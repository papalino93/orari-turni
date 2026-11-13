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
  undoManualBooking,
  previewBlock,
  clearPause,
  testBookingsCount,
  keepableTestBookings,
  resolveTestBookings,
  type ManualInput,
  type ManualResult,
  eraseBooking,
  refuseProposalForCustomer,
  loadBookingSettings,
  markArrival,
  claimWhatsapp,
  releaseWhatsapp,
  markWhatsappSent,
  proposeTime,
  saveBookingSettings,
  setDayFull,
  type StaffResult,
  importManualBookings,
  type ImportLineResult,
} from "@/lib/booking/service";
import { IMPORT_MAX_CHARS } from "@/lib/booking/import";
import { addDayNote, removeDayNote, updateDayNote } from "@/lib/booking/agenda-server";
import { actorName, effectiveMode, NEED_WHO, NeedWhoError, sentFrom, setVenueWho, clearVenueWho, venueDeviceExists, whatsappRole } from "@/lib/booking/venue";
import { sendPushToStaff } from "@/lib/booking/push";

// Ogni azione è un indirizzo pubblico: la prima cosa è sempre requireAgendaManager()
// (titolare/consulente, o dipendente con «Può gestire le prenotazioni», letto dal database;
// con l'agenda spenta solo il titolare, come la pagina).

// Con l'agenda spenta prenotazioni e agenda sono solo per le prove del titolare (come la pagina).
async function requireAgendaManager(): Promise<BookingManager> {
  const m = await requireBookingManager();
  if (m.role !== "ADMIN" && !(await loadBookingSettings()).agendaEnabled) throw new AuthError("L'agenda delle prenotazioni non è ancora accesa: per ora la prova solo il titolare.");
  return m;
}

// Chi firma in cronologia: dal telefono enoteca la persona scelta in «Chi sei?» («Marta (telefono
// enoteca)»), senza la quale non si salva niente; altrimenti chi ha fatto l'accesso.
async function who(m: BookingManager): Promise<string> {
  try {
    return await actorName(m);
  } catch (e) {
    if (e instanceof NeedWhoError) throw new ValidationError(NEED_WHO);
    throw e;
  }
}

// Questo dispositivo manda lui i WhatsApp ai clienti (niente avviso «da mandare» agli altri)?
async function sendsWhatsapp(m: BookingManager): Promise<boolean> {
  return whatsappRole(m, effectiveMode(await loadBookingSettings(), await venueDeviceExists())) === "send";
}

// Anteprime di Vercel (stesso database del sito): si lavora solo sulle prenotazioni di prova.
async function guardPreview(id?: string | null) {
  const blocked = await previewBlock(id);
  if (blocked) throw new ValidationError(blocked);
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

// ask: «C'è già Rossi sabato alle 20:30 (4 persone): è la stessa?» (si richiama con dupOk).
export type ReplyOutcome = { mailSent: boolean; email: string | null; whatsappHref: string | null; ask?: undefined } | { ask: string };

function outcome(r: StaffResult): ReplyOutcome {
  if (!r.ok) {
    if (r.ask) return { ask: r.ask };
    throw new ValidationError(r.error);
  }
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
  // dupOk: «È un'altra, segna lo stesso»; selfWa: questo dispositivo manda lui il WhatsApp (niente avviso agli altri).
  opts?: { dupOk?: boolean; selfWa?: boolean },
): Promise<ActionResult<ReplyOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    await guardPreview(id);
    const origin = await requestOrigin();
    // Il titolare manda i WhatsApp da qualsiasi dispositivo; un dipendente solo dal telefono enoteca.
    // Chi manda i WhatsApp lo decide il server (telefono enoteca, impostazione «Chi manda i WhatsApp»).
    void opts?.selfWa;
    const actor = { name: await who(m), selfWa: await sendsWhatsapp(m) };
    try {
      if (kind === "confirm") return outcome(await confirmBooking(id, actor, message, origin, opts?.dupOk === true));
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
    await guardPreview(id);
    if (arrived !== true && arrived !== false && arrived !== null) throw new ValidationError("Azione non valida.");
    const r = await markArrival(id, { name: await who(m) }, arrived);
    refresh();
    if (!r.ok) throw new ValidationError(r.error);
  });
}

// ---------- Agenda: prenotazioni segnate a mano e modifiche

// Esito del salvataggio: salvata (con il messaggio WhatsApp già pronto, se c'è il telefono)
// oppure una domanda da confermare («Quel giorno risulta chiuso: segnarla lo stesso?»).
// I campi del foglio «Modifica» come li ha adesso il database (dopo un conflitto si ricaricano).
export type AgendaFields = {
  name: string;
  phone: string;
  people: number;
  day: string;
  time: string;
  table: string;
  note: string;
  allergies: boolean;
  timeUnknown: boolean;
  peopleUnknown: boolean;
  menu: string;
  version: string;
};

