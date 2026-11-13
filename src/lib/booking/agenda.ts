// Agenda a calendario (Giorno · Settimana · Mese): tipi e calcoli puri, uguali sul server e nel browser.
// Le date sono giorni commerciali «AAAA-MM-GG» (cambiano alle 5:00: le 00:30 sono ancora la sera prima)
// e si contano come stringhe, mai con l'ora locale del dispositivo: un cambio d'ora non sposta i giorni.

import { addDays, isIncomplete, timeToDayMinutes, weekdayOf, type BookingStatus } from "@/lib/booking/rules";

export type AgendaView = "day" | "week" | "month";

// Una prenotazione come la mostra l'agenda: dati leggeri, senza cronologia (il dettaglio la carica a parte).
export type AgendaBooking = {
  id: string;
  status: BookingStatus;
  day: string;
  time: string;
  startsAt: number;
  people: number;
  name: string;
  phone: string;
  note: string | null;
  allergies: boolean;
  table: string | null;
  menu: string | null;
  source: string | null;
  promoTitle: string | null;
  manual: boolean;
  createdBy: string | null;
  arrivedAt: number | null;
  noShowAt: number | null;
  isTest: boolean;
  timeUnknown: boolean;
  peopleUnknown: boolean;
  proposedTime: string | null;
  proposedStartsAt: number | null;
  createdAt: number;
  // Annullata dopo essere stata in agenda (segnata a mano o confermata): resta barrata in fondo al giorno.
  wasInAgenda: boolean;
};

export type AgendaEvent = { title: string; slug: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null };
export type AgendaNote = { id: string; day: string; text: string; author: string; updatedAt: number };
export type AgendaClosure = { kind: "closed" | "full"; reason: string | null };
// «In servizio»: chi lavora quel giorno (fasce dei turni) e chi è in ferie o permesso.
export type AgendaStaff = {
  // null: la settimana non è ancora confermata e chi guarda non è il titolare.
  working: { name: string; ranges: string[] }[] | null;
  away: { name: string; what: string }[] | null;
};

// Riepilogo di un giorno (per la vista Mese il server manda solo questo).
export type DaySummary = {
  // Confermate che contano (senza le prove con l'agenda accesa): prenotazioni e persone note.
  count: number;
  people: number;
  // Delle confermate: quante con persone o ora da definire.
  peopleUnknown: number;
  timeUnknown: number;
  incomplete: number;
  arrived: number;
  allergies: number;
  // Richieste online ancora da confermare (non contano nei totali).
  pending: number;
};

export type AgendaData = {
  from: string;
  to: string;
  bookings: AgendaBooking[] | null;
  summary: Record<string, DaySummary>;
  events: AgendaEvent[];
  notes: AgendaNote[];
  closures: Record<string, AgendaClosure>;
  staff: Record<string, AgendaStaff>;
};

// ---------- Periodi

export const weekStartOf = (day: string) => addDays(day, -weekdayOf(day));
const monthOf = (day: string) => day.slice(0, 7);
const firstOfMonth = (day: string) => `${monthOf(day)}-01`;
function lastOfMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Giorni mostrati da una vista: il giorno, la settimana da lunedì, il mese a settimane intere (5 o 6 righe).
export function periodRange(view: AgendaView, anchor: string): { from: string; to: string } {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = weekStartOf(anchor);
    return { from, to: addDays(from, 6) };
  }
  const from = weekStartOf(firstOfMonth(anchor));
  const last = lastOfMonth(anchor);
  return { from, to: addDays(weekStartOf(last), 6) };
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

// Avanti / indietro di un periodo. Il mese tiene il giorno se c'è (31 gennaio → 28 febbraio).
export function shiftPeriod(view: AgendaView, anchor: string, dir: 1 | -1): string {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  const [y, m, d] = anchor.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + dir, 1));
  const maxDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, maxDay))).toISOString().slice(0, 10);
}

