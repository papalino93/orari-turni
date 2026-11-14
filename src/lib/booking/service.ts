// Prenotazioni online: database, cambi di stato e avvisi. Solo server.
//
// Regole che valgono ovunque:
// - ogni cambio di stato è un aggiornamento condizionato (updateMany con lo stato atteso):
//   se due persone rispondono insieme, vince la prima e l'altra legge «già gestita da…»;
// - i messaggi partono solo dopo il salvataggio, e ogni invio (riuscito o no) resta nella cronologia;
// - richieste di prova (funzione spenta, anteprime di Vercel) non avvisano nessuno.

import { createHash, createHmac, randomInt } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadVenue } from "@/lib/menu";
import { internationalNumber, whatsappHref } from "@/lib/menu-venue";
import { escapeHtml, isValidEmail, mailConfigured, oneLine, sendTransactional } from "@/lib/mail";
import {
  addDays,
  availability,
  businessDay,
  dayLong,
  dayShort,
  normalizeSource,
  peopleText,
  parseBookingSettings,
  phoneProblem,
  romeInstant,
  timeToDayMinutes,
  withinOpening,
  whatsappReachable,
  editVersion,
  romeParts,
  nameKey,
  pausedNow,
  dayTimeShort,
  MANUAL_SOURCES,
  type ManualSource,
  type BookingSettings,
  type DayAvailability,
  type DayClosure,
  mentionsAllergy,
  cleanMenu,
  isIncomplete,
  peopleOrUnknown,
  UNKNOWN_TIME_MINUTES,
} from "@/lib/booking/rules";
import { customerMessage, customerSubject, staffAlert, VENUE_NAME, type MessageKind } from "@/lib/booking/messages";
import { bookingMailHtml, staffMailHtml } from "@/lib/booking/mail-html";
import { sendPushToStaff } from "@/lib/booking/push";
import { activeClaim, CLAIM_MINUTES, lastSent, pendingSince, whatsappPending } from "@/lib/booking/whatsapp-queue";
import { importable, importSig, parseImport, IMPORT_MAX_ROWS } from "@/lib/booking/import";
import type { Hours } from "@/lib/menu-venue";

export type BookingRow = Awaited<ReturnType<typeof prisma.bookingRequest.findFirstOrThrow>>;

// ---------- Impostazioni

export async function loadBookingSettings(): Promise<BookingSettings> {
  const row = await prisma.menuSetting.findUnique({ where: { id: "bookings" } });
  return parseBookingSettings(row?.value);
}

export async function saveBookingSettings(next: BookingSettings): Promise<void> {
  const value = JSON.stringify(next);
  await prisma.menuSetting.upsert({ where: { id: "bookings" }, update: { value }, create: { id: "bookings", value } });
}

// ---------- Link segreto del cliente
//
// Il link si ricava dall'id con una firma (HMAC con NEXTAUTH_SECRET): nel database c'è solo
// l'impronta, e chi lavora può rimandare il link al cliente in ogni momento.

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET non configurato.");
  return s;
}

export function tokenFor(id: string): string {
  return createHmac("sha256", secret()).update(`booking:v1:${id}`).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Indirizzo pubblico del sito: il dominio di produzione se c'è, altrimenti quello della richiesta.
// Anche da un'anteprima di Vercel i link ai clienti puntano al sito vero (le anteprime sono protette).
export function siteOrigin(requestOrigin?: string | null): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return requestOrigin || "http://localhost:3000";
}

// Le anteprime di Vercel usano il database vero: da lì non parte mai nessun messaggio.
export const isPreview = () => process.env.VERCEL_ENV === "preview";

// Nelle anteprime il personale può provare solo con le prenotazioni di prova: quelle vere (stesso
// database del sito) non si toccano. Restituisce il messaggio da mostrare, o null se si può.
export const PREVIEW_BLOCKED =
  "Questa è un'anteprima di prova del sito: le prenotazioni vere si cambiano solo dal sito vero (orari-turni.vercel.app).";
export async function previewBlock(id?: string | null): Promise<string | null> {
  if (!isPreview()) return null;
  if (!id) return PREVIEW_BLOCKED;
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { isTest: true } });
  return b && b.isTest ? null : PREVIEW_BLOCKED;
}

// Lavoro da fare dopo aver risposto (avvisi, email): con after() quando c'è una richiesta in corso,
// altrimenti (prove con tsx) subito ma con un tempo massimo. Mai un errore verso chi ha chiamato.
export function later(work: () => Promise<unknown>, maxMs = 4000): Promise<void> {
  const safe = () => work().catch((e: unknown) => console.error("[prenotazioni] dopo la risposta:", e));
  try {
    after(safe);
    return Promise.resolve();
  } catch {
    return Promise.race([safe().then(() => {}), new Promise<void>((r) => setTimeout(r, maxMs))]);
  }
}

export function statusPath(id: string): string {
  return `/menu/prenota/r/${tokenFor(id)}`;
}

// Codice breve da dire al telefono: niente lettere che si confondono (0/O, 1/I/L).
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return c;
}

// ---------- Disponibilità

// Chiusure dei giorni tra from e to: «chiuso» dagli Orari (giornata chiusa) e «al completo»
// dalle prenotazioni. Le chiusure pubbliche (ferie negli orari del menù) le vede già availability().
export async function closuresBetween(from: string, to: string): Promise<Map<string, DayClosure>> {
  const [closed, full] = await Promise.all([
    prisma.closureDay.findMany({ where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } } }),
    prisma.bookingClosedDay.findMany({ where: { day: { gte: from, lte: to } } }),
  ]);
  const out = new Map<string, DayClosure>();
  for (const f of full) out.set(f.day, { kind: "full", reason: f.reason });
  for (const c of closed) out.set(c.date.toISOString().slice(0, 10), { kind: "closed", reason: c.reason });
  return out;
}

export type DayOption = {
  day: string;
  label: string; // «Sab 14 nov»
  availability: DayAvailability;
  events: { title: string; slug: string; startTime: string | null }[];
};

// I prossimi giorni prenotabili (per il modulo): da oggi a daysAhead.
export async function bookingDays(settings: BookingSettings, now: Date = new Date()): Promise<DayOption[]> {
  const today = businessDay(now);
  const last = addDays(today, settings.daysAhead);
  const [{ hours }, closures, events] = await Promise.all([
    loadVenue(),
    closuresBetween(today, last),
    prisma.menuPromo.findMany({
      where: { kind: "EVENT", hidden: false, deletedAt: null, endDate: { gte: today }, startDate: { lte: last } },
      select: { title: true, slug: true, startDate: true, endDate: true, startTime: true },
    }),
  ]);
  const out: DayOption[] = [];
  for (let d = today; d <= last; d = addDays(d, 1)) {
    out.push({
      day: d,
      label: dayShort(d),
      availability: availability(d, hours, settings, closures.get(d) ?? null, now),
      events: events.filter((e) => e.startDate <= d && d <= e.endDate).map((e) => ({ title: e.title, slug: e.slug, startTime: e.startTime })),
    });
  }
  return out;
}

async function dayAvailability(day: string, settings: BookingSettings, now: Date): Promise<DayAvailability> {
  const [{ hours }, closures] = await Promise.all([loadVenue(), closuresBetween(day, day)]);
  return availability(day, hours, settings, closures.get(day) ?? null, now);
}

// ---------- Nuova richiesta (dal cliente)

export type NewRequestInput = {
  day: unknown;
  time: unknown;
  people: unknown;
  name: unknown;
  phone: unknown;
  email: unknown;
  contact: unknown;
  note: unknown;
  allergies: unknown;
  source: unknown;
  event: unknown; // slug dell'evento, facoltativo
  privacy: unknown; // deve essere true
};

export type NewRequestContext = { ip: string; isAdmin: boolean; origin: string | null };

