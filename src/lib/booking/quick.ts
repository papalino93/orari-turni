// «Scrivi o detta»: una prenotazione scritta come si parla, o dettata col microfono della tastiera.
// «Angelo per 10 alle 20 e 30», «sabato Rossi 4 persone alle otto e mezza», «domani sera in 6 a nome
// Bianchi 333 1234567». Niente servizi esterni: si legge qui, subito, e i dati non escono dal sito.
//
// Regola d'oro: mai indovinare. Un numero senza un indizio (persone? ora?) resta un dubbio da
// scegliere a mano; il foglio mostra sempre cosa ha capito prima di salvare.
//
// Funzioni pure (nessun browser, nessun database): le prove sono in scripts/menu-e2e/prenota-scrivi.mjs
// (frasi scritte da chi non ha visto questo codice, più migliaia di combinazioni).

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
    // ventuno, ventotto, trentuno (la vocale cade), ventitre / ventitré, venticinque
    const stem = t.slice(0, -1);
    if (!w.startsWith(stem)) continue;
    const restFull = w.startsWith(t) ? w.slice(t.length) : null;
    if (restFull && restFull in UNITS) return n + UNITS[restFull];
    const rest = w.slice(stem.length);
    if (rest === "uno" || rest === "otto") return n + UNITS[rest];
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
  [/^mar(t|tedi)?$/, 1],
  [/^mer(c|coledi)?$/, 2],
  [/^gio(v|vedi)?$/, 3],
  [/^ven(erdi)?$/, 4],
  [/^sab(ato)?$/, 5],
  [/^dom(enica)?$/, 6],
];
const weekdayWord = (w: string): number | null => {
  for (const [re, n] of WEEKDAYS) if (re.test(w.replace(/\.$/, ""))) return n;
  return null;
};
const WEEKDAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

const PEOPLE_AFTER = /^(persone|persona|pers|p|px|pax|coperti|coperto|posti|ospiti|adulti|amici)$/;
const KIDS = /^(bambini|bambino|bimbi|bimbo|bimba|bimbe|ragazzi|ragazzini|figli)$/;
const PM_HINT = /^(sera|stasera|cena|pomeriggio)$/;
const AM_HINT = /^(mattina|stamattina|domattina|pranzo|mattino)$/;
const PHONE_CUE = /^(tel|telefono|cell|cellulare|cel|numero|n°|num)$/;
// Parole di contorno: non sono né nome né nota (saluti, verbi del «segna…», articoli, riempitivi detti a voce).
const FILLER = new Set([
  "prenotazione", "prenotare", "prenota", "prenoto", "prenotiamo", "vorrei", "volevo", "vorremmo", "ciao", "buonasera", "buongiorno", "salve",
  "un", "una", "uno", "il", "lo", "la", "i", "gli", "le", "l'", "di", "del", "della", "a", "al", "alla", "ad", "per", "e", "ed", "con", "col", "da", "in",
  "tavolo", "tavola", "tav", "posto", "nome", "cognome", "sig", "signor", "signore", "signora", "sigra", "sig.ra", "dott", "dottor", "ore", "alle", "all'", "verso", "circa", "h",
  "sera", "cena", "pranzo", "mattina", "pomeriggio", "notte", "numero", "tel", "telefono", "cellulare", "cell", "cel", "siamo", "saremo", "sono", "saranno",
  "ok", "okay", "allora", "poi", "anche", "prossimo", "prossima", "pross", "questo", "questa", "giorno", "verranno", "viene", "vengono", "x", "n", "nr",
  "senti", "segna", "segnami", "segni", "segno", "segnare", "segniamo", "metti", "mettimi", "mettiamo", "mettere", "mi", "ci", "ha", "hanno", "chiamato", "chiamata",
  "chiama", "chiamano", "cliente", "si", "chiede", "chiedono", "eh", "ehm", "uhm", "perfetto", "grazie", "va", "bene", "suo", "sua", "loro", "ecco", "dunque",
  "quindi", "aspetta", "richiamo", "richiama", "dopo", "non", "lasciato", "no", "favore", "piacere", "sempre", "solito", "tipo", "ma", "o", "che", "lui", "lei",
  "c'e", "c'", "dice", "dicono", "vuole", "vogliono", "venire", "agenda", "famiglia", "fam", "scusa", "telefono", "ospite", "clienti",
]);
// Parole con cui comincia una nota (come nel librone).
const NOTE_START =
  /^(seggiolon[ei]|compleanno|anniversario|passeggino|cane|cani|bimb[oaie]|bambin[oaie]|festa|dehors|fuori|finestra|torta|vegan[oaie]?|vegetarian[oaie]|sedia|sedie|carrozzina|aperitivo|degustazione|caparra|acconto|nota|note|esterno|interno|divanetto|ritardo|forse|celiac[oaie]|allergic[oaie]|allergia|allergie|intolleran\w*|senza|vicino|merenda|laurea|battesimo|cresima|comunione|addio|cena|pranzo)$/;