export type AgendaOutcome =
  | { saved: true; id: string; whatsappHref: string | null; hasPhone: boolean; unchanged: boolean; isTest: boolean }
  // dup: avviso doppioni («È un'altra, segna lo stesso»), altrimenti giorno chiuso / fuori orario.
  | { saved: false; ask: string; dup: boolean; field?: undefined }
  | { saved: false; ask?: undefined; error: string; field?: string; conflict?: AgendaFields; gone?: boolean };

function agendaOutcome(r: ManualResult): AgendaOutcome {
  if (r.ok) return { saved: true, id: r.booking.id, whatsappHref: r.whatsappHref, hasPhone: Boolean(r.booking.phone), unchanged: r.unchanged === true, isTest: r.booking.isTest };
  if ("ask" in r) return { saved: false, ask: r.ask, dup: r.dup === true };
  if ("conflict" in r) {
    const c = r.conflict;
    return {
      saved: false,
      error: r.error,
      conflict: {
        name: c.name,
        phone: c.phone,
        people: c.people,
        day: c.day,
        time: c.time,
        table: c.table ?? "",
        note: c.note ?? "",
        allergies: c.allergies,
        timeUnknown: c.timeUnknown,
        peopleUnknown: c.peopleUnknown,
        menu: c.menu ?? "",
        version: editVersion(c),
      },
    };
  }
  if ("gone" in r) return { saved: false, error: r.error, gone: true };
  return { saved: false, error: r.error, field: r.field };
}

const manualFields = (input: ManualInput): ManualInput => {
  if (!input || typeof input !== "object") throw new ValidationError("Dati non validi.");
  const { day, time, people, name, phone, table, note, allergies, source, force, dupOk, timeUnknown, peopleUnknown, menu } = input;
  return { day, time, people, name, phone, table, note, allergies, source, force, dupOk, timeUnknown, peopleUnknown, menu };
};

export async function addManualBooking(input: ManualInput): Promise<ActionResult<AgendaOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const r = await createManualBooking(manualFields(input), { name: await who(m) }, await requestOrigin());
    refresh();
    return agendaOutcome(r);
  });
}

export async function editBooking(idInput: string, input: ManualInput, version: string): Promise<ActionResult<AgendaOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    await guardPreview(id);
    const fields = { ...manualFields(input), source: undefined };
    const r = await updateBooking(id, fields, typeof version === "string" ? version : null, { name: await who(m) }, await requestOrigin());
    refresh();
    return agendaOutcome(r);
  });
}

// ---------- «Importa dal librone»: tante prenotazioni insieme da una lista incollata

// keep: le righe già in agenda da segnare lo stesso («Importa lo stesso»).
function importInput(text: unknown, keep: unknown): { text: string; keep: number[] } {
  if (typeof text !== "string") throw new ValidationError("Dati non validi.");
  if (text.length > IMPORT_MAX_CHARS) throw new ValidationError("La lista è troppo lunga: dividila in più parti.");
  const lines = Array.isArray(keep) ? keep.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, 2000) : [];
  return { text, keep: lines };
}

export type ImportOutcome = { results: ImportLineResult[]; isTest: boolean };

// Anteprima: che cosa succederebbe (doppioni già in agenda, giorni chiusi), senza salvare niente.
export async function checkImport(text: string, keep: number[] = []): Promise<ActionResult<ImportOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const input = importInput(text, keep);
    const r = await importManualBookings(input.text, input.keep, { name: m.name }, { dryRun: true });
    if (!r.ok) throw new ValidationError(r.error);
    return { results: r.results, isTest: r.isTest };
  });
}

// Segna in agenda tutte le righe buone, una dopo l'altra; per ognuna dice com'è andata.
export async function importBookings(text: string, keep: number[] = []): Promise<ActionResult<ImportOutcome>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const input = importInput(text, keep);
    const r = await importManualBookings(input.text, input.keep, { name: await who(m) }, { dryRun: false });
    refresh();
    if (!r.ok) throw new ValidationError(r.error);
    return { results: r.results, isTest: r.isTest };
  });
}

// «Annulla» nel messaggio «✓ Segnata…» subito dopo il salvataggio: la prenotazione sparisce.
export async function undoNewBooking(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    await guardPreview(id);
    const r = await undoManualBooking(id, { name: await who(m) });
    refresh();
    if (!r.ok) throw new ValidationError(r.error);
  });
}