export type NewRequestResult =
  | { ok: true; id: string; code: string; statusPath: string; isTest: boolean; reused?: boolean }
  | { ok: false; error: string; field?: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function createBookingRequest(input: NewRequestInput, ctx: NewRequestContext, now: Date = new Date()): Promise<NewRequestResult> {
  const settings = await loadBookingSettings();
  if (!settings.enabled && !ctx.isAdmin) return { ok: false, error: "Le prenotazioni online non sono attive. Chiamaci o scrivici su WhatsApp." };
  if (!ctx.isAdmin && pausedNow(settings, now)) return { ok: false, error: PAUSED_TEXT };

  const day = str(input.day, 10);
  const time = str(input.time, 5);
  const people = Number(input.people);
  const name = str(input.name, 80);
  const phoneRaw = str(input.phone, 40);
  const contact = input.contact === "email" ? "email" : "whatsapp";
  const email = str(input.email, 254).toLowerCase();
  const note = str(input.note, 300);

  // Anche date che non esistono («31 novembre», da un invio fatto a mano): «Scegli il giorno».
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || addDays(day, 0) !== day) return { ok: false, error: "Scegli il giorno.", field: "day" };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Scegli l'ora.", field: "time" };
  if (!Number.isInteger(people) || people < 1) return { ok: false, error: "Scegli quante persone.", field: "people" };
  if (people > settings.maxPeople) {
    return { ok: false, error: `Per più di ${settings.maxPeople} persone chiamaci o scrivici: ci organizziamo meglio a voce.`, field: "people" };
  }
  if (name.length < 2) return { ok: false, error: "Scrivi il tuo nome.", field: "name" };
  // Niente indirizzi web o email nel nome: finirebbe nei messaggi che partono a nome del locale.
  if (/https?:|www\.|:\/\/|@|<|>/i.test(name)) return { ok: false, error: "Scrivi solo il nome (e, se vuoi, il cognome).", field: "name" };
  const phoneError = phoneProblem(phoneRaw, contact);
  if (phoneError) return { ok: false, error: phoneError, field: "phone" };
  const phone = internationalNumber(phoneRaw);
  if (!phone) return { ok: false, error: "Il numero di telefono non sembra giusto: controllalo.", field: "phone" };
  if (contact === "email" && !isValidEmail(email)) return { ok: false, error: "L'indirizzo email non sembra giusto: controllalo.", field: "email" };
  if (input.privacy !== true) return { ok: false, error: "Per inviare la richiesta, conferma di aver letto l'informativa sulla privacy.", field: "privacy" };

  const avail = await dayAvailability(day, settings, now);
  if (avail.state !== "open") {
    const why =
      avail.state === "closed"
        ? "Quel giorno siamo chiusi: scegli un altro giorno."
        : avail.state === "full"
          ? "Quel giorno siamo già al completo: scegli un altro giorno o chiamaci."
          : avail.state === "past"
            ? "Quel giorno è già passato: scegli un altro giorno."
            : avail.state === "tooFar"
              ? `Si può chiedere un tavolo fino a ${settings.daysAhead} giorni prima.`
              : "Per quel giorno è troppo tardi per chiedere un tavolo online: chiamaci.";
    return { ok: false, error: why, field: "day" };
  }
  const slot = avail.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, error: "Quell'orario non è più disponibile: scegline un altro.", field: "time" };

  const isTest = !settings.enabled || process.env.VERCEL_ENV === "preview";
  const ipHash = createHash("sha256").update(`${secret()}:ip:${ctx.ip}`).digest("hex").slice(0, 32);

  // Freni contro gli abusi, contati nel database (le istanze del server non condividono la memoria).
  if (!ctx.isAdmin) {
    const hourAgo = new Date(now.getTime() - 60 * 60000);
    const [byIp, pendingByPhone] = await Promise.all([
      prisma.bookingRequest.count({ where: { ipHash, createdAt: { gte: hourAgo } } }),
      prisma.bookingRequest.count({ where: { phone, status: { in: ["PENDING", "PROPOSED"] }, startsAt: { gte: now } } }),
    ]);
    if (byIp >= 10) return { ok: false, error: "Hai mandato tante richieste in poco tempo: aspetta un po' oppure chiamaci." };
    if (pendingByPhone >= 3) return { ok: false, error: "Con questo numero ci sono già 3 richieste in attesa: aspetta la nostra risposta oppure chiamaci." };
    // Freno complessivo (senza firewall): troppe richieste online da chiunque in 10 minuti → pausa da sola.
    if (await spamBrake(now)) return { ok: false, error: PAUSED_TEXT };
  }
  const slug = str(input.event, 120);
  const promo = slug ? await prisma.menuPromo.findFirst({ where: { slug, kind: "EVENT", hidden: false, deletedAt: null }, select: { id: true } }) : null;
  const source = promo ? "evento" : normalizeSource(input.source);

  let created: BookingRow | null = null;
  let reused: { id: string; code: string; isTest: boolean } | null = null;
  let taken = false;
  for (let attempt = 0; attempt < 5 && !created && !reused && !taken; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
        // Stesso telefono, giorno e ora già chiesti (doppio tocco, rete che ripete l'invio): si riusa
        // quella richiesta. Il lucchetto sulla combinazione evita che due invii nello stesso istante
        // passino entrambi il controllo.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${phone}:${day}:${time}`}))`;
        const same = await tx.bookingRequest.findFirst({
          where: { phone, day, time, status: { in: ["PENDING", "PROPOSED", "CONFIRMED"] } },
          select: { id: true, code: true, isTest: true, ipHash: true, createdAt: true },
        });
        if (same) {
          // Si ridà il link solo a chi l'ha appena chiesta dallo stesso indirizzo: chi conosce solo
          // telefono, giorno e ora di qualcun altro non deve poter vedere o annullare la sua richiesta.
          if (same.ipHash === ipHash && now.getTime() - same.createdAt.getTime() < 15 * 60000) reused = same;
          else taken = true;
          return null;
        }
        const row = await tx.bookingRequest.create({
          data: {
            code: newCode(),
            tokenHash: `tmp_${createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex")}`,
            day,
            time,
            startsAt: slot.startsAt,
            people,
            name,
            phone,
            email: contact === "email" ? email || null : null,
            contact,
            note: note || null,
            allergies: input.allergies === true || mentionsAllergy(note),
            source,
            promoId: promo?.id ?? null,
            isTest,
            ipHash,
          },
        });
        const withToken = await tx.bookingRequest.update({ where: { id: row.id }, data: { tokenHash: hashToken(tokenFor(row.id)) } });
        await tx.bookingLog.create({ data: { requestId: row.id, actor: "cliente", kind: "CREATED", message: isTest ? "Richiesta di prova" : null } });
        return withToken;
      });
    } catch (e) {
      // Codice già usato (rarissimo): se ne prova un altro.
      if (!(e instanceof Error && /Unique constraint/i.test(e.message))) throw e;
    }
  }
  if (taken) {
    return {
      ok: false,
      error: "Con questo numero c'è già una richiesta per quel giorno e quell'ora: trovi il link nel messaggio che ti abbiamo mandato, oppure chiamaci.",
      field: "time",
    };
  }
  if (reused) {
    const r = reused as { id: string; code: string; isTest: boolean };
    return { ok: true, id: r.id, code: r.code, statusPath: statusPath(r.id), isTest: r.isTest, reused: true };
  }
  if (!created) return { ok: false, error: "Non siamo riusciti a salvare la richiesta: riprova tra poco." };
  return { ok: true, id: created.id, code: created.code, statusPath: statusPath(created.id), isTest };
}

// ---------- Freno anti-spam complessivo
//
// Oltre SPAM_MAX richieste online in SPAM_MINUTES minuti (contate nel database: le istanze del server non
// condividono la memoria) il modulo si mette in pausa da solo per PAUSE_MINUTES minuti: l'ora di fine sta
// nelle impostazioni, il titolare riceve UN avviso e può riaprire prima («Riapri ora»).

export const SPAM_MAX = 15;
export const SPAM_MINUTES = 10;
export const PAUSE_MINUTES = 30;
export const PAUSED_TEXT = "In questo momento le richieste online sono chiuse: chiamaci.";

async function spamBrake(now: Date): Promise<boolean> {
  const recent = await prisma.bookingRequest.count({ where: { manual: false, createdAt: { gte: new Date(now.getTime() - SPAM_MINUTES * 60000) } } });
  if (recent < SPAM_MAX) return false;
  // Un solo «primo»: con il lucchetto, due richieste insieme non mettono due pause (e due avvisi).
  const until = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking:pause'))`;
    const row = await tx.menuSetting.findUnique({ where: { id: "bookings" } });
    const current = parseBookingSettings(row?.value);
    if (pausedNow(current, now)) return null;
    const next = new Date(now.getTime() + PAUSE_MINUTES * 60000);
    const value = JSON.stringify({ ...current, pausedUntil: next.toISOString() });
    await tx.menuSetting.upsert({ where: { id: "bookings" }, update: { value }, create: { id: "bookings", value } });
    return next;
  });
  if (until) {
    const at = romeParts(until);
    const hhmm = `${String(Math.floor(at.minutes / 60)).padStart(2, "0")}:${String(at.minutes % 60).padStart(2, "0")}`;
    await later(() =>
      notifyOwner(
        "Richieste online in pausa",
        `Più di ${SPAM_MAX} richieste in ${SPAM_MINUTES} minuti: il modulo è chiuso fino alle ${hhmm}. Se va tutto bene, riaprilo da Prenotazioni › Impostazioni.`,
      ),
    );
  }
  return true;
}

// «Riapri ora» del titolare.
export async function clearPause(): Promise<void> {
  const current = await loadBookingSettings();
  if (current.pausedUntil) await saveBookingSettings({ ...current, pausedUntil: "" });
}

// Avviso solo al titolare (suoi dispositivi ed email per gli avvisi), senza una richiesta a cui legarlo.
async function notifyOwner(title: string, body: string): Promise<void> {
  if (isPreview()) return;
  const settings = await loadBookingSettings();
  await sendPushToStaff({ title, body, url: "/prenotazioni?apri=impostazioni", tag: "booking-pause" }, undefined, "owner").catch(() => {});
  if (settings.notifyEmail && isValidEmail(settings.notifyEmail) && mailConfigured()) {
    // Conta sulla quota del giorno (con la riserva per le prenotazioni).
    await sendTransactional([{ to: settings.notifyEmail, subject: oneLine(`${title}: ${body}`).slice(0, 180), text: body, html: `<p>${escapeHtml(body)}</p>` }])
      .catch(() => {});
  }
}

// Dopo il salvataggio (in after()): avvisi al personale e ricevuta al cliente per email.
export async function afterCreate(id: string, origin: string | null): Promise<void> {
  // Anche un buon momento per controllare i WhatsApp fermi da troppo (vedi remindStaleWhatsapp).
  await remindStaleWhatsapp().catch(() => 0);
  const b = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!b) return;
  if (b.isTest || isPreview()) return;
  await purgeOncePerDay().catch(() => {});
  const alert = staffAlert(b);
  await notifyStaff(b.id, alert.title, alert.body, `/prenotazioni?r=${b.id}`);
  if (b.contact === "email" && b.email) await sendCustomerMail(b, "received", origin);
}

// ---------- Agenda: prenotazioni segnate a mano (telefono, WhatsApp, di persona)
//
// Nascono già confermate, senza avvisi (chi le segna è già lì) e senza freni anti-abuso
// (le segna solo chi ha il permesso). Un orario fuori apertura o un giorno chiuso non
// bloccano: il servizio risponde con una domanda («segnarla lo stesso?») e si salva con force.

export type ManualInput = {
  day: unknown;
  time: unknown;
  people: unknown;
  name: unknown;
  phone: unknown;
  table: unknown;
  note: unknown;
  allergies: unknown;
  // «Ancora da definire»: ora e/o persone non ancora note (prenotazione vera, da completare).
  timeUnknown?: unknown;
  peopleUnknown?: unknown;
  menu?: unknown; // «Menù da 25 €», facoltativo
  source?: unknown; // solo alla creazione: "telefono" | "whatsapp" | "persona"
  force?: unknown; // true: segna anche fuori orario / giorno chiuso
  dupOk?: unknown; // true: «È un'altra, segna lo stesso» dopo l'avviso doppioni
};