// Cognomi con la particella: «Lo Russo», «Di Stefano», «De Luca», «La Rosa», «Al Masri», «Dal Monte».
const PARTICLE = /^(lo|la|li|le|di|de|del|della|dei|degli|dal|dalla|da|al|el|van|von|mc|o')$/;
// «Alessandro e la moglie»: due persone.
const COMPANION = /^(moglie|marito|compagna|compagno|fidanzata|fidanzato|ragazza|ragazzo|amica|amico|mamma|papa|madre|padre|sorella|fratello)$/;

const isInt = (w: string) => /^\d{1,2}$/.test(w);
const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const capitalized = (raw: string) => /^\p{Lu}/u.test(raw);

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
// «il 21»: il prossimo 21 da oggi in avanti (questo mese o i prossimi: «il 31» di novembre → 31 dicembre).
function nextDayOfMonth(n: number, today: string): string | null {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let k = 0; k < 4; k++) {
    const key = dateKey(y, m, n);
    if (key && key >= today) return key;
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return null;
}
function nextWeekday(wd: number, today: string, next: boolean): string {
  let d = today;
  for (let k = 0; k < 14; k++, d = addDays(d, 1)) if (weekdayOf(d) === wd && (!next || d !== today)) return d;
  return d;
}

// ---------- Lettura (con le correzioni dette a voce: «domani no anzi domenica», «alle 8 anzi alle 9»)

const CORRECTION = /\s+(?:no[, ]+)?(?:anzi(?:[, ]+no)?|cioè|cioe|o meglio|no[, ]+scusa|scusa)\s+/i;

export function parseQuick(text: string, opts: QuickOptions): QuickResult {
  const clean = text
    .replace(/\s+/g, " ")
    .trim()
    // «all'una», «all una e mezza», «verso l'una»: l'una è le 13 (o, con «di notte», l'1)
    .replace(/\b(all|verso l|per l)['’ ]\s*una\b/gi, (_m, w: string) => (w.toLowerCase() === "all" ? "alle 1" : `${w.slice(0, -2)} le 1`))
    // «sab 21 anzi 28»: la correzione è il giorno del mese
    .replace(/(\b(?:lun|mar|mer|gio|ven|sab|dom)[a-zìé]*\.?\s+)\d{1,2}\s+(?:no[, ]+)?(?:anzi|no[, ]+scusa|scusa)\s+(\d{1,2})\b/i, "$1$2");
  const m = clean.match(CORRECTION);
  if (m && m.index !== undefined && m.index > 0) {
    // Vale l'ultima: la parte dopo la correzione sostituisce i campi che ripete.
    const before = parseOne(clean.slice(0, m.index), opts);
    const after = parseOne(clean.slice(m.index + m[0].length), opts);
    const merged: QuickResult = { ...before };
    for (const k of ["people", "day", "time", "phone", "table", "menu"] as const) if (after[k] !== null) (merged as Record<string, unknown>)[k] = after[k];
    merged.name = before.name ?? after.name;
    merged.note = [before.note, after.note].filter(Boolean).join(", ") || null;
    merged.allergies = before.allergies || after.allergies;
    // un dubbio della prima parte risolto dalla seconda non si mostra
    merged.doubts = [...before.doubts.filter((d) => !(after.people !== null && /persone/.test(d)) && !(after.time !== null && /l'ora/.test(d))), ...after.doubts];
    return merged;
  }
  return parseOne(clean.replace(/^(?:cioè|cioe|anzi)\s+/i, ""), opts);
}

function parseOne(text: string, opts: QuickOptions): QuickResult {
  const out: QuickResult = { name: null, people: null, day: null, time: null, phone: null, table: null, menu: null, note: null, allergies: false, doubts: [] };
  // «menù da venticinque euro» → «menù da 25 euro», poi il menù si toglie dalla riga (il prezzo non è ora né persone)
  const numbered = text.replace(/(\p{L}+)(\s*(?:euro|€))/giu, (all, w: string, rest: string) => {
    const n = wordNumber(fold(w));
    return n !== null ? `${n}${rest}` : all;
  });
  const { rest, menu } = takeMenu(numbered);
  out.menu = menu;

  // Le virgole separano i pezzi (nome, nota…) ma non dentro «20,30»; «+» si stacca («+ 1 bambino»).
  const spaced = rest
    .replace(/,(?!\d)/g, " , ")
    .replace(/[;!?]/g, " , ")
    .replace(/(^|\s)\+(?=\s)/g, " più ");
  const toks: Tok[] = [];
  const push = (raw: string, w: string, comma = false) => toks.push({ raw, w, used: false, comma, day: false });
  const words = spaced.split(/\s+/).filter(Boolean);
  for (let k = 0; k < words.length; k++) {
    const raw = words[k];
    if (raw === "," || /^[-–—/+|•·]+$/.test(raw)) {
      // virgole e trattini da soli («barbieri - 3 - domani») separano i pezzi
      if (toks.length) toks[toks.length - 1].comma = true;
      continue;
    }
    // «2+2 bimbi»
    const plus = raw.match(/^(\d{1,2})\+(\d{1,2})$/);
    if (plus) {
      push(plus[1], plus[1]);
      push("più", "più");
      push(plus[2], plus[2]);
      continue;
    }
    const endsPiece = /[,.]$/.test(raw) && !/^\d+[.,]$/.test(raw) && !/^(sig|dott|sig\.ra|ing|avv|n|nr|tel|cell|tav)\.$/i.test(raw) && raw.length > 1;
    const bare = raw.replace(/[,.:]+$/, "");
    let w = fold(bare).replace(/°$/, "");
    // Dettatura: «virgola» e «punto» a volte arrivano come parole.
    if ((w === "virgola" || w === "punto") && toks.length) {
      toks[toks.length - 1].comma = true;
      continue;
    }
    // Telefono con separatori: «333-1234567», «333.987.6543», «055/7221234»
    if (/^\+?[\d][\d./-]{5,}\d$/.test(w) && w.replace(/\D/g, "").length >= 7 && !/^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/.test(w)) w = w.replace(/[./-]/g, "");
    // Numeri in parole → cifre. Non «un/una/uno» (di solito è un articolo) e non un nome con la maiuscola
    // detto per primo («Otto per otto alle otto»).
    const n = wordNumber(w);
    const nameFirst = k === 0 && capitalized(raw) && fold(words[k + 1] ?? "") === "per";
    if (n !== null && w !== "uno" && !nameFirst) w = String(n);
    if (w === "primo" && (monthOf(fold(words[k + 1] ?? "").replace(/[.,]$/, "")) || fold(words[k - 1] ?? "") === "il")) w = "1";
    push(bare, w, endsPiece);
  }
  // Numero dettato cifra per cifra: «tre tre tre uno due…» → «uno» in mezzo alle cifre è 1.
  toks.forEach((t, i) => {
    if ((t.w === "uno" || t.w === "un") && (/^\d$/.test(toks[i - 1]?.w ?? "") || /^\d$/.test(toks[i + 1]?.w ?? "")) && (/^\d$/.test(toks[i - 1]?.w ?? "") || /^\d$/.test(toks[i + 2]?.w ?? ""))) t.w = "1";
  });
  const T = toks;
  const at = (i: number) => (i >= 0 && i < T.length && !T[i].used ? T[i].w : "");
  const take = (...idx: number[]) => idx.forEach((i) => (T[i].used = true));
  const takeDay = (...idx: number[]) =>
    idx.forEach((i) => {
      T[i].used = true;
      T[i].day = true;
    });
  let timeSeen = false; // un'ora scritta, anche sbagliata («alle 20:75»): il numero rimasto sono le persone

  // ---------- Telefono: la prima sequenza di cifre (anche a gruppi, anche dettate una per una)
  for (let i = 0; i < T.length && !out.phone; i++) {
    if (T[i].used || !/^(\+?\d+)$/.test(T[i].w)) continue;
    // «4 333 1234567»: un numero piccolo davanti al telefono sono le persone
    if (/^[1-9]\d?$/.test(T[i].w) && !PHONE_CUE.test(at(i - 1)) && /^\d{3,}$/.test(at(i + 1))) continue;
    let digits = "";
    const idx: number[] = [];
    for (let j = i; j < T.length && !T[j].used && /^\+?\d+$/.test(T[j].w); j++) {
      digits += T[j].w;
      idx.push(j);
      const national = digits.replace(/^(\+39|0039)/, "");
      const nextDigits = j + 1 < T.length && /^\d+$/.test(T[j + 1].w);
      const mobile = /^3\d{9}$/.test(national);
      const fixed = /^0\d{5,10}$/.test(national) && national.length >= 9 && (!nextDigits || national.length >= 11);
      if (mobile || (fixed && !nextDigits) || (fixed && national.length >= 10)) {
        out.phone = mobile ? `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}` : national;
        take(...idx);
        if (PHONE_CUE.test(at(i - 1))) take(i - 1);
        break;
      }
      if (/^\+(?!39)\d{8,15}$/.test(digits) && !nextDigits) {
        out.phone = digits;
        take(...idx);
        break;
      }
      if (digits.replace(/\D/g, "").length > 13) break;
    }
  }
  // Cifre dopo «cell»/«tel» che non fanno un numero intero: un numero incompleto, non ore o persone.
  for (let i = 0; i < T.length; i++) {
    if (T[i].used || !PHONE_CUE.test(T[i].w)) continue;
    let j = i + 1;
    if (/^(e|è)$/.test(at(j))) j++;
    const idx: number[] = [];
    while (j < T.length && !T[j].used && /^\+?\d{2,}$/.test(T[j].w)) idx.push(j++);
    if (idx.length && idx.map((x) => T[x].w).join("").length >= 5) {
      take(i, ...idx);
      out.doubts.push(`Il numero di telefono sembra incompleto: «${idx.map((x) => T[x].raw).join(" ")}».`);
    }
  }

  // ---------- Giorno
  let weekday: number | null = null;
  let dayFromWeekdayNumber = false;
  const pmHint = T.some((t) => PM_HINT.test(t.w));
  const amHint = T.some((t) => AM_HINT.test(t.w));
  const nightHint = T.some((t, i) => t.w === "notte" && (T[i - 1]?.w === "di" || T[i - 1]?.w === "della"));
  // «Domenica per due sabato alle 20»: un giorno della settimana detto per primo, con la maiuscola,
  // seguito da «per», quando c'è un altro giorno nella frase, è un nome.
  const dayWords = T.filter((t) => weekdayWord(t.w) !== null || /^(oggi|stasera|domani|dopodomani)$/.test(t.w)).length;
  const nameLikeDay = (i: number) =>
    (i === 0 && capitalized(T[i].raw) && T[i + 1]?.w === "per" && dayWords > 1) ||
    /^(signor|signora|sig|sigra|sig\.ra)$/.test(T[i - 1]?.w ?? "") ||
    (capitalized(T[i].raw) && i + 1 < T.length && capitalized(T[i + 1].raw) && /^\p{Lu}\p{Ll}/u.test(T[i + 1].raw) && weekdayWord(T[i + 1].w) === null && !FILLER.has(T[i + 1].w) && dayWords > 1);
  const dotted = /^(\d{1,2})\.(\d{1,2})$/;
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
    let m = w.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
    // «21.11» è una data solo dopo il giorno della settimana che combacia, o dopo «il»; altrimenti è l'ora
    if (!m && dotted.test(w) && i > 0 && (T[i - 1].day || T[i - 1].w === "il")) {
      const dm = w.match(dotted)!;
      const cand = +dm[2] <= 12 ? nextDate(+dm[2], +dm[1], opts.today) : null;
      if (cand && (weekday === null ? T[i - 1].w === "il" : weekdayOf(cand) === weekday)) m = dm;
    }
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
      const d = y ? dateKey(y, +m[2], +m[1]) : nextDate(+m[2], +m[1], opts.today);
      if (d) {
        out.day = d;
        takeDay(i);
        if (at(i - 1) === "il") takeDay(i - 1);
      } else {
        take(i);
        out.doubts.push(`La data «${T[i].raw}» non esiste: scegli tu il giorno.`);
      }
      continue;
    }
    const wd = weekdayWord(w);
    if (wd !== null && weekday === null && !nameLikeDay(i)) {
      weekday = wd;
      takeDay(i);
      const nb = at(i + 1);
      // «sab 21/11», «sab 21.11»: la data la legge il giro dopo
      if (/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(nb)) continue;
      if (dotted.test(nb)) {
        const dm = nb.match(dotted)!;
        const cand = +dm[2] <= 12 ? nextDate(+dm[2], +dm[1], opts.today) : null;
        if (cand && weekdayOf(cand) === wd) continue;
      }
      // «sabato 21», «sabato 21 novembre», «sabato prossimo» / «ven pross»
      const nm = monthOf(at(i + 2));
      if (isInt(nb) && +nb >= 1 && +nb <= 31 && at(i + 2) !== "e" && at(i + 2) !== "meno" && !PEOPLE_AFTER.test(at(i + 2))) {
        out.day = nm ? nextDate(nm, +nb, opts.today) : nextDayOfMonth(+nb, opts.today);
        takeDay(i + 1);
        if (nm) takeDay(i + 2);
        else dayFromWeekdayNumber = true;
      } else {
        const next = /^(prossim[oa]|pross)$/.test(nb);
        if (next) takeDay(i + 1);
        out.day = nextWeekday(wd, opts.today, next);
        // Detto il giorno di oggi («sabato» di sabato): si mette oggi, ma lo si fa notare, perché
        // spesso si intende quello della settimana dopo (per oggi di solito si dice «stasera»).
        if (!next && out.day === opts.today) {
          const later = addDays(opts.today, 7);
          out.doubts.push(`«${WEEKDAY_NAMES[wd]}» è oggi: se intendi ${WEEKDAY_NAMES[wd]} ${Number(later.slice(8))}, cambia il giorno.`);
        }
      }
      continue;
    }
    // «21 novembre», «il 21», «il 1° dicembre», «il 21 novembre»
    if (/^\d{1,2}$/.test(w)) {
      const mo = monthOf(at(i + 1));
      if (mo && +w >= 1 && +w <= 31) {
        const d = nextDate(mo, +w, opts.today);
        if (d) {
          out.day = d;
          takeDay(i, i + 1);
          if (at(i - 1) === "il") takeDay(i - 1);
        }
        continue;
      }
      if (at(i - 1) === "il" || at(i - 1) === "giorno") {
        if (+w >= 1 && +w <= 31) {
          out.day = nextDayOfMonth(+w, opts.today);
          takeDay(i - 1, i);
        } else {
          take(i - 1, i);
          out.doubts.push(`Il giorno «${w}» non esiste: scegli tu il giorno.`);
        }
        continue;
      }
    }
  }
  // Parole di giorno rimaste («21/11 sabato»): non sono il nome.
  for (let i = 0; i < T.length; i++) {
    if (T[i].used || nameLikeDay(i)) continue;
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
  // 1–9 senza altro: la sera (un'enoteca la mattina presto è chiusa); 10 e 11 senza «mattina»/«pranzo»: un dubbio
  // (le 10 sono l'apertura del mattino, le 22 la chiusura); «di notte» resta com'è.
  const fixHour = (h: number, m: number): string | null | "ambiguous" => {
    if (h > 24 || m > 59) return null;
    if (h === 24) h = 0;
    if (h >= 1 && h <= 11 && !nightHint) {
      if (pmHint && !amHint) h += 12;
      else if (!amHint) {
        const day = out.day ?? opts.today;
        const pm = opts.isOpen ? opts.isOpen(day, hhmm(h + 12, m)) : false;
        const am = opts.isOpen ? opts.isOpen(day, hhmm(h, m)) : false;
        if (h >= 10 && !pm) return "ambiguous";
        if (pm || h <= 9) h += 12;
        else if (!am) return "ambiguous";
      }
    }
    return hhmm(h, m);
  };
  const setTime = (h: number, m: number, idx: number[]): boolean => {
    timeSeen = true;
    const t = fixHour(h, m);
    take(...idx);
    if (t === "ambiguous") {
      out.doubts.push(`«Alle ${h}${m ? `:${String(m).padStart(2, "0")}` : ""}»: di mattina o di sera? Scegli tu l'ora.`);
      return true;
    }
    if (t === null) {
      out.doubts.push("L'ora scritta non esiste: scegli tu l'ora.");
      return true;
    }
    out.time = t;
    return true;
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
      if (/^\d{1,2}$/.test(b) && +b <= 59 && !PEOPLE_AFTER.test(c) && !KIDS.test(c)) return { m: +b, used: [i, i + 1] };
    }
    if (a === "meno" && (b === "un" || b === "1") && c === "quarto") return { m: -15, used: [i, i + 1, i + 2] };
    if (a === "meno" && /^\d{1,2}$/.test(b) && +b <= 30) return { m: -+b, used: [i, i + 1] };
    if (/^\d{2}$/.test(a) && +a <= 59 && +a % 5 === 0 && !PEOPLE_AFTER.test(b) && !KIDS.test(b)) return { m: +a, used: [i] };
    return null;
  };
  const withMinutes = (h: number, i: number, idx: number[]) => {
    const mm = minutesAfter(i);
    let minutes = mm?.m ?? 0;
    let hour = h;
    if (minutes < 0) {
      hour = h - 1;
      minutes = 60 + minutes;
    }
    return setTime(hour, minutes, [...idx, ...(mm?.used ?? [])]);
  };
  for (let i = 0; i < T.length && !timeSeen; i++) {
    const w = at(i);
    if (!w) continue;
    let m = w.match(/^(\d{1,2})[:.,h](\d{2})$/);
    if (m) {
      setTime(+m[1], +m[2], [i]);
      if (/^(alle|ore|verso|le|h)$/.test(at(i - 1))) take(i - 1);
      continue;
    }
    m = w.match(/^h(\d{1,2})[:.](\d{2})$/);
    if (m) {
      setTime(+m[1], +m[2], [i]);
      continue;
    }
    m = w.match(/^h(\d{1,2})$/) ?? w.match(/^(\d{1,2})h$/);
    if (m) {
      withMinutes(+m[1], i + 1, [i]);
      continue;
    }
    if (w === "mezzogiorno") {
      withMinutes(12, i + 1, [i]);
      continue;
    }
    // «alle 20», «ore 20 e 30», «h 20», «per le 8 e mezza», «verso le 21», «alle 2030»
    const cue = /^(alle|ore|verso|h)$/.test(w) || (w === "le" && /^(per|verso|dalle)$/.test(at(i - 1)));
    if (cue && /^\d{3,4}$/.test(at(i + 1)) && +at(i + 1).slice(-2) <= 59) {
      const v = at(i + 1);
      setTime(+v.slice(0, -2), +v.slice(-2), [i, i + 1]);
      continue;
    }
    if (cue && /^\d{1,2}$/.test(at(i + 1))) {
      withMinutes(+at(i + 1), i + 2, [i, i + 1]);
      if (at(i - 1) === "per" || at(i - 1) === "verso") take(i - 1);
      continue;
    }
    if (cue && /^\d+$/.test(at(i + 1))) {
      // «ore 99»: un'ora che non esiste
      setTime(99, 0, [i, i + 1]);
      continue;
    }
    // «20 e 30», «8 e mezza», «9 meno un quarto» anche senza «alle»
    if (isInt(w) && +w <= 23 && (at(i + 1) === "e" || at(i + 1) === "meno")) {
      const mm = minutesAfter(i + 1);
      if (mm && Math.abs(mm.m) % 5 === 0 && (mm.m !== 0 || at(i + 1) === "e")) withMinutes(+w, i + 1, [i]);
    }
  }

  // ---------- Persone
  const okPeople = (n: number) => n >= 1 && n <= 60;
  const kidsAfter = (i: number): { n: number; used: number[] } | null => {
    // «+ 1 bambino», «e 2 bambini», «più due bimbi»
    if (/^(e|piu|più)$/.test(at(i)) && /^(\d{1,2}|un|una|uno)$/.test(at(i + 1)) && KIDS.test(at(i + 2))) return { n: /^\d/.test(at(i + 1)) ? +at(i + 1) : 1, used: [i, i + 1, i + 2] };
    return null;
  };
  const setPeople = (n: number, idx: number[], after: number) => {
    const kids = kidsAfter(after);
    out.people = n + (kids?.n ?? 0);
    take(...idx, ...(kids?.used ?? []));
  };
  for (let i = 0; i < T.length && out.people === null; i++) {
    const w = at(i);
    if (!w) continue;
    // «10 persone», «4 pax», «2 adulti (e 2 bambini)», «4 bambini»
    if (/^\d{1,2}$/.test(w) && (PEOPLE_AFTER.test(at(i + 1)) || KIDS.test(at(i + 1))) && okPeople(+w)) {
      setPeople(+w, [i, i + 1], i + 2);
      break;
    }
    // «2 più 2 bimbi»
    if (/^\d{1,2}$/.test(w) && okPeople(+w) && kidsAfter(i + 1)) {
      setPeople(+w, [i], i + 1);
      break;
    }
    // «persone quattro» (detto al contrario)
    if (PEOPLE_AFTER.test(w) && /^\d{1,2}$/.test(at(i + 1)) && okPeople(+at(i + 1)) && !/^(alle|ore)$/.test(at(i - 1))) {
      setPeople(+at(i + 1), [i, i + 1], i + 2);
      break;
    }
    // «4p», «x4», «4px», «x 4»
    let m = w.match(/^(?:x(\d{1,2})|(\d{1,2})(?:p|px|pax|pers)\.?)$/);
    if (m && okPeople(+(m[1] ?? m[2]))) {
      setPeople(+(m[1] ?? m[2]), [i], i + 1);
      break;
    }
    if (w === "x" && /^\d{1,2}$/.test(at(i + 1)) && okPeople(+at(i + 1))) {
      setPeople(+at(i + 1), [i, i + 1], i + 2);
      break;
    }
    // «per 10», «in 4», «siamo 6», «tavolo per 2», «tavolo da 8»
    if (/^(per|in|siamo|saremo|da)$/.test(w) && /^\d{1,2}$/.test(at(i + 1)) && okPeople(+at(i + 1))) {
      const nxt = at(i + 2);
      const isTime = (nxt === "e" || nxt === "meno") && /^(\d{1,2}|mezza|mezzo|un|1|3)$/.test(at(i + 3)) && !PEOPLE_AFTER.test(at(i + 3)) && !KIDS.test(at(i + 4));
      const isDate = !!monthOf(nxt);
      if (!isTime && !isDate && !(w === "da" && !/^(tavolo|tav)$/.test(T[i - 1]?.w ?? ""))) {
        setPeople(+at(i + 1), [i, i + 1, ...(PEOPLE_AFTER.test(nxt) ? [i + 2] : [])], PEOPLE_AFTER.test(nxt) ? i + 3 : i + 2);
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
      break;
    }
    m = null;
  }
  // «Alessandro e la moglie»: due persone (il nome resta Alessandro)
  if (out.people === null) {
    for (let i = 0; i + 2 < T.length; i++) {
      if (at(i) === "e" && /^(la|il|sua|suo)$/.test(at(i + 1)) && COMPANION.test(at(i + 2))) {
        out.people = 2;
        take(i, i + 1, i + 2);
        break;
      }
    }
  }

  // ---------- Tavolo: «tavolo 5», «tav 5», «t5», «tavolo n. 8», «tavolo numero 12»
  for (let i = 0; i < T.length && !out.table; i++) {
    const w = at(i);
    const m = w.match(/^(?:t|tav)\.?(\d{1,3})$/);
    if (m) {
      out.table = m[1];
      take(i);
      break;
    }
    if (/^(tavolo|tav)$/.test(w)) {
      let j = i + 1;
      if (/^(n|nr|numero|num|n°)$/.test(at(j))) j++;
      if (/^\d{1,3}$/.test(at(j)) && !PEOPLE_AFTER.test(at(j + 1)) && !KIDS.test(at(j + 1))) {
        out.table = at(j);
        take(i, ...Array.from({ length: j - i }, (_, k) => i + 1 + k));
        break;
      }
    }
  }

  // ---------- Numeri rimasti
  // «domani 21», «sab 21/11 20»: un'ora piena (12–23) subito dopo il giorno, se l'ora non c'è ancora
  if (!timeSeen) {
    for (let i = 1; i < T.length; i++) {
      if (!T[i].used && T[i - 1].day && /^\d{1,2}$/.test(T[i].w) && +T[i].w >= 12 && +T[i].w <= 23 && !PEOPLE_AFTER.test(at(i + 1)) && !KIDS.test(at(i + 1))) {
        setTime(+T[i].w, 0, [i]);
        break;
      }
    }
  }
  // «1 celiaco», «uno allergico»: un numero davanti a una nota fa parte della nota
  const leftover = T.map((t, i) => ({ t, i })).filter(({ t, i }) => !t.used && /^\d{1,3}$/.test(t.w) && !(i + 1 < T.length && !T[i + 1].used && (NOTE_START.test(T[i + 1].w) || mentionsAllergy(T[i + 1].w))));
  if (out.people === null && leftover.length === 1 && okPeople(+leftover[0].t.w)) {
    const n = +leftover[0].t.w;
    // Con l'ora già scritta, un numero solo sono le persone. Senza l'ora: le persone solo se come ora
    // non può essere (a quell'ora il locale è chiuso), altrimenti è un dubbio («Rossi 20», «sabato 5»).
    const asHour = n <= 24 ? fixHour(n, 0) : null;
    const day = out.day ?? opts.today;
    const couldBeHour = asHour !== null && (asHour === "ambiguous" || !opts.isOpen || opts.isOpen(day, asHour));
    if (timeSeen || !couldBeHour) {
      out.people = n;
      take(leftover[0].i);
    }
  }
  const still = leftover.filter(({ i }) => !T[i].used);
  if (still.length) {
    out.doubts.push(`Non so a cosa si riferisce «${still.map(({ t }) => t.raw).join(" ")}»: ${out.people === null && !out.time ? "scegli tu persone e ora" : out.people === null ? "scegli tu le persone" : !out.time ? "scegli tu l'ora" : "controlla"}.`);
    still.forEach(({ i }) => take(i));
  }
  // «sabato 5» senza persone: il 5 può essere il giorno o le persone → giorno e persone da scegliere
  if (dayFromWeekdayNumber && out.people === null && !timeSeen) {
    out.day = null;
    out.doubts.push("Non so se il numero dopo il giorno è la data o le persone: scegli tu giorno e persone.");
  }

  // ---------- Nome e nota: le parole rimaste, a pezzi (un pezzo finisce dove c'è una parola già letta o una virgola)
  // Il primo pezzo che non comincia come una nota è il nome; il resto è la nota.
  const segments: number[][] = [];
  let cur: number[] = [];
  T.forEach((t, i) => {
    if (t.used) {
      if (cur.length) segments.push(cur);
      cur = [];
      return;
    }
    cur.push(i);
    if (t.comma) {
      segments.push(cur);
      cur = [];
    }
  });
  if (cur.length) segments.push(cur);
  // Una particella con la maiuscola davanti a un nome con la maiuscola fa parte del cognome («Lo Russo»).
  const keepParticle = (i: number) => PARTICLE.test(T[i].w) && capitalized(T[i].raw) && i + 1 < T.length && capitalized(T[i + 1].raw) && !FILLER.has(T[i + 1].w);
  // Dopo una particella («del bene», «la porta») una parola di contorno può essere un cognome.
  const GRAMMAR = /^(il|lo|la|i|gli|le|l'|un|una|uno|di|del|della|a|al|alla|per|e|ed|con|da|in|che|signor|signora|sig)$/;
  // (solo per le poche parole di contorno che sono anche cognomi: «del bene», «la porta», «del posto»)
  const afterParticle = (i: number) =>
    i > 0 && !T[i - 1].used && /^(del|della|dei|degli|dal|dalla|lo|la|di|de)$/.test(T[i - 1].w) && /^(bene|porta|posto|sala|sempre)$/.test(T[i].w) && !GRAMMAR.test(T[i].w) && !(T[i - 1].w === "di" && /^(nome|conto|parte)$/.test(T[i - 2]?.w ?? ""));
  const isFill = (i: number) => FILLER.has(T[i].w) && !keepParticle(i) && !afterParticle(i);
  const trim = (seg: number[]) => {
    let a = 0;
    let b = seg.length;
    while (a < b && isFill(seg[a])) a++;
    while (b > a && isFill(seg[b - 1])) b--;
    return seg.slice(a, b);
  };
  const capWord = (raw: string) => {
    const base = raw.length > 2 && raw === raw.toUpperCase() && /\p{L}{3}/u.test(raw) ? raw.toLowerCase() : raw; // «MARIANI» → «Mariani»
    return base.replace(/(^|['’-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  };
  const noteWord = (i: number) => NOTE_START.test(T[i].w) || mentionsAllergy(T[i].w);
  const notes: string[] = [];
  for (const seg of segments) {
    let core = trim(seg);
    if (!core.length) continue;
    if (!out.name && !noteWord(core[0])) {
      const first = core[0];
      const prev = first - 1;
      if (prev >= 0 && !T[prev].used && seg.includes(prev) && PARTICLE.test(T[prev].w) && !(T[prev].w === "di" && /^(nome|conto|parte)$/.test(T[prev - 1]?.w ?? "")) && !/^(signor|signora|sig)$/.test(T[first].w)) {
        core = [prev, ...core];
      }
      // il nome finisce dove comincia una nota, o una parola di contorno dopo il nome («Lombardi chiede…»)
      let k = 0;
      while (k < core.length && !noteWord(core[k]) && !(k > 0 && isFill(core[k]) && !(T[core[k]].w === "e" && k + 1 < core.length && !isFill(core[k + 1]) && !noteWord(core[k + 1]) && capitalized(T[core[k + 1]].raw)))) k++;
      const nameIdx = core.slice(0, k);
      // fuori i numeri rimasti dentro il nome
      const nameWords = nameIdx.filter((i) => !/^\d+$/.test(T[i].w));
      if (nameWords.length) {
        out.name = nameWords.map((i) => capWord(T[i].raw)).join(" ").slice(0, 80);
        const restIdx = trim(core.slice(k));
        if (restIdx.length) notes.push(restIdx.map((i) => T[i].raw).join(" "));
        continue;
      }
    }
    notes.push(core.map((i) => T[i].raw).join(" "));
  }
  const noteText = notes
    .map((n) => n.trim().replace(/^(nota|note)\s*[:.-]?\s*/i, ""))
    .filter(Boolean)
    .join(", ");
  out.note = noteText ? noteText.slice(0, 300) : null;
  // «nessuna allergia», «no allergie», «senza allergie»: non è un'allergia
  const denied = text.replace(/\b(?:nessuna|niente|no|senza|non\s+(?:ha|hanno)(?:\s+nessuna)?)\s+allergi[ae]\b/gi, "");
  out.allergies = mentionsAllergy(denied);
  return out;
}
