// Prenotazioni online: impostazioni e calcolo degli orari prenotabili. Funzioni pure,
// sicure anche nei componenti client (niente database: quello sta in lib/booking/service.ts).

import { rangesFor, type Hours } from "@/lib/menu-venue";

export type BookingSettings = {
  // Spenta: la pagina pubblica non c'è (404) e nessuno riceve avvisi. Il titolare la vede
  // lo stesso per provarla, e le sue richieste sono «di prova».
  enabled: boolean;
  // Prima ora prenotabile («sempre esclusa la mattina»).
  firstTime: string;
  // Ultima richiesta: tanti minuti prima della chiusura.
  lastBeforeClose: number;
  // Passo degli orari proposti (minuti).
  step: number;
  // Oltre questo numero di persone: «chiamaci».
  maxPeople: number;
  // Anticipo minimo rispetto ad adesso (minuti).
  leadMinutes: number;
  // Fin quanti giorni avanti si può chiedere.
  daysAhead: number;
  // Email del titolare per gli avvisi (facoltativa; serve l'invio mail configurato).
  notifyEmail: string;
  // Persone già confermate oltre le quali di solito il locale è pieno (0 = non mostrare).
  capacityHint: number;
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  enabled: false,
  firstTime: "12:00",
  lastBeforeClose: 60,
  step: 30,
  maxPeople: 10,
  leadMinutes: 60,
  daysAhead: 30,
  notifyEmail: "",
  capacityHint: 0,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function parseBookingSettings(raw: string | null | undefined): BookingSettings {
  let v: Partial<BookingSettings> = {};
  try {
    v = raw ? (JSON.parse(raw) as Partial<BookingSettings>) : {};
  } catch {
    v = {};
  }
  const d = DEFAULT_BOOKING_SETTINGS;
  return {
    enabled: v.enabled === true,
    firstTime: typeof v.firstTime === "string" && TIME.test(v.firstTime) ? v.firstTime : d.firstTime,
    lastBeforeClose: int(v.lastBeforeClose, 0, 240, d.lastBeforeClose),
    step: [15, 30, 60].includes(Number(v.step)) ? Number(v.step) : d.step,
    maxPeople: int(v.maxPeople, 1, 40, d.maxPeople),
    leadMinutes: int(v.leadMinutes, 0, 24 * 60, d.leadMinutes),
    daysAhead: int(v.daysAhead, 1, 180, d.daysAhead),
    notifyEmail: typeof v.notifyEmail === "string" ? v.notifyEmail.trim().slice(0, 254) : "",
    capacityHint: int(v.capacityHint, 0, 500, d.capacityHint),
  };
}

// ---------- Date e ore a Roma

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fmtMin = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// Scarto di Roma da UTC (minuti) in un certo istante: 60 d'inverno, 120 d'estate.
function romeOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

// Istante (UTC) di «giorno alle ora», ora di Roma. minutes può superare 1440 (dopo mezzanotte).
// Nelle ore che non esistono (cambio all'ora legale) si sposta avanti; in quelle doppie ne prende una.
export function romeInstant(dayKey: string, minutes: number): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = naive - romeOffset(new Date(naive)) * 60000;
  guess = naive - romeOffset(new Date(guess)) * 60000;
  return new Date(guess);
}

// Giorno di calendario e minuti, ora di Roma.
export function romeParts(at: Date): { dateKey: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  const [yy, mm, dd] = dateKey.split("-").map(Number);
  return { dateKey, minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7 };
}

// Giorno commerciale (cambia alle 5:00, come in lib/menu-format.ts).
export function businessDay(at: Date): string {
  const { dateKey, minutes } = romeParts(at);
  return minutes < 5 * 60 ? addDays(dateKey, -1) : dateKey;
}

// ---------- Orari prenotabili

export type Slot = { time: string; minutes: number; startsAt: Date };

export type DayClosure = { kind: "closed" | "full"; reason: string | null };

export type DayAvailability =
  | { state: "open"; slots: Slot[] }
  // Giorno passato, oltre il limite in avanti, chiuso, al completo, o tutti gli orari troppo vicini.
  | { state: "past" | "tooFar" | "closed" | "full" | "noSlots"; reason: string | null; slots: [] };