export type ManualResult =
  // unchanged: «Salva le modifiche» senza aver cambiato niente.
  | { ok: true; booking: BookingRow; whatsappHref: string | null; unchanged?: boolean }
  | { ok: false; error: string; field?: string }
  // Da confermare: giorno chiuso, ora fuori apertura o già passata; dup: c'è già una prenotazione simile.
  | { ok: false; error: string; ask: string; dup?: boolean }
  // Modifica: nel frattempo un altro l'ha cambiata (con i dati di adesso) o è stata annullata.
  | { ok: false; error: string; conflict: BookingRow }
  | { ok: false; error: string; gone: true };

type CleanManual = {
  day: string;
  time: string;
  startsAt: Date;
  people: number;
  name: string;
  phone: string;
  table: string | null;
  note: string | null;
  allergies: boolean;
  timeUnknown: boolean;
  peopleUnknown: boolean;
  menu: string | null;
};

// Nella cronologia: «Segnata da Marta (telefono)». «librone»: arrivate con «Importa dal librone».
const SOURCE_LOG: Record<ManualSource | "librone", string> = { telefono: "telefono", whatsapp: "WhatsApp", persona: "di persona", librone: "dal librone" };

// keep: giorno e ora della prenotazione che si modifica (un giorno o un'ora già passati si possono
// tenere senza domande, per esempio per segnare il tavolo di ieri sera).
async function cleanManual(input: ManualInput, source: string | null, now: Date, keep?: { day: string; time: string; timeUnknown: boolean }): Promise<{ ok: true; v: CleanManual } | { ok: false; error: string; field?: string } | { ok: false; error: string; ask: string }> {
  const keepDay = keep?.day;
  const day = str(input.day, 10);
  const time = str(input.time, 5);
  const people = Number(input.people);
  const name = str(input.name, 80);
  const phoneRaw = str(input.phone, 40);
  const table = str(input.table, 20);
  const note = str(input.note, 300);
  const timeUnknown = input.timeUnknown === true;
  const peopleUnknown = input.peopleUnknown === true;
  const menu = cleanMenu(input.menu);
  const today = businessDay(now);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome.", field: "name" };
  if (!peopleUnknown && (!Number.isInteger(people) || people < 1 || people > 60)) return { ok: false, error: "Persone: scrivi un numero da 1 a 60, oppure «Ancora da definire».", field: "people" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || addDays(day, 0) !== day) return { ok: false, error: "Scegli il giorno.", field: "day" };
  // Un giorno già passato si può tenere solo se la prenotazione era già lì (modifica di altro).
  if (day < today && day !== keepDay) return { ok: false, error: "Quel giorno è già passato: scegli oggi o un giorno che deve venire.", field: "day" };
  if (day > addDays(today, 365)) return { ok: false, error: "Si può segnare fino a un anno avanti.", field: "day" };
  if (!timeUnknown && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "Scegli l'ora, oppure «Ancora da definire».", field: "time" };
  let phone = "";
  if (phoneRaw) {
    // Anche un fisso va bene: la conferma su WhatsApp la si manda solo a un cellulare.
    const problem = phoneProblem(phoneRaw, "email");
    if (problem) return { ok: false, error: problem.replace("il tuo numero", "il numero"), field: "phone" };
    phone = internationalNumber(phoneRaw) ?? "";
    if (!phone) return { ok: false, error: "Il numero di telefono non sembra giusto: controllalo.", field: "phone" };
  } else if (source === "keep") {
    // Modifica di una prenotazione che il numero l'aveva (per esempio online): non si toglie.
    return { ok: false, error: "Scrivi il telefono: serve per la conferma e per avvisare se cambia qualcosa.", field: "phone" };
  }
  // Senza numero va bene anche per «Telefono» e «WhatsApp»: al telefono si segna in fretta, il numero
  // si aggiunge dopo (nella prenotazione c'è il bollino «manca il numero»).
  // Giorno e ora non cambiati (si modifica altro): nessuna domanda, era già stata fatta.
  const kept = keep && keep.day === day && (timeUnknown ? keep.timeUnknown : !keep.timeUnknown && keep.time === time);
  if (input.force !== true && !kept && timeUnknown) {
    // Ora ancora da definire: si chiede solo se quel giorno il locale è chiuso.
    const { hours } = await loadVenue();
    const closed = (await closuresBetween(day, day)).get(day);
    if (closed?.kind === "closed" || withinOpening(day, "20:00", hours) === "closedDay") {
      return { ok: false, error: "Quel giorno risulta chiuso.", ask: `${closed?.kind === "closed" && closed.reason ? `Quel giorno risulta chiuso (${closed.reason})` : "Quel giorno risulta chiuso"}: segnarla lo stesso?` };
    }
  }
  if (input.force !== true && !kept && !timeUnknown) {
    // Orario già passato da più di mezz'ora (per esempio «Oggi» toccato al posto di «Domani»):
    // è lo sbaglio più probabile, quindi la prima domanda.
    const startsAt = romeInstant(day, timeToDayMinutes(time));
    if (startsAt.getTime() < now.getTime() - 30 * 60000) {
      const when = day === romeParts(now).dateKey ? "di oggi" : `di ${dayLong(day)}`;
      return { ok: false, error: "Orario già passato.", ask: `Le ${time} ${when} sono già passate: segnarla lo stesso?` };
    }
    const { hours } = await loadVenue();
    const closed = (await closuresBetween(day, day)).get(day);
    const open = closed?.kind === "closed" ? "closedDay" : withinOpening(day, time, hours);
    if (open === "closedDay") return { ok: false, error: "Quel giorno risulta chiuso.", ask: `${closed?.reason ? `Quel giorno risulta chiuso (${closed.reason})` : "Quel giorno risulta chiuso"}: segnarla lo stesso?` };
    if (open === "outside") return { ok: false, error: "Ora fuori dagli orari di apertura.", ask: `Alle ${time} il locale risulta chiuso: segnarla lo stesso?` };
  }
  return {
    ok: true,
    v: {
      day,
      time: timeUnknown ? "" : time,
      // Ora da definire: le 5:00 del giorno (inizio del giorno commerciale), sempre in quel giorno e in cima.
      startsAt: romeInstant(day, timeUnknown ? UNKNOWN_TIME_MINUTES : timeToDayMinutes(time)),
      people: peopleUnknown ? 0 : people,
      name,
      phone,
      table: table || null,
      note: note || null,
      allergies: input.allergies === true,
      timeUnknown,
      peopleUnknown,
      menu,
    },
  };
}

async function confirmationHref(b: BookingRow, origin: string | null): Promise<string | null> {
  // Ora o persone ancora da definire: niente conferma al cliente (avrebbe un orario inventato).
  if (!b.phone || isIncomplete(b)) return null;
  return customerWhatsappHref(b, "confirmed", origin, (await loadVenue()).contacts.address || null);
}

export async function createManualBooking(input: ManualInput, actor: StaffActor, origin: string | null, now: Date = new Date()): Promise<ManualResult> {
  const source = typeof input.source === "string" && (MANUAL_SOURCES as readonly string[]).includes(input.source) ? (input.source as ManualSource) : null;
  if (!source) return { ok: false, error: "Scegli da dove arriva: telefono, WhatsApp o di persona.", field: "source" };
  const c = await cleanManual(input, source, now);
  if (!c.ok) return c;
  const v = c.v;
  const settings = await loadBookingSettings();
  // Di prova solo con l'agenda spenta (o da un'anteprima): con l'agenda accesa quello che si segna è vero.
  const isTest = !settings.agendaEnabled || isPreview();
  // Doppio tocco su «Segna in agenda» (o rete che ripete l'invio): la stessa prenotazione non si segna due volte.
  const twin = await recentTwin(v, actor, now);
  if (twin) return { ok: true, booking: twin, whatsappHref: await confirmationHref(twin, origin) };
  if (input.dupOk !== true) {
    const dup = await findDuplicate({ day: v.day, phone: v.phone, name: v.name, isTest });
    if (dup) return { ok: false, error: "C'è già una prenotazione simile.", ask: dupQuestion(dup), dup: true };
  }
  const created = await insertManual(v, source, actor, isTest);
  if (!created) return { ok: false, error: "Non sono riuscito a salvarla: riprova tra poco." };
  return { ok: true, booking: created, whatsappHref: await confirmationHref(created, origin) };
}

// La stessa prenotazione segnata dalla stessa persona negli ultimi 2 minuti (doppio tocco).
function recentTwin(v: CleanManual, actor: StaffActor, now: Date): Promise<BookingRow | null> {
  return prisma.bookingRequest.findFirst({
    where: {
      manual: true,
      createdBy: actor.name,
      name: v.name,
      day: v.day,
      time: v.time,
      people: v.people,
      timeUnknown: v.timeUnknown,
      peopleUnknown: v.peopleUnknown,
      // Anche telefono, tavolo e nota: due Rossi diversi alla stessa ora non sono un doppio tocco.
      phone: v.phone,
      table: v.table,
      note: v.note,
      status: "CONFIRMED",
      createdAt: { gte: new Date(now.getTime() - 2 * 60000) },
    },
  });
}

