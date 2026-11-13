"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { loadVenue } from "@/lib/menu";
import {
  addOptOut,
  buildMail,
  getProvider,
  isValidEmail,
  loadMailSender,
  mailBlockedReason,
  mailQuotaToday,
  MailError,
  optedOutAmong,
  publicOrigin,
  releaseBulk,
  reserveBulk,
  saveMailSender,
  unsubscribeUrls,
  type BatchResult,
  type Recipient,
} from "@/lib/mail";
import { parseId, parseText, runAction, ValidationError, type ActionResult } from "@/lib/validation";
import { recordSent } from "@/lib/mail-contacts";
import { isConsent, longDay } from "@/lib/mail-rubrica";

const MAX_CHUNK = 50;

// Solo titolare e consulente (requireUser rifiuta i dipendenti), con la sezione accesa, fuori dalle
// anteprime e con il servizio collegato: lo ricontrolla ogni azione, non solo la pagina.
async function mailUser() {
  const user = await requireUser();
  const blocked = await mailBlockedReason();
  if (blocked) throw new ValidationError(blocked);
  return user;
}

async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function quotaMessage(available: number, reserve: number) {
  return available > 0
    ? `Oggi puoi mandare ancora ${available} mail (${reserve} sono tenute per le prenotazioni): riduci la lista e manda le altre domani.`
    : `Per oggi le mail della lista sono finite (${reserve} restano tenute per le prenotazioni): riprova domani.`;
}

function readRecipients(input: unknown): Recipient[] {
  const list = Array.isArray(input) ? input : [];
  if (list.length === 0 || list.length > MAX_CHUNK) throw new ValidationError("Gruppo di destinatari non valido.");
  const recipients = list.map((r: { email?: unknown; header?: unknown }) => ({
    email: typeof r?.email === "string" ? r.email.trim().toLowerCase() : "",
    header: typeof r?.header === "string" ? r.header.slice(0, 200) : "",
  }));
  if (recipients.some((r) => !isValidEmail(r.email))) throw new ValidationError("Indirizzo email non valido.");
  return recipients;
}

// Prepara le mail (piè di pagina di legge e link per cancellarsi di ognuno) e le spedisce.
async function deliver(recipients: Recipient[], subject: string, body: string): Promise<BatchResult> {
  const [venue, sender, origin] = await Promise.all([loadVenue(), loadMailSender(), requestOrigin()]);
  const site = publicOrigin(origin);
  const footer = { address: venue.contacts.address, company: sender.company, vat: sender.vat, privacyUrl: sender.privacyUrl };
  const replyTo = process.env.MAIL_REPLY_TO || undefined;
  const mails = recipients.map((r) => {
    const urls = unsubscribeUrls(r.email, site);
    return buildMail(r, { subject, body, footer, unsubscribeUrl: urls.page, oneClickUrl: urls.oneClick, replyTo });
  });
  return getProvider().sendBatch(mails);
}

function statusOf(s: { recipients: number; sent: number; failed: number; excluded: number }, stopped: boolean) {
  const done = s.sent + s.failed + s.excluded >= s.recipients;
  if (!done && !stopped) return "IN_CORSO";
  if (s.sent === 0) return "NON_PARTITA";
  return s.failed > 0 || !done ? "PARZIALE" : "INVIATA";
}

// Inizio di un invio alla lista: una riga nel registro, che i gruppi aggiornano.
// basis: perché si può scrivere a queste persone, scelto al passo 3 («Sono clienti o contatti già
// avuti», «Hanno chiesto di riceverle», «Altro motivo»): resta nel registro e vale per chi entra in
// rubrica con questo invio.
export async function startMailSend(input: { subject: string; recipients: number; basis: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await mailUser();
    const subject = parseText(input?.subject, "oggetto", { max: 200, required: true });
    const total = Number(input?.recipients);
    if (!Number.isInteger(total) || total < 1 || total > 100000) throw new ValidationError("Numero di destinatari non valido.");
    if (!isConsent(input?.basis)) throw new ValidationError("Scegli perché puoi scrivere a queste persone.");
    const quota = await mailQuotaToday();
    if (total > quota.bulkAvailable) throw new ValidationError(quotaMessage(quota.bulkAvailable, quota.reserve));
    const row = await prisma.mailSend.create({ data: { by: user.name || user.username, subject, recipients: total, basis: input.basis } });
    return { id: row.id };
  });
}

