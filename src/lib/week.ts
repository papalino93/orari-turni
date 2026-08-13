const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAY_LABELS_FULL = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Lunedì della settimana contenente `date`.
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const jsDay = d.getUTCDay(); // 0=domenica..6=sabato
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function dayLabel(date: Date, full = false): string {
  const idx = (date.getUTCDay() + 6) % 7; // 0=lunedì..6=domenica
  return (full ? DAY_LABELS_FULL : DAY_LABELS)[idx];
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getUTCMonth() === end.getUTCMonth();
  const startStr = weekStart.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: sameMonth ? undefined : "long",
    timeZone: "UTC",
  });
  const endStr = end.toLocaleDateString("it-IT", { day: "2-digit", month: "long", timeZone: "UTC" });
  return `${startStr} – ${endStr}`;
}

// Fuso del locale. Le date sono salvate come giorno "puro" (@db.Date) e
// confrontate come stringhe YYYY-MM-DD: "oggi" va quindi calcolato nel fuso
// del negozio, non in UTC. Con toISOString() dopo la mezzanotte italiana
// "oggi" sarebbe rimasto al giorno prima fino alle 01:00/02:00, marcando
// come passati turni ancora in corso.
const SHOP_TIME_ZONE = "Europe/Rome";

// en-CA formatta come YYYY-MM-DD, lo stesso formato delle chiavi data.
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayKey(now: Date = new Date()): string {
  return dayKeyFormatter.format(now);
}

export function isToday(date: Date): boolean {
  return toDateKey(date) === todayKey();
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Ore lavorate di un singolo blocco (decimali, es. 4.5).
export function blockHours(block: { startTime: string; endTime: string }): number {
  return Math.max(0, timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) / 60;
}

export function sumHours(blocks: { startTime: string; endTime: string }[]): number {
  return Math.round(blocks.reduce((sum, b) => sum + blockHours(b), 0) * 100) / 100;
}

const MONTH_LABELS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];
const MONTH_LABELS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function monthLabel(monthIndex: number, short = false): string {
  return (short ? MONTH_LABELS_SHORT : MONTH_LABELS)[monthIndex];
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function daysInMonth(date: Date): Date[] {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

// Le settimane (lunedì..domenica) che intersecano il mese di `date`.
export function weeksInMonth(date: Date): Date[][] {
  const start = startOfWeek(startOfMonth(date));
  const end = endOfMonth(date);
  const weeks: Date[][] = [];
  let cursor = start;
  while (cursor <= end) {
    weeks.push(weekDays(cursor));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

// Come weeksInMonth, ma ogni fascia è "tagliata" al mese: la prima parte
// dal giorno 1 (anche se non è lunedì) e l'ultima finisce all'ultimo
// giorno del mese, senza mai includere giorni del mese precedente/successivo.
export function weekRangesInMonth(date: Date): { start: Date; end: Date }[] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const ranges: { start: Date; end: Date }[] = [];
  let cursor = startOfWeek(monthStart);
  while (cursor <= monthEnd) {
    const weekEnd = addDays(cursor, 6);
    const start = cursor < monthStart ? monthStart : cursor;
    const end = weekEnd > monthEnd ? monthEnd : weekEnd;
    ranges.push({ start, end });
    cursor = addDays(cursor, 7);
  }
  return ranges;
}

export function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function addYears(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

export function formatMonthYear(date: Date): string {
  return `${monthLabel(date.getUTCMonth())} ${date.getUTCFullYear()}`;
}

export function formatFullDate(date: Date): string {
  return date.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
}
