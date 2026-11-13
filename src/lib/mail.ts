// Mail, parte del server: il servizio che spedisce (Brevo, Resend o «log» per le prove),
// la quota del giorno condivisa con le prenotazioni, le disiscrizioni e i dati del mittente.
// Chiavi e mittente vivono solo nelle variabili d'ambiente. Lettura della lista, testo e piè di
// pagina (usati anche nel browser per l'anteprima) sono in mail-text.ts e si importano anche da qui.

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { loadFeatures } from "@/lib/app-features";
import { isValidEmail, type OutgoingMail } from "@/lib/mail-text";

export * from "@/lib/mail-text";

// ---------- Servizio di posta

export type BatchResult = { sent: number; failed: string[]; error?: MailError };

export interface MailProvider {
  // Una mail per destinatario, mai tutti in copia. Lancia MailError se non ne parte nessuna;
  // se ne partono solo alcune restituisce quante e quali no (con il primo errore).
  sendBatch(mails: OutgoingMail[]): Promise<BatchResult>;
}

// Errore del servizio di posta già tradotto in una frase per il titolare.
export class MailError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly quota = false,
  ) {
    super(message);
    this.name = "MailError";
  }
}

type ProviderName = "resend" | "brevo" | "log";

function providerName(): ProviderName {
  const p = process.env.MAIL_PROVIDER?.toLowerCase();
  return p === "brevo" ? "brevo" : p === "log" ? "log" : "resend";
}

function apiKey() {
  return providerName() === "brevo" ? process.env.BREVO_API_KEY : process.env.RESEND_API_KEY;
}

export function mailConfigured(): boolean {
  // «log»: solo per le prove in locale, non spedisce nulla (scrive nel terminale del server).
  if (providerName() === "log") return true;
  return Boolean(apiKey() && process.env.MAIL_FROM);
}

// Le anteprime di Vercel usano il database vero: da lì non parte mai nessuna mail della lista.
export const isPreviewDeploy = () => process.env.VERCEL_ENV === "preview";

// Rifiuto del servizio → frase chiara. Il dettaglio tecnico finisce solo nel registro del server.
export function providerError(provider: "Brevo" | "Resend", status: number, detail: string): MailError {
  console.error(`[mail] ${provider} ${status}: ${detail.slice(0, 300)}`);
  const d = detail.toLowerCase();
  if (status === 429 && /rate|too many|velocit/.test(d) && !/daily|quota|credit/.test(d))
    return new MailError("Troppe mail in pochi secondi: aspetta un minuto e premi «Riprova».", status);
  if (status === 429 || status === 402 || /daily_quota|quota|credit/.test(d))
    return new MailError("La quota di oggi è finita: riprova domani.", status, true);
  if (/ip address|unrecogni[sz]ed ip|authorised ip|authorized ip/.test(d))
    return new MailError(`${provider} accetta solo indirizzi IP autorizzati: nel pannello di ${provider} disattiva la lista degli IP autorizzati (il sito non ha un IP fisso).`, status);
  if (/domain|dominio/.test(d) && /verif|not.*valid|authenticat/.test(d))
    return new MailError(`Il dominio del mittente non è ancora verificato su ${provider}: aggiungi i record DNS che ${provider} mostra e aspetta la verifica.`, status);
  if (/sender|from/.test(d) && /invalid|not.*valid|verif|not allowed/.test(d))
    return new MailError(`Il mittente (MAIL_FROM) non è valido o non è verificato su ${provider}.`, status);
  if (status === 401) return new MailError(`La chiave di ${provider} non è valida: controlla la variabile della chiave su Vercel.`, status);
  if (status === 403)
    return new MailError(`${provider} rifiuta l'invio: il dominio del mittente non è ancora verificato o la chiave non ha i permessi.`, status);
  if (status >= 500) return new MailError(`${provider} in questo momento non risponde: riprova tra qualche minuto.`, status);
  return new MailError(`${provider} ha rifiutato l'invio (errore ${status}): controlla l'indirizzo e riprova.`, status);
}

// «Nome <indirizzo>» oppure solo «indirizzo».
function parseFrom(value: string): { name?: string; email: string } {
  const m = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, "") || undefined, email: m[2].trim() } : { email: value.trim() };
}

