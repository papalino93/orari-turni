// Rubrica della pagina Mail, parte del server: lettura per il browser, contatti aggiunti dagli
// invii e dal modulo delle prenotazioni, gruppi. Le parole condivise sono in mail-rubrica.ts.

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/mail-text";
import { BOOKING_OPTIN_TEXT, cleanEmail, GROUP_COLORS, cleanName, SITE_GROUP_NAME, tidyPhone, type Consent, type RContact, type RubricaData } from "@/lib/mail-rubrica";

// Dopo quanti giorni un contatto eliminato (che si poteva ancora rimettere) si cancella davvero.
export const PURGE_DAYS = 30;

export function newContactId(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

// Tutta la rubrica per il browser (ricerca, filtri e ordine si fanno lì: con 5.000 contatti è
// ancora una risposta piccola e la ricerca è istantanea). Chi non vuole più email è segnato.
export async function loadRubrica(): Promise<RubricaData> {
  await prisma.mailContact.deleteMany({ where: { deletedAt: { lt: new Date(Date.now() - PURGE_DAYS * 86400000) } } }).catch(() => {});
  const [contacts, groups, links, optOuts] = await Promise.all([
    prisma.mailContact.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        notes: true,
        source: true,
        consent: true,
        consentAt: true,
        consentNote: true,
        createdAt: true,
        lastSentAt: true,
        sentCount: true,
      },
    }),
    prisma.mailGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.mailContactGroup.findMany({ select: { contactId: true, groupId: true } }),
    prisma.mailOptOut.findMany({ select: { email: true, createdAt: true, source: true } }),
  ]);
  const byContact = new Map<string, string[]>();
  for (const l of links) {
    const list = byContact.get(l.contactId);
    if (list) list.push(l.groupId);
    else byContact.set(l.contactId, [l.groupId]);
  }
  const out = new Map(optOuts.map((o) => [o.email, { at: o.createdAt.toISOString(), source: o.source }]));
  return {
    contacts: contacts.map(
      (c): RContact => ({
        id: c.id,
        email: c.email,
        name: c.name,
        phone: tidyPhone(c.phone),
        notes: c.notes ?? "",
        source: c.source,
        consent: c.consent,
        consentAt: c.consentAt.toISOString(),
        consentNote: c.consentNote ?? "",
        createdAt: c.createdAt.toISOString(),
        lastSentAt: c.lastSentAt?.toISOString() ?? null,
        sentCount: c.sentCount,
        groups: byContact.get(c.id) ?? [],
        out: out.get(c.email) ?? null,
      }),
    ),
    groups: groups.map((g) => ({ id: g.id, name: g.name, color: g.color, sortOrder: g.sortOrder })),
    optOuts: optOuts.map((o) => o.email),
  };
}

export async function contactCount(): Promise<number> {
  return prisma.mailContact.count({ where: { deletedAt: null } });
}

// Un gruppo per nome (senza badare alle maiuscole); se non c'è lo crea in fondo.
// Senza colore: il prossimo della tavolozza, così i gruppi nuovi non sono tutti uguali.
export async function ensureGroup(name: string, color?: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mail-group:${name.toLowerCase()}`}))`;
    const found = await tx.mailGroup.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (found) return found.id;
    const last = await tx.mailGroup.aggregate({ _max: { sortOrder: true } });
    const count = await tx.mailGroup.count();
    const g = await tx.mailGroup.create({ data: { name, color: color ?? GROUP_COLORS[count % GROUP_COLORS.length].id, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    return g.id;
  });
}

// Dopo un gruppo di un invio vero (mai le prove): chi l'ha ricevuta entra in rubrica (o si aggiorna
// «ultima mail» e il numero di mail ricevute), e si segna a chi è andato l'invio. Il nome si mette
// solo se in rubrica era vuoto; il motivo per scrivergli è quello dichiarato al passo 3, solo per i
// nuovi. Un contatto eliminato a cui si riscrive torna in rubrica.
export async function recordSent(input: {
  sendId: string;
  sent: { email: string; header: string }[];
  failed: string[];
  excluded: string[];
  basis: Consent;
  note: string;
}): Promise<void> {
  const rows = [
    ...input.sent.map((r) => ({ sendId: input.sendId, email: r.email, status: "sent" })),
    ...input.failed.map((email) => ({ sendId: input.sendId, email, status: "failed" })),
    ...input.excluded.map((email) => ({ sendId: input.sendId, email, status: "excluded" })),
  ];
  if (rows.length) await prisma.mailSendRecipient.createMany({ data: rows, skipDuplicates: true });
  if (input.sent.length === 0) return;
  const ids = input.sent.map(() => newContactId());
  const emails = input.sent.map((r) => r.email);
  const names = input.sent.map((r) => cleanName(r.header));
  await prisma.$executeRaw`
    INSERT INTO "MailContact" ("id", "email", "name", "source", "consent", "consentAt", "consentNote", "createdAt", "updatedAt", "lastSentAt", "sentCount")
    SELECT t.id, t.email, t.name, 'invio', ${input.basis}, now(), ${input.note}, now(), now(), now(), 1
    FROM unnest(${ids}::text[], ${emails}::text[], ${names}::text[]) AS t(id, email, name)
    ON CONFLICT ("email") DO UPDATE SET
      "lastSentAt" = now(),
      "sentCount" = "MailContact"."sentCount" + 1,
      "updatedAt" = now(),
      "name" = CASE WHEN "MailContact"."name" = '' THEN EXCLUDED."name" ELSE "MailContact"."name" END,
      "deletedAt" = NULL`;
}

// Modulo «Chiedi un tavolo», casella delle novità spuntata: il cliente entra in rubrica con il
// consenso chiesto dal sito (quando e con quale testo) e nel gruppo «Clienti dal sito». Se c'era
// già, il consenso diventa questo e il nome o il telefono si riempiono se mancavano. Chi si era
// cancellato resta cancellato: un modulo senza conferma dell'indirizzo non basta a riattivarlo.
export async function subscribeFromBooking(input: { email: string; name: string; phone: string | null }, now = new Date()): Promise<void> {
  input = { ...input, phone: tidyPhone(input.phone) || null };
  const email = cleanEmail(input.email);
  if (!isValidEmail(email)) return;
  const name = cleanName(input.name);
  const groupId = await ensureGroup(SITE_GROUP_NAME, "oro");
  const consentNote = `Casella del modulo per chiedere un tavolo: «${BOOKING_OPTIN_TEXT}»`;
  const existing = await prisma.mailContact.findUnique({ where: { email } });
  // Tolto a mano dalla rubrica: resta tolto. Il modulo non chiede conferma dell'indirizzo, quindi
  // chiunque potrebbe scriverlo; lo rimette solo il titolare.
  if (existing?.deletedAt) return;
  const contact = existing
    ? await prisma.mailContact.update({
        where: { email },
        data: {
          consent: "chiesto",
          consentAt: now,
          consentNote,
          ...(existing.name.trim() || !name ? {} : { name }),
          ...(existing.phone || !input.phone ? {} : { phone: input.phone }),
        },
      })
    : await prisma.mailContact.create({
        data: { email, name, phone: input.phone, source: "sito", consent: "chiesto", consentAt: now, consentNote },
      });
  await prisma.mailContactGroup.createMany({ data: [{ contactId: contact.id, groupId }], skipDuplicates: true });
}