// Un gruppo (fino a 50) di un invio. Il client spezza la lista; qui si ricontrolla tutto:
// indirizzi, disiscrizioni (escluse sempre), quota del giorno con la riserva per le prenotazioni.
// La chiave (invio, numero del gruppo) fa sì che «Riprova» non rispedisca un gruppo già partito.
export async function sendMailChunk(input: {
  sendId: string;
  index: number;
  recipients: Recipient[];
  subject: string;
  body: string;
}): Promise<ActionResult<{ sent: number; failed: number; excluded: number; warning: string | null }>> {
  return runAction(async () => {
    await mailUser();
    const sendId = parseId(input?.sendId, "invio");
    const index = Number(input?.index);
    if (!Number.isInteger(index) || index < 0 || index > 10000) throw new ValidationError("Gruppo non valido.");
    const subject = parseText(input?.subject, "oggetto", { max: 200, required: true });
    const body = parseText(input?.body, "testo", { max: 20000, required: true });
    const all = readRecipients(input?.recipients);

    const send = await prisma.mailSend.findUnique({ where: { id: sendId } });
    if (!send) throw new ValidationError("Invio non trovato: ricarica la pagina.");

    // Gruppo già partito (doppio tocco o «Riprova»): non si rispedisce.
    const previous = await prisma.mailSendChunk.findUnique({ where: { sendId_idx: { sendId, idx: index } } });
    if (previous) return { sent: previous.sent, failed: previous.failed, excluded: 0, warning: null };
    try {
      await prisma.mailSendChunk.create({ data: { sendId, idx: index } });
    } catch {
      return { sent: 0, failed: 0, excluded: 0, warning: null };
    }

    const optedOut = await optedOutAmong(all.map((r) => r.email));
    const recipients = all.filter((r) => !optedOut.has(r.email));
    const excluded = all.length - recipients.length;

    const finish = async (sent: number, failed: number, stopped: boolean) => {
      await prisma.mailSendChunk.update({ where: { sendId_idx: { sendId, idx: index } }, data: { sent, failed } });
      const s = await prisma.mailSend.update({
        where: { id: sendId },
        data: { sent: { increment: sent }, failed: { increment: failed }, excluded: { increment: excluded } },
      });
      await prisma.mailSend.update({ where: { id: sendId }, data: { status: statusOf(s, stopped) } });
    };
    // Gruppo non partito: si toglie la chiave, così «Riprova» lo rimanda davvero.
    const giveUp = async () => {
      await prisma.mailSendChunk.delete({ where: { sendId_idx: { sendId, idx: index } } }).catch(() => {});
      const s = await prisma.mailSend.findUnique({ where: { id: sendId } });
      if (s) await prisma.mailSend.update({ where: { id: sendId }, data: { status: statusOf(s, true) } });
    };

    if (recipients.length === 0) {
      await finish(0, 0, false);
      await prisma.mailSendRecipient
        .createMany({ data: all.map((r) => ({ sendId, email: r.email, status: "excluded" })), skipDuplicates: true })
        .catch(() => {});
      return { sent: 0, failed: 0, excluded, warning: null };
    }

    if (!(await reserveBulk(recipients.length))) {
      await giveUp();
      const quota = await mailQuotaToday();
      throw new ValidationError(quotaMessage(quota.bulkAvailable, quota.reserve));
    }

    let res: BatchResult;
    try {
      res = await deliver(recipients, subject, body);
    } catch (e) {
      await releaseBulk(recipients.length);
      await giveUp();
      if (e instanceof MailError) throw new ValidationError(e.message);
      throw e;
    }
    await releaseBulk(res.failed.length);
    await finish(res.sent, res.failed.length, Boolean(res.error?.quota));
    // Chi l'ha ricevuta entra in rubrica (o si aggiorna). Se non riesce, l'invio resta valido.
    const failedSet = new Set(res.failed);
    await recordSent({
      sendId,
      sent: recipients.filter((r) => !failedSet.has(r.email)),
      failed: res.failed,
      excluded: all.filter((r) => optedOut.has(r.email)).map((r) => r.email),
      basis: isConsent(send.basis) ? send.basis : "altro",
      note: `Dichiarato all'invio «${send.subject}» del ${longDay(send.createdAt.toISOString())}`,
    }).catch((e: unknown) => console.error("[mail] rubrica dopo l'invio", e));
    revalidatePath("/mail");
    return {
      sent: res.sent,
      failed: res.failed.length,
      excluded,
      warning: res.failed.length ? `${res.failed.length} non ${res.failed.length === 1 ? "è partita" : "sono partite"}: ${res.error?.message ?? ""}`.trim() : null,
    };
  });
}