export function getProvider(): MailProvider {
  if (providerName() === "log") {
    return {
      // Solo prove in locale. Un indirizzo che finisce con «+errore@…» fa finta di essere rifiutato.
      async sendBatch(mails) {
        const failed: string[] = [];
        for (const m of mails) {
          if (/\+errore@/i.test(m.to)) failed.push(m.to);
          else console.log(`[mail di prova] a ${m.to}: ${m.subject}`);
        }
        const error = failed.length ? new MailError("Indirizzo rifiutato (prova).", 400) : undefined;
        if (failed.length === mails.length && error) throw error;
        return { sent: mails.length - failed.length, failed, error };
      },
    };
  }
  const key = apiKey();
  const from = process.env.MAIL_FROM;
  if (!key || !from) throw new MailError("Invio mail non configurato: mancano la chiave del servizio o MAIL_FROM.");
  const replyTo = process.env.MAIL_REPLY_TO || undefined;

  if (providerName() === "brevo") {
    const sender = parseFrom(from);
    return {
      // Brevo non ha un invio multiplo con testi diversi: una richiesta per destinatario, a
      // gruppetti di 10. Ognuna va per conto suo: «Sono partite N su M» resta vero.
      async sendBatch(mails) {
        const failed: string[] = [];
        let error: MailError | undefined;
        for (let i = 0; i < mails.length; i += 10) {
          const part = mails.slice(i, i + 10);
          const results = await Promise.allSettled(
            part.map(async (m) => {
              const res = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                  sender,
                  to: [{ email: m.to }],
                  subject: m.subject,
                  textContent: m.text,
                  htmlContent: m.html,
                  replyTo: replyTo ? { email: replyTo } : undefined,
                  headers: m.headers,
                }),
              });
              if (!res.ok) throw providerError("Brevo", res.status, await res.text().catch(() => ""));
            }),
          );
          results.forEach((r, j) => {
            if (r.status === "fulfilled") return;
            failed.push(part[j].to);
            error ??= r.reason instanceof MailError ? r.reason : new MailError("Brevo non risponde: controlla la connessione e riprova.");
          });
          // Quota finita: inutile provare con le altre.
          if (error?.quota) {
            for (const m of mails.slice(i + 10)) failed.push(m.to);
            break;
          }
        }
        if (failed.length === mails.length) throw error ?? new MailError("Non è partita nessuna mail.");
        return { sent: mails.length - failed.length, failed, error };
      },
    };
  }

  return {
    // Resend: un'unica chiamata per il gruppo, che parte tutto o niente.
    async sendBatch(mails) {
      let res: Response;
      try {
        res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            mails.map((m) => ({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, reply_to: replyTo, headers: m.headers })),
          ),
        });
      } catch {
        throw new MailError("Resend non risponde: controlla la connessione e riprova.");
      }
      if (!res.ok) throw providerError("Resend", res.status, await res.text().catch(() => ""));
      return { sent: mails.length, failed: [] };
    },
  };
}

// ---------- Quota del giorno, condivisa tra prenotazioni e invii a una lista

// Limite del piano: Brevo gratuito 300 al giorno, Resend 100. MAIL_DAILY_LIMIT lo cambia.
export function dailyLimit(): number {
  const n = Number(process.env.MAIL_DAILY_LIMIT);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return providerName() === "brevo" ? 300 : 100;
}

// Quante mail del giorno restano sempre libere per le prenotazioni (ricevute, conferme, avvisi).
export function bookingReserve(): number {
  const raw = process.env.MAIL_BOOKING_RESERVE;
  const n = raw === undefined || raw === "" ? 50 : Number(raw);
  return Math.min(dailyLimit(), Number.isFinite(n) && n >= 0 ? Math.floor(n) : 50);
}

// Giorno di Roma (AAAA-MM-GG): la quota dei servizi si azzera a mezzanotte, più o meno.
export function romeDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export type MailQuota = { limit: number; used: number; transactional: number; bulk: number; reserve: number; bulkAvailable: number };

export async function mailQuotaToday(): Promise<MailQuota> {
  const row = await prisma.mailDay.findUnique({ where: { day: romeDay() } });
  const limit = dailyLimit();
  const reserve = bookingReserve();
  const transactional = row?.transactional ?? 0;
  const bulk = row?.bulk ?? 0;
  const used = transactional + bulk;
  return { limit, used, transactional, bulk, reserve, bulkAvailable: Math.max(0, limit - reserve - used) };
}

// Conta le mail partite oggi. «transactional»: prenotazioni e avvisi (possono usare tutto il
// limite); «bulk»: la pagina Mail (si ferma prima della riserva).
export async function recordMailSent(kind: "transactional" | "bulk", n: number): Promise<void> {
  if (!(n > 0)) return;
  const day = romeDay();
  await prisma.mailDay.upsert({
    where: { day },
    create: { day, [kind]: n },
    update: { [kind]: { increment: n } },
  });
}

// Prenota sulla quota di oggi n mail della lista, solo se resta intatta la riserva per le
// prenotazioni. Atomico: due invii insieme non possono superare il limite.
export async function reserveBulk(n: number): Promise<boolean> {
  const day = romeDay();
  const max = dailyLimit() - bookingReserve();
  await prisma.$executeRaw`INSERT INTO "MailDay" ("day", "transactional", "bulk", "updatedAt") VALUES (${day}, 0, 0, now()) ON CONFLICT ("day") DO NOTHING`;
  const changed = await prisma.$executeRaw`UPDATE "MailDay" SET "bulk" = "bulk" + ${n}, "updatedAt" = now() WHERE "day" = ${day} AND "bulk" + "transactional" + ${n} <= ${max}`;
  return changed === 1;
}

