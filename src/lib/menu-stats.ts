// Statistiche anonime del menù dei clienti: niente cookie, niente dati
// personali, solo che cosa è successo, in che giorno e a che ora (italiana).
// Puro: usato dal menù (client), dall'endpoint che riceve e dalla pagina
// Statistiche.

export const STAT_KINDS = {
  open: "Apertura del menù",
  search: "Ricerca",
  search_empty: "Ricerca senza risultati",
  pick: "Risultato scelto",
  pair: "Abbinamento toccato",
  section: "Sezione aperta",
  event: "Pagina evento",
  contact: "Contatto",
} as const;

export type StatKind = keyof typeof STAT_KINDS;

export function isStatKind(value: unknown): value is StatKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STAT_KINDS, value);
}

// Giorno (YYYY-MM-DD), ora (0–23) e giorno della settimana (1 = lunedì … 7 = domenica)
// nell'ora italiana, dal giorno di calendario (mezzanotte–mezzanotte).
export function romeParts(now: Date = new Date()): { day: string; hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    weekday: weekdays.indexOf(get("weekday")) + 1,
  };
}

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
export const WEEKDAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"] as const;
