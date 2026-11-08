"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBookingManager, AuthError, type BookingManager } from "@/lib/guard";
import { runAction, ValidationError, type ActionResult } from "@/lib/validation";
import { isValidEmail } from "@/lib/mail";
import { editVersion, parseBookingSettings, type BookingSettings } from "@/lib/booking/rules";
import {
  acceptProposalForCustomer,
  cancelByVenue,
  cancelForCustomer,
  confirmBooking,
  createManualBooking,
  declineBooking,
  queueConfirmation,
  updateBooking,
  type ManualInput,
  type ManualResult,
  eraseBooking,
  refuseProposalForCustomer,
  loadBookingSettings,
  markArrival,
  markWhatsappOpened,
  proposeTime,
  saveBookingSettings,
  setDayFull,
  type StaffResult,
} from "@/lib/booking/service";
import { sendPushToStaff } from "@/lib/booking/push";

// Ogni azione è un indirizzo pubblico: la prima cosa è sempre requireAgendaManager()
// (titolare/consulente, o dipendente con «Può gestire le prenotazioni», letto dal database;
// con la funzione spenta solo il titolare, come la pagina).

// Con la funzione spenta prenotazioni e agenda sono solo per le prove del titolare (come la pagina).
async function requireAgendaManager(): Promise<BookingManager> {
  const m = await requireBookingManager();
  if (m.role !== "ADMIN" && !(await loadBookingSettings()).enabled) throw new AuthError("Le prenotazioni non sono ancora attive: per ora le prova solo il titolare.");
  return m;
}

const ID = /^[a-z0-9]{10,40}$/i;
function parseBookingId(v: unknown): string {
  if (typeof v !== "string" || !ID.test(v)) throw new ValidationError("Richiesta non trovata: ricarica la pagina.");
  return v;
}

async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : null;
}

async function requireOwner(): Promise<BookingManager> {
  const m = await requireBookingManager();
  if (m.role !== "ADMIN") throw new AuthError("Questa impostazione la cambia solo il titolare.");
  return m;
}

function refresh() {
  // Anche il menù in alto (numero delle richieste in attesa) e Impostazioni.
  revalidatePath("/", "layout");
}

export type ReplyOutcome = { mailSent: boolean; email: string | null; whatsappHref: string | null };

function outcome(r: StaffResult): ReplyOutcome {
  if (!r.ok) throw new ValidationError(r.error);
  return { mailSent: r.mailSent, email: r.booking.email, whatsappHref: r.whatsappHref };
}

// Errori «già gestita da…»: si mostra il testo e la pagina si aggiorna comunque (vedi la vista).
export async function replyToRequest(
  idInput: string,
  // accept/refuse: il cliente ha detto sì/no all'orario proposto (su WhatsApp o al telefono);
  // customerCancel: ci ha avvisato il cliente che non viene (nessun messaggio).
  kind: "confirm" | "propose" | "decline" | "cancel" | "accept" | "refuse" | "customerCancel",
  message: string,
  time?: string,
): Promise<ActionResult<ReplyOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    const origin = await requestOrigin();
    const actor = { name: m.name };
    try {
      if (kind === "confirm") return outcome(await confirmBooking(id, actor, message, origin));
      if (kind === "propose") return outcome(await proposeTime(id, actor, time, message, origin));
      if (kind === "decline") return outcome(await declineBooking(id, actor, message, origin));
      if (kind === "cancel") return outcome(await cancelByVenue(id, actor, message, origin));
      if (kind === "accept") return outcome(await acceptProposalForCustomer(id, actor, origin));
      if (kind === "refuse") return outcome(await refuseProposalForCustomer(id, actor, origin));
      if (kind === "customerCancel") return outcome(await cancelForCustomer(id, actor, origin));
      throw new ValidationError("Azione non valida.");
    } finally {
      refresh();
    }
  });
}

export async function setArrival(idInput: string, arrived: boolean | null): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    if (arrived !== true && arrived !== false && arrived !== null) throw new ValidationError("Azione non valida.");
    const r = await markArrival(id, { name: m.name }, arrived);
    refresh();
    if (!r.ok) throw new ValidationError(r.error);
  });
}

// ---------- Agenda: prenotazioni segnate a mano e modifiche

// Esito del salvataggio: salvata (con il messaggio WhatsApp già pronto, se c'è il telefono)
// oppure una domanda da confermare («Quel giorno risulta chiuso: segnarla lo stesso?»).
// I campi del foglio «Modifica» come li ha adesso il database (dopo un conflitto si ricaricano).
export type AgendaFields = { name: string; phone: string; people: number; day: string; time: string; table: string; note: string; allergies: boolean; version: string };

