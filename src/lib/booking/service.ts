// Prenotazioni online: database, cambi di stato e avvisi. Solo server.
//
// Regole che valgono ovunque:
// - ogni cambio di stato è un aggiornamento condizionato (updateMany con lo stato atteso):
//   se due persone rispondono insieme, vince la prima e l'altra legge «già gestita da…»;
// - i messaggi partono solo dopo il salvataggio, e ogni invio (riuscito o no) resta nella cronologia;
// - richieste di prova (funzione spenta, anteprime di Vercel) non avvisano nessuno.

import { createHash, createHmac, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { loadVenue } from "@/lib/menu";
import { internationalNumber, whatsappHref } from "@/lib/menu-venue";
import { escapeHtml, getProvider, isValidEmail, mailConfigured, oneLine } from "@/lib/mail";
import {
  addDays,
  availability,
  businessDay,
  dayShort,
  normalizeSource,
  parseBookingSettings,
  romeInstant,
  timeToDayMinutes,
  type BookingSettings,
  type DayAvailability,
  type DayClosure,
} from "@/lib/booking/rules";
import { customerMessage, customerSubject, staffAlert, VENUE_NAME, type MessageKind } from "@/lib/booking/messages";
import { sendPushToStaff } from "@/lib/booking/push";

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
export function siteOrigin(requestOrigin?: string | null): string {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return requestOrigin || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
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
  | { ok: true; id: string; code: string; statusPath: string; isTest: boolean }
  | { ok: false; error: string; field?: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function createBookingRequest(input: NewRequestInput, ctx: NewRequestContext, now: Date = new Date()): Promise<NewRequestResult> {
  const settings = await loadBookingSettings();
  if (!settings.enabled && !ctx.isAdmin) return { ok: false, error: "Le prenotazioni online non sono attive. Chiamaci o scrivici su WhatsApp." };

  const day = str(input.day, 10);
  const time = str(input.time, 5);
  const people = Number(input.people);
  const name = str(input.name, 80);
  const phoneRaw = str(input.phone, 40);
  const contact = input.contact === "email" ? "email" : "whatsapp";
  const email = str(input.email, 254).toLowerCase();
  const note = str(input.note, 300);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "Scegli il giorno.", field: "day" };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Scegli l'ora.", field: "time" };
  if (!Number.isInteger(people) || people < 1) return { ok: false, error: "Scegli quante persone.", field: "people" };
  if (people > settings.maxPeople) {
    return { ok: false, error: `Per più di ${settings.maxPeople} persone chiamaci o scrivici: ci organizziamo meglio a voce.`, field: "people" };
  }
  if (name.length < 2) return { ok: false, error: "Scrivi il tuo nome.", field: "name" };
  const phone = internationalNumber(phoneRaw);
  if (!phone) return { ok: false, error: "Il numero di telefono non sembra giusto: controllalo.", field: "phone" };
  if (contact === "email" && !isValidEmail(email)) return { ok: false, error: "L'indirizzo email non sembra giusto: controllalo.", field: "email" };
  if (input.privacy !== true) return { ok: false, error: "Per inviare la richiesta serve il consenso all'uso dei dati.", field: "privacy" };

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
              ? `Si può chiedere un tavolo al massimo ${settings.daysAhead} giorni prima.`
              : "Per quel giorno è troppo tardi per prenotare online: chiamaci.";
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
    if (byIp >= 5) return { ok: false, error: "Hai mandato tante richieste in poco tempo: aspetta un po' oppure chiamaci." };
    if (pendingByPhone >= 3) return { ok: false, error: "Con questo numero ci sono già 3 richieste in attesa: aspetta la nostra risposta oppure chiamaci." };
  }
  // Stesso telefono, stesso giorno e ora, ancora in attesa: è un doppio invio, si riusa quella.
  const same = await prisma.bookingRequest.findFirst({
    where: { phone, day, time, status: { in: ["PENDING", "PROPOSED", "CONFIRMED"] } },
    select: { id: true, code: true, isTest: true },
  });
  if (same) return { ok: true, id: same.id, code: same.code, statusPath: statusPath(same.id), isTest: same.isTest };

  const slug = str(input.event, 120);
  const promo = slug ? await prisma.menuPromo.findFirst({ where: { slug, deletedAt: null }, select: { id: true } }) : null;
  const source = promo ? "evento" : normalizeSource(input.source);

  let created: BookingRow | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
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
            email: email || null,
            contact,
            note: note || null,
            allergies: input.allergies === true,
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
  if (!created) return { ok: false, error: "Non sono riuscito a salvare la richiesta: riprova tra poco." };
  return { ok: true, id: created.id, code: created.code, statusPath: statusPath(created.id), isTest };
}

// Dopo il salvataggio (in after()): avvisi al personale e ricevuta al cliente per email.
export async function afterCreate(id: string, origin: string | null): Promise<void> {
  const b = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!b) return;
  if (b.isTest) return;
  const alert = staffAlert(b);
  await notifyStaff(b.id, alert.title, alert.body, "/prenotazioni");
  if (b.contact === "email" && b.email) await sendCustomerMail(b, "received", origin);
}