// Restituisce alla quota le mail prenotate e non partite.
export async function releaseBulk(n: number): Promise<void> {
  if (!(n > 0)) return;
  await prisma.$executeRaw`UPDATE "MailDay" SET "bulk" = GREATEST("bulk" - ${n}, 0), "updatedAt" = now() WHERE "day" = ${romeDay()}`;
}

// Per le prenotazioni: spedisce e conta sulla quota del giorno (senza fermarsi alla riserva).
export async function sendTransactional(mails: OutgoingMail[]): Promise<BatchResult> {
  const res = await getProvider().sendBatch(mails);
  await recordMailSent("transactional", res.sent).catch((e: unknown) => console.error("[mail] conteggio quota", e));
  return res;
}

// ---------- Si può usare la pagina Mail?

// null se si può spedire, altrimenti la frase da mostrare.
export async function mailBlockedReason(): Promise<string | null> {
  if (!(await loadFeatures()).mail) return "La sezione Mail è spenta: accendila da Impostazioni → «Mail».";
  if (isPreviewDeploy()) return "Questa è una versione di prova del sito: nelle versioni di prova non si spedisce.";
  if (!mailConfigured()) return "Invio mail non configurato: mancano la chiave del servizio o l'indirizzo mittente.";
  return null;
}

// ---------- Disiscrizioni

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET non configurato.");
  return s;
}

function optOutMac(email: string): string {
  return createHmac("sha256", secret()).update(`mail-optout:v1:${email}`).digest("base64url").slice(0, 32);
}

// Il link «Non voglio più ricevere queste email» di una persona: l'indirizzo e la sua firma.
export function unsubscribeToken(email: string): string {
  const e = email.trim().toLowerCase();
  return `${Buffer.from(e).toString("base64url")}.${optOutMac(e)}`;
}

// L'indirizzo del link, solo se la firma è giusta.
export function emailFromUnsubscribeToken(token: string): string | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [enc, mac] = token.split(".");
  if (!enc || !mac) return null;
  const email = Buffer.from(enc, "base64url").toString("utf8");
  if (!isValidEmail(email) || email !== email.toLowerCase()) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(optOutMac(email));
  return a.length === b.length && timingSafeEqual(a, b) ? email : null;
}

// Indirizzo pubblico del sito per i link nelle mail: il dominio di produzione se c'è.
export function publicOrigin(requestOrigin?: string | null): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return requestOrigin || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export function unsubscribeUrls(email: string, origin: string) {
  const page = `${origin}/mail/cancellami/${unsubscribeToken(email)}`;
  return { page, oneClick: `${page}/conferma` };
}

// Idempotente: chi si è già cancellato resta com'era (data e modo della prima volta).
export async function addOptOut(email: string, source: "link" | "one-click" | "a mano" | "cancellazione"): Promise<void> {
  const e = email.trim().toLowerCase();
  await prisma.mailOptOut.upsert({ where: { email: e }, create: { email: e, source }, update: {} });
}

export async function isOptedOut(email: string): Promise<boolean> {
  return Boolean(await prisma.mailOptOut.findUnique({ where: { email: email.trim().toLowerCase() } }));
}

export async function optedOutAmong(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await prisma.mailOptOut.findMany({ where: { email: { in: emails } }, select: { email: true } });
  return new Set(rows.map((r) => r.email));
}

// ---------- Dati del mittente (piè di pagina di legge), salvati in MenuSetting "mailSender"

export type MailSender = { company: string; vat: string; privacyUrl: string; testEmail: string };
// Dati del registro delle imprese (si possono cambiare dalla pagina Mail → «Dati del mittente»).
const SENDER_DEFAULTS: MailSender = {
  company: process.env.MAIL_COMPANY ?? "L'Angolo del Vino di Ticonosco Andrea",
  vat: process.env.MAIL_VAT ?? "06838060488",
  privacyUrl: "",
  testEmail: "",
};

export async function loadMailSender(): Promise<MailSender> {
  const row = await prisma.menuSetting.findUnique({ where: { id: "mailSender" } });
  if (!row) return SENDER_DEFAULTS;
  try {
    const v = JSON.parse(row.value) as Partial<MailSender>;
    const s = (x: unknown, d: string) => (typeof x === "string" ? x : d);
    return {
      company: s(v.company, SENDER_DEFAULTS.company) || SENDER_DEFAULTS.company,
      vat: s(v.vat, SENDER_DEFAULTS.vat) || SENDER_DEFAULTS.vat,
      privacyUrl: s(v.privacyUrl, ""),
      testEmail: s(v.testEmail, ""),
    };
  } catch {
    return SENDER_DEFAULTS;
  }
}

export async function saveMailSender(value: MailSender): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.menuSetting.upsert({ where: { id: "mailSender" }, create: { id: "mailSender", value: json }, update: { value: json } });
}
