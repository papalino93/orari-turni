// Informazioni sul locale mostrate nel menù: copertina, orari e contatti. Puro:
// usabile sia sul server sia nei componenti client (stato «Aperto ora» calcolato
// sull'orologio del telefono, così resta giusto anche con la pagina in cache).

export type Range = { open: string; close: string };
export type HoursException = {
  id: string;
  startDate: string;
  endDate: string;
  closed: boolean;
  ranges: Range[];
  note: string;
};
// weekly: 7 giorni, da lunedì (0) a domenica (6); nessuna fascia = chiuso.
export type Hours = { showStatus: boolean; weekly: Range[][]; exceptions: HoursException[] };
export type Contacts = { phone: string; whatsappMessage: string; address: string; instagram: string; review: string };
export type Hero = { title: string };

export const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"] as const;
const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

const r = (open: string, close: string): Range => ({ open, close });

// Valori di partenza: gli orari della scheda Google del locale.
export const DEFAULT_HOURS: Hours = {
  showStatus: true,
  weekly: [
    [r("17:00", "21:30")],
    [r("17:00", "21:30")],
    [r("10:00", "13:00"), r("16:30", "22:00")],
    [r("10:00", "13:00"), r("16:30", "22:30")],
    [r("10:00", "13:00"), r("16:30", "22:00")],
    [r("10:00", "13:00"), r("16:30", "22:00")],
    [r("16:30", "21:00")],
  ],
  exceptions: [],
};

export const DEFAULT_CONTACTS: Contacts = {
  phone: "338 327 7053",
  whatsappMessage: "Ciao! Vorrei prenotare un tavolo per",
  address: "Via dei Rossi 53/C, 50018 Scandicci FI",
  instagram: "https://www.instagram.com/langolo.del.vino_enoteca/",
  review: "https://g.page/r/CQtef5OLe4RQEBM/review",
};

export const DEFAULT_HERO: Hero = { title: "Carta dei vini\ne Menù" };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
export const isDayKey = (v: unknown): v is string => typeof v === "string" && DAY.test(v);

function parseRanges(value: unknown): Range[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((x) => {
    const { open, close } = (x ?? {}) as { open?: unknown; close?: unknown };
    return isTime(open) && isTime(close) && open !== close ? [{ open, close }] : [];
  });
}

function readJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Lettura difensiva delle impostazioni (JSON nel database): mai un'eccezione.
export function parseHours(raw: string | null | undefined): Hours {
  const v = readJson(raw) as Partial<Hours> | null;
  if (!v || typeof v !== "object") return DEFAULT_HOURS;
  const weekly = Array.from({ length: 7 }, (_, i) => parseRanges(Array.isArray(v.weekly) ? v.weekly[i] : []));
  const exceptions = (Array.isArray(v.exceptions) ? v.exceptions : []).flatMap((x): HoursException[] => {
    const e = (x ?? {}) as Partial<HoursException>;
    if (typeof e.id !== "string" || !isDayKey(e.startDate) || !isDayKey(e.endDate) || e.startDate > e.endDate) return [];
    return [
      {
        id: e.id,
        startDate: e.startDate,
        endDate: e.endDate,
        closed: Boolean(e.closed),
        ranges: parseRanges(e.ranges),
        note: typeof e.note === "string" ? e.note.slice(0, 120) : "",
      },
    ];
  });
  return { showStatus: v.showStatus !== false, weekly, exceptions };
}

export function parseContacts(raw: string | null | undefined): Contacts {
  const v = readJson(raw) as Partial<Contacts> | null;
  if (!v || typeof v !== "object") return DEFAULT_CONTACTS;
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  return { phone: s(v.phone), whatsappMessage: s(v.whatsappMessage), address: s(v.address), instagram: s(v.instagram), review: s(v.review) };
}

export function parseHero(raw: string | null | undefined): Hero {
  const v = readJson(raw) as Partial<Hero> | null;
  const title = v && typeof v.title === "string" ? v.title.trim() : "";
  return { title: title || DEFAULT_HERO.title };
}