// Salva una prenotazione segnata a mano: già confermata, con la riga «Segnata da …» in cronologia.
async function insertManual(v: CleanManual, source: ManualSource | "librone", actor: StaffActor, isTest: boolean): Promise<BookingRow | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const row = await tx.bookingRequest.create({
          data: {
            code: newCode(),
            tokenHash: `tmp_${createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex")}`,
            status: "CONFIRMED",
            day: v.day,
            time: v.time,
            startsAt: v.startsAt,
            people: v.people,
            name: v.name,
            phone: v.phone,
            contact: "whatsapp",
            note: v.note,
            allergies: v.allergies,
            table: v.table,
            timeUnknown: v.timeUnknown,
            peopleUnknown: v.peopleUnknown,
            menu: v.menu,
            source,
            manual: true,
            createdBy: actor.name,
            handledBy: actor.name,
            isTest,
          },
        });
        const withToken = await tx.bookingRequest.update({ where: { id: row.id }, data: { tokenHash: hashToken(tokenFor(row.id)) } });
        await tx.bookingLog.create({ data: { requestId: row.id, actor: actor.name, kind: "CREATED", message: `${SOURCE_LOG[source]}${isTest ? " · di prova" : ""}` } });
        return withToken;
      });
    } catch (e) {
      // Codice già usato (rarissimo): se ne prova un altro.
      if (!(e instanceof Error && /Unique constraint/i.test(e.message))) throw e;
    }
  }
  return null;
}

// ---------- «Importa dal librone»: tante prenotazioni insieme da una lista incollata
//
// Il testo si rilegge qui (parseImport), mai fidandosi dell'anteprima del browser. Ogni riga buona
// passa da cleanManual come «Segna lo stesso» (giorno chiuso o fuori orario non bloccano: sul librone
// c'erano già), ma un giorno passato no. Le prenotazioni già in agenda (stesso numero o stesso nome
// quel giorno) si saltano, tranne quelle che chi importa ha scelto di tenere («Importa lo stesso»).

export type ImportLineResult = {
  line: number;
  // Impronta della riga letta (importSig): il foglio la confronta con la sua anteprima.
  sig: string;
  ok: boolean;
  id?: string;
  error?: string;
  // Già in agenda: «C'è già Rossi alle 20:30 (4 persone)». skippedDuplicate: per questo non segnata.
  dup?: string;
  skippedDuplicate?: boolean;
  // Uguale alla riga… della stessa lista: non si segna due volte.
  repeatOf?: number;
  // Non blocca: giorno chiuso, ora fuori apertura o già passata.
  warning?: string;
};

export async function importManualBookings(
  text: string,
  keepLines: number[],
  actor: StaffActor,
  opts: { dryRun: boolean },
  now: Date = new Date(),
): Promise<{ ok: true; results: ImportLineResult[]; isTest: boolean } | { ok: false; error: string }> {
  const rows = parseImport(text, now).filter((r) => r.kind === "booking");
  if (rows.length > IMPORT_MAX_ROWS) return { ok: false, error: `Al massimo ${IMPORT_MAX_ROWS} prenotazioni alla volta: dividi la lista in più parti.` };
  const keep = new Set(keepLines);
  const settings = await loadBookingSettings();
  const isTest = !settings.agendaEnabled || isPreview();
  const days = [...new Set(rows.filter(importable).map((r) => r.day as string))].sort();
  // Una lettura sola per i doppioni e una per gli orari: le prenotazioni segnate qui non contano
  // (due «Rossi» diversi lo stesso giorno nella lista si segnano tutti e due).
  const [existing, venue, closures] = days.length
    ? await Promise.all([
        prisma.bookingRequest.findMany({ where: { day: { in: days }, isTest, status: { in: [...DUP_STATUSES] } }, select: DUP_SELECT, orderBy: { startsAt: "asc" } }),
        loadVenue(),
        closuresBetween(days[0], days[days.length - 1]),
      ])
    : [[], null, new Map<string, DayClosure>()];
  const results: ImportLineResult[] = [];
  for (const r of rows) {
    const base = { line: r.line, sig: importSig(r) };
    if (r.errors.length) {
      results.push({ ...base, ok: false, error: r.errors.join(" · ") });
      continue;
    }
    if (r.repeatOf !== null) {
      results.push({ ...base, ok: false, repeatOf: r.repeatOf });
      continue;
    }
    // Ora o persone che mancano: la prenotazione si segna lo stesso, «da completare».
    const c = await cleanManual(
      {
        day: r.day,
        time: r.time ?? "",
        people: r.people ?? 0,
        timeUnknown: r.time === null,
        peopleUnknown: r.people === null,
        name: r.name,
        phone: r.phone,
        table: r.table,
        note: r.note,
        menu: r.menu,
        allergies: mentionsAllergy(r.note),
        force: true,
      },
      "librone",
      now,
    );
    if (!c.ok) {
      results.push({ ...base, ok: false, error: c.error });
      continue;
    }
    const v = c.v;
    const warning = importWarning(v, venue?.hours ?? null, closures.get(v.day) ?? null, now);
    const dupRow = pickDuplicate(
      existing.filter((e) => e.day === v.day),
      { phone: v.phone || null, name: v.name },
    );
    const dup = dupRow ? `C'è già ${dupRow.status === "CONFIRMED" ? "" : "una richiesta di "}${dupRow.name} ${dupAt(dupRow)} (${peopleOrUnknown(dupRow)})${dupRow.status === "CONFIRMED" ? "" : ", da confermare"}` : undefined;
    if (dup && !keep.has(r.line)) {
      results.push({ ...base, ok: false, dup, skippedDuplicate: true, warning });
      continue;
    }
    if (opts.dryRun) {
      results.push({ ...base, ok: true, dup, warning });
      continue;
    }
    try {
      const saved = (await recentTwin(v, actor, now)) ?? (await insertManual(v, "librone", actor, isTest));
      results.push(saved ? { ...base, ok: true, id: saved.id, dup, warning } : { ...base, ok: false, error: "Non sono riuscito a salvarla: riprova tra poco." });
    } catch (e) {
      console.error("[prenotazioni] importa dal librone:", e);
      results.push({ ...base, ok: false, error: "Non sono riuscito a salvarla: riprova tra poco." });
    }
  }
  return { ok: true, results, isTest };
}

// Avviso (non blocca) per una prenotazione dal librone: le stesse domande del foglio «Nuova prenotazione».
function importWarning(v: CleanManual, hours: Hours | null, closure: DayClosure | null, now: Date): string | undefined {
  if (!v.timeUnknown && v.startsAt.getTime() < now.getTime() - 30 * 60000) return `Le ${v.time} di oggi sono già passate`;
  if (!hours) return undefined;
  if (closure?.kind === "closed") return closure.reason ? `Quel giorno risulta chiuso (${closure.reason})` : "Quel giorno risulta chiuso";
  if (v.timeUnknown) return withinOpening(v.day, "20:00", hours) === "closedDay" ? "Quel giorno risulta chiuso" : undefined;
  const open = withinOpening(v.day, v.time, hours);
  if (open === "closedDay") return "Quel giorno risulta chiuso";
  if (open === "outside") return `Alle ${v.time} il locale risulta chiuso`;
  return undefined;
}

// ---------- Doppioni: stesso numero lo stesso giorno, oppure stesso nome (senza maiuscole e accenti)

type DupRow = { id: string; name: string; day: string; time: string; people: number; status: string; phone: string; timeUnknown: boolean; peopleUnknown: boolean };
const DUP_STATUSES = ["PENDING", "PROPOSED", "CONFIRMED"] as const;
const DUP_SELECT = { id: true, name: true, day: true, time: true, people: true, status: true, phone: true, timeUnknown: true, peopleUnknown: true } as const;
// «alle 20:30» oppure «(ora da definire)».
const dupAt = (d: Pick<DupRow, "time" | "timeUnknown">) => (d.timeUnknown ? "con l'ora da definire" : `alle ${d.time}`);

export async function findDuplicate(c: { day: string; phone: string | null; name: string; isTest: boolean; excludeId?: string }): Promise<DupRow | null> {
  const rows = await prisma.bookingRequest.findMany({
    where: { day: c.day, isTest: c.isTest, status: { in: [...DUP_STATUSES] }, ...(c.excludeId ? { id: { not: c.excludeId } } : {}) },
    select: DUP_SELECT,
    orderBy: { startsAt: "asc" },
  });
  return pickDuplicate(rows, c);
}

// Tra le prenotazioni di quel giorno (in ordine di ora): prima le confermate (quelle in agenda), poi le richieste.
function pickDuplicate(rows: DupRow[], c: { phone: string | null; name: string }): DupRow | null {
  const key = nameKey(c.name);
  const hit = (r: DupRow) => (c.phone && r.phone === c.phone) || (key.length >= 2 && nameKey(r.name) === key);
  return rows.find((r) => r.status === "CONFIRMED" && hit(r)) ?? rows.find(hit) ?? null;
}

export function dupQuestion(d: DupRow): string {
  return `C'è già ${d.name} ${dayLong(d.day).split(" ")[0]} ${dupAt(d)} (${peopleOrUnknown(d)})${d.status === "CONFIRMED" ? "" : ", ancora da confermare"}: è la stessa?`;
}

// «Annulla» subito dopo averla segnata (nel messaggio «✓ Segnata…»): si cancella del tutto, ma solo
// se l'ha segnata la stessa persona da poco e nessuno l'ha ancora toccata.
export async function undoManualBooking(id: string, actor: StaffActor, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { manual: true, createdBy: true, createdAt: true, log: { select: { kind: true } } } });
  if (!b) return { ok: true };
  if (!b.manual || b.createdBy !== actor.name || now.getTime() - b.createdAt.getTime() > 15 * 60000 || b.log.some((l) => l.kind !== "CREATED")) {
    return { ok: false, error: "Non si può più togliere così: apri la prenotazione e annullala." };
  }
  await prisma.bookingRequest.deleteMany({ where: { id } });
  return { ok: true };
}