export type AgendaOutcome =
  | { saved: true; id: string; whatsappHref: string | null; hasPhone: boolean; unchanged: boolean }
  | { saved: false; ask: string; field?: undefined }
  | { saved: false; ask?: undefined; error: string; field?: string; conflict?: AgendaFields; gone?: boolean };

function agendaOutcome(r: ManualResult): AgendaOutcome {
  if (r.ok) return { saved: true, id: r.booking.id, whatsappHref: r.whatsappHref, hasPhone: Boolean(r.booking.phone), unchanged: r.unchanged === true };
  if ("ask" in r) return { saved: false, ask: r.ask };
  if ("conflict" in r) {
    const c = r.conflict;
    return {
      saved: false,
      error: r.error,
      conflict: { name: c.name, phone: c.phone, people: c.people, day: c.day, time: c.time, table: c.table ?? "", note: c.note ?? "", allergies: c.allergies, version: editVersion(c) },
    };
  }
  if ("gone" in r) return { saved: false, error: r.error, gone: true };
  return { saved: false, error: r.error, field: r.field };
}

const manualFields = (input: ManualInput): ManualInput => {
  if (!input || typeof input !== "object") throw new ValidationError("Dati non validi.");
  const { day, time, people, name, phone, table, note, allergies, source, force } = input;
  return { day, time, people, name, phone, table, note, allergies, source, force };
};

export async function addManualBooking(input: ManualInput): Promise<ActionResult<AgendaOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const r = await createManualBooking(manualFields(input), { name: m.name }, await requestOrigin());
    refresh();
    return agendaOutcome(r);
  });
}

export async function editBooking(idInput: string, input: ManualInput, version: string): Promise<ActionResult<AgendaOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    const fields = { ...manualFields(input), source: undefined };
    const r = await updateBooking(id, fields, typeof version === "string" ? version : null, { name: m.name }, await requestOrigin());
    refresh();
    return agendaOutcome(r);
  });
}

// «Manda la risposta su WhatsApp» (aperto), «Segna come già mandata» e il suo «Annulla»;
// «queue»: la conferma di una prenotazione dell'agenda la manda il telefono del locale.
export async function markWhatsapp(idInput: string, how: "opened" | "done" | "undo" | "queue"): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    const exists = await prisma.bookingRequest.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new ValidationError("Questa richiesta non c'è più.");
    if (how === "queue") {
      const r = await queueConfirmation(id, { name: m.name });
      refresh();
      if (!r.ok) throw new ValidationError(r.error);
      return;
    }
    if (how === "opened") await markWhatsappOpened(id, { name: m.name });
    else if (how === "done") await prisma.bookingLog.create({ data: { requestId: id, actor: m.name, kind: "WHATSAPP_DONE", message: null } });
    else if (how === "undo") {
      const last = await prisma.bookingLog.findFirst({ where: { requestId: id, kind: "WHATSAPP_DONE", actor: m.name }, orderBy: { at: "desc" }, select: { id: true } });
      if (last) await prisma.bookingLog.delete({ where: { id: last.id } });
    } else throw new ValidationError("Azione non valida.");
    refresh();
  });
}

// Il cliente chiede di cancellare i suoi dati: solo il titolare, e non si torna indietro.
export async function eraseRequest(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireOwner();
    const id = parseBookingId(idInput);
    const r = await eraseBooking(id);
    refresh();
    if (!r.ok) throw new ValidationError(r.error);
  });
}

// «Siamo pieni stasera» / «Chiudi le richieste» di un giorno, e «Riapri».
export async function setDayClosed(dayInput: string, full: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    if (typeof dayInput !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayInput) || Number.isNaN(Date.parse(`${dayInput}T00:00:00Z`))) {
      throw new ValidationError("Giorno non valido.");
    }
    await setDayFull(dayInput, Boolean(full), { name: m.name }, null);
    refresh();
  });
}

// ---------- Solo titolare

export async function setBookingsEnabled(on: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await requireOwner();
    const current = await loadBookingSettings();
    await saveBookingSettings({ ...current, enabled: Boolean(on) });
    refresh();
  });
}