// Orari prenotabili di un giorno commerciale: dentro gli orari di apertura (anche dopo
// mezzanotte), non prima di firstTime, fino a lastBeforeClose minuti prima della chiusura,
// a passi di step, e almeno leadMinutes da adesso.
export function availability(
  dayKey: string,
  hours: Hours,
  settings: BookingSettings,
  closure: DayClosure | null,
  now: Date,
): DayAvailability {
  const today = businessDay(now);
  if (dayKey < today) return { state: "past", reason: null, slots: [] };
  if (dayKey > addDays(today, settings.daysAhead)) return { state: "tooFar", reason: null, slots: [] };
  if (closure?.kind === "closed") return { state: "closed", reason: closure.reason, slots: [] };
  const ranges = rangesFor(hours, dayKey);
  if (!ranges.length) return { state: "closed", reason: null, slots: [] };
  if (closure?.kind === "full") return { state: "full", reason: closure.reason, slots: [] };

  const first = toMin(settings.firstTime);
  const minStart = now.getTime() + settings.leadMinutes * 60000;
  const seen = new Set<number>();
  const slots: Slot[] = [];
  for (const r of ranges) {
    const open = toMin(r.open);
    let close = toMin(r.close);
    if (close <= open) close += 1440;
    // Le ore prima delle 5 appartengono alla sera prima: un'apertura «02:00» del giorno è già notte.
    let start = Math.max(open, first);
    start = Math.ceil(start / settings.step) * settings.step;
    const last = close - settings.lastBeforeClose;
    for (let m = start; m <= last; m += settings.step) {
      if (seen.has(m)) continue;
      const startsAt = romeInstant(dayKey, m);
      if (startsAt.getTime() < minStart) continue;
      seen.add(m);
      slots.push({ time: fmtMin(m), minutes: m, startsAt });
    }
  }
  slots.sort((a, b) => a.minutes - b.minutes);
  if (!slots.length) return { state: "noSlots", reason: null, slots: [] };
  return { state: "open", slots };
}

// Minuti di un orario «HH:MM» scelto per un giorno: le ore prima delle 5 sono dopo mezzanotte.
export function timeToDayMinutes(time: string): number {
  const m = toMin(time);
  return m < 5 * 60 ? m + 1440 : m;
}

// ---------- Testi

const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// «sabato 14 novembre»
export function dayLong(dayKey: string): string {
  const [, m, d] = dayKey.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(dayKey)]} ${d} ${MONTHS[m - 1]}`;
}

// «Sab 14 nov»
export function dayShort(dayKey: string): string {
  const [, m, d] = dayKey.split("-").map(Number);
  const w = WEEKDAYS[weekdayOf(dayKey)];
  return `${w.charAt(0).toUpperCase()}${w.slice(1, 3)} ${d} ${MONTHS_SHORT[m - 1]}`;
}

// «oggi», «domani» o «sabato 14 novembre», rispetto al giorno commerciale di adesso.
export function dayRelative(dayKey: string, now: Date): string {
  const today = businessDay(now);
  if (dayKey === today) return "oggi";
  if (dayKey === addDays(today, 1)) return "domani";
  return dayLong(dayKey);
}

export const peopleText = (n: number) => `${n} ${n === 1 ? "persona" : "persone"}`;

// ---------- Stati

export type BookingStatus = "PENDING" | "PROPOSED" | "CONFIRMED" | "DECLINED" | "CANCELLED";
// Lo stato che si mostra: una richiesta mai risposta con l'orario passato è «scaduta».
export type BookingView = BookingStatus | "EXPIRED";

export function viewStatus(b: { status: BookingStatus; startsAt: Date; proposedStartsAt?: Date | null }, now: Date): BookingView {
  if (b.status === "PENDING" && b.startsAt.getTime() < now.getTime()) return "EXPIRED";
  if (b.status === "PROPOSED" && (b.proposedStartsAt ?? b.startsAt).getTime() < now.getTime()) return "EXPIRED";
  return b.status;
}

export const STATUS_LABEL: Record<BookingView, string> = {
  PENDING: "Da confermare",
  PROPOSED: "Altro orario proposto",
  CONFIRMED: "Confermata",
  DECLINED: "Non c'è posto",
  CANCELLED: "Annullata",
  EXPIRED: "Scaduta senza risposta",
};

export const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  menu: "Menù",
  evento: "Evento",
  altro: "Link diretto",
};

export function normalizeSource(v: unknown): string {
  return typeof v === "string" && v in SOURCE_LABEL ? v : "altro";
}
