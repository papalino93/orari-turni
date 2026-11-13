// «Importa dal librone»: lettura di una lista incollata (una prenotazione per riga) in prenotazioni
// da segnare in agenda. Funzione pura: la usa il foglio nel browser per l'anteprima e la rifà il
// server prima di salvare (non si fida mai di quello che ha letto il browser).
//
// Una riga: giorno, ora, persone, nome; poi telefono e nota se ci sono. Separatori: tabulazione
// (Excel), punto e virgola, barra verticale oppure semplici spazi. Una riga con il solo giorno
// («Sabato 15/11») vale per le righe sotto, come una pagina del librone.

import { internationalNumber } from "@/lib/menu-venue";
import { addDays, businessDay, mentionsAllergy, nameKey, phoneProblem, weekdayOf } from "@/lib/booking/rules";

export const IMPORT_MAX_ROWS = 200;
export const IMPORT_MAX_CHARS = 60000;

export type ImportRow = {
  // Numero della riga nel testo incollato (da 1, contando anche le righe vuote).
  line: number;
  text: string;
  // booking: una prenotazione; day: riga con il solo giorno (vale per le righe sotto);
  // skip: intestazione delle colonne (Excel), si salta.
  kind: "booking" | "day" | "skip";
  day: string | null;
  // Il giorno viene dalla riga «giorno» numero… (null: scritto sulla riga stessa).
  dayFrom: number | null;
  time: string | null;
  people: number | null;
  name: string;
  // Il telefono come scritto e com'è salvato («393331234567»); "" se non c'è.
  phone: string;
  phoneIntl: string;
  table: string;
  note: string;
  allergies: boolean;
  // Problemi che impediscono di segnarla (in rosso) e avvisi che non la bloccano (in giallo).
  errors: string[];
  warnings: string[];
  // Uguale a una riga più in alto: non si segna due volte.
  repeatOf: number | null;
};

export const E_DAY = "Giorno non letto";
export const E_PAST = "Giorno già passato";
export const E_FAR = "Giorno troppo avanti (più di un anno)";
export const E_TIME = "Ora non letta";
export const E_PEOPLE = "Persone?";
export const E_NAME = "Manca il nome";
export const E_NAME_LONG = "Nome troppo lungo: separa la nota con una virgola";
export const W_WEEKDAY = "Il giorno della settimana non torna";

// Impronta di una prenotazione letta: due righe uguali hanno la stessa.
export function importSig(r: Pick<ImportRow, "day" | "time" | "people" | "name" | "phoneIntl">): string {
  return [r.day ?? "", r.time ?? "", r.people ?? "", nameKey(r.name), r.phoneIntl].join("|");
}

// Si segna? (prenotazione senza problemi e non ripetuta)
export const importable = (r: ImportRow) => r.kind === "booking" && r.errors.length === 0 && r.repeatOf === null;

// ---------- Parole

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
// Token senza punteggiatura in coda («Rossi,» «sab.» «20:30,»).
const bare = (s: string) => plain(s).replace(/[,.;:]+$/, "");

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/^lun(edi)?$/, 0],
  [/^mar(tedi)?$/, 1],
  [/^mer(coledi)?$/, 2],
  [/^gio(vedi)?$/, 3],
  [/^ven(erdi)?$/, 4],
  [/^sab(ato)?$/, 5],
  [/^dom(enica)?$/, 6],
];
const WEEKDAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
function weekdayWord(t: string): number | null {
  const b = bare(t);
  for (const [re, n] of WEEKDAY_WORDS) if (re.test(b)) return n;
  return null;
}
const MONTH_WORDS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MONTH_FULL = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
function monthWord(t: string): number | null {
  const b = bare(t);
  for (let i = 0; i < 12; i++) if (b === MONTH_WORDS[i] || b === MONTH_FULL[i]) return i + 1;
  return null;
}
const PEOPLE_WORD = /^(p|px|pax|pers|persona|persone|coperti|coperto)$/;
const FILLER = /^(ore|alle|h|per|il|tel|cell|telefono|cellulare|nr|n)$/;
// Parole con cui di solito comincia una nota: il nome finisce prima.
// Solo scritte in minuscolo: «Mario Festa» resta un nome, «Rossi festa 18 anni» no.
const NOTE_START =
  /^(seggiolon[ei]|compleanno|anniversario|passeggino|cane|cani|bimb[oaie]|bambin[oaie]|festa|dehors|fuori|finestra|torta|vegan[oaie]?|vegetarian[oaie]|sedia|sedie|carrozzina|aperitivo|degustazione|caparra|acconto|nota|note|tavolo|esterno|interno|divanetto|ritardo|arriva|arrivano|forse)[,.:;]?$/;