// Modifica di una prenotazione confermata (online o a mano). `version` è editVersion() dei dati che
// chi modifica aveva davanti: se nel frattempo qualcun altro li ha cambiati, non si sovrascrive e
// si rimandano i dati di adesso, da far vedere nel modulo. «Arrivati» e simili non contano.
export async function updateBooking(id: string, input: ManualInput, version: unknown, actor: StaffActor, origin: string | null, now: Date = new Date()): Promise<ManualResult> {
  const b = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!b) return { ok: false, error: "Questa prenotazione non c'è più.", gone: true };
  if (b.status !== "CONFIRMED") {
    return { ok: false, error: b.status === "CANCELLED" ? "Nel frattempo è stata annullata: non si può più modificare." : "Si possono modificare solo le prenotazioni confermate.", gone: true };
  }
  if (typeof version === "string" && editVersion(b) !== version) return conflictResult(b);
  // Telefono obbligatorio solo se c'era: una prenotazione online ha sempre il numero del cliente.
  const c = await cleanManual(input, b.phone ? "keep" : null, now, { day: b.day, time: b.time, timeUnknown: b.timeUnknown });
  if (!c.ok) return c;
  const v = c.v;
  const changes: string[] = [];
  const diff = (label: string, before: string | null, after: string | null) => {
    if ((before ?? "") !== (after ?? "")) changes.push(`${label} ${before || "—"} → ${after || "—"}`);
  };
  if (b.day !== v.day) changes.push(`giorno ${dayShort(b.day)} → ${dayShort(v.day)}`);
  diff("ora", b.timeUnknown ? "da definire" : b.time, v.timeUnknown ? "da definire" : v.time);
  diff("persone", b.peopleUnknown ? "da definire" : String(b.people), v.peopleUnknown ? "da definire" : String(v.people));
  diff("nome", b.name, v.name);
  diff("telefono", b.phone ? `+${b.phone}` : null, v.phone ? `+${v.phone}` : null);
  diff("tavolo", b.table, v.table);
  if ((b.note ?? "") !== (v.note ?? "")) changes.push(v.note ? "nota cambiata" : "nota tolta");
  if (b.allergies !== v.allergies) changes.push(v.allergies ? "allergie: sì" : "allergie: no");
  diff("menù", b.menu, v.menu);
  if (!changes.length) return { ok: true, booking: b, whatsappHref: await confirmationHref(b, origin), unchanged: true };
  // Si salva solo se i campi sono ancora quelli letti qui sopra (due «Salva» insieme: vince il primo).
  const r = await prisma.bookingRequest.updateMany({
    where: {
      id,
      status: "CONFIRMED",
      day: b.day,
      time: b.time,
      people: b.people,
      name: b.name,
      phone: b.phone,
      table: b.table,
      note: b.note,
      allergies: b.allergies,
      timeUnknown: b.timeUnknown,
      peopleUnknown: b.peopleUnknown,
      menu: b.menu,
    },
    data: {
      day: v.day,
      time: v.time,
      startsAt: v.startsAt,
      people: v.people,
      name: v.name,
      phone: v.phone,
      table: v.table,
      note: v.note,
      allergies: v.allergies,
      timeUnknown: v.timeUnknown,
      peopleUnknown: v.peopleUnknown,
      menu: v.menu,
      // Spostata a un altro giorno: «arrivati» / «non venuti» di prima non valgono più.
      ...(b.day !== v.day ? { arrivedAt: null, noShowAt: null } : {}),
    },
  });
  if (!r.count) {
    const now2 = await prisma.bookingRequest.findUnique({ where: { id } });
    if (!now2 || now2.status !== "CONFIRMED") return { ok: false, error: "Nel frattempo è stata annullata: non si può più modificare.", gone: true };
    return conflictResult(now2);
  }
  await log(id, actor.name, "UPDATED", changes.join(", "));
  const saved = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
  return { ok: true, booking: saved, whatsappHref: await confirmationHref(saved, origin) };
}

// «Nel frattempo l'ha modificata Marta»: il nome dall'ultima modifica in cronologia.
async function conflictResult(current: BookingRow): Promise<ManualResult> {
  const last = await prisma.bookingLog.findFirst({ where: { requestId: current.id, kind: "UPDATED" }, orderBy: { at: "desc" }, select: { actor: true } });
  return {
    ok: false,
    error: `Nel frattempo l'ha modificata ${last?.actor ?? "qualcun altro"}: qui sotto ci sono i dati aggiornati. Rifai la tua modifica e salva.`,
    conflict: current,
  };
}

export const INCOMPLETE_NO_CONFIRM = "Prima completa ora e persone: la conferma al cliente si manda quando sono decise.";

// «Da mandare dal telefono enoteca»: la conferma entra nella lista «Da mandare su WhatsApp».
export async function queueConfirmation(id: string, actor: StaffActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await prisma.bookingRequest.findUnique({
    where: { id },
    select: {
      status: true,
      phone: true,
      contact: true,
      cancelledBy: true,
      startsAt: true,
      proposedStartsAt: true,
      timeUnknown: true,
      peopleUnknown: true,
      log: { select: { at: true, actor: true, kind: true, message: true } },
    },
  });
  if (!b || b.status !== "CONFIRMED") return { ok: false, error: "Si può mandare solo la conferma di una prenotazione confermata." };
  if (isIncomplete(b)) return { ok: false, error: INCOMPLETE_NO_CONFIRM };
  if (!b.phone) return { ok: false, error: "Manca il telefono: aggiungilo con «Modifica»." };
  if (!whatsappReachable(b.phone)) return { ok: false, error: "È un numero fisso: su WhatsApp non arriva. Se serve, chiama il cliente." };
  // Già in lista e non ancora mandata (doppio tocco, o due persone): niente seconda voce in cronologia.
  if (whatsappPending(b, Date.now()) === "confirmed") return { ok: true };
  await log(id, actor.name, "WA_QUEUED", null);
  await later(() => notifyWhatsappQueue(id));
  return { ok: true };
}

// Una risposta è entrata in «Da mandare su WhatsApp»: avviso a chi può mandarla (dispositivi del
// titolare e quelli segnati «telefono enoteca»). Solo se c'è davvero qualcosa da mandare.
export async function notifyWhatsappQueue(id: string): Promise<void> {
  if (isPreview()) return;
  const b = await prisma.bookingRequest.findUnique({ where: { id }, include: { log: { select: { at: true, actor: true, kind: true, message: true } } } });
  if (!b || b.isTest || !whatsappPending(b, Date.now())) return;
  const kind = whatsappPending(b, Date.now());
  const time = b.status === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time;
  const what = kind === "confirmed" ? "conferma" : kind === "proposed" ? "altro orario" : kind === "declined" ? "siamo al completo" : "annullamento";
  const push = await sendPushToStaff(
    {
      title: "Da mandare su WhatsApp",
      body: `Da mandare su WhatsApp: ${what} per ${b.name}, ${dayTimeShort(b.day, time)} — tocca per aprire WhatsApp con il messaggio già scritto`,
      url: `/prenotazioni?r=${b.id}`,
      tag: `booking-wa-${b.id}`,
    },
    undefined,
    "whatsapp",
  ).catch(() => ({ sent: 0, failed: 1 }));
  if (push.sent) await log(id, "sistema", "PUSH_OK", `Avviso «da mandare su WhatsApp» a ${push.sent} ${push.sent === 1 ? "telefono" : "telefoni"}`);
  if (push.failed) await log(id, "sistema", "PUSH_FAIL", `${push.failed} ${push.failed === 1 ? "avviso non partito" : "avvisi non partiti"}`);
}

// ---------- Promemoria: un WhatsApp aspetta da troppo
//
// Con «Solo il telefono enoteca», se un messaggio resta «da mandare» per 15 minuti (telefono della sala
// scarico, spento, dimenticato), un solo avviso a titolare e consulente: «Da 15 minuti c'è un messaggio
// WhatsApp da mandare a Rossi: il telefono dell'enoteca è acceso?». Su Vercel Hobby non c'è un cron
// frequente: il controllo parte quando qualcuno apre Prenotazioni, mentre la pagina controlla la lista
// (ogni 8 secondi se c'è qualcosa da mandare) e quando arriva una richiesta. Una volta per risposta
// (BookingRequest.waRemindedAt, aggiornato in modo condizionato: due controlli insieme, un avviso solo).

export const REMIND_MINUTES = 15;
let lastRemindCheck = 0;

export async function remindStaleWhatsapp(now: Date = new Date(), opts: { force?: boolean } = {}): Promise<number> {
  if (isPreview()) return 0;
  // Non più di un controllo al minuto per server (la lista si controlla ogni 8 secondi).
  if (!opts.force && now.getTime() - lastRemindCheck < 60000) return 0;
  lastRemindCheck = now.getTime();
  const settings = await loadBookingSettings();
  if (!settings.agendaEnabled || settings.whatsappSenders !== "venue") return 0;
  const venues = await prisma.employee.count({ where: { isVenueDevice: true, active: true, canManageBookings: true } });
  if (!venues) return 0;
  const since = new Date(now.getTime() - REMIND_MINUTES * 60000);
  const rows = await prisma.bookingRequest.findMany({
    where: {
      isTest: false,
      day: { gte: addDays(businessDay(now), -1) },
      status: { in: ["CONFIRMED", "PROPOSED", "DECLINED", "CANCELLED"] },
      phone: { not: "" },
      // Solo quelle che hanno avuto una risposta da almeno 15 minuti.
      log: { some: { kind: { in: ["CONFIRMED", "ACCEPTED", "PROPOSED", "DECLINED", "CANCELLED", "WA_QUEUED"] }, at: { lte: since } } },
    },
    include: { log: { select: { at: true, actor: true, kind: true, message: true } } },
    take: 200,
  });
  let sent = 0;
  for (const b of rows) {
    const kind = whatsappPending(b, now.getTime());
    const queued = pendingSince(b);
    if (!kind || queued === null || now.getTime() - queued < REMIND_MINUTES * 60000) continue;
    // Qualcuno lo sta mandando adesso: niente promemoria.
    if (activeClaim(b, now.getTime())) continue;
    if (b.waRemindedAt && b.waRemindedAt.getTime() >= queued) continue;
    const won = await prisma.bookingRequest.updateMany({
      where: { id: b.id, OR: [{ waRemindedAt: null }, { waRemindedAt: { lt: new Date(queued) } }] },
      data: { waRemindedAt: now },
    });
    if (!won.count) continue;
    const minutes = Math.floor((now.getTime() - queued) / 60000);
    const body = `Da ${minutes} minuti c'è un messaggio WhatsApp da mandare a ${b.name}: il telefono dell'enoteca è acceso?`;
    const push = await sendPushToStaff({ title: "WhatsApp ancora da mandare", body, url: `/prenotazioni?r=${b.id}`, tag: `booking-wa-promemoria-${b.id}` }, undefined, "owner").catch(() => ({ sent: 0, failed: 1 }));
    await log(b.id, "sistema", "WA_REMINDER", push.sent ? `Promemoria al titolare (${push.sent} ${push.sent === 1 ? "telefono" : "telefoni"}): ${body}` : `Promemoria al titolare non arrivato a nessun telefono: ${body}`);
    sent++;
  }
  return sent;
}