// ---------- Avvisi

async function log(requestId: string, actor: string, kind: string, message?: string | null) {
  await prisma.bookingLog.create({ data: { requestId, actor, kind, message: message ?? null } });
}

async function notifyStaff(requestId: string, title: string, body: string, url: string) {
  const settings = await loadBookingSettings();
  const push = await sendPushToStaff({ title, body, url, tag: `booking-${requestId}` }).catch((e: unknown) => ({ sent: 0, failed: 1, error: String(e) }));
  if (push.sent) await log(requestId, "sistema", "PUSH_OK", `Notifica a ${push.sent} ${push.sent === 1 ? "telefono" : "telefoni"}`);
  if (push.failed) await log(requestId, "sistema", "PUSH_FAIL", `${push.failed} notifiche non partite`);
  if (settings.notifyEmail && isValidEmail(settings.notifyEmail) && mailConfigured()) {
    try {
      await getProvider().sendBatch([
        {
          to: settings.notifyEmail,
          subject: oneLine(`${title}: ${body}`).slice(0, 180),
          text: `${body}\n\nApri le richieste: ${siteOrigin()}${url}`,
          html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(siteOrigin() + url)}">Apri le richieste</a></p>`,
        },
      ]);
      await log(requestId, "sistema", "MAIL_OK", `Avviso al titolare (${settings.notifyEmail})`);
    } catch (e) {
      await log(requestId, "sistema", "MAIL_FAIL", `Avviso al titolare non partito: ${String(e).slice(0, 200)}`);
    }
  }
}

function messageInput(b: BookingRow, origin: string | null) {
  return {
    name: b.name,
    day: b.day,
    time: b.time,
    people: b.people,
    proposedTime: b.proposedTime,
    staffMessage: b.staffMessage,
    statusUrl: `${siteOrigin(origin)}${statusPath(b.id)}`,
    allergies: b.allergies,
  };
}

async function sendCustomerMail(b: BookingRow, kind: MessageKind, origin: string | null): Promise<boolean> {
  if (!b.email || !mailConfigured() || b.isTest) return false;
  const m = messageInput(b, origin);
  const text = customerMessage(kind, m);
  try {
    await getProvider().sendBatch([
      {
        to: b.email,
        subject: oneLine(`${customerSubject(kind, m)} · ${VENUE_NAME}`),
        text,
        html: text
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>")}</p>`)
          .join(""),
      },
    ]);
    await log(b.id, "sistema", "MAIL_OK", `Email al cliente: ${customerSubject(kind, m)}`);
    return true;
  } catch (e) {
    await log(b.id, "sistema", "MAIL_FAIL", `Email al cliente non partita: ${String(e).slice(0, 200)}`);
    return false;
  }
}

// Messaggio WhatsApp già scritto per il cliente (chi lavora tocca Invia dal telefono del locale).
export function customerWhatsappHref(b: BookingRow, kind: MessageKind, origin: string | null): string | null {
  return whatsappHref(b.phone, customerMessage(kind, messageInput(b, origin)));
}

// ---------- Risposte del locale

export type StaffActor = { name: string };
export type StaffResult =
  | { ok: true; booking: BookingRow; mailSent: boolean; whatsappHref: string | null }
  | { ok: false; error: string };

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
    data: { ...data, handledAt: now, handledBy: actor.name },
  });
  if (res.count === 0) return { ok: false, error: await alreadyHandled(id) };
  await log(id, actor.name, logKind, logMessage);
  const booking = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
  let mailSent = false;
  let wa: string | null = null;
  if (kind) {
    if (booking.contact === "email" && booking.email) mailSent = await sendCustomerMail(booking, kind, origin);
    // WhatsApp sempre pronto: anche per chi ha scelto l'email, se la mail non è partita.
    wa = customerWhatsappHref(booking, kind, origin);
  }
  return { ok: true, booking, mailSent, whatsappHref: wa };
}

const msg = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

export function confirmBooking(id: string, actor: StaffActor, message: unknown, origin: string | null) {
  return respond(id, actor, ["PENDING"], { status: "CONFIRMED", staffMessage: msg(message) }, "CONFIRMED", msg(message), "confirmed", origin);
}

export async function proposeTime(id: string, actor: StaffActor, time: unknown, message: unknown, origin: string | null): Promise<StaffResult> {
  const b = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!b) return { ok: false, error: "Questa richiesta non c'è più." };
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "Scegli l'orario da proporre." };
  if (time === b.time) return { ok: false, error: "È lo stesso orario richiesto: scegline un altro oppure conferma." };
  const startsAt = romeInstant(b.day, timeToDayMinutes(time));
  if (startsAt.getTime() < Date.now()) return { ok: false, error: "Quell'orario è già passato: scegline un altro." };
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

