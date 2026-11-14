// «Scrivi o detta»: una prenotazione scritta come si parla, o dettata col microfono della tastiera.
// «Angelo per 10 alle 20 e 30», «sabato Rossi 4 persone alle otto e mezza», «domani sera in 6 a nome
// Bianchi 333 1234567». Niente servizi esterni: si legge qui, subito, e i dati non escono dal sito.
//
// Regola d'oro: mai indovinare. Un numero senza un indizio (persone? ora?) resta un dubbio da
// scegliere a mano; il foglio mostra sempre cosa ha capito prima di salvare.
//
// Funzioni pure (nessun browser, nessun database): le prove sono in scripts/menu-e2e/prenota-scrivi.mjs.

import { addDays, mentionsAllergy, weekdayOf } from "@/lib/booking/rules";
import { takeMenu } from "@/lib/booking/import";

export type QuickResult = {
  name: string | null;
  people: number | null;
  day: string | null;
  time: string | null;
  phone: string | null;
  table: string | null;
  menu: string | null;
  note: string | null;
  allergies: boolean;
  // Cose da far controllare: numeri senza indizio, giorno della settimana che non torna…
  doubts: string[];
};

export type QuickOptions = {
  // Oggi secondo il calendario (dopo mezzanotte è già il giorno nuovo).
  today: string;
  // Il locale è aperto quel giorno a quell'ora? Serve per «alle 8» → 20:00 o 08:00.
  isOpen?: (day: string, time: string) => boolean;
};

type Tok = { raw: string; w: string; used: boolean; comma: boolean; day: boolean };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");

// ---------- Numeri scritti in parole (la dettatura a volte li lascia così)

const UNITS: Record<string, number> = { uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9 };
const SPECIAL: Record<string, number> = {
  zero: 0, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16,
  diciassette: 17, diciotto: 18, diciannove: 19,
};
const TENS: [string, number][] = [["venti", 20], ["trenta", 30], ["quaranta", 40], ["cinquanta", 50], ["sessanta", 60]];

export function wordNumber(w: string): number | null {
  if (w in UNITS) return UNITS[w];
  if (w in SPECIAL) return SPECIAL[w];
  for (const [t, n] of TENS) {
    if (w === t) return n;
    // ventuno, ventotto, trentuno (la vocale cade), ventitre / ventitré
    const stem = t.slice(0, -1);
    if (w.startsWith(stem)) {
      const rest = w.slice(stem.length);
      const restFull = w.startsWith(t) ? w.slice(t.length) : null;
      for (const r of [restFull, rest]) {
        if (r && r in UNITS) return n + UNITS[r];
        if (r && `${r}` === "tre") return n + 3;
      }
      if (rest === "uno" || rest === "un") return n + 1;
      if (rest === "otto") return n + 8;
    }
  }
  return null;
}

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const monthOf = (w: string): number | null => {
  const b = w.replace(/\.$/, "");
  const i = MONTHS.indexOf(b);
  if (i >= 0) return i + 1;
  const j = MONTHS_SHORT.indexOf(b);
  return j >= 0 && b !== "mar" ? j + 1 : null; // «mar» è anche martedì
};
const WEEKDAYS: [RegExp, number][] = [
  [/^lun(edi)?$/, 0],
  [/^mar(tedi)?$/, 1],
  [/^mer(coledi)?$/, 2],
  [/^gio(vedi)?$/, 3],
  [/^ven(erdi)?$/, 4],
  [/^sab(ato)?$/, 5],
  [/^dom(enica)?$/, 6],
];
const weekdayWord = (w: string): number | null => {
  for (const [re, n] of WEEKDAYS) if (re.test(w.replace(/\.$/, ""))) return n;
  return null;
};
const WEEKDAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