// ---------- Avvisi

async function log(requestId: string, actor: string, kind: string, message?: string | null) {
  await prisma.bookingLog.create({ data: { requestId, actor, kind, message: message ?? null } });
}

async function notifyStaff(requestId: string, title: string, body: string, url: string) {
  if (isPreview()) return;
  const settings = await loadBookingSettings();
  const push = await sendPushToStaff({ title, body, url, tag: `booking-${requestId}` }).catch((e: unknown) => ({ sent: 0, failed: 1, error: String(e) }));
  if (push.sent) await log(requestId, "sistema", "PUSH_OK", `Avviso a ${push.sent} ${push.sent === 1 ? "telefono" : "telefoni"}`);
  if (push.failed) await log(requestId, "sistema", "PUSH_FAIL", `${push.failed} ${push.failed === 1 ? "avviso non partito" : "avvisi non partiti"}`);
  if (settings.notifyEmail && isValidEmail(settings.notifyEmail) && mailConfigured()) {
    try {
      await sendTransactional([
        {
          to: settings.notifyEmail,
          subject: oneLine(`${title}: ${body}`).slice(0, 180),
          text: `${body}\n\nApri le richieste: ${siteOrigin()}${url}`,
          html: staffMailHtml({ title, body, url: siteOrigin() + url, origin: siteOrigin(), venue: { address: "", phone: "" } }),
        },
      ]);
      await log(requestId, "sistema", "MAIL_OK", `Avviso al titolare (${settings.notifyEmail})`);
    } catch (e) {
      await log(requestId, "sistema", "MAIL_FAIL", `Avviso al titolare non partito: ${String(e).slice(0, 200)}`);
    }
  }
}

function messageInput(b: BookingRow, origin: string | null, extra: { address?: string | null } = {}) {
  return {
    ...extra,
    bookUrl: `${siteOrigin(origin)}/prenota`,
    name: b.name,
    day: b.day,
    // Ora o persone da definire: nel messaggio non si scrivono (mai un orario inventato).
    time: b.timeUnknown ? "" : b.time,
    people: b.peopleUnknown ? 0 : b.people,
    proposedTime: b.proposedTime,
    staffMessage: b.staffMessage,
    statusUrl: `${siteOrigin(origin)}${statusPath(b.id)}`,
    allergies: b.allergies,
  };
}

async function sendCustomerMail(b: BookingRow, kind: MessageKind, origin: string | null, wasConfirmed = false): Promise<boolean> {
  if (!b.email || !mailConfigured() || b.isTest || isPreview()) return false;
  const venue = await loadVenue();
  const m = { ...messageInput(b, origin, { address: venue.contacts.address || null }), wasConfirmed };
  const text = customerMessage(kind, m);
  const subject = customerSubject(kind, m);
  const site = siteOrigin(origin);
  try {
    await sendTransactional([
      {
        to: b.email,
        subject: oneLine(`${subject} · ${VENUE_NAME}`),
        text,
        // La veste delle mail della sezione Mail, con riepilogo e pulsanti; nessun elemento da newsletter.
        html: bookingMailHtml({
          kind,
          text,
          subject,
          m: { ...m, code: b.code, peopleUnknown: b.peopleUnknown },
          origin: site,
          calendarUrl: kind === "confirmed" && !b.timeUnknown ? `${site}${statusPath(b.id)}/calendario` : null,
          canCancel: kind === "received" || kind === "confirmed",
          venue: { address: venue.contacts.address, phone: venue.contacts.phone },
        }),
      },
    ]);
    await log(b.id, "sistema", "MAIL_OK", `Email al cliente: ${subject}`);
    return true;
  } catch (e) {
    await log(b.id, "sistema", "MAIL_FAIL", `Email al cliente non partita: ${String(e).slice(0, 200)}`);
    return false;
  }
}

// Messaggio WhatsApp già scritto per il cliente (chi lavora tocca Invia dal telefono enoteca).
export function customerWhatsappHref(b: BookingRow, kind: MessageKind, origin: string | null, address?: string | null): string | null {
  if (!whatsappReachable(b.phone)) return null;
  // Il numero è salvato già internazionale («33612345678»): con il «+» non si confonde con un numero italiano.
  return whatsappHref(`+${b.phone}`, customerMessage(kind, messageInput(b, origin, { address: address ?? null })));
}

// ---------- Risposte del locale

// selfWa: chi risponde ha WhatsApp a portata di mano (titolare o telefono enoteca) e lo manda lui:
// niente avviso «da mandare su WhatsApp» agli altri.
export type StaffActor = { name: string; selfWa?: boolean };
export type StaffResult =
  | { ok: true; booking: BookingRow; mailSent: boolean; whatsappHref: string | null }
  | { ok: false; error: string; ask?: string };

async function alreadyHandled(id: string): Promise<string> {
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { status: true, handledBy: true, cancelledBy: true } });
  if (!b) return "Questa richiesta non c'è più.";
  const who = b.handledBy ? ` da ${b.handledBy}` : "";
  switch (b.status) {
    case "CONFIRMED":
      return `Già confermata${who}.`;
    case "DECLINED":
      return `Già gestita${who}: non c'era posto.`;
    case "PROPOSED":
      return `Già gestita${who}: è stato proposto un altro orario.`;
    case "CANCELLED":
      return b.cancelledBy === "cliente" ? "Il cliente l'ha annullata." : `Già annullata${who}.`;
    default:
      return "Qualcuno l'ha appena cambiata: ricarica la pagina.";
  }
}

async function respond(
  id: string,
  actor: StaffActor,
  from: ("PENDING" | "PROPOSED" | "CONFIRMED")[],
  data: Parameters<typeof prisma.bookingRequest.updateMany>[0]["data"],
  logKind: string,
  logMessage: string | null,
  kind: MessageKind | null,
  origin: string | null,
): Promise<StaffResult> {
  const now = new Date();
  const res = await prisma.bookingRequest.updateMany({
    where: { id, status: { in: from } },
    data: { ...data, handledBy: actor.name },
  });
  if (res.count === 0) return { ok: false, error: await alreadyHandled(id) };
  // Prima risposta del locale (per il «tempo di risposta» nei numeri): non si sovrascrive dopo.
  await prisma.bookingRequest.updateMany({ where: { id, handledAt: null }, data: { handledAt: now } });
  await log(id, actor.name, logKind, logMessage);
  const booking = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
  let mailSent = false;
  let wa: string | null = null;
  if (kind) {
    if (booking.contact === "email" && booking.email) mailSent = await sendCustomerMail(booking, kind, origin);
    // WhatsApp sempre pronto: anche per chi ha scelto l'email, se la mail non è partita.
    wa = customerWhatsappHref(booking, kind, origin, (await loadVenue()).contacts.address || null);
    if (wa && !actor.selfWa && !booking.isTest) await later(() => notifyWhatsappQueue(id));
  }
  return { ok: true, booking, mailSent, whatsappHref: wa };
}

const msg = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

export async function confirmBooking(id: string, actor: StaffActor, message: unknown, origin: string | null, dupOk = false): Promise<StaffResult> {
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { startsAt: true, status: true, day: true, phone: true, name: true, isTest: true } });
  if (b && b.status === "PENDING" && b.startsAt.getTime() < Date.now() - 30 * 60000) {
    return { ok: false, error: "L'orario di questa richiesta è già passato: non si può più confermare." };
  }
  // C'è già (in agenda o tra le richieste) lo stesso cliente quel giorno? Prima di confermare, si chiede.
  if (b && b.status === "PENDING" && !dupOk) {
    const dup = await findDuplicate({ day: b.day, phone: b.phone || null, name: b.name, isTest: b.isTest, excludeId: id });
    if (dup) return { ok: false, error: "C'è già una prenotazione simile.", ask: dupQuestion(dup) };
  }
  return respond(id, actor, ["PENDING"], { status: "CONFIRMED", staffMessage: msg(message) }, "CONFIRMED", msg(message), "confirmed", origin);
}

export async function proposeTime(id: string, actor: StaffActor, time: unknown, message: unknown, origin: string | null): Promise<StaffResult> {
  const b = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!b) return { ok: false, error: "Questa richiesta non c'è più." };
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "Scegli l'orario da proporre." };
  if (time === b.time) return { ok: false, error: "È lo stesso orario richiesto: scegline un altro oppure conferma." };
  const startsAt = romeInstant(b.day, timeToDayMinutes(time));
  if (startsAt.getTime() < Date.now()) return { ok: false, error: "Quell'orario è già passato: scegline un altro." };
  // Solo dentro gli orari di apertura di quel giorno (anche se la serata è «al completo» online).
  const [{ hours }, closures, settings] = await Promise.all([loadVenue(), closuresBetween(b.day, b.day), loadBookingSettings()]);
  const closure = closures.get(b.day);
  const open = availability(
    b.day,
    hours,
    // todayUntil vuoto: «per stasera online fino alle…» ferma i clienti, non il personale che propone un orario.
    { ...settings, firstTime: "05:00", step: 5, lastBeforeClose: 0, leadMinutes: 0, daysAhead: 400, todayUntil: "" },
    closure?.kind === "closed" ? closure : null,
    new Date(),
  );
  if (open.state !== "open") return { ok: false, error: "Quel giorno siamo chiusi: non si può proporre un orario." };
  if (!open.slots.some((sl) => sl.time === time)) return { ok: false, error: `Alle ${time} siamo chiusi: scegli un orario dentro l'apertura.` };
  return respond(
    id,
    actor,
    ["PENDING"],
    { status: "PROPOSED", proposedTime: time, proposedStartsAt: startsAt, staffMessage: msg(message) },
    "PROPOSED",
    `Proposto alle ${time}${msg(message) ? ` · ${msg(message)}` : ""}`,
    "proposed",
    origin,
  );
}