// WhatsApp ai clienti, una sola coda per tutti (vedi service.ts, claimWhatsapp):
// - "opened": «Apri WhatsApp» → la prende in mano chi tocca (lucchetto di 5 minuti, «In invio da…»);
//   force: «Rimanda lo stesso» dopo «Già mandato da…»;
// - "sent": «Mandato» → sparisce per tutti, in cronologia chi, da dove e quando;
// - "release": «Annulla» → torna libera; "done" / "undo": «Segna come già mandata» e il suo «Annulla»;
// - "queue": la conferma di una prenotazione dell'agenda la manda il telefono enoteca.
export type WhatsappClaim = { ok: true } | { ok: false; text: string; claimedBy?: string; sentBy?: string; at?: number };

export async function markWhatsapp(idInput: string, how: "opened" | "sent" | "release" | "done" | "undo" | "queue", opts?: { force?: boolean }): Promise<ActionResult<WhatsappClaim>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const id = parseBookingId(idInput);
    await guardPreview(id);
    const exists = await prisma.bookingRequest.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new ValidationError("Questa richiesta non c'è più.");
    const actor = await who(m);
    try {
      if (how === "queue") {
        const r = await queueConfirmation(id, { name: actor });
        if (!r.ok) throw new ValidationError(r.error);
        return { ok: true } as WhatsappClaim;
      }
      if (how === "opened") {
        // Solo chi manda (o titolare/consulente con «Mandalo io dal mio WhatsApp»).
        if (whatsappRole(m, effectiveMode(await loadBookingSettings(), await venueDeviceExists())) === "none") throw new ValidationError("Le risposte su WhatsApp le manda il telefono enoteca.");
        const r = await claimWhatsapp(id, actor, sentFrom(m), opts?.force === true);
        return r.ok ? ({ ok: true } as WhatsappClaim) : ({ ok: false, text: r.error, claimedBy: r.claimedBy, sentBy: r.sentBy, at: r.at } as WhatsappClaim);
      }
      if (how === "sent") await markWhatsappSent(id, actor, sentFrom(m));
      else if (how === "release") await releaseWhatsapp(id, actor);
      else if (how === "done") await markWhatsappSent(id, actor, null);
      else if (how === "undo") {
        const last = await prisma.bookingLog.findFirst({ where: { requestId: id, kind: "WHATSAPP_DONE", actor }, orderBy: { at: "desc" }, select: { id: true } });
        if (last) await prisma.bookingLog.delete({ where: { id: last.id } });
      } else throw new ValidationError("Azione non valida.");
      return { ok: true } as WhatsappClaim;
    } finally {
      refresh();
    }
  });
}

// «Chi sei?» sul telefono enoteca (vale qualche ora, su questo telefono); "" = cambia persona.
export async function chooseVenueWho(employeeId: string): Promise<ActionResult<{ name: string | null }>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    if (!employeeId) {
      await clearVenueWho();
      return { name: null };
    }
    const r = await setVenueWho(m, employeeId);
    if (!r.ok) throw new ValidationError(r.error);
    return { name: r.name };
  });
}

// Il cliente chiede di cancellare i suoi dati: solo il titolare, e non si torna indietro.
export async function eraseRequest(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireOwner();
    const id = parseBookingId(idInput);
    await guardPreview(id);
    const r = await eraseBooking(id);
    refresh();
    if (!r.ok) throw new ValidationError(r.error);
  });
}

// «Siamo pieni stasera» / «Chiudi le richieste» di un giorno, e «Riapri».
export async function setDayClosed(dayInput: string, full: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    await guardPreview();
    if (typeof dayInput !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayInput) || Number.isNaN(Date.parse(`${dayInput}T00:00:00Z`))) {
      throw new ValidationError("Giorno non valido.");
    }
    await setDayFull(dayInput, Boolean(full), { name: await who(m) }, null);
    refresh();
  });
}

// ---------- Note del giorno nell'agenda («EVENTO DAINELLI», un promemoria)

export async function saveDayNote(input: { id?: string | null; day?: string; text: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    await guardPreview();
    if (!input || typeof input !== "object") throw new ValidationError("Dati non validi.");
    if (input.id) {
      if (typeof input.id !== "string" || !ID.test(input.id)) throw new ValidationError("Nota non trovata: ricarica la pagina.");
      const r = await updateDayNote(input.id, input.text, await who(m));
      if (!r.ok) throw new ValidationError(r.error);
      return { id: input.id };
    }
    const r = await addDayNote(String(input.day ?? ""), input.text, await who(m));
    if (!r.ok) throw new ValidationError(r.error);
    return { id: r.id };
  });
}

export async function deleteDayNote(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireAgendaManager();
    await guardPreview();
    if (typeof idInput !== "string" || !ID.test(idInput)) throw new ValidationError("Nota non trovata: ricarica la pagina.");
    await removeDayNote(idInput);
  });
}

// ---------- Solo titolare

// Le prove all'accensione: «Ci sono N prenotazioni di prova: cancellarle?»
export type SwitchOutcome = { done: true; deleted: number; kept: number } | { done: false; tests: number; keepable: number };