const PEOPLE_AFTER = /^(persone|persona|pers|p|px|pax|coperti|coperto|posti|ospiti|adulti|bambini|amici)$/;
const PM_HINT = /^(sera|stasera|cena|pomeriggio|notte|stanotte)$/;
const AM_HINT = /^(mattina|stamattina|domattina|pranzo|mattino)$/;
// Parole di contorno: non sono né nome né nota.
const FILLER = new Set([
  "prenotazione", "prenotare", "prenota", "prenoto", "prenotiamo", "vorrei", "volevo", "vorremmo", "ciao", "buonasera", "buongiorno", "salve",
  "un", "una", "uno", "il", "lo", "la", "i", "gli", "le", "l'", "di", "del", "della", "a", "al", "alla", "ad", "per", "e", "ed", "con", "da",
  "tavolo", "tavola", "posto", "nome", "cognome", "sig", "sig.", "signor", "signore", "signora", "sig.ra", "dott", "dott.", "ore", "alle", "all'", "verso", "circa",
  "sera", "cena", "pranzo", "mattina", "pomeriggio", "notte", "numero", "tel", "tel.", "telefono", "cellulare", "cell", "cell.", "siamo", "saremo", "sono",
  "ok", "allora", "poi", "anche", "prossimo", "prossima", "questo", "questa", "giorno", "il", "verranno", "viene", "vengono",
]);
// Parole con cui comincia una nota (come nel librone).
const NOTE_START =
  /^(seggiolon[ei]|compleanno|anniversario|passeggino|cane|cani|bimb[oaie]|bambin[oaie]|festa|dehors|fuori|finestra|torta|vegan[oaie]?|vegetarian[oaie]|sedia|sedie|carrozzina|aperitivo|degustazione|caparra|acconto|nota|note|esterno|interno|divanetto|ritardo|forse|celiac[oaie]|allergic[oaie]|allergia|allergie|intolleran\w*|senza|vicino)$/;

const isInt = (w: string) => /^\d{1,2}$/.test(w);
const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