// --- Data e ora a Roma --------------------------------------------------------

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Giorno del calendario (non commerciale) e minuti dalla mezzanotte, ora di Roma.
export function romeNow(now: Date): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { dateKey: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// Eccezione che vale per il giorno (l'ultima dell'elenco vince).
export function exceptionFor(hours: Hours, dateKey: string): HoursException | null {
  let found: HoursException | null = null;
  for (const e of hours.exceptions) if (e.startDate <= dateKey && dateKey <= e.endDate) found = e;
  return found;
}

export function rangesFor(hours: Hours, dateKey: string): Range[] {
  const e = exceptionFor(hours, dateKey);
  if (e) return e.closed ? [] : e.ranges;
  return hours.weekly[weekdayIndex(dateKey)] ?? [];
}

// Fasce in minuti dalla mezzanotte del giorno indicato; chi chiude dopo la
// mezzanotte (close <= open) arriva al giorno dopo.
function intervals(hours: Hours, dateKey: string, offset: number): [number, number][] {
  return rangesFor(hours, dateKey).map((x) => {
    const start = toMin(x.open);
    let end = toMin(x.close);
    if (end <= start) end += 1440;
    return [start + offset, end + offset];
  });
}

export type OpenStatus = { open: boolean; label: string };

// «Aperto ora · chiude alle 22:00» / «Chiuso · riapre domani alle 16:30».
// null se l'indicazione è spenta.
export function openStatus(hours: Hours, now: Date): OpenStatus | null {
  if (!hours.showStatus) return null;
  const { dateKey, minutes } = romeNow(now);
  const current = [...intervals(hours, addDaysKey(dateKey, -1), -1440), ...intervals(hours, dateKey, 0)].find(
    ([start, end]) => start <= minutes && minutes < end,
  );
  if (current) return { open: true, label: `Aperto ora · chiude alle ${fmt(current[1])}` };

  let when: string | null = null;
  for (let d = 0; d <= 7 && !when; d++) {
    const day = addDaysKey(dateKey, d);
    const starts = intervals(hours, day, 0)
      .map(([start]) => start)
      .filter((start) => d > 0 || start > minutes)
      .sort((a, b) => a - b);
    if (starts.length > 0) {
      const name = d === 0 ? "oggi" : d === 1 ? "domani" : DAY_NAMES[weekdayIndex(day)].toLowerCase();
      when = `${name} alle ${fmt(starts[0])}`;
    }
  }
  const today = exceptionFor(hours, dateKey);
  const head = today?.closed ? `Chiuso oggi${today.note ? ` · ${today.note}` : ""}` : "Chiuso";
  return { open: false, label: when ? `${head} · riapre ${when}` : head };
}

// Orari della settimana per la scheda a fondo pagina: giorni consecutivi con
// gli stessi orari sono raggruppati («Lun – Mar»).
export function weeklyRows(hours: Hours): { days: string; text: string }[] {
  const text = (ranges: Range[]) => (ranges.length ? ranges.map((x) => `${x.open}–${x.close}`).join(" · ") : "Chiuso");
  const rows: { start: number; end: number; text: string }[] = [];
  hours.weekly.forEach((ranges, i) => {
    const t = text(ranges);
    const last = rows[rows.length - 1];
    if (last && last.text === t) last.end = i;
    else rows.push({ start: i, end: i, text: t });
  });
  return rows.map((row) => ({
    days: row.start === row.end ? DAY_SHORT[row.start] : `${DAY_SHORT[row.start]} – ${DAY_SHORT[row.end]}`,
    text: row.text,
  }));
}

// --- Link dei contatti --------------------------------------------------------

// Numero in formato internazionale senza «+»: i cellulari e i fissi italiani
// senza prefisso ricevono il 39.
export function internationalNumber(phone: string): string | null {
  const raw = phone.replace(/[^\d+]/g, "");
  let digits: string;
  if (raw.startsWith("+")) digits = raw.slice(1);
  else if (raw.startsWith("00")) digits = raw.slice(2);
  else if (/^[03]\d{6,10}$/.test(raw)) digits = `39${raw}`;
  else digits = raw;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function telHref(phone: string): string | null {
  const n = internationalNumber(phone);
  return n ? `tel:+${n}` : null;
}

export function whatsappHref(phone: string, message: string): string | null {
  const n = internationalNumber(phone);
  if (!n) return null;
  // Se il messaggio finisce con una parola («…un tavolo per»), si aggiunge uno
  // spazio: il cliente continua a scrivere («4 persone, sabato alle 20»).
  const text = message.trim();
  const ready = /[\p{L}\p{N}]$/u.test(text) ? `${text} ` : text;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(ready)}` : ""}`;
}

export function mapsHref(address: string): string | null {
  const a = address.trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
