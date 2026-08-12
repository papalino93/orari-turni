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

// dayOfWeek nel modello CoverageThreshold: 0=domenica..6=sabato (convenzione JS Date).
export function jsDayOfWeek(date: Date): number {
  return date.getUTCDay();
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

export function isToday(date: Date): boolean {
  return toDateKey(date) === toDateKey(new Date());
}

// Orario di riferimento per la vista copertura (fasce orarie di un'enoteca).
export const COVERAGE_START_HOUR = 8;
export const COVERAGE_END_HOUR = 24;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function coverageCounts(
  blocks: { startTime: string; endTime: string }[],
): number[] {
  const hours = COVERAGE_END_HOUR - COVERAGE_START_HOUR;
  const counts = new Array(hours).fill(0);
  for (const b of blocks) {
    const start = timeToMinutes(b.startTime);
    const end = timeToMinutes(b.endTime);
    for (let h = 0; h < hours; h++) {
      const slotStart = (COVERAGE_START_HOUR + h) * 60;
      const slotEnd = slotStart + 60;
      if (start < slotEnd && end > slotStart) counts[h]++;
    }
  }
  return counts;
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