export type SettingsInput = Omit<BookingSettings, "enabled">;

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  return runAction(async () => {
    await requireOwner();
    if (!input || typeof input !== "object") throw new ValidationError("Dati non validi.");
    const int = (v: unknown, min: number, max: number, what: string) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${what}: scrivi un numero da ${min} a ${max}.`);
      return n;
    };
    if (typeof input.firstTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.firstTime)) throw new ValidationError("Prima ora prenotabile: scegli un orario.");
    const email = typeof input.notifyEmail === "string" ? input.notifyEmail.trim().toLowerCase() : "";
    if (email && !isValidEmail(email)) throw new ValidationError("L'email per gli avvisi non sembra giusta: controllala.");
    if (![15, 30, 60].includes(Number(input.step))) throw new ValidationError("Scegli ogni quanto proporre gli orari.");
    const current = await loadBookingSettings();
    const next: BookingSettings = {
      enabled: current.enabled,
      firstTime: input.firstTime,
      lastBeforeClose: int(input.lastBeforeClose, 0, 240, "Ultima richiesta prima della chiusura"),
      step: Number(input.step),
      maxPeople: int(input.maxPeople, 1, 40, "Persone massime"),
      leadMinutes: int(input.leadMinutes, 0, 24 * 60, "Anticipo minimo"),
      daysAhead: int(input.daysAhead, 1, 180, "Giorni in avanti"),
      notifyEmail: email,
      capacityHint: int(input.capacityHint, 0, 500, "Quante persone ci stanno"),
    };
    // Stesso controllo di chi legge le impostazioni: quello che si salva è quello che vale.
    await saveBookingSettings(parseBookingSettings(JSON.stringify(next)));
    refresh();
  });
}

// ---------- Avvisi sul telefono

type SubscriptionInput = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function parseSubscription(sub: SubscriptionInput) {
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  let ok = false;
  try {
    // Solo i servizi di notifica veri (Apple, Google, Mozilla, Microsoft): il server non chiama indirizzi qualsiasi.
    const u = new URL(endpoint);
    ok =
      u.protocol === "https:" &&
      /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(u.hostname);
  } catch {
    ok = false;
  }
  if (!ok || endpoint.length > 1000 || !/^[\w-]{20,200}$/.test(p256dh) || !/^[\w-]{8,100}$/.test(auth)) {
    throw new ValidationError("Il telefono non ha dato i dati per gli avvisi: riprova.");
  }
  return { endpoint, p256dh, auth };
}

const owner = (m: BookingManager) => (m.employeeId ? { employeeId: m.employeeId, username: null } : { username: m.username, employeeId: null });

export async function savePushSubscription(sub: SubscriptionInput, userAgent: string): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const { endpoint, p256dh, auth } = parseSubscription(sub);
    const ua = typeof userAgent === "string" ? userAgent.slice(0, 300) : null;
    // Stesso telefono, altra persona che ha fatto l'accesso: l'iscrizione passa a chi c'è adesso.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, userAgent: ua, ...owner(m) },
      update: { p256dh, auth, userAgent: ua, failCount: 0, ...owner(m) },
    });
    revalidatePath("/prenotazioni");
  });
}

export async function removePushSubscription(endpointInput: string): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireBookingManager();
    if (typeof endpointInput !== "string" || endpointInput.length > 1000) throw new ValidationError("Dati non validi.");
    await prisma.pushSubscription.deleteMany({ where: { endpoint: endpointInput, ...(m.employeeId ? { employeeId: m.employeeId } : { username: m.username }) } });
    revalidatePath("/prenotazioni");
  });
}

export async function sendTestPush(endpointInput: string): Promise<ActionResult<number>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    if (typeof endpointInput !== "string" || endpointInput.length > 1000) throw new ValidationError("Dati non validi.");
    const mine = await prisma.pushSubscription.findFirst({
      where: { endpoint: endpointInput, ...(m.employeeId ? { employeeId: m.employeeId } : { username: m.username }) },
      select: { id: true },
    });
    if (!mine) throw new ValidationError("Gli avvisi non sono attivi su questo telefono: tocca «Attiva gli avvisi».");
    const r = await sendPushToStaff({ title: "Prova riuscita", body: "Così arriva l'avviso di una nuova richiesta di prenotazione.", url: "/prenotazioni", tag: "booking-test" }, { endpoint: endpointInput });
    if (!r.sent) throw new ValidationError("L'avviso non è partito: disattiva e riattiva gli avvisi, poi riprova.");
    return r.sent;
  });
}

// All'uscita: questo dispositivo non riceve più gli avvisi (il telefono può passare a un'altra persona).
// Basta l'accesso, non il permesso: chi l'ha perso deve poter togliere lo stesso la sua iscrizione.
export async function forgetPushOnSignOut(endpointInput: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user) return;
    if (typeof endpointInput !== "string" || endpointInput.length > 1000) throw new ValidationError("Dati non validi.");
    const who = session.user.role === "EMPLOYEE" ? (session.user.employeeId ? { employeeId: session.user.employeeId } : null) : { username: session.user.username };
    if (!who) return;
    await prisma.pushSubscription.deleteMany({ where: { endpoint: endpointInput, ...who } });
  });
}
