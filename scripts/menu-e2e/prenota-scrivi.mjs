// «Scrivi o detta»: la lettura delle prenotazioni scritte o dettate (funzioni pure, niente browser).
// 1. le frasi «cieche» (fixtures/scrivi-frasi-cieche.json): scritte da chi non ha visto il codice,
//    digitate di fretta e come le scrive la dettatura di iPhone/Android, con la risposta giusta;
// 2. migliaia di combinazioni generate (nome × persone × giorno × ora × telefono × nota × ordine).
// Oggi per tutte: venerdì 13 novembre 2026. Regola: mai indovinare (i campi ambigui restano vuoti).
// Uso: npx tsx scripts/menu-e2e/prenota-scrivi.mjs [--mostra]
import { readFileSync } from "node:fs";
const { parseQuick } = await import("../../src/lib/booking/quick.ts");

const TODAY = "2026-11-13";
// Orari dell'enoteca: lun–mar 17–21:30; mer–sab 10–13 e 16:30–22; dom 16:30–21.
const HOURS = [[["17:00", "21:30"]], [["17:00", "21:30"]], [["10:00", "13:00"], ["16:30", "22:00"]], [["10:00", "13:00"], ["16:30", "22:00"]], [["10:00", "13:00"], ["16:30", "22:00"]], [["10:00", "13:00"], ["16:30", "22:00"]], [["16:30", "21:00"]]];
const wd = (d) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
export const isOpen = (day, time) => HOURS[wd(day)].some(([a, b]) => time >= a && time < b);
const opts = { today: TODAY, isOpen };
const SHOW = process.argv.includes("--mostra");

const FIELDS = ["name", "people", "day", "time", "phone", "table", "menu"];
function compare(text, expect) {
  const got = parseQuick(text, opts);
  const errs = [];
  for (const f of FIELDS) {
    const want = expect[f] ?? null;
    const have = got[f] ?? null;
    if (String(want) !== String(have)) errs.push(`${f}: atteso ${JSON.stringify(want)}, letto ${JSON.stringify(have)}`);
  }
  if ((expect.allergies ?? false) !== got.allergies) errs.push(`allergie: atteso ${expect.allergies ?? false}, letto ${got.allergies}`);
  if (expect.noteIncludes && !(got.note ?? "").toLowerCase().includes(expect.noteIncludes.toLowerCase())) errs.push(`nota: doveva contenere «${expect.noteIncludes}», letto ${JSON.stringify(got.note)}`);
  return { got, errs };
}

// ---------- 1. Frasi cieche
const blind = JSON.parse(readFileSync(new URL("./fixtures/scrivi-frasi-cieche.json", import.meta.url), "utf8"));
let ok1 = 0;
const fails1 = [];
for (const c of blind) {
  const { errs } = compare(c.text, c.expect);
  if (errs.length) fails1.push({ id: c.id, kind: c.kind, text: c.text, errs });
  else ok1++;
}