// Il cliente ha risposto «sì» all'orario proposto, per esempio su WhatsApp: lo segna chi lavora.
export async function acceptProposalForCustomer(id: string, actor: StaffActor, origin: string | null): Promise<StaffResult> {
  const b = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!b) return { ok: false, error: "Questa richiesta non c'è più." };
  if (b.status !== "PROPOSED" || !b.proposedTime || !b.proposedStartsAt) return { ok: false, error: await alreadyHandled(id) };
  return respond(
    id,
    actor,
    ["PROPOSED"],
    { status: "CONFIRMED", time: b.proposedTime, startsAt: b.proposedStartsAt, proposedTime: null, proposedStartsAt: null, staffMessage: null },
    "ACCEPTED",
    `Il cliente ha detto sì alle ${b.proposedTime} (segnato da ${actor.name})`,
    "confirmed",
    origin,
  );
}

export function declineBooking(id: string, actor: StaffActor, message: unknown, origin: string | null) {
  return respond(id, actor, ["PENDING", "PROPOSED"], { status: "DECLINED", staffMessage: msg(message) }, "DECLINED", msg(message), "declined", origin);
}

// Il cliente ha risposto «no» all'orario proposto (per esempio su WhatsApp): lo segna chi lavora.
// Nessun messaggio al cliente (ce l'ha appena detto lui) e niente nella lista di WhatsApp.
export async function refuseProposalForCustomer(id: string, actor: StaffActor, origin: string | null): Promise<StaffResult> {
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { status: true, proposedTime: true } });
  if (!b) return { ok: false, error: "Questa richiesta non c'è più." };
  if (b.status !== "PROPOSED") return { ok: false, error: await alreadyHandled(id) };
  return respond(id, actor, ["PROPOSED"], { status: "DECLINED", cancelledBy: "cliente" }, "REFUSED", `Il cliente ha detto no alle ${b.proposedTime ?? "orario proposto"} (segnato da ${actor.name})`, null, origin);
}

// «Ci ha avvisato il cliente»: non viene più (ha chiamato o scritto). Nessun messaggio al cliente.
export function cancelForCustomer(id: string, actor: StaffActor, origin: string | null) {
  return respond(id, actor, ["PENDING", "PROPOSED", "CONFIRMED"], { status: "CANCELLED", cancelledBy: "cliente" }, "CANCELLED", CUSTOMER_TOLD_US, null, origin);
}
export const CUSTOMER_TOLD_US = "Ci ha avvisato il cliente";

export function cancelByVenue(id: string, actor: StaffActor, message: unknown, origin: string | null) {
  return respond(id, actor, ["CONFIRMED"], { status: "CANCELLED", cancelledBy: "locale", staffMessage: msg(message) }, "CANCELLED", msg(message), "cancelledByVenue", origin);
}

// Arrivati / non venuti: solo per le confermate, dal giorno stesso.
export async function markArrival(id: string, actor: StaffActor, arrived: boolean | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { status: true, day: true, startsAt: true } });
  if (!b || b.status !== "CONFIRMED") return { ok: false, error: "Si può segnare solo una prenotazione confermata." };
  const now = new Date();
  if (arrived === true && b.day > businessDay(now)) return { ok: false, error: "Si può segnare «Arrivati» solo dal giorno della prenotazione." };
  if (arrived === false && b.startsAt.getTime() > now.getTime()) return { ok: false, error: "«Non venuti» si può segnare solo dopo l'orario." };
  const r = await prisma.bookingRequest.updateMany({
    where: { id, status: "CONFIRMED" },
    data: arrived === null ? { arrivedAt: null, noShowAt: null } : arrived ? { arrivedAt: now, noShowAt: null } : { noShowAt: now, arrivedAt: null },
  });
  if (!r.count) return { ok: false, error: "Nel frattempo è stata annullata: ricarica la pagina." };
  await log(id, actor.name, arrived === null ? "ARRIVAL_CLEARED" : arrived ? "ARRIVED" : "NOSHOW", null);
  return { ok: true };
}

// ---------- WhatsApp ai clienti: una sola coda per tutti, con un lucchetto
//
// «Apri WhatsApp» prende in mano la risposta (waClaimBy/waClaimAt, aggiornamento condizionato: in due
// insieme vince il primo, l'altro legge «In invio da …»); «Mandato» la toglie dalla coda per tutti;
// «Annulla» la libera; dopo 5 minuti senza «Mandato» torna libera da sola. Se è già stata mandata,
// non si riapre WhatsApp (il cliente riceverebbe due messaggi) se non con «Rimanda lo stesso».

const hhmmRome = (d: Date) => {
  const p = romeParts(d);
  return `${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(p.minutes % 60).padStart(2, "0")}`;
};

export type ClaimResult = { ok: true } | { ok: false; error: string; claimedBy?: string; sentBy?: string; at?: number };

// device: un numero a caso tenuto sull'apparecchio (localStorage). Con lo stesso nome su due apparecchi
// (il titolare dal telefono e dal computer) il messaggio lo prende uno solo; null = apparecchio sconosciuto
// (pagina vecchia ancora aperta): vale solo il nome, come prima.
export async function claimWhatsapp(id: string, actor: string, from: string, force: boolean, now: Date = new Date(), device: string | null = null): Promise<ClaimResult> {
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { waClaimBy: true, waClaimAt: true, log: { select: { at: true, actor: true, kind: true, message: true } } } });
  if (!b) return { ok: false, error: "Questa richiesta non c'è più." };
  const sent = lastSent(b);
  if (sent && !force) return { ok: false, error: `Già mandato da ${sent.by} alle ${hhmmRome(new Date(sent.at))}`, sentBy: sent.by, at: sent.at };
  const free = new Date(now.getTime() - CLAIM_MINUTES * 60000);
  const mine = device ? { waClaimBy: actor, OR: [{ waClaimDevice: null }, { waClaimDevice: device }] } : { waClaimBy: actor };
  const r = await prisma.bookingRequest.updateMany({
    where: { id, OR: [{ waClaimAt: null }, { waClaimAt: { lt: free } }, mine] },
    data: { waClaimBy: actor, waClaimAt: now, waClaimDevice: device },
  });
  if (!r.count) {
    const c = await prisma.bookingRequest.findUnique({ where: { id }, select: { waClaimBy: true, waClaimAt: true } });
    const elsewhere = c?.waClaimBy === actor ? " su un altro apparecchio" : "";
    return { ok: false, error: `In invio da ${c?.waClaimBy ?? "qualcun altro"}${elsewhere}${c?.waClaimAt ? ` dalle ${hhmmRome(c.waClaimAt)}` : ""}`, claimedBy: c?.waClaimBy ?? undefined, at: c?.waClaimAt?.getTime() };
  }
  await log(id, actor, "WHATSAPP_OPENED", `in invio ${from}${force && sent ? " (rimandato)" : ""}`);
  return { ok: true };
}

// «Annulla»: la risposta torna libera (solo chi l'aveva presa).
export async function releaseWhatsapp(id: string, actor: string, device: string | null = null): Promise<void> {
  await prisma.bookingRequest.updateMany({
    where: { id, waClaimBy: actor, ...(device ? { OR: [{ waClaimDevice: null }, { waClaimDevice: device }] } : {}) },
    data: { waClaimBy: null, waClaimAt: null, waClaimDevice: null },
  });
}

// «Mandato» (from: «dal numero dell'enoteca» / «dal WhatsApp personale»); null = «Segna come già mandata».
export async function markWhatsappSent(id: string, actor: string, from: string | null): Promise<void> {
  await log(id, actor, "WHATSAPP_DONE", from);
  await prisma.bookingRequest.updateMany({ where: { id }, data: { waClaimBy: null, waClaimAt: null, waClaimDevice: null } });
}

// ---------- Serate al completo

export async function setDayFull(day: string, full: boolean, actor: StaffActor, reason?: string | null): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Giorno non valido.");
  if (full) {
    await prisma.bookingClosedDay.upsert({
      where: { day },
      update: { reason: reason ?? null, createdBy: actor.name },
      create: { day, reason: reason ?? null, createdBy: actor.name },
    });
  } else {
    await prisma.bookingClosedDay.deleteMany({ where: { day } });
  }
}

// ---------- Il cliente dalla sua pagina

export async function findByToken(token: string): Promise<BookingRow | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  return prisma.bookingRequest.findUnique({ where: { tokenHash: hashToken(token) } });
}

export type CustomerResult = { ok: true; booking: BookingRow } | { ok: false; error: string };