// I due interruttori: «agenda» (agenda interna per il personale) e «online» (richieste dai clienti).
// - accendere le richieste online accende anche l'agenda; spegnere l'agenda spegne anche le richieste;
// - spegnere le richieste online non tocca mai l'agenda;
// - accendendo, se ci sono prove si chiede che cosa farne (tests: "delete" | "keep").
export async function setBookingSwitch(which: "agenda" | "online", on: boolean, tests?: "delete" | "keep"): Promise<ActionResult<SwitchOutcome>> {
  return runAction(async () => {
    await requireOwner();
    await guardPreview();
    if (which !== "agenda" && which !== "online") throw new ValidationError("Azione non valida.");
    const current = await loadBookingSettings();
    let result: SwitchOutcome = { done: true, deleted: 0, kept: 0 };
    const turningOn = on === true && (which === "agenda" ? !current.agendaEnabled : !current.enabled);
    if (turningOn) {
      const n = await testBookingsCount();
      if (n > 0 && tests !== "delete" && tests !== "keep") return { done: false, tests: n, keepable: await keepableTestBookings() };
      if (n > 0) {
        const r = await resolveTestBookings(tests as "delete" | "keep");
        result = { done: true, ...r };
      }
    }
    const next =
      which === "agenda"
        ? { ...current, agendaEnabled: on === true, enabled: on === true ? current.enabled : false }
        : { ...current, enabled: on === true, agendaEnabled: on === true ? true : current.agendaEnabled };
    await saveBookingSettings(next);
    refresh();
    return result;
  });
}

// «Riapri ora» dopo la pausa automatica (troppe richieste in poco tempo).
export async function reopenOnline(): Promise<ActionResult> {
  return runAction(async () => {
    await requireOwner();
    await guardPreview();
    await clearPause();
    refresh();
  });
}

export type SettingsInput = Omit<BookingSettings, "enabled" | "agendaEnabled" | "pausedUntil">;

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  return runAction(async () => {
    await requireOwner();
    await guardPreview();
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
    const todayUntil = typeof input.todayUntil === "string" ? input.todayUntil.trim() : "";
    if (todayUntil && !/^([01]\d|2[0-3]):[0-5]\d$/.test(todayUntil)) throw new ValidationError("«Per stasera online fino alle»: scegli un orario o lascia vuoto.");
    const current = await loadBookingSettings();
    const next: BookingSettings = {
      agendaEnabled: current.agendaEnabled,
      enabled: current.enabled,
      pausedUntil: current.pausedUntil,
      todayUntil,
      firstTime: input.firstTime,
      lastBeforeClose: int(input.lastBeforeClose, 0, 240, "Ultima richiesta prima della chiusura"),
      step: Number(input.step),
      maxPeople: int(input.maxPeople, 1, 40, "Persone massime"),
      leadMinutes: int(input.leadMinutes, 0, 24 * 60, "Anticipo minimo"),
      daysAhead: int(input.daysAhead, 1, 180, "Giorni in avanti"),
      notifyEmail: email,
      capacityHint: int(input.capacityHint, 0, 500, "Quante persone ci stanno"),
      whatsappSenders: input.whatsappSenders === "all" ? "all" : "venue",
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

export async function savePushSubscription(sub: SubscriptionInput, userAgent: string, localPhone = false): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireAgendaManager();
    const { endpoint, p256dh, auth } = parseSubscription(sub);
    const ua = typeof userAgent === "string" ? userAgent.slice(0, 300) : null;
    // «Telefono enoteca» lo decide la sessione (il telefono della sala), non una scelta sul dispositivo.
    void localPhone;
    const lp = m.venueDevice === true;
    // Stesso telefono, altra persona che ha fatto l'accesso: l'iscrizione passa a chi c'è adesso.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, userAgent: ua, localPhone: lp, ...owner(m) },
      update: { p256dh, auth, userAgent: ua, failCount: 0, localPhone: lp, ...owner(m) },
    });
    revalidatePath("/prenotazioni");
  });
}

// Riallinea l'iscrizione agli avvisi: «telefono enoteca» (avvisi «da mandare su WhatsApp») lo decide
// l'accesso del telefono della sala, non più un interruttore sul dispositivo (il secondo argomento resta
// per i telefoni con la pagina vecchia ancora aperta, ma non conta).
export async function setPushLocalPhone(endpointInput: string, on?: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const m = await requireBookingManager();
    void on;
    if (typeof endpointInput !== "string" || endpointInput.length > 1000) throw new ValidationError("Dati non validi.");
    await prisma.pushSubscription.updateMany({
      where: { endpoint: endpointInput, ...(m.employeeId ? { employeeId: m.employeeId } : { username: m.username }) },
      data: { localPhone: m.venueDevice === true },
    });
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