// Prova su di sé: una mail sola, conta sulla quota ma non va nel registro.
export async function sendMailTest(input: { to: string; header: string; subject: string; body: string }): Promise<ActionResult<{ sent: number }>> {
  return runAction(async () => {
    await mailUser();
    const subject = parseText(input?.subject, "oggetto", { max: 200, required: true });
    const body = parseText(input?.body, "testo", { max: 20000, required: true });
    const [r] = readRecipients([{ email: input?.to, header: input?.header }]);
    if (!(await reserveBulk(1))) {
      const quota = await mailQuotaToday();
      throw new ValidationError(quotaMessage(quota.bulkAvailable, quota.reserve));
    }
    try {
      await deliver([r], subject, body);
    } catch (e) {
      await releaseBulk(1);
      if (e instanceof MailError) throw new ValidationError(e.message);
      throw e;
    }
    // La prossima prova propone lo stesso indirizzo, anche da un altro dispositivo.
    const sender = await loadMailSender();
    if (sender.testEmail !== r.email) await saveMailSender({ ...sender, testEmail: r.email }).catch(() => {});
    return { sent: 1 };
  });
}

// «Dati del mittente»: ragione sociale e partita IVA per il piè di pagina, link all'informativa,
// indirizzo per le prove. Si possono salvare anche con la sezione spenta o nelle anteprime.
export async function saveMailSenderAction(input: { company: string; vat: string; privacyUrl: string; testEmail: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const company = parseText(input?.company, "ragione sociale", { max: 120 });
    const vat = parseText(input?.vat, "partita IVA", { max: 30 });
    const privacyUrl = parseText(input?.privacyUrl, "link all'informativa", { max: 300 });
    if (privacyUrl && !/^https:\/\/[^\s<>"]+$/.test(privacyUrl)) throw new ValidationError("Il link all'informativa deve iniziare con https://");
    const testEmail = parseText(input?.testEmail, "indirizzo per le prove", { max: 254 }).toLowerCase();
    if (testEmail && !isValidEmail(testEmail)) throw new ValidationError("L'indirizzo per le prove non sembra giusto.");
    await saveMailSender({ company, vat, privacyUrl, testEmail });
    revalidatePath("/mail");
  });
}

// «Segna come cancellato»: chi ha risposto «cancellami» non riceverà più le mail della lista.
export async function markOptOutAction(input: { email: string }): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    await requireUser();
    const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!isValidEmail(email)) throw new ValidationError("L'indirizzo non sembra giusto: controllalo.");
    await addOptOut(email, "a mano");
    revalidatePath("/mail");
    return { email };
  });
}