export const inMonth = (day: string, anchor: string) => monthOf(day) === monthOf(anchor);

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
export const WEEKDAY_SHORT = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Titolo del periodo: «Sabato 14 novembre» (con l'anno se non è quello di oggi), «Novembre 2026»,
// e per una settimana a cavallo di due mesi «Nov – dic 2026».
export function periodTitle(view: AgendaView, anchor: string, today: string): string {
  const [y, m, d] = anchor.split("-").map(Number);
  if (view === "day") return `${cap(WEEKDAYS[weekdayOf(anchor)])} ${d} ${MONTHS[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ""}`;
  if (view === "week") {
    const { from, to } = periodRange("week", anchor);
    const [y1, m1] = from.split("-").map(Number);
    const [y2, m2] = to.split("-").map(Number);
    if (m1 === m2) return `${cap(MONTHS[m1 - 1])} ${y1}`;
    if (y1 === y2) return `${cap(MONTHS[m1 - 1].slice(0, 3))} – ${MONTHS[m2 - 1].slice(0, 3)} ${y2}`;
    return `${cap(MONTHS[m1 - 1].slice(0, 3))} ${y1} – ${MONTHS[m2 - 1].slice(0, 3)} ${y2}`;
  }
  return `${cap(MONTHS[m - 1])} ${y}`;
}

// Nome per i lettori di schermo dei pulsanti ‹ ›.
export const PERIOD_WORD: Record<AgendaView, { prev: string; next: string }> = {
  day: { prev: "Giorno prima", next: "Giorno dopo" },
  week: { prev: "Settimana prima", next: "Settimana dopo" },
  month: { prev: "Mese prima", next: "Mese dopo" },
};

// ---------- Prenotazioni del giorno

// Confermate che contano nei totali: con l'agenda accesa le prove si vedono ma non contano.
export const counts = (b: Pick<AgendaBooking, "isTest">, countTests: boolean) => countTests || !b.isTest;

// Richiesta online ancora aperta (da confermare, o con un altro orario proposto e non scaduto).
export function isOpenRequest(b: Pick<AgendaBooking, "status" | "startsAt" | "proposedStartsAt">, now: number): boolean {
  if (b.status === "PENDING") return b.startsAt >= now;
  if (b.status === "PROPOSED") return (b.proposedStartsAt ?? b.startsAt) >= now;
  return false;
}

export function summarize(rows: AgendaBooking[], countTests: boolean, now: number): DaySummary {
  const s: DaySummary = { count: 0, people: 0, peopleUnknown: 0, timeUnknown: 0, incomplete: 0, arrived: 0, allergies: 0, pending: 0 };
  for (const b of rows) {
    if (b.status === "CONFIRMED" && counts(b, countTests)) {
      s.count++;
      if (!b.peopleUnknown) s.people += b.people;
      else s.peopleUnknown++;
      if (b.timeUnknown) s.timeUnknown++;
      if (isIncomplete(b)) s.incomplete++;
      if (b.arrivedAt) s.arrived++;
      if (b.allergies) s.allergies++;
    } else if (isOpenRequest(b, now)) s.pending++;
  }
  return s;
}

export function summarizeByDay(rows: AgendaBooking[], countTests: boolean, now: number): Record<string, DaySummary> {
  const byDay = new Map<string, AgendaBooking[]>();
  for (const b of rows) {
    const l = byDay.get(b.day);
    if (l) l.push(b);
    else byDay.set(b.day, [b]);
  }
  const out: Record<string, DaySummary> = {};
  for (const [day, l] of byDay) out[day] = summarize(l, countTests, now);
  return out;
}

// Minuti dall'inizio del giorno commerciale (le 00:30 dopo le 23:30). Ora da definire: prima di tutto.
export function minutesOf(b: Pick<AgendaBooking, "time" | "timeUnknown" | "status" | "proposedTime">): number {
  if (b.timeUnknown || !b.time) return -1;
  const t = b.status === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time;
  return timeToDayMinutes(t);
}

// Ordine dell'agenda: ora, poi chi è arrivato prima in agenda.
export const byTime = (a: AgendaBooking, b: AgendaBooking) => minutesOf(a) - minutesOf(b) || a.createdAt - b.createdAt;

// Fasce di mezz'ora (sempre le stesse, qualunque giorno): 20:00 vale per 20:00–20:29, 20:30 per
// 20:30–20:59. Una prenotazione alle 20:45 sta nella fascia delle 20:30 e mostra la sua ora.
export type TimeGroup = { key: string; minutes: number; label: string; rows: AgendaBooking[]; count: number; people: number; unknownPeople: number };

const hhmm = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const slotOf = (minutes: number) => Math.floor(minutes / 30) * 30;
export const slotLabel = (slot: number) => hhmm(slot);

export function groupByTime(rows: AgendaBooking[], countTests: boolean): TimeGroup[] {
  const map = new Map<number, AgendaBooking[]>();
  for (const b of [...rows].sort(byTime)) {
    const m = minutesOf(b);
    const key = m < 0 ? -1 : slotOf(m);
    const l = map.get(key);
    if (l) l.push(b);
    else map.set(key, [b]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, l]) => {
      const counted = l.filter((b) => b.status === "CONFIRMED" && counts(b, countTests));
      return {
        key: slot < 0 ? "da-definire" : `ore-${slotLabel(slot).replace(":", "")}`,
        minutes: slot,
        label: slot < 0 ? "Ora da definire" : slotLabel(slot),
        rows: l,
        count: counted.length,
        people: counted.reduce((s, b) => s + (b.peopleUnknown ? 0 : b.people), 0),
        unknownPeople: counted.filter((b) => b.peopleUnknown).length,
      };
    });
}

// Pienezza rispetto alla capienza (impostazione «Di solito pieni oltre», altrimenti 50 persone):
// 0 vuoto · 1 tranquillo · 2 si riempie · 3 quasi pieno · 4 oltre la capienza.
export const DEFAULT_CAPACITY = 50;
export const capacityOf = (capacityHint: number) => (capacityHint > 0 ? capacityHint : DEFAULT_CAPACITY);
export function fullness(people: number, capacity: number): 0 | 1 | 2 | 3 | 4 {
  if (people <= 0) return 0;
  const r = people / capacity;
  if (r > 1) return 4;
  if (r >= 0.85) return 3;
  if (r >= 0.5) return 2;
  return 1;
}
export const FULLNESS_TEXT = ["Nessuna prenotazione", "Tranquillo", "Si riempie", "Quasi pieno", "Oltre il solito"] as const;

// Cerca nel giorno: nome, telefono (anche solo le cifre), nota, menù, tavolo.
export function matchesSearch(b: Pick<AgendaBooking, "name" | "phone" | "note" | "menu" | "table">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && b.phone.includes(digits)) return true;
  return [b.name, b.note ?? "", b.menu ?? "", b.table ?? ""].some((t) => t.toLowerCase().includes(q));
}

// Eventi del menù che toccano un giorno.
export const eventsOn = (events: AgendaEvent[], day: string) => events.filter((e) => e.startDate <= day && day <= e.endDate);

// «Dalle 19:00», «19:00–23:00» o niente.
export function eventTime(e: Pick<AgendaEvent, "startTime" | "endTime">): string {
  if (e.startTime && e.endTime) return `${e.startTime}–${e.endTime}`;
  if (e.startTime) return `dalle ${e.startTime}`;
  return "";
}