// ---------- Giorno

function dateKey(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return addDays(key, 0) === key ? key : null;
}

// Giorno senza anno: il prossimo. Uno appena passato (fino a 2 mesi fa) è un errore, non l'anno dopo.
function withoutYear(m: number, d: number, today: string): string | "past" | null {
  const y = Number(today.slice(0, 4));
  const k = dateKey(y, m, d) ?? (m === 2 && d === 29 ? dateKey(y + 1, m, d) : null);
  if (!k) return null;
  if (k >= today) return k;
  if (k >= addDays(today, -60)) return "past";
  return dateKey(y + 1, m, d);
}

type DayHit = { day: string | "past" | "invalid"; used: number };

// Data in un token (14/11, 14-11, 14.11, 14/11/26, 2026-11-14), o «14 nov [2026]» su due/tre token.
function readDate(toks: string[], i: number, today: string, allowDot: boolean): DayHit | null {
  const t = bare(toks[i]);
  if (t === "oggi" || t === "stasera") return { day: today, used: 1 };
  if (t === "domani") return { day: addDays(today, 1), used: 1 };
  if (t === "dopodomani") return { day: addDays(today, 2), used: 1 };
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return { day: dateKey(+m[1], +m[2], +m[3]) ?? "invalid", used: 1 };
  m = t.match(/^(\d{1,2})([-/.])(\d{1,2})(?:\2(\d{2}|\d{4}))?$/);
  if (m && (m[2] !== "." || allowDot || m[4])) {
    const d = +m[1];
    const mo = +m[3];
    if (m[4]) {
      const y = m[4].length === 2 ? 2000 + +m[4] : +m[4];
      return { day: dateKey(y, mo, d) ?? "invalid", used: 1 };
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return m[2] === "." ? null : { day: "invalid", used: 1 };
    return { day: withoutYear(mo, d, today) ?? "invalid", used: 1 };
  }
  // «14 nov», «14nov», «14 novembre 2026»
  m = t.match(/^(\d{1,2})([a-z]+)$/);
  let d: number | null = null;
  let mo: number | null = null;
  let used = 0;
  if (m && monthWord(m[2])) {
    d = +m[1];
    mo = monthWord(m[2]);
    used = 1;
  } else if (/^\d{1,2}$/.test(t) && i + 1 < toks.length && monthWord(toks[i + 1])) {
    d = +t;
    mo = monthWord(toks[i + 1]);
    used = 2;
  }
  if (d !== null && mo !== null) {
    const y = toks[i + used] ? bare(toks[i + used]) : "";
    if (/^20\d{2}$/.test(y)) return { day: dateKey(+y, mo, d) ?? "invalid", used: used + 1 };
    return { day: withoutYear(mo, d, today) ?? "invalid", used };
  }
  return null;
}

// ---------- Ora

const hhmm = (h: number, m: number) => (h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null);

// 20:30, 20.30, 20,30, 20h30, 20h, 2030, 20:30:00 (da Excel). «20» da solo lo decide chi chiama.
function readTime(tok: string, allowDot = true): string | null {
  const t = bare(tok).replace(/^(h|ore)/, "");
  let m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return hhmm(+m[1], +m[2]);
  m = t.match(/^(\d{1,2})[.,h](\d{2})$/);
  if (m && (allowDot || !t.includes("."))) return hhmm(+m[1], +m[2]);
  m = t.match(/^(\d{1,2})h$/);
  if (m) return hhmm(+m[1], 0);
  m = t.match(/^(\d{1,2})(\d{2})$/);
  if (m) return hhmm(+m[1], +m[2]);
  return null;
}
// Il token può essere un'ora scritta con un separatore (per decidere se «14.11» è una data).
const looksTime = (tok: string) => /^(h|ore)?\d{1,2}([:,h]\d{2}(:\d{2})?|h)$/.test(bare(tok)) || /^\d{1,2}\.\d{2}$/.test(bare(tok)) || /^\d{4}$/.test(bare(tok));

// ---------- Persone

// x4, 4p, 4px, 4pax, 4pers, 4persone, 4+2 (adulti + bambini)
function readPeopleTok(tok: string): number | null {
  const t = bare(tok);
  let m = t.match(/^x\s*(\d{1,3})$/);
  if (m) return +m[1];
  m = t.match(/^(\d{1,3})\s*(p|px|pax|pers|persona|persone|coperti)\.?$/);
  if (m) return +m[1];
  m = t.match(/^(\d{1,2})\+(\d{1,2})$/);
  if (m) return +m[1] + +m[2];
  return null;
}

// ---------- Telefono

type PhoneRun = { start: number; end: number; text: string };

const phoneTok = (t: string) => /^\+?[\d\-.()/]+$/.test(t.replace(/[,;:]+$/, "")) && /\d/.test(t);
const digitsOf = (s: string) => s.replace(/\D/g, "");

// Quante cifre al massimo può avere un numero che comincia così.
function maxDigits(start: string): number {
  const s = start.replace(/[^\d+]/g, "");
  let national = s;
  let extra = 0;
  if (s.startsWith("+39")) {
    national = s.slice(3);
    extra = 2;
  } else if (s.startsWith("0039")) {
    national = s.slice(4);
    extra = 4;
  } else if (s.startsWith("+") || s.startsWith("00")) return 15 + (s.startsWith("00") ? 2 : 0);
  if (!national) return 15;
  if (national.startsWith("3")) return 10 + extra;
  return 11 + extra;
}

// La prima sequenza di cifre (anche a gruppi: «333 123 4567», «+39 02 1234567») che sembra un numero.
function findPhone(toks: { t: string; f: number }[]): PhoneRun | null {
  for (let i = 0; i < toks.length; i++) {
    if (!phoneTok(toks[i].t)) continue;
    let text = toks[i].t.replace(/[,;:]+$/, "");
    let end = i + 1;
    // Si aggiungono gruppi di cifre finché il numero non è completo (una virgola lo chiude).
    while (end < toks.length && toks[end].f === toks[i].f && phoneTok(toks[end].t) && !/[,;]$/.test(toks[end - 1].t) && digitsOf(text).length < maxDigits(text)) {
      const next = `${text} ${toks[end].t.replace(/[,;:]+$/, "")}`;
      if (digitsOf(next).length > maxDigits(next)) break;
      text = next;
      end++;
    }
    if (digitsOf(text).length >= 6 && !/[/]/.test(text)) return { start: i, end, text };
  }
  return null;
}

// ---------- Una riga

type Parsed = Omit<ImportRow, "line" | "text" | "dayFrom" | "repeatOf"> & { weekday: number | null; bareDay: boolean; dayError: "past" | "invalid" | null };

function parseLine(raw: string, today: string): Parsed {
  const fielded = /[\t;|]/.test(raw);
  const fields = fielded ? raw.split(/[\t;|]/) : [raw];
  let toks: { t: string; f: number }[] = [];
  fields.forEach((fld, f) => {
    for (const t of fld.trim().split(/\s+/).filter(Boolean)) toks.push({ t, f });
  });

  // Tavolo: «t5», «tav 5», «tav. 5», «tavolo 5», «tavolo n. 5», ovunque nella riga.
  let table = "";
  for (let i = 0; i < toks.length && !table; i++) {
    const b = bare(toks[i].t);
    let m = b.match(/^(?:t|tav|tavolo)\.?(\d{1,3}[a-z]?)$/);
    if (m) {
      table = m[1];
      toks.splice(i, 1);
      break;
    }
    if (/^(t|tav|tavolo)$/.test(b)) {
      let j = i + 1;
      if (toks[j] && /^(n|nr|num)$/.test(bare(toks[j].t))) j++;
      m = toks[j] ? bare(toks[j].t).match(/^(\d{1,3}[a-z]?)$/) : null;
      if (m) {
        table = m[1];
        toks.splice(i, j - i + 1);
        break;
      }
    }
  }

  let day: string | null = null;
  let dayError: "past" | "invalid" | null = null;
  let weekday: number | null = null;
  let time: string | null = null;
  let people: number | null = null;
  let peopleBad = false;
  const words = toks.map((x) => x.t);
  const otherTimeAt = (k: number) => words.some((w, j) => j !== k && looksTime(w));

  // Giorno, ora e persone all'inizio della riga, in qualsiasi ordine.
  let i = 0;
  const okPeople = (n: number) => n >= 1 && n <= 60;
  while (i < toks.length) {
    const t = words[i];
    const b = bare(t);
    if (FILLER.test(b) && i + 1 < toks.length) {
      i++;
      continue;
    }
    if (weekday === null && day === null && !dayError) {
      const w = weekdayWord(t);
      if (w !== null) {
        weekday = w;
        i++;
        continue;
      }
    }
    if (day === null && !dayError) {
      const allowDot = otherTimeAt(i) || time !== null;
      const hit = readDate(words, i, today, allowDot);
      if (hit) {
        if (hit.day === "past" || hit.day === "invalid") dayError = hit.day;
        else day = hit.day;
        i += hit.used;
        continue;
      }
    }
    if (time === null) {
      const tm = /^\d{1,2}$/.test(b) ? null : readTime(t);
      if (tm) {
        time = tm;
        i++;
        continue;
      }
    }
    if (people === null && !peopleBad) {
      const p = readPeopleTok(t);
      if (p !== null) {
        if (okPeople(p)) people = p;
        else peopleBad = true;
        i++;
        continue;
      }
      // «4 persone», «4 p»
      if (/^\d{1,3}$/.test(b) && words[i + 1] && PEOPLE_WORD.test(bare(words[i + 1]))) {
        if (okPeople(+b)) people = +b;
        else peopleBad = true;
        i += 2;
        continue;
      }
    }
    if (/^\d{1,3}$/.test(b)) {
      const n = +b;
      // Un numero da solo: è l'ora se l'ora manca e le persone vengono dopo (o ci sono già).
      const next = words[i + 1];
      const peopleNext = next !== undefined && (/^\d{1,3}$/.test(bare(next)) || readPeopleTok(next) !== null);
      if (time === null && n <= 23 && (people !== null || peopleBad || peopleNext)) {
        time = hhmm(n, 0);
        i++;
        continue;
      }
      if (people === null && !peopleBad) {
        if (okPeople(n)) people = n;
        else peopleBad = true;
        i++;
        continue;
      }
    }
    break;
  }
  let rest = toks.slice(i);
  // Giorno e ora scritti più avanti (con «/» o «:», senza dubbi), persone come «4p» / «x4».
  rest = rest.filter((x) => {
    if (day === null && !dayError && /^\d{1,4}[/-]\d{1,2}([/-]\d{2,4})?[,;]?$/.test(x.t)) {
      const hit = readDate([x.t], 0, today, false);
      if (hit && hit.used === 1) {
        if (hit.day === "past" || hit.day === "invalid") dayError = hit.day;
        else day = hit.day;
        return false;
      }
    }
    if (time === null && /^\d{1,2}:\d{2}(:\d{2})?[,;]?$/.test(x.t)) {
      time = readTime(x.t);
      if (time) return false;
    }
    if (people === null && !peopleBad && /^(x\d|\d+(p|px|pax|pers|persone)\.?$)/i.test(x.t)) {
      const p = readPeopleTok(x.t);
      if (p !== null) {
        if (okPeople(p)) people = p;
        else peopleBad = true;
        return false;
      }
    }
    return true;
  });

  // Telefono, poi nome e nota.
  const phoneRun = findPhone(rest);
  let phone = "";
  let before = rest;
  let after: typeof rest = [];
  if (phoneRun) {
    phone = phoneRun.text;
    before = rest.slice(0, phoneRun.start);
    after = rest.slice(phoneRun.end);
    // «tel.» prima del numero non è parte del nome.
    while (before.length && /^(tel|cell|telefono|cellulare)$/.test(bare(before[before.length - 1].t))) before = before.slice(0, -1);
  }
  const join = (l: typeof rest) => l.map((x) => x.t).join(" ");
  const byField = (l: typeof rest) => {
    const out: string[] = [];
    let f = -1;
    for (const x of l) {
      if (x.f !== f) out.push(x.t);
      else out[out.length - 1] += ` ${x.t}`;
      f = x.f;
    }
    return out;
  };
  let nameWords: typeof rest;
  const noteParts: string[] = [];
  if (!before.length && after.length) {
    // Telefono prima del nome: il nome è quello che viene dopo.
    before = after;
    after = [];
  }
  if (fielded) {
    const fl = byField(before);
    nameWords = before.filter((x) => x.f === before[0]?.f);
    noteParts.push(...fl.slice(1));
  } else {
    nameWords = before;
  }
  // Dentro il nome: una virgola, un trattino, una parentesi o una parola da nota separano la nota.
  // (Con le colonne, il nome è la sua colonna: niente tagli.)
  let cut = -1;
  for (let k = 0; k < nameWords.length && !fielded; k++) {
    const t = nameWords[k].t;
    if (k > 0 && /^[-–—(:"«]/.test(t)) {
      cut = k;
      break;
    }
    if (k > 0 && ((t === t.toLowerCase() && NOTE_START.test(plain(t))) || mentionsAllergy(t))) {
      cut = k;
      break;
    }
    if (/[,:]$/.test(t) && k < nameWords.length - 1) {
      cut = k + 1;
      break;
    }
  }
  if (cut > 0) {
    noteParts.unshift(join(nameWords.slice(cut)));
    nameWords = nameWords.slice(0, cut);
  }
  if (fielded) noteParts.push(...byField(after));
  else if (after.length) noteParts.push(join(after));
  const name = join(nameWords)
    .replace(/[,:;\-–—]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const note = noteParts
    .map((p) =>
      p
        .trim()
        .replace(/^[-–—:,(«"]+\s*/, "")
        .replace(/^(nota|note)\s*[:.-]?\s*/i, "")
        .replace(/[)»"]+$/, "")
        .trim(),
    )
    .filter(Boolean)
    .join(", ");

  const errors: string[] = [];
  if (peopleBad || people === null) errors.push(E_PEOPLE);
  if (name.length < 2) errors.push(E_NAME);
  else if (name.length > 80) errors.push(E_NAME_LONG);
  let phoneIntl = "";
  if (phone) {
    const problem = phoneProblem(phone, "email");
    if (problem) errors.push(problem.replace("il tuo numero", "il numero"));
    else {
      phoneIntl = internationalNumber(phone) ?? "";
      if (!phoneIntl) errors.push("Il numero di telefono non sembra giusto: controllalo.");
    }
  }

  const nothingElse = time === null && people === null && !peopleBad && !rest.length && !table;
  return {
    kind: "booking",
    day,
    time,
    people,
    name,
    phone,
    phoneIntl,
    table,
    note: note.slice(0, 300),
    allergies: mentionsAllergy(note),
    errors,
    warnings: [],
    weekday,
    bareDay: nothingElse && (day !== null || dayError !== null || weekday !== null),
    dayError,
  };
}

// ---------- Tutto il testo

export function parseImport(text: string, now: Date): ImportRow[] {
  const today = businessDay(now);
  const out: ImportRow[] = [];
  let heading: { day: string | null; line: number; weekday: number | null } | null = null;
  const lines = text.slice(0, IMPORT_MAX_CHARS).split(/\r\n|\r|\n/);
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n].trim();
    if (!raw) continue;
    const p = parseLine(raw, today);
    const { weekday, bareDay, dayError, ...rest } = p;
    const row: ImportRow = { ...rest, line: n + 1, text: raw, dayFrom: null, repeatOf: null };
    // Riga con il solo giorno: vale per le righe sotto.
    if (bareDay) {
      row.kind = "day";
      row.errors = [];
      if (dayError === "past") row.errors.push(E_PAST);
      else if (dayError === "invalid" || row.day === null) row.errors.push(E_DAY);
      else if (row.day < today) row.errors.push(E_PAST);
      else if (row.day > addDays(today, 365)) row.errors.push(E_FAR);
      if (row.day && weekday !== null && weekdayOf(row.day) !== weekday) row.warnings.push(weekdayWarning(row.day));
      heading = { day: row.errors.length ? null : row.day, line: row.line, weekday };
      out.push(row);
      continue;
    }
    // Intestazione delle colonne (da Excel): niente giorno, ora, persone né telefono.
    if (!row.day && !dayError && !row.time && row.people === null && !row.phone && /\b(nome|data|giorno|ora|persone|telefono|coperti)\b/i.test(raw)) {
      row.kind = "skip";
      row.errors = [];
      out.push(row);
      continue;
    }
    const dayErrors: string[] = [];
    if (dayError === "past") dayErrors.push(E_PAST);
    else if (dayError === "invalid") dayErrors.push(E_DAY);
    else if (!row.day) {
      if (heading) {
        if (heading.day) {
          row.day = heading.day;
          row.dayFrom = heading.line;
        } else dayErrors.push(E_DAY);
      } else dayErrors.push(E_DAY);
    }
    if (row.day && row.day < today && !dayErrors.length) dayErrors.push(E_PAST);
    if (row.day && row.day > addDays(today, 365)) dayErrors.push(E_FAR);
    if (row.day && weekday !== null && weekdayOf(row.day) !== weekday) row.warnings.push(weekdayWarning(row.day));
    const timeErrors = row.time ? [] : [E_TIME];
    row.errors = [...dayErrors, ...timeErrors, ...row.errors];
    out.push(row);
  }
  markRepeats(out);
  return out;
}

function weekdayWarning(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${W_WEEKDAY}: il ${d}/${m} è ${WEEKDAY_NAMES[weekdayOf(day)]}`;
}

// Righe uguali (stesso giorno, ora, persone, nome e telefono): la seconda si salta. Stesso nome lo
// stesso giorno ma con altro (ora, persone): si segnano tutte e due, con un avviso.
function markRepeats(rows: ImportRow[]) {
  const seen = new Map<string, number>();
  const names = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== "booking" || r.errors.length) continue;
    const sig = importSig(r);
    const first = seen.get(sig);
    if (first !== undefined) {
      r.repeatOf = first;
      continue;
    }
    seen.set(sig, r.line);
    const nk = `${r.day}|${nameKey(r.name)}`;
    const other = names.get(nk);
    if (other !== undefined) r.warnings.push(`Anche alla riga ${other} c'è ${r.name} lo stesso giorno`);
    else names.set(nk, r.line);
  }
}

// Riepilogo per il pulsante e la riga sopra l'anteprima.
export function importCounts(rows: ImportRow[]) {
  const bookings = rows.filter((r) => r.kind === "booking");
  return {
    bookings: bookings.length,
    ok: bookings.filter(importable).length,
    errors: rows.filter((r) => r.errors.length > 0).length,
    repeats: bookings.filter((r) => r.repeatOf !== null).length,
  };
}