function dateKey(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return addDays(key, 0) === key ? key : null;
}
// Giorno e mese senza anno: il prossimo (oggi compreso).
function nextDate(m: number, d: number, today: string): string | null {
  const y = Number(today.slice(0, 4));
  const k = dateKey(y, m, d);
  if (k && k >= today) return k;
  return dateKey(y + 1, m, d);
}
// «il 21»: il prossimo 21 (questo mese o il prossimo); con il giorno della settimana, quello che combacia.
function nextDayOfMonth(n: number, today: string, weekday: number | null): string | null {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  let first: string | null = null;
  for (let k = 0; k < 4; k++) {
    const key = dateKey(y, m, n);
    if (key && key >= today) {
      if (weekday === null || weekdayOf(key) === weekday) return key;
      first ??= key;
    }
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return first;
}
function nextWeekday(wd: number, today: string, next: boolean): string {
  let d = today;
  for (let k = 0; k < 7; k++, d = addDays(d, 1)) if (weekdayOf(d) === wd && (!next || d !== today)) return d;
  return d;
}

// ---------- Lettura

export function parseQuick(text: string, opts: QuickOptions): QuickResult {
  const out: QuickResult = { name: null, people: null, day: null, time: null, phone: null, table: null, menu: null, note: null, allergies: false, doubts: [] };
  const { rest, menu } = takeMenu(text.replace(/\s+/g, " ").trim());
  out.menu = menu;

  // Le virgole separano i pezzi (nome, nota…) ma non dentro «20,30»; i punti finali si tolgono.
  const spaced = rest.replace(/,(?!\d)/g, " , ").replace(/[;!?]/g, " , ");
  const toks: Tok[] = [];
  for (const raw of spaced.split(/\s+/).filter(Boolean)) {
    if (raw === ",") {
      if (toks.length) toks[toks.length - 1].comma = true;
      continue;
    }
    let w = fold(raw).replace(/[.:]+$/, "");
    // Dettatura: «virgola» e «punto» a volte arrivano come parole.
    if ((w === "virgola" || w === "punto") && toks.length) {
      toks[toks.length - 1].comma = true;
      continue;
    }
    if (/[.,]$/.test(raw) && !/\d[.,]$/.test(raw) && raw.length > 1) {
      // «Rossi.» a fine pezzo: separa come una virgola (ma non «sig.»)
      if (raw.endsWith(",") || !/^(sig|dott|sig\.ra|ing|avv)\.$/i.test(raw)) {
        toks.push({ raw: raw.replace(/[.,]+$/, ""), w, used: false, comma: true, day: false });
        const nn = wordNumber(w);
        if (nn !== null) toks[toks.length - 1].w = String(nn);
        continue;
      }
    }
    if (/^l'|^all'|^dell'|^un'/.test(w) && w.length > 4) {
      // «all'una», «l'Angolo»: l'articolo resta attaccato, lo si stacca
      const [art, word] = [w.slice(0, w.indexOf("'") + 1), w.slice(w.indexOf("'") + 1)];
      toks.push({ raw: raw.slice(0, art.length), w: art, used: false, comma: false, day: false });
      toks.push({ raw: raw.slice(art.length), w: word, used: false, comma: false, day: false });
      continue;
    }
    // numeri in parole → cifre (ma non «un/una»: di solito è un articolo)
    const n = wordNumber(w);
    if (n !== null) w = String(n);
    toks.push({ raw, w, used: false, comma: false, day: false });
  }
  const T = toks;
  const at = (i: number) => (i >= 0 && i < T.length && !T[i].used ? T[i].w : "");
  const take = (...idx: number[]) => idx.forEach((i) => (T[i].used = true));
  const takeDay = (...idx: number[]) => idx.forEach((i) => {
    T[i].used = true;
    T[i].day = true;
  });

  // ---------- Telefono: la prima sequenza di cifre (anche a gruppi, anche dettate una per una)
  for (let i = 0; i < T.length && !out.phone; i++) {
    if (T[i].used || !/^(\+?\d+|00\d+)$/.test(T[i].w)) continue;
    let digits = "";
    let j = i;
    const idx: number[] = [];
    while (j < T.length && !T[j].used && /^\+?\d+$/.test(T[j].w)) {
      digits += T[j].w;
      idx.push(j);
      const national = digits.replace(/^(\+39|0039)/, "");
      if (/^[03]\d{8,10}$/.test(national) && (j + 1 >= T.length || !/^\d+$/.test(T[j + 1].w) || national.length >= 10)) {
        // un numero italiano completo (fisso o cellulare)
        if (national.length >= 9 && (national.startsWith("3") ? national.length === 10 : true)) {
          out.phone = national.startsWith("3") ? `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}` : national;
          take(...idx);
          break;
        }
      }
      if (/^\+(?!39)\d{8,15}$/.test(digits)) {
        out.phone = digits;
        take(...idx);
        break;
      }
      if (digits.replace(/\D/g, "").length > 13) break;
      j++;
    }
    // «4 333 1234567»: se partendo da qui non torna, si riprova dal gruppo dopo (il 4 sono le persone)
  }

  // ---------- Giorno
  let weekday: number | null = null;
  const pmHint = T.some((t) => PM_HINT.test(t.w));
  const amHint = T.some((t) => AM_HINT.test(t.w));
  for (let i = 0; i < T.length && !out.day; i++) {
    const w = at(i);
    if (!w) continue;
    if (w === "oggi" || w === "stasera" || w === "stanotte" || w === "stamattina") {
      out.day = opts.today;
      takeDay(i);
      continue;
    }
    if (w === "domani" || w === "domattina") {
      out.day = addDays(opts.today, 1);
      takeDay(i);
      continue;
    }
    if (w === "dopodomani") {
      out.day = addDays(opts.today, 2);
      takeDay(i);
      continue;
    }
    // «21/11», «21-11», e «21.11» solo dopo il giorno della settimana o «il» (altrimenti «20.30» è l'ora)
    const dotOk = i > 0 && (T[i - 1].day || T[i - 1].w === "il");
    const m = w.match(dotOk ? /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/ : /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
      out.day = y ? dateKey(y, +m[2], +m[1]) : nextDate(+m[2], +m[1], opts.today);
      if (out.day) takeDay(i);
      continue;
    }
    const wd = weekdayWord(w);
    if (wd !== null && weekday === null) {
      weekday = wd;
      takeDay(i);
      // «sabato 21», «sabato 21 novembre», «sabato prossimo»; «sab 21/11»: la data la legge il giro dopo
      const nb = at(i + 1);
      if (/^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(nb)) continue;
      const nm = monthOf(at(i + 2));
      if (isInt(nb) && +nb >= 1 && +nb <= 31 && !(at(i + 2) === "e" || /^[:.]/.test(at(i + 2)))) {
        out.day = nm ? nextDate(nm, +nb, opts.today) : nextDayOfMonth(+nb, opts.today, wd);
        takeDay(i + 1);
        if (nm) takeDay(i + 2);
      } else {
        const next = /^prossim[oa]$/.test(nb);
        if (next) takeDay(i + 1);
        out.day = nextWeekday(wd, opts.today, next);
      }
      continue;
    }
    // «21 novembre», «il 21», «il 21 novembre»
    if (isInt(w) && +w >= 1 && +w <= 31) {
      const mo = monthOf(at(i + 1));
      if (mo) {
        out.day = nextDate(mo, +w, opts.today);
        takeDay(i, i + 1);
        continue;
      }
      if (at(i - 1) === "il" || at(i - 1) === "giorno") {
        out.day = nextDayOfMonth(+w, opts.today, weekday);
        takeDay(i - 1, i);
        continue;
      }
    }
  }
  // Parole di giorno rimaste («21/11 sabato», «domani sera … domani»): non sono il nome.
  for (let i = 0; i < T.length; i++) {
    if (T[i].used) continue;
    const wd = weekdayWord(T[i].w);
    if (wd !== null || /^(oggi|stasera|stanotte|stamattina|domani|domattina|dopodomani)$/.test(T[i].w)) {
      if (wd !== null) weekday ??= wd;
      takeDay(i);
    }
  }
  if (out.day && weekday !== null && weekdayOf(out.day) !== weekday) {
    out.doubts.push(`Il giorno della settimana non torna: il ${Number(out.day.slice(8))}/${Number(out.day.slice(5, 7))} è ${WEEKDAY_NAMES[weekdayOf(out.day)]}.`);
  }

  // ---------- Ora
  const fixHour = (h: number, m: number, explicitPm: boolean): string | null => {
    if (h > 24 || m > 59) return null;
    if (h === 24) h = 0;
    if (h >= 1 && h <= 11) {
      if (explicitPm || (pmHint && !amHint)) h += 12;
      else if (!amHint) {
        const day = out.day ?? opts.today;
        const pm = opts.isOpen ? opts.isOpen(day, hhmm(h + 12, m)) : false;
        const am = opts.isOpen ? opts.isOpen(day, hhmm(h, m)) : false;
        if (pm && !am) h += 12;
        else if (!pm && !am && h <= 9) h += 12; // un'enoteca la sera: «alle 8» sono le 20
        else if (pm && am && h <= 9) h += 12;
      }
    }
    return hhmm(h, m);
  };
  const minutesAfter = (i: number): { m: number; used: number[] } | null => {
    // «e 30», «e mezza», «e un quarto», «e tre quarti», «meno un quarto», «30» (dettato senza «e»)
    const a = at(i);
    const b = at(i + 1);
    const c = at(i + 2);
    if (a === "e") {
      if (b === "mezza" || b === "mezzo") return { m: 30, used: [i, i + 1] };
      if ((b === "un" || b === "1") && c === "quarto") return { m: 15, used: [i, i + 1, i + 2] };
      if (b === "3" && c === "quarti") return { m: 45, used: [i, i + 1, i + 2] };
      if (/^\d{1,2}$/.test(b) && +b <= 59) return { m: +b, used: [i, i + 1] };
    }
    if (a === "meno" && (b === "un" || b === "1") && c === "quarto") return { m: -15, used: [i, i + 1, i + 2] };
    if (/^\d{2}$/.test(a) && +a <= 59 && +a % 5 === 0 && !PEOPLE_AFTER.test(b)) return { m: +a, used: [i] };
    return null;
  };
  for (let i = 0; i < T.length && !out.time; i++) {
    const w = at(i);
    if (!w) continue;
    let m = w.match(/^(\d{1,2})[:.,h](\d{2})$/);
    if (m && !(w.includes(".") && +m[2] > 59)) {
      const t = fixHour(+m[1], +m[2], false);
      if (t) {
        out.time = t;
        take(i);
        if (/^(alle|ore|verso|le)$/.test(at(i - 1))) take(i - 1);
      }
      continue;
    }
    m = w.match(/^(\d{1,2})h$/);
    if (m) {
      out.time = fixHour(+m[1], 0, false);
      take(i);
      continue;
    }
    if (w === "mezzogiorno") {
      out.time = "12:00";
      take(i);
      continue;
    }
    // «alle 20», «ore 20 e 30», «per le 8 e mezza», «verso le 21»
    const cue = /^(alle|ore|verso)$/.test(w) || (w === "le" && /^(per|verso|dalle)$/.test(at(i - 1)));
    if (cue && isInt(at(i + 1)) && +at(i + 1) <= 24) {
      const h = +at(i + 1);
      const mm = minutesAfter(i + 2);
      let minutes = mm?.m ?? 0;
      let hour = h;
      if (minutes < 0) {
        hour = h - 1;
        minutes = 45;
      }
      const t = fixHour(hour, minutes, false);
      if (t) {
        out.time = t;
        take(i, i + 1, ...(mm?.used ?? []));
        if (at(i - 1) === "per" || at(i - 1) === "verso") take(i - 1);
      }
      continue;
    }
    // «20 e 30», «8 e mezza» anche senza «alle»
    if (isInt(w) && +w <= 23 && (at(i + 1) === "e" || at(i + 1) === "meno")) {
      const mm = minutesAfter(i + 1);
      if (mm && mm.m % 5 === 0 && !PEOPLE_AFTER.test(at(mm.used[mm.used.length - 1] + 1))) {
        const t = mm.m < 0 ? fixHour(+w - 1, 45, false) : fixHour(+w, mm.m, false);
        if (t) {
          out.time = t;
          take(i, ...mm.used);
        }
      }
    }
  }

  // ---------- Persone
  const okPeople = (n: number) => n >= 1 && n <= 60;
  for (let i = 0; i < T.length && out.people === null; i++) {
    const w = at(i);
    if (!w) continue;
    // «10 persone», «4 pax», «6 coperti»
    if (/^\d{1,2}$/.test(w) && PEOPLE_AFTER.test(at(i + 1)) && okPeople(+w)) {
      out.people = +w;
      take(i, i + 1);
      break;
    }
    // «4p», «x4», «4px»
    let m = w.match(/^(?:x(\d{1,2})|(\d{1,2})(?:p|px|pax|pers)\.?)$/);
    if (m && okPeople(+(m[1] ?? m[2]))) {
      out.people = +(m[1] ?? m[2]);
      take(i);
      break;
    }
    // «per 10», «in 4», «siamo 6», «tavolo per 2», «tavolo da 8»
    if (/^(per|in|siamo|saremo|da)$/.test(w) && /^\d{1,2}$/.test(at(i + 1)) && okPeople(+at(i + 1))) {
      const nxt = at(i + 2);
      const isTime = nxt === "e" && /^(\d{1,2}|mezza|mezzo|un|1|3)$/.test(at(i + 3)) && !PEOPLE_AFTER.test(at(i + 3));
      const isDate = !!monthOf(nxt) || /^[/-]/.test(nxt);
      if (!isTime && !isDate && !(w === "da" && at(i - 1) !== "tavolo")) {
        out.people = +at(i + 1);
        take(i, i + 1);
        if (PEOPLE_AFTER.test(nxt)) take(i + 2);
        break;
      }
    }
    if ((w === "un" || w === "una" || w === "1") && (at(i + 1) === "persona" || (at(i + 1) === "sola" && at(i + 2) === "persona"))) {
      out.people = 1;
      take(i, i + 1);
      if (at(i + 2) === "persona") take(i + 2);
      break;
    }
    if (w === "coppia") {
      out.people = 2;
      take(i);
      if (at(i - 1) === "una" || at(i - 1) === "un") take(i - 1);
      break;
    }
    m = null;
  }

  // ---------- Tavolo: «tavolo 5», «tav 5», «t5»
  for (let i = 0; i < T.length && !out.table; i++) {
    const w = at(i);
    const m = w.match(/^(?:t|tav)\.?(\d{1,3})$/);
    if (m) {
      out.table = m[1];
      take(i);
      break;
    }
    if (/^(tavolo|tav)$/.test(w) && /^\d{1,3}$/.test(at(i + 1)) && !PEOPLE_AFTER.test(at(i + 2))) {
      out.table = at(i + 1);
      take(i, i + 1);
      break;
    }
  }

  // ---------- Numeri rimasti: con l'ora già scritta, uno solo sono le persone; altrimenti è un dubbio
  // «domani 21», «sab 21/11 20»: un'ora piena (12–23) subito dopo il giorno, se l'ora non c'è ancora
  if (!out.time) {
    for (let i = 1; i < T.length; i++) {
      if (!T[i].used && T[i - 1].day && /^\d{1,2}$/.test(T[i].w) && +T[i].w >= 12 && +T[i].w <= 23 && !PEOPLE_AFTER.test(at(i + 1))) {
        out.time = hhmm(+T[i].w, 0);
        take(i);
        break;
      }
    }
  }
  const leftover = T.map((t, i) => ({ t, i })).filter(({ t }) => !t.used && /^\d{1,3}$/.test(t.w));
  if (out.people === null && leftover.length === 1 && out.time && okPeople(+leftover[0].t.w)) {
    out.people = +leftover[0].t.w;
    take(leftover[0].i);
  } else if (leftover.length) {
    const nums = leftover.map(({ t }) => t.raw).join(" ");
    out.doubts.push(`Non so a cosa si riferisce «${nums}»: ${out.people === null && !out.time ? "scegli tu persone e ora" : out.people === null ? "scegli tu le persone" : !out.time ? "scegli tu l'ora" : "controlla"}.`);
    leftover.forEach(({ i }) => take(i));
  }

  // ---------- Nome e nota: le parole rimaste, a pezzi (un pezzo finisce dove c'è una parola già letta o una virgola)
  // Il primo pezzo che non comincia come una nota è il nome; il resto è la nota.
  const segments: Tok[][] = [];
  let cur: Tok[] = [];
  for (const t of T) {
    if (t.used) {
      if (cur.length) segments.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
    if (t.comma) {
      segments.push(cur);
      cur = [];
    }
  }
  if (cur.length) segments.push(cur);
  const isFill = (t: Tok) => FILLER.has(t.w);
  const trim = (seg: Tok[]) => {
    let a = 0;
    let b = seg.length;
    while (a < b && isFill(seg[a])) a++;
    while (b > a && isFill(seg[b - 1])) b--;
    return seg.slice(a, b);
  };
  const capWord = (raw: string) => {
    const clean = raw.replace(/[.,:;]+$/, "");
    if (clean !== clean.toLowerCase()) return clean;
    return clean.replace(/(^|['’-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  };
  const noteWord = (t: Tok) => NOTE_START.test(t.w) || mentionsAllergy(t.w);
  const notes: string[] = [];
  for (const seg of segments) {
    const core = trim(seg);
    if (!core.length) continue;
    if (!out.name && !noteWord(core[0])) {
      // il nome finisce dove comincia una nota («Rossi tavolo fuori», «Lucia, seggiolone»)
      let k = core.findIndex(noteWord);
      if (k < 0) k = core.length;
      const nameToks = trim(core.slice(0, k));
      if (nameToks.length) {
        out.name = nameToks.map((t) => capWord(t.raw)).join(" ").slice(0, 80);
        const after = seg.slice(seg.indexOf(nameToks[nameToks.length - 1]) + 1);
        const rest = trim(after).length ? after : [];
        if (rest.length) notes.push(rest.map((t) => t.raw.replace(/[,;]+$/, "")).join(" ").replace(/^(e|ed|con|poi|anche)\s+/i, ""));
        continue;
      }
    }
    notes.push(core.map((t) => t.raw.replace(/[,;]+$/, "")).join(" "));
  }
  const noteText = notes
    .map((n) => n.trim().replace(/^(nota|note)\s*[:.-]?\s*/i, ""))
    .filter(Boolean)
    .join(", ");
  out.note = noteText ? noteText.slice(0, 300) : null;
  out.allergies = mentionsAllergy(out.note) || mentionsAllergy(text);
  return out;
}