// ---------- 2. Combinazioni generate
const NAMES = [["Angelo", "Angelo"], ["rossi", "Rossi"], ["Mario Rossi", "Mario Rossi"], ["dei grandi", "Dei Grandi"], ["Giulia Bianchi", "Giulia Bianchi"], ["De Luca", "De Luca"], ["d'angelo", "D'Angelo"], ["Anna Maria Verdi", "Anna Maria Verdi"], ["Smith", "Smith"], ["Lucia", "Lucia"]];
const WORD = { 1: "uno", 2: "due", 3: "tre", 4: "quattro", 5: "cinque", 6: "sei", 7: "sette", 8: "otto", 9: "nove", 10: "dieci", 12: "dodici", 15: "quindici", 20: "venti" };
const PEOPLE = (n) => [`per ${n}`, `${n} persone`, `in ${n}`, `siamo in ${n}`, `tavolo per ${n}`, `x${n}`, `${n} pax`, `per ${WORD[n]}`, `${WORD[n]} persone`, `siamo in ${WORD[n]}`];
const DAYS = [
  ["oggi", "2026-11-13"], ["stasera", "2026-11-13"], ["domani", "2026-11-14"], ["dopodomani", "2026-11-15"], ["sabato", "2026-11-14"], ["sabato 21", "2026-11-21"],
  ["sab 21/11", "2026-11-21"], ["21/11", "2026-11-21"], ["il 21", "2026-11-21"], ["21 novembre", "2026-11-21"], ["domenica", "2026-11-15"], ["venerdì prossimo", "2026-11-20"],
  ["lunedì 16", "2026-11-16"], ["martedì", "2026-11-17"], ["giovedì 26 novembre", "2026-11-26"], ["5/12", "2026-12-05"], ["il 5 dicembre", "2026-12-05"], ["mercoledì 2 dicembre", "2026-12-02"],
];
const TIMES = [
  ["alle 20:30", "20:30"], ["alle 20.30", "20:30"], ["ore 20 e 30", "20:30"], ["alle 8 e mezza", "20:30"], ["alle venti e trenta", "20:30"], ["alle otto e mezza", "20:30"],
  ["alle 21", "21:00"], ["alle nove", "21:00"], ["20:30", "20:30"], ["alle 19", "19:00"], ["alle sette e un quarto", "19:15"], ["alle nove meno un quarto", "20:45"],
  ["verso le 20", "20:00"], ["per le 21", "21:00"], ["alle 19:45", "19:45"],
];
const PHONES = [["", null], ["333 123 4567", "333 123 4567"], ["3331234567", "333 123 4567"], ["+39 347 555 1234", "347 555 1234"], ["tel 340 701 0226", "340 701 0226"]];
const NOTES = [["", null], ["seggiolone", "seggiolone"], [", compleanno", "compleanno"], ["vicino alla finestra", "finestra"]];
const ORDERS = [
  (n, p, d, t, ph, no) => [n, p, d, t, ph, no],
  (n, p, d, t, ph, no) => [d, t, n, p, ph, no],
  (n, p, d, t, ph, no) => [p, d, t, "a nome", n, ph, no],
  (n, p, d, t, ph, no) => [n, d, t, p, no, ph],
  (n, p, d, t, ph, no) => ["prenotazione per", d, t, n, p, ph, no],
];
let seed = 7;
const rnd = (k) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % k;
};
const N_GEN = 6000;
let ok2 = 0;
const fails2 = [];
for (let k = 0; k < N_GEN; k++) {
  const [nt, ne] = NAMES[rnd(NAMES.length)];
  const people = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20][rnd(13)];
  const pList = PEOPLE(people).filter((s) => !s.includes("undefined"));
  let pt = pList[rnd(pList.length)];
  if (people === 1) pt = ["una persona", "per 1", "1 persona"][rnd(3)];
  const [dt, de] = DAYS[rnd(DAYS.length)];
  // giorno a lettere maiuscole a volte (dettatura: prima lettera maiuscola)
  let [tt, te] = TIMES[rnd(TIMES.length)];
  if (dt === "stasera" && tt.includes("e un quarto") === false && rnd(2)) tt = tt.replace(/^alle /, "alle ");
  const [pht, phe] = PHONES[rnd(PHONES.length)];
  const [not, noe] = NOTES[rnd(NOTES.length)];
  const order = ORDERS[rnd(ORDERS.length)];
  let text = order(nt, pt, dt, tt, pht, not).filter(Boolean).join(" ").replace(/\s+,/g, ",");
  if (rnd(3) === 0) text = text.charAt(0).toUpperCase() + text.slice(1);
  const expect = { name: ne, people, day: de, time: te, phone: phe, table: null, menu: null, allergies: false, ...(noe ? { noteIncludes: noe } : {}) };
  const { errs } = compare(text, expect);
  if (errs.length) fails2.push({ text, errs });
  else ok2++;
}

console.log(`Frasi cieche: ${ok1}/${blind.length} giuste`);
console.log(`Combinazioni generate: ${ok2}/${N_GEN} giuste`);
const show = (list, n) => list.slice(0, n).forEach((f) => console.log(`  ${f.id ? `#${f.id} ` : ""}«${f.text}»\n     ${f.errs.join(" · ")}`));
if (fails1.length) {
  console.log(`\nSBAGLIATE (cieche): ${fails1.length}`);
  show(fails1, SHOW ? 1000 : 40);
}
if (fails2.length) {
  console.log(`\nSBAGLIATE (generate): ${fails2.length}`);
  show(fails2, SHOW ? 200 : 25);
}
const all = fails1.length + fails2.length;
console.log(`\n${all === 0 ? "tutto giusto" : `${all} da sistemare`}`);
process.exit(all ? 1 : 0);