export function declineBooking(id: string, actor: StaffActor, message: unknown, origin: string | null) {
  return respond(id, actor, ["PENDING", "PROPOSED"], { status: "DECLINED", staffMessage: msg(message) }, "DECLINED", msg(message), "declined", origin);
}

export function cancelByVenue(id: string, actor: StaffActor, message: unknown, origin: string | null) {
  return respond(id, actor, ["CONFIRMED"], { status: "CANCELLED", cancelledBy: "locale", staffMessage: msg(message) }, "CANCELLED", msg(message), "cancelledByVenue", origin);
}

// Arrivati / non venuti: solo per le confermate, dal giorno stesso.
export async function markArrival(id: string, actor: StaffActor, arrived: boolean | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await prisma.bookingRequest.findUnique({ where: { id }, select: { status: true } });
  if (!b || b.status !== "CONFIRMED") return { ok: false, error: "Si può segnare solo una prenotazione confermata." };
  await prisma.bookingRequest.update({
    where: { id },
    data: arrived === null ? { arrivedAt: null, noShowAt: null } : arrived ? { arrivedAt: new Date(), noShowAt: null } : { noShowAt: new Date(), arrivedAt: null },
  });
  await log(id, actor.name, arrived === null ? "ARRIVAL_CLEARED" : arrived ? "ARRIVED" : "NOSHOW", null);
  return { ok: true };
}

// Segna che il messaggio WhatsApp è stato aperto (non si può sapere se è stato davvero inviato).
export async function markWhatsappOpened(id: string, actor: StaffActor): Promise<void> {
  await log(id, actor.name, "WHATSAPP_OPENED", null);
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
      where: { id: b.id, status: { in: ["PENDING", "PROPOSED", "CONFIRMED"] }, startsAt: { gte: new Date(now.getTime() - 2 * 3600000) } },
      data: { status: "CANCELLED", cancelledBy: "cliente" },
    });
    if (!r.count) return { ok: false, error: "Non si può più annullare da qui: chiamaci." };
    await log(b.id, "cliente", "CANCELLED", null);
    const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: b.id } });
    if (!after.isTest) {
      await notifyStaff(b.id, "Prenotazione annullata dal cliente", `${after.name} · ${dayShort(after.day)} alle ${after.time} · ${after.people} pers.`, "/prenotazioni");
      if (after.contact === "email") await sendCustomerMail(after, "cancelledByCustomer", origin);
    }
    return { ok: true, booking: after };
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
    const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: b.id } });
    if (!after.isTest) {
      await notifyStaff(
        b.id,
        accept ? "Il cliente ha accettato il nuovo orario" : "Il cliente non può al nuovo orario",
        `${after.name} · ${dayShort(after.day)} alle ${accept ? after.time : b.proposedTime} · ${after.people} pers.`,
        "/prenotazioni",
      );
      if (accept && after.contact === "email") await sendCustomerMail(after, "confirmed", origin);
    }
    return { ok: true, booking: after };
  }
  return { ok: false, error: "Azione non valida." };
}

// ---------- Elenchi per il personale

export async function pendingCount(): Promise<number> {
  return prisma.bookingRequest.count({
    where: { isTest: false, status: "PENDING", startsAt: { gte: new Date() } },
  });
}

export async function listBookings(now: Date = new Date()) {
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

// Numeri per la scheda «Numeri»: ultimi 90 giorni, senza le prove.
export async function bookingStats(now: Date = new Date()) {
  const since = new Date(now.getTime() - 90 * 86400000);
  const rows = await prisma.bookingRequest.findMany({
    where: { isTest: false, createdAt: { gte: since } },
    select: { status: true, source: true, createdAt: true, handledAt: true, people: true, noShowAt: true, arrivedAt: true, cancelledBy: true, startsAt: true },
  });
  const bySource = new Map<string, number>();
  let confirmed = 0;
  let declined = 0;
  let cancelled = 0;
  let noShow = 0;
  let people = 0;
  const responseMinutes: number[] = [];
  for (const r of rows) {
    bySource.set(r.source ?? "altro", (bySource.get(r.source ?? "altro") ?? 0) + 1);
    if (r.status === "CONFIRMED") {
      confirmed++;
      people += r.people;
    }
    if (r.status === "DECLINED") declined++;
    if (r.status === "CANCELLED") cancelled++;
    if (r.noShowAt) noShow++;
    if (r.handledAt) responseMinutes.push((r.handledAt.getTime() - r.createdAt.getTime()) / 60000);
  }
  responseMinutes.sort((a, b) => a - b);
  const median = responseMinutes.length ? responseMinutes[Math.floor(responseMinutes.length / 2)] : null;
  return { total: rows.length, confirmed, declined, cancelled, noShow, people, medianResponseMinutes: median, bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]) };
}