export async function customerAction(token: string, action: unknown, origin: string | null): Promise<CustomerResult> {
  const b = await findByToken(token);
  if (!b) return { ok: false, error: "Questa richiesta non c'è più." };
  const now = new Date();
  if (action === "cancel") {
    const r = await prisma.bookingRequest.updateMany({
      // Ora da definire (startsAt alle 5 di quel giorno): si può annullare fino a fine giornata.
      where: { id: b.id, status: { in: ["PENDING", "PROPOSED", "CONFIRMED"] }, startsAt: { gt: b.timeUnknown ? new Date(now.getTime() - 24 * 3600000) : now }, arrivedAt: null, noShowAt: null },
      data: { status: "CANCELLED", cancelledBy: "cliente" },
    });
    if (!r.count) return { ok: false, error: "Non si può più annullare da qui: chiamaci." };
    await log(b.id, "cliente", "CANCELLED", null);
    const updated = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: b.id } });
    // Avvisi ed email dopo la risposta: un servizio lento non fa aspettare il cliente.
    if (!updated.isTest) {
      await later(async () => {
        await notifyStaff(b.id, "Prenotazione annullata dal cliente", `${updated.name} · ${dayLong(updated.day)}${updated.timeUnknown ? "" : ` alle ${updated.time}`} · ${peopleOrUnknown(updated)}`, `/prenotazioni?r=${b.id}`);
        if (updated.contact === "email") await sendCustomerMail(updated, "cancelledByCustomer", origin, b.status === "CONFIRMED");
      });
    }
    return { ok: true, booking: updated };
  }
  if (action === "accept" || action === "refuse") {
    if (b.status !== "PROPOSED" || !b.proposedTime || !b.proposedStartsAt) return { ok: false, error: "Non c'è nessun orario da accettare." };
    if (b.proposedStartsAt.getTime() < now.getTime()) return { ok: false, error: "L'orario proposto è già passato: chiamaci." };
    const accept = action === "accept";
    const r = await prisma.bookingRequest.updateMany({
      where: { id: b.id, status: "PROPOSED" },
      data: accept
        ? { status: "CONFIRMED", time: b.proposedTime, startsAt: b.proposedStartsAt, proposedTime: null, proposedStartsAt: null }
        : { status: "DECLINED", cancelledBy: "cliente" },
    });
    if (!r.count) return { ok: false, error: "Qualcosa è cambiato nel frattempo: ricarica la pagina." };
    await log(b.id, "cliente", accept ? "ACCEPTED" : "REFUSED", accept ? `Va bene alle ${b.proposedTime}` : `No alle ${b.proposedTime}`);
    const updated = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: b.id } });
    if (!updated.isTest) {
      await later(async () => {
        await notifyStaff(
          b.id,
          accept ? "Il cliente ha accettato il nuovo orario" : "Il cliente ha detto no al nuovo orario",
          `${updated.name} · ${dayLong(updated.day)} alle ${accept ? updated.time : b.proposedTime} · ${peopleText(updated.people)}`,
          `/prenotazioni?r=${b.id}`,
        );
        if (accept && updated.contact === "email") await sendCustomerMail(updated, "confirmed", origin);
      });
    }
    return { ok: true, booking: updated };
  }
  return { ok: false, error: "Azione non valida." };
}

// ---------- Elenchi per il personale

export async function pendingCount(): Promise<number> {
  return prisma.bookingRequest.count({
    where: { isTest: false, status: "PENDING", startsAt: { gte: new Date() } },
  });
}

// Le cose da fare per chi gestisce le prenotazioni: richieste da confermare e risposte da mandare su
// WhatsApp (pallino del menù «Prenotazioni», widget «Da fare»).
export async function bookingsToDo(now: Date = new Date()): Promise<{ pending: number; whatsapp: number; incomplete: number }> {
  const [pending, risposte, incomplete] = await Promise.all([
    pendingCount(),
    prisma.bookingRequest.findMany({
      // Anche le conferme in coda delle prenotazioni segnate a mano (non hanno handledAt).
      where: {
        isTest: false,
        OR: [{ handledAt: { not: null } }, { manual: true }],
        status: { in: ["CONFIRMED", "PROPOSED", "DECLINED", "CANCELLED"] },
        startsAt: { gte: new Date(now.getTime() - 86400000) },
      },
      select: {
        status: true,
        contact: true,
        phone: true,
        cancelledBy: true,
        startsAt: true,
        proposedStartsAt: true,
        timeUnknown: true,
        peopleUnknown: true,
        log: { select: { at: true, actor: true, kind: true, message: true } },
      },
    }),
    incompleteCount(now),
  ]);
  return { pending, whatsapp: risposte.filter((b) => whatsappPending(b, now.getTime()) !== null).length, incomplete };
}

// Prenotazioni vere con ora o persone ancora da definire, da oggi in avanti («Da completare»).
// Non sono mai richieste da confermare né risposte da mandare: nessun conteggio doppio.
export async function incompleteCount(now: Date = new Date()): Promise<number> {
  return prisma.bookingRequest.count({
    where: { isTest: false, status: "CONFIRMED", day: { gte: businessDay(now) }, OR: [{ timeUnknown: true }, { peopleUnknown: true }] },
  });
}

export async function listBookings(now: Date = new Date()) {
  await purgeOncePerDay(now).catch(() => {});
  const today = businessDay(now);
  const since = addDays(today, -30);
  const rows = await prisma.bookingRequest.findMany({
    where: { day: { gte: since } },
    orderBy: [{ startsAt: "asc" }],
    include: { promo: { select: { title: true, slug: true } }, log: { orderBy: { at: "asc" } } },
  });
  const full = await prisma.bookingClosedDay.findMany({ where: { day: { gte: today } }, orderBy: { day: "asc" } });
  return { today, rows, fullDays: full };
}

// Numeri per la scheda «Numeri»: ultimi 90 giorni, senza le prove. Le richieste online e le
// prenotazioni segnate a mano si contano a parte (le seconde non hanno «al completo» né tempi di risposta).
export async function bookingStats(now: Date = new Date()) {
  const since = new Date(now.getTime() - 90 * 86400000);
  const rows = await prisma.bookingRequest.findMany({
    where: { isTest: false, createdAt: { gte: since } },
    select: { status: true, source: true, manual: true, createdAt: true, handledAt: true, people: true, noShowAt: true, arrivedAt: true, cancelledBy: true, startsAt: true },
  });
  const bySource = new Map<string, { n: number; confirmed: number; people: number }>();
  let total = 0;
  let confirmed = 0;
  let declined = 0;
  let cancelled = 0;
  let noShow = 0;
  let people = 0;
  const manual = { total: 0, confirmed: 0, people: 0, cancelled: 0 };
  const responseMinutes: number[] = [];
  for (const r of rows) {
    {
      const key = r.source ?? "altro";
      const s = bySource.get(key) ?? { n: 0, confirmed: 0, people: 0 };
      s.n++;
      if (r.status === "CONFIRMED") {
        s.confirmed++;
        s.people += r.people;
      }
      bySource.set(key, s);
    }
    if (r.noShowAt) noShow++;
    if (r.manual) {
      manual.total++;
      if (r.status === "CONFIRMED") {
        manual.confirmed++;
        manual.people += r.people;
      }
      if (r.status === "CANCELLED") manual.cancelled++;
      continue;
    }
    total++;
    if (r.status === "CONFIRMED") {
      confirmed++;
      people += r.people;
    }
    if (r.status === "DECLINED" && r.cancelledBy !== "cliente") declined++;
    if (r.status === "CANCELLED") cancelled++;
    if (r.handledAt) responseMinutes.push((r.handledAt.getTime() - r.createdAt.getTime()) / 60000);
  }
  responseMinutes.sort((a, b) => a - b);
  const median = responseMinutes.length ? responseMinutes[Math.floor(responseMinutes.length / 2)] : null;
  return { total, confirmed, declined, cancelled, noShow, people, manual, medianResponseMinutes: median, bySource: [...bySource.entries()].sort((a, b) => b[1].n - a[1].n) };
}

// ---------- Conservazione dei dati (informativa: «fino a 6 mesi dopo la data, poi li cancelliamo»)

const KEEP_DAYS = 183;

export async function purgeOldBookings(now: Date = new Date()): Promise<number> {
  const limit = addDays(businessDay(now), -KEEP_DAYS);
  const r = await prisma.bookingRequest.deleteMany({ where: { day: { lt: limit } } });
  return r.count;
}

// Al massimo una volta al giorno (non a ogni ricarica della pagina): il giorno dell'ultima pulizia
// sta in MenuSetting «bookings-purge». Chi arriva per primo nel giorno la fa.
const PURGE_ID = "bookings-purge";
export async function purgeOncePerDay(now: Date = new Date()): Promise<number | null> {
  const today = businessDay(now);
  const row = await prisma.menuSetting.findUnique({ where: { id: PURGE_ID } });
  if (row?.value === today) return null;
  const r = row
    ? await prisma.menuSetting.updateMany({ where: { id: PURGE_ID, value: row.value }, data: { value: today } })
    : await prisma.menuSetting.createMany({ data: [{ id: PURGE_ID, value: today }], skipDuplicates: true });
  if (!r.count) return null;
  return purgeOldBookings(now);
}

// ---------- Prenotazioni di prova, all'accensione dell'agenda o delle richieste online

export async function testBookingsCount(): Promise<number> {
  return prisma.bookingRequest.count({ where: { isTest: true } });
}

// «Cancella le prove» oppure «Tienile e rendile vere»: diventano vere solo quelle segnate a mano, non
// annullate, da oggi in poi (le altre prove non servono a niente e si cancellano).
export async function resolveTestBookings(how: "delete" | "keep", now: Date = new Date()): Promise<{ deleted: number; kept: number }> {
  let kept = 0;
  if (how === "keep") {
    const r = await prisma.bookingRequest.updateMany({
      where: { isTest: true, manual: true, status: { not: "CANCELLED" }, day: { gte: businessDay(now) } },
      data: { isTest: false },
    });
    kept = r.count;
  }
  const d = await prisma.bookingRequest.deleteMany({ where: { isTest: true } });
  return { deleted: d.count, kept };
}

// Quante delle prove diventerebbero vere con «Tienile»?
export async function keepableTestBookings(now: Date = new Date()): Promise<number> {
  return prisma.bookingRequest.count({ where: { isTest: true, manual: true, status: { not: "CANCELLED" }, day: { gte: businessDay(now) } } });
}

// Il cliente chiede di cancellare i suoi dati: il titolare la elimina con la cronologia.
export async function eraseBooking(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await prisma.bookingRequest.deleteMany({ where: { id } });
  return r.count ? { ok: true } : { ok: false, error: "Questa richiesta non c'è più." };
}
