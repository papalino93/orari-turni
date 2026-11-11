// Prenotazioni online: impostazioni e calcolo degli orari prenotabili. Funzioni pure,
// sicure anche nei componenti client (niente database: quello sta in lib/booking/service.ts).

import { rangesFor, type Hours } from "@/lib/menu-venue";

export type BookingSettings = {
  // Agenda interna («+ Nuova prenotazione», Agenda, Stasera, Prossimi giorni) per chi ha il permesso.
  // Spenta: la vede solo il titolare, e quello che segna è «di prova». Le richieste online accese
  // la accendono sempre (chi risponde ai clienti deve vederle).
  agendaEnabled: boolean;
  // Richieste online dai clienti (modulo pubblico, link nel menù e negli eventi). Spenta: la pagina
  // pubblica non c'è (404) e nessuno riceve avvisi; il titolare la vede per provarla («di prova»).
  // Spegnerla non tocca mai l'agenda: è il freno d'emergenza contro lo spam.
  enabled: boolean;
  // «Per stasera online fino alle…» (es. «19:00»): dopo, il modulo per oggi dice di chiamare. "" = nessun limite.
  todayUntil: string;
  // Pausa automatica del modulo (troppe richieste in poco tempo): fino a quando (ISO), "" = nessuna.
  pausedUntil: string;
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
  agendaEnabled: false,
  enabled: false,
  todayUntil: "",
  pausedUntil: "",
  firstTime: "17:00",
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
  const enabled = v.enabled === true;
  return {
    // Con le richieste online accese l'agenda è sempre accesa (anche per le impostazioni salvate
    // prima che ci fossero i due interruttori).
    agendaEnabled: v.agendaEnabled === true || enabled,
    enabled,
    todayUntil: typeof v.todayUntil === "string" && TIME.test(v.todayUntil) ? v.todayUntil : "",
    pausedUntil: typeof v.pausedUntil === "string" && !Number.isNaN(Date.parse(v.pausedUntil)) ? v.pausedUntil : "",
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
  // «Per stasera online fino alle 19»: dopo quell'ora, per oggi si chiama (come quando è troppo tardi).
  const until = onlineUntilInstant(dayKey, today, settings);
  if (until && now.getTime() >= until.getTime()) return { state: "noSlots", reason: null, slots: [] };

  const first = toMin(settings.firstTime);
  const minStart = now.getTime() + settings.leadMinutes * 60000;
  const seen = new Set<number>();
  // La notte del passaggio all'ora legale due orari («02:00» e «03:00») cadono nello stesso istante: uno solo.
  const seenInstants = new Set<number>();
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
      if (startsAt.getTime() < minStart || seenInstants.has(startsAt.getTime())) continue;
      seen.add(m);
      seenInstants.add(startsAt.getTime());
      slots.push({ time: fmtMin(m), minutes: m, startsAt });
    }
  }
  slots.sort((a, b) => a.minutes - b.minutes);
  if (!slots.length) return { state: "noSlots", reason: null, slots: [] };
  return { state: "open", slots };
}

// Fino a quando oggi si può chiedere online («Per stasera online fino alle…»), o null se non c'è limite.
export function onlineUntilInstant(dayKey: string, today: string, settings: Pick<BookingSettings, "todayUntil">): Date | null {
  if (dayKey !== today || !settings.todayUntil) return null;
  return romeInstant(dayKey, timeToDayMinutes(settings.todayUntil));
}

// Pausa automatica in corso (troppe richieste online in poco tempo)?
export function pausedNow(settings: Pick<BookingSettings, "pausedUntil">, now: Date = new Date()): Date | null {
  if (!settings.pausedUntil) return null;
  const until = new Date(settings.pausedUntil);
  return until.getTime() > now.getTime() ? until : null;
}

// Stato dei due interruttori in una riga, per la fascia in cima a /prenotazioni e le impostazioni.
export function switchesText(settings: Pick<BookingSettings, "agendaEnabled" | "enabled">): string {
  return `Agenda ${settings.agendaEnabled ? "accesa" : "spenta"} · Richieste online ${settings.enabled ? "accese" : "spente"}`;
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
  DECLINED: "Al completo",
  CANCELLED: "Annullata",
  EXPIRED: "Scaduta senza risposta",
};

export const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  menu: "Menù",
  evento: "Evento",
  altro: "Link diretto",
  // Segnate a mano in agenda dal personale.
  telefono: "Telefono",
  whatsapp: "WhatsApp",
  persona: "Di persona",
};

// Da dove arriva una prenotazione segnata a mano (pulsanti del foglio «Nuova prenotazione»).
export const MANUAL_SOURCES = ["telefono", "whatsapp", "persona"] as const;
export type ManualSource = (typeof MANUAL_SOURCES)[number];

// Solo le provenienze del sito: un cliente non può dichiararsi «telefono» o «di persona».
const ONLINE_SOURCES = ["google", "menu", "evento", "altro"];
export function normalizeSource(v: unknown): string {
  return typeof v === "string" && ONLINE_SOURCES.includes(v) ? v : "altro";
}

// L'ora è dentro gli orari di apertura di quel giorno? (Agenda: non blocca, avvisa soltanto.)
export function withinOpening(dayKey: string, time: string, hours: Hours): "ok" | "closedDay" | "outside" {
  const ranges = rangesFor(hours, dayKey);
  if (!ranges.length) return "closedDay";
  const m = timeToDayMinutes(time);
  for (const r of ranges) {
    const open = toMin(r.open);
    let close = toMin(r.close);
    if (close <= open) close += 1440;
    if (m >= open && m <= close) return "ok";
  }
  return "outside";
}

export const bookingsText = (n: number) => `${n} ${n === 1 ? "prenotazione" : "prenotazioni"}`;

// Totali di un giorno: prenotazioni e persone. Niente «tavoli»: una prenotazione da 10 su più
// tavoli accostati non è «1 tavolo».
export function agendaTotals(rows: { people: number }[]): { people: number; count: number; text: string } {
  const people = rows.reduce((s, b) => s + b.people, 0);
  return { people, count: rows.length, text: `${bookingsText(rows.length)} · ${peopleText(people)}` };
}

// Nome per riconoscere i doppioni: senza maiuscole, accenti e spazi in più («Rossì  Mario» = «rossi mario»).
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// «sab 20:30»: giorno breve e ora, per gli avvisi e i messaggi brevi.
export function dayTimeShort(dayKey: string, time: string): string {
  return `${WEEKDAYS[weekdayOf(dayKey)].slice(0, 3)} ${time}`;
}

// Persone e prenotazioni confermate intorno a un orario (±1 ora) e in tutta la giornata: per decidere
// se c'è posto prima di confermare una richiesta o segnarne una nuova.
export function aroundTime(
  rows: { id: string; day: string; startsAt: number; people: number }[],
  day: string,
  startsAt: number | null,
  excludeId?: string,
): { near: { people: number; count: number } | null; day: { people: number; count: number } } {
  const same = rows.filter((r) => r.day === day && r.id !== excludeId);
  const sum = (l: typeof same) => ({ people: l.reduce((s, r) => s + r.people, 0), count: l.length });
  return { near: startsAt === null ? null : sum(same.filter((r) => Math.abs(r.startsAt - startsAt) <= 60 * 60000)), day: sum(same) };
}

// «Tavolo 5», ma «dehors» e «Sala grande» così come sono.
export function tableText(table: string): string {
  return /^\d+[a-z]?$/i.test(table.trim()) ? `Tavolo ${table.trim()}` : table.trim();
}

// Impronta dei campi che si modificano dal foglio «Modifica»: chi salva dice quali dati aveva
// davanti, e se nel frattempo qualcuno li ha cambiati non si sovrascrive. «Arrivati»/«Non venuti»
// e le altre azioni non toccano questi campi, quindi non fanno fallire una modifica aperta.
export function editVersion(b: { day: string; time: string; people: number; name: string; phone: string | null; table: string | null; note: string | null; allergies: boolean }): string {
  return JSON.stringify([b.day, b.time, b.people, b.name, b.phone ?? "", b.table ?? "", b.note ?? "", b.allergies]);
}

// Le etichette dei giorni nel foglio: tra mezzanotte e le 5 il giorno commerciale («oggi»)
// è ancora quello di ieri sul calendario, e «Domani» sarebbe il giorno che è già cominciato.
// Allora si scrive la data: «Sab 7 nov (stanotte)» e «Dom 8 nov».
export function quickDayLabels(today: string, now: Date): { today: string; tomorrow: string } {
  if (romeParts(now).dateKey === today) return { today: "Oggi", tomorrow: "Domani" };
  return { today: `${dayShort(today)} (stanotte)`, tomorrow: dayShort(addDays(today, 1)) };
}

// ---------- Telefono del cliente
//
// Un numero sbagliato vuol dire una risposta che non arriva mai: si controlla prima dell'invio
// (stessa funzione nel modulo e sul server). Restituisce il testo dell'errore o null se va bene.
export function phoneProblem(raw: string, contact: "whatsapp" | "email"): string | null {
  const plain = raw.replace(/[\s.\-/()]/g, "");
  if (!plain) return "Scrivi il tuo numero di telefono.";
  if (!/^\+?\d+$/.test(plain)) return "Nel numero di telefono ci sono caratteri strani: scrivi solo le cifre.";
  let national: string | null = null;
  if (plain.startsWith("+39")) national = plain.slice(3);
  else if (plain.startsWith("0039")) national = plain.slice(4);
  else if (!plain.startsWith("+") && !plain.startsWith("00")) {
    if (!/^[03]/.test(plain)) return "Se è un numero estero, scrivilo con il prefisso, es. +44 …";
    national = plain;
  }
  if (national !== null) {
    if (national.startsWith("3") && national.length !== 10) return "Il numero sembra incompleto: un cellulare ha 10 cifre (es. 333 123 4567).";
    if (national.startsWith("0") && (national.length < 6 || national.length > 11)) return "Il numero di telefono non sembra giusto: controllalo.";
    if (!/^[03]/.test(national)) return "Il numero di telefono non sembra giusto: controllalo.";
    if (national.startsWith("0") && contact === "whatsapp") return "Su WhatsApp possiamo risponderti solo su un cellulare: scrivi il cellulare oppure scegli Email.";
  } else {
    const digits = plain.replace(/^\+|^00/, "");
    if (digits.length < 8 || digits.length > 15) return "Il numero di telefono non sembra giusto: controllalo.";
  }
  return null;
}

// Si può scrivere su WhatsApp a questo numero (salvato come «393331234567»)? Non a un fisso italiano.
export function whatsappReachable(phone: string | null | undefined): boolean {
  return Boolean(phone) && !phone!.startsWith("390");
}

// «333 123 4567» / «+44 7700 900123»: il numero per intero, leggibile, per farlo controllare al cliente.
export function phoneReadable(international: string): string {
  if (international.startsWith("39") && international.length === 12) {
    const n = international.slice(2);
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return `+${international}`;
}
