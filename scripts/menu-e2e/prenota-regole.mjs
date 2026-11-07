// Prenotazioni online: regole pure (orari prenotabili, ora di Roma, stati, impostazioni) e
// regole del servizio sul database di prova (richieste, limiti, risposte del locale, cliente,
// concorrenza). Niente browser.
// Uso: npx tsx scripts/menu-e2e/prenota-regole.mjs   (tsx serve per gli import «@/…» in TypeScript)
import { loadEnvLocal, onInterrupt, check, finish, DB, q, snapshotBookingSetting, restoreBookingSetting, setBookingSetting, cleanBookings, randomIp, randomPhone } from "./prenota-lib.mjs";

loadEnvLocal();
process.env.MAIL_PROVIDER = "log";
process.env.PUSH_PROVIDER = "log";
delete process.env.VERCEL_ENV;
if (!/\/orari_test(\?|$)/.test(process.env.DATABASE_URL || "")) {
  console.error("DATABASE_URL non è il database di prova orari_test: mi fermo.");
  process.exit(2);
}
const R = await import("@/lib/booking/rules");
const S = await import("@/lib/booking/service");
const { whatsappPending } = await import("@/lib/booking/whatsapp-queue");
const { prisma } = await import("@/lib/prisma");
const { availability, romeInstant, romeParts, businessDay, viewStatus, parseBookingSettings, DEFAULT_BOOKING_SETTINGS, timeToDayMinutes, dayShort, dayLong, dayRelative, peopleText, addDays, weekdayOf } = R;

const iso = (d) => d.toISOString().slice(0, 16) + "Z";
const times = (a) => a.slots.map((s) => s.time).join(",");
const set = (over = {}) => ({ ...DEFAULT_BOOKING_SETTINGS, enabled: true, firstTime: "12:00", lastBeforeClose: 60, step: 30, leadMinutes: 60, daysAhead: 30, maxPeople: 10, ...over });
const range = (o, c) => ({ open: o, close: c });
// Orari di prova (lunedì = 0): lun chiuso, mar 17–21:30, mer/gio mattina e sera, ven/sab 18–01, dom 16:30–21.
const HOURS = {
  showStatus: true,
  weekly: [
    [],
    [range("17:00", "21:30")],
    [range("10:00", "13:00"), range("16:30", "22:00")],
    [range("10:00", "13:00"), range("16:30", "22:30")],
    [range("18:00", "01:00")],
    [range("18:00", "01:00")],
    [range("16:30", "21:00")],
  ],
  exceptions: [],
};
const NOW = romeInstant("2026-11-09", 8 * 60); // lunedì 9 novembre 2026, 08:00 a Roma
const seq = (from, to, step = 30) => {
  const out = [];
  for (let m = from; m <= to; m += step) out.push(R.fmtMin(m));
  return out.join(",");
};

// ================= Regole pure =================
check("calendario di prova: 9/11/2026 è lunedì, 14/11 sabato", weekdayOf("2026-11-09") === 0 && weekdayOf("2026-11-14") === 5);

// Orari dentro l'apertura
{
  const wed = availability("2026-11-11", HOURS, set(), null, NOW);
  check("mercoledì: 12:00 (mattina dopo firstTime) e 16:30…21:00 (fino a 1 h prima della chiusura)", wed.state === "open" && times(wed) === "12:00," + seq(990, 1260), times(wed));
  const thu = availability("2026-11-12", HOURS, set(), null, NOW);
  check("giovedì chiude 22:30: ultimo orario 21:30", thu.state === "open" && thu.slots.at(-1).time === "21:30", times(thu));
  const tue = availability("2026-11-10", HOURS, set(), null, NOW);
  check("martedì 17:00–21:30: da 17:00 a 20:30", times(tue) === seq(1020, 1230), times(tue));
  const mon = availability("2026-11-09", HOURS, set(), null, NOW);
  check("lunedì senza fasce: chiuso", mon.state === "closed" && mon.slots.length === 0 && mon.reason === null);
  const stamps = wed.slots.map((s) => s.startsAt.getTime());
  check("orari in ordine e senza doppioni", stamps.every((t, i) => i === 0 || t > stamps[i - 1]));
  check("ogni orario porta l'istante giusto (16:30 di novembre = 15:30Z)", iso(wed.slots[1].startsAt) === "2026-11-11T15:30Z", iso(wed.slots[1].startsAt));
}

// Chiusura dopo mezzanotte (18:00–01:00)
{
  const fri = availability("2026-11-13", HOURS, set(), null, NOW);
  const last = fri.slots.at(-1);
  check("venerdì 18:00–01:00: da 18:00 a 00:00", times(fri) === seq(1080, 1440), times(fri));
  check("00:00 è dopo la mezzanotte del venerdì (minuti 1440, sabato 14 alle 00:00)", last.minutes === 1440 && iso(last.startsAt) === "2026-11-13T23:00Z" && romeParts(last.startsAt).dateKey === "2026-11-14", iso(last.startsAt));
  const fri0 = availability("2026-11-13", HOURS, set({ lastBeforeClose: 0 }), null, NOW);
  check("lastBeforeClose 0: anche 00:30 e 01:00", fri0.slots.slice(-2).map((s) => s.time).join(",") === "00:30,01:00" && fri0.slots.at(-1).minutes === 1500);
  check("timeToDayMinutes: 00:30 → 1470 (dopo mezzanotte), 04:59 → 1739, 05:00 → 300", timeToDayMinutes("00:30") === 1470 && timeToDayMinutes("04:59") === 1739 && timeToDayMinutes("05:00") === 300);
  // Alle 00:10 di sabato il giorno commerciale è ancora venerdì: gli orari dopo mezzanotte valgono.
  const late = romeInstant("2026-11-13", 1450);
  check("businessDay alle 00:10 di sabato = venerdì", businessDay(late) === "2026-11-13");
  check("businessDay alle 04:59 = giorno prima, alle 05:00 = giorno stesso", businessDay(romeInstant("2026-11-14", 299)) === "2026-11-13" && businessDay(romeInstant("2026-11-14", 300)) === "2026-11-14");
  const friLate = availability("2026-11-13", HOURS, set({ leadMinutes: 0, lastBeforeClose: 0 }), null, late);
  check("venerdì alle 00:10, anticipo 0: restano 00:30 e 01:00", friLate.state === "open" && times(friLate) === "00:30,01:00", times(friLate));
  const sat = availability("2026-11-14", HOURS, set(), null, late);
  check("…e sabato non è «passato»", sat.state === "open");
}

// firstTime e passo
{
  check("firstTime 17:00: niente mattina", availability("2026-11-11", HOURS, set({ firstTime: "17:00" }), null, NOW).slots[0].time === "17:00");
  check("firstTime 18:15 con passo 30: si parte dalle 18:30", availability("2026-11-11", HOURS, set({ firstTime: "18:15" }), null, NOW).slots[0].time === "18:30");
  const s60 = availability("2026-11-15", HOURS, set({ step: 60 }), null, NOW);
  check("passo 60 (domenica 16:30–21:00): 17:00, 18:00, 19:00, 20:00", times(s60) === "17:00,18:00,19:00,20:00", times(s60));
  const s15 = availability("2026-11-11", HOURS, set({ step: 15 }), null, NOW);
  check("passo 15 (mercoledì): 12:00 + 16:30…21:00 ogni 15 min", times(s15) === "12:00," + seq(990, 1260, 15), String(s15.slots.length));
  check("lastBeforeClose 0: si arriva all'ora di chiusura", availability("2026-11-10", HOURS, set({ lastBeforeClose: 0 }), null, NOW).slots.at(-1).time === "21:30");
  check("lastBeforeClose 120: martedì fino alle 19:30", availability("2026-11-10", HOURS, set({ lastBeforeClose: 120 }), null, NOW).slots.at(-1).time === "19:30");
}

// Anticipo minimo
{
  const at1710 = romeInstant("2026-11-11", 17 * 60 + 10);
  const a = availability("2026-11-11", HOURS, set({ leadMinutes: 60 }), null, at1710);
  check("oggi alle 17:10, anticipo 60: il primo orario è 18:30", a.slots[0].time === "18:30", times(a));
  const b = availability("2026-11-11", HOURS, set({ leadMinutes: 0 }), null, romeInstant("2026-11-11", 17 * 60));
  check("oggi alle 17:00, anticipo 0: 17:00 c'è ancora, 16:30 no", b.slots[0].time === "17:00", times(b));
  const c = availability("2026-11-11", HOURS, set({ leadMinutes: 60 }), null, romeInstant("2026-11-11", 21 * 60 + 30));
  check("oggi alle 21:30: nessun orario (noSlots)", c.state === "noSlots" && c.slots.length === 0);
  const d = availability("2026-11-12", HOURS, set({ leadMinutes: 24 * 60 }), null, at1710);
  check("anticipo 24 h: domani solo dalle 17:30", d.slots[0].time === "17:30", times(d));
}

// Giorno passato e oltre daysAhead
{
  check("giorno passato: «past»", availability("2026-11-08", HOURS, set(), null, NOW).state === "past");
  check("oggi + 30 giorni: ancora prenotabile", availability(addDays("2026-11-09", 30), HOURS, set(), null, NOW).state === "open");
  check("oggi + 31 giorni: «tooFar»", availability(addDays("2026-11-09", 31), HOURS, set(), null, NOW).state === "tooFar");
  check("daysAhead 1: dopodomani «tooFar»", availability("2026-11-11", HOURS, set({ daysAhead: 1 }), null, NOW).state === "tooFar");
}

// Chiusure «closed» e «full»
{
  const c = availability("2026-11-11", HOURS, set(), { kind: "closed", reason: "Ferie" }, NOW);
  check("giornata chiusa: «closed» con il motivo", c.state === "closed" && c.reason === "Ferie" && c.slots.length === 0);
  const f = availability("2026-11-11", HOURS, set(), { kind: "full", reason: "Pieno" }, NOW);
  check("serata al completo: «full» con il motivo", f.state === "full" && f.reason === "Pieno" && f.slots.length === 0);
  check("al completo in un giorno di chiusura: resta «closed»", availability("2026-11-09", HOURS, set(), { kind: "full", reason: null }, NOW).state === "closed");
  check("giorno passato e chiuso: «past» prima di tutto", availability("2026-11-08", HOURS, set(), { kind: "closed", reason: "x" }, NOW).state === "past");
}

// Eccezioni degli orari del menù
{
  const H = {
    ...HOURS,
    exceptions: [
      { id: "e1", startDate: "2026-11-20", endDate: "2026-11-22", closed: true, ranges: [], note: "Ferie" },
      { id: "e2", startDate: "2026-11-16", endDate: "2026-11-16", closed: false, ranges: [range("19:00", "23:00")], note: "Aperti di lunedì" },
      { id: "e3", startDate: "2026-11-18", endDate: "2026-11-18", closed: false, ranges: [range("10:00", "13:00")], note: "Solo mattina" },
    ],
  };
  check("eccezione chiusa (ferie 20–22): chiuso tutti e tre i giorni", ["2026-11-20", "2026-11-21", "2026-11-22"].every((d) => availability(d, H, set(), null, NOW).state === "closed"));
  check("…il giorno dopo le ferie si riapre", availability("2026-11-23", H, set(), null, NOW).state === "closed" /* lunedì */ && availability("2026-11-24", H, set(), null, NOW).state === "open");
  const mon = availability("2026-11-16", H, set(), null, NOW);
  check("eccezione aperta di lunedì 19:00–23:00: 19:00…22:00", times(mon) === seq(1140, 1320), times(mon));
  const morning = availability("2026-11-18", H, set(), null, NOW);
  check("eccezione solo mattina 10–13 con firstTime 12:00: solo 12:00", times(morning) === "12:00", times(morning));
  check("…con firstTime 12:30: nessun orario (noSlots)", availability("2026-11-18", H, set({ firstTime: "12:30" }), null, NOW).state === "noSlots");
}

// Ora legale (29 marzo 2026) e ora solare (25 ottobre 2026)
{
  const NOWM = romeInstant("2026-03-20", 600);
  const sat = availability("2026-03-28", HOURS, set(), null, NOWM);
  check("28 marzo (sabato, ora solare): 18:00 = 17:00Z", iso(sat.slots[0].startsAt) === "2026-03-28T17:00Z", iso(sat.slots[0].startsAt));
  check("28 marzo: 00:00 (dopo mezzanotte, prima del cambio) = 23:00Z", iso(sat.slots.at(-1).startsAt) === "2026-03-28T23:00Z", iso(sat.slots.at(-1).startsAt));
  const sun = availability("2026-03-29", HOURS, set(), null, NOWM);
  check("29 marzo (domenica, ora legale): 17:00 = 15:00Z", iso(sun.slots.find((s) => s.time === "17:00").startsAt) === "2026-03-29T15:00Z");
  check("29 marzo: orari a passo di 30 minuti esatti", sun.slots.every((s, i) => i === 0 || s.startsAt - sun.slots[i - 1].startsAt === 30 * 60000));
  check("romeInstant 29/3 alle 02:30 (ora che non esiste): spostata avanti alle 03:30 (01:30Z)", iso(romeInstant("2026-03-28", 1440 + 150)) === "2026-03-29T01:30Z", iso(romeInstant("2026-03-28", 1440 + 150)));
  const NOWO = romeInstant("2026-10-20", 600);
  const sat2 = availability("2026-10-24", HOURS, set({ lastBeforeClose: 0 }), null, NOWO);
  check("24 ottobre (sabato, ora legale): 18:00 = 16:00Z, 01:00 = 23:00Z", iso(sat2.slots[0].startsAt) === "2026-10-24T16:00Z" && iso(sat2.slots.at(-1).startsAt) === "2026-10-24T23:00Z", `${iso(sat2.slots[0].startsAt)} ${iso(sat2.slots.at(-1).startsAt)}`);
  const sun2 = availability("2026-10-25", HOURS, set(), null, NOWO);
  check("25 ottobre (domenica, ora solare): 17:00 = 16:00Z", iso(sun2.slots.find((s) => s.time === "17:00").startsAt) === "2026-10-25T16:00Z");
  check("25 ottobre: orari a passo di 30 minuti esatti", sun2.slots.every((s, i) => i === 0 || s.startsAt - sun2.slots[i - 1].startsAt === 30 * 60000));
  check("ogni orario di sabato 24/10 torna alla stessa ora di Roma", sat2.slots.every((s) => R.fmtMin(romeParts(s.startsAt).minutes) === s.time));
  check("businessDay: domenica 29/3 alle 03:30 (ora legale) è ancora sabato", businessDay(new Date("2026-03-29T01:30:00Z")) === "2026-03-28");
  check("businessDay: domenica 25/10 alle 02:30 (seconda volta) è ancora sabato", businessDay(new Date("2026-10-25T01:30:00Z")) === "2026-10-24");
  check("romeInstant d'estate (1/7 alle 20:00) = 18:00Z, d'inverno (15/1) = 19:00Z", iso(romeInstant("2026-07-01", 1200)) === "2026-07-01T18:00Z" && iso(romeInstant("2026-01-15", 1200)) === "2026-01-15T19:00Z");
  // Caso limite: un locale aperto fino alle 04:00 nella notte del cambio d'ora.
  const H4 = { ...HOURS, weekly: HOURS.weekly.map((w, i) => (i === 5 ? [range("22:00", "04:00")] : w)) };
  const n = availability("2026-03-28", H4, set({ lastBeforeClose: 0 }), null, NOWM);
  const st = n.slots.map((s) => s.startsAt.getTime());
  check("(caso limite) notte del 29/3 aperti fino alle 04: nessun istante doppio tra gli orari", new Set(st).size === st.length, n.slots.map((s) => `${s.time}=${iso(s.startsAt).slice(11)}`).join(" "));
}

// viewStatus
{
  const past = new Date(NOW.getTime() - 60000);
  const fut = new Date(NOW.getTime() + 3600000);
  check("viewStatus: in attesa con orario passato → «EXPIRED»", viewStatus({ status: "PENDING", startsAt: past }, NOW) === "EXPIRED");
  check("viewStatus: in attesa con orario futuro → «PENDING»", viewStatus({ status: "PENDING", startsAt: fut }, NOW) === "PENDING");
  check("viewStatus: proposta con orario proposto passato → «EXPIRED»", viewStatus({ status: "PROPOSED", startsAt: fut, proposedStartsAt: past }, NOW) === "EXPIRED");
  check("viewStatus: proposta con orario proposto futuro (anche se il richiesto è passato) → «PROPOSED»", viewStatus({ status: "PROPOSED", startsAt: past, proposedStartsAt: fut }, NOW) === "PROPOSED");
  check("viewStatus: confermata passata resta «CONFIRMED»", viewStatus({ status: "CONFIRMED", startsAt: past }, NOW) === "CONFIRMED");
  check("viewStatus: annullata e rifiutata restano tali", viewStatus({ status: "CANCELLED", startsAt: past }, NOW) === "CANCELLED" && viewStatus({ status: "DECLINED", startsAt: past }, NOW) === "DECLINED");
  check("etichette in italiano per tutti gli stati", Object.keys(R.STATUS_LABEL).length === 6 && R.STATUS_LABEL.EXPIRED === "Scaduta senza risposta");
}

// parseBookingSettings
{
  const d = DEFAULT_BOOKING_SETTINGS;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check("impostazioni assenti → valori di partenza (spenta, 10 persone, 30 giorni)", eq(parseBookingSettings(null), d) && d.enabled === false && d.maxPeople === 10 && d.daysAhead === 30, `firstTime di partenza: ${d.firstTime}`);
  check("JSON rotto → valori di partenza", eq(parseBookingSettings("{rotto"), d));
  check("enabled solo se true (non «true» scritto)", parseBookingSettings('{"enabled":"true"}').enabled === false && parseBookingSettings('{"enabled":true}').enabled === true);
  check("firstTime non valido (25:00, 9:00) → quello di partenza; 12:00 e 18:30 validi", parseBookingSettings('{"firstTime":"25:00"}').firstTime === d.firstTime && parseBookingSettings('{"firstTime":"9:00"}').firstTime === d.firstTime && parseBookingSettings('{"firstTime":"18:30"}').firstTime === "18:30" && parseBookingSettings('{"firstTime":"12:00"}').firstTime === "12:00");
  check("passo solo 15/30/60 (anche scritto come testo)", parseBookingSettings('{"step":45}').step === 30 && parseBookingSettings('{"step":"15"}').step === 15 && parseBookingSettings('{"step":60}').step === 60);
  check("persone massime tra 1 e 40", parseBookingSettings('{"maxPeople":0}').maxPeople === 10 && parseBookingSettings('{"maxPeople":41}').maxPeople === 10 && parseBookingSettings('{"maxPeople":40}').maxPeople === 40 && parseBookingSettings('{"maxPeople":2.5}').maxPeople === 10);
  check("giorni avanti tra 1 e 180, anticipo 0…1440, chiusura 0…240", parseBookingSettings('{"daysAhead":181}').daysAhead === 30 && parseBookingSettings('{"leadMinutes":0}').leadMinutes === 0 && parseBookingSettings('{"leadMinutes":1441}').leadMinutes === 60 && parseBookingSettings('{"lastBeforeClose":-5}').lastBeforeClose === 60);
  check("email degli avvisi ripulita, soglia negativa → 0", parseBookingSettings('{"notifyEmail":"  a@b.it  ","capacityHint":-1}').notifyEmail === "a@b.it" && parseBookingSettings('{"capacityHint":-1}').capacityHint === 0);
}

// Testi
check("dayShort «Sab 14 nov», dayLong «sabato 14 novembre»", dayShort("2026-11-14") === "Sab 14 nov" && dayLong("2026-11-14") === "sabato 14 novembre");
check("dayRelative: oggi, domani, poi il giorno per esteso", dayRelative("2026-11-09", NOW) === "oggi" && dayRelative("2026-11-10", NOW) === "domani" && dayRelative("2026-11-11", NOW) === "mercoledì 11 novembre");
check("peopleText: 1 persona, 4 persone", peopleText(1) === "1 persona" && peopleText(4) === "4 persone");

// ================= Servizio (database di prova) =================
const savedSetting = snapshotBookingSetting();
const savedClosed = DB(`select day from "BookingClosedDay"`).split("\n").filter(Boolean);
onInterrupt(() => {
  cleanBookings();
  restoreBookingSetting(savedSetting);
});
try {
  cleanBookings();
  setBookingSetting({ enabled: true, notifyEmail: "prova-c@example.com" });
  const settings = await S.loadBookingSettings();
  check("servizio: impostazioni lette dal database", settings.enabled === true && settings.notifyEmail === "prova-c@example.com");

  // Giorni con almeno 4 orari, da dopodomani (lontani dall'anticipo), senza chiusure già presenti.
  const days = (await S.bookingDays(settings)).filter((d, i) => i >= 2 && d.availability.state === "open" && d.availability.slots.length >= 4 && !savedClosed.includes(d.day));
  check("servizio: bookingDays trova giorni prenotabili", days.length >= 3, days.map((d) => d.day).join(" "));
  const [D1, D2, D3] = days;
  const slot = (d, i) => d.availability.slots[i].time;
  let n = 0;
  const base = (over = {}) => ({ day: D1.day, time: slot(D1, 0), people: 2, name: `Prova C ${++n}`, phone: randomPhone(), email: "", contact: "whatsapp", note: "", allergies: false, source: "menu", event: "", privacy: true, ...over });
  const ctx = (over = {}) => ({ ip: randomIp(), isAdmin: false, origin: "http://localhost:3100", ...over });
  const create = (over, c) => S.createBookingRequest(base(over), ctx(c));
  const row = (id) => DB(`select status||'|'||coalesce("handledBy",'')||'|'||coalesce("cancelledBy",'') from "BookingRequest" where id=${q(id)}`);

  // Campi obbligatori
  const errs = [
    [{ day: "" }, "day", /giorno/],
    [{ time: "8" }, "time", /ora/],
    [{ people: 0 }, "people", /quante persone/],
    [{ people: "due" }, "people", /quante persone/],
    [{ people: 11 }, "people", /Per più di 10 persone chiamaci/],
    [{ name: " A " }, "name", /nome/],
    [{ phone: "12" }, "phone", /prefisso/],
    [{ phone: "333 12345" }, "phone", /incompleto/],
    [{ phone: "333 1234 5678" }, "phone", /incompleto/],
    [{ phone: "055 123456" }, "phone", /solo su un cellulare/],
    [{ phone: "333-abc-4567" }, "phone", /caratteri strani/],
    [{ contact: "email", email: "non-una-mail" }, "email", /email/],
    [{ privacy: false }, "privacy", /informativa/],
    [{ privacy: "true" }, "privacy", /informativa/],
    [{ time: "03:17" }, "time", /non è più disponibile/],
    [{ day: addDays(businessDay(new Date()), -1) }, "day", /già passato/],
    [{ day: addDays(businessDay(new Date()), 31) }, "day", /fino a 30 giorni/],
    [{ name: "Vai su www.esempio.it" }, "name", /solo il nome/],
  ];
  for (const [over, field, re] of errs) {
    const r = await create(over);
    check(`richiesta: ${JSON.stringify(over)} → errore sul campo «${field}»`, !r.ok && r.field === field && re.test(r.error), r.ok ? "accettata!" : `${r.field}: ${r.error}`);
  }
  check("richiesta: nessuna riga salvata dagli errori", DB(`select count(*) from "BookingRequest" where name like 'Prova C%'`) === "0");
  const landline = await create({ phone: "055 1234567", contact: "email", email: "prova-c@example.com", time: slot(D1, 3) });
  check("telefono fisso con risposta per email: accettato", landline.ok, landline.error);
  if (landline.ok) DB(`delete from "BookingRequest" where id=${q(landline.id)}`);
  check("phoneProblem: stessi messaggi nel modulo (cellulare giusto, estero col prefisso)", R.phoneProblem("333 123 4567", "whatsapp") === null && R.phoneProblem("+44 7700 900123", "whatsapp") === null && /incompleto/.test(R.phoneProblem("33312345", "whatsapp")));
  check("phoneReadable: «333 123 4567» e «+44…»", R.phoneReadable("393331234567") === "333 123 4567" && R.phoneReadable("447700900123") === "+447700900123");

  // Richiesta giusta
  const okIn = base({ people: 4, note: "  Tavolo   vicino alla finestra  " + "x".repeat(400), allergies: true, source: "google" });
  const ok = await S.createBookingRequest(okIn, ctx());
  check("richiesta giusta: salvata, codice di 6 caratteri, link /menu/prenota/r/…", ok.ok && /^[A-HJ-NP-Z2-9]{6}$/.test(ok.code) && /^\/menu\/prenota\/r\/[\w-]{40,}$/.test(ok.statusPath) && ok.isTest === false, JSON.stringify(ok));
  const saved = await prisma.bookingRequest.findUnique({ where: { id: ok.id } });
  check("richiesta: telefono in formato internazionale, nota ripulita (max 300), allergie sì, da Google", saved.phone.startsWith("39333") && saved.note.length === 300 && saved.note.startsWith("Tavolo vicino alla finestra") && saved.allergies === true && saved.source === "google" && saved.status === "PENDING");
  check("richiesta: startsAt = giorno e ora a Roma", saved.startsAt.getTime() === romeInstant(D1.day, timeToDayMinutes(slot(D1, 0))).getTime());
  check("richiesta: nel database solo l'impronta del link", saved.tokenHash === S.hashToken(ok.statusPath.split("/").pop()) && !DB(`select "tokenHash" from "BookingRequest" where id=${q(ok.id)}`).includes(ok.statusPath.split("/").pop()));
  check("richiesta: cronologia «CREATED» dal cliente", DB(`select actor||':'||kind from "BookingLog" where "requestId"=${q(ok.id)}`) === "cliente:CREATED");
  check("findByToken: col link giusto la trova, con uno inventato no", (await S.findByToken(ok.statusPath.split("/").pop()))?.id === ok.id && (await S.findByToken("x".repeat(43))) === null && (await S.findByToken("corto")) === null);
  const allergiesStr = await S.createBookingRequest(base({ allergies: "true", time: slot(D1, 1) }), ctx());
  check("allergie solo se true (non «true» scritto)", allergiesStr.ok && DB(`select allergies from "BookingRequest" where id=${q(allergiesStr.id)}`) === "f");
  const src = await S.createBookingRequest(base({ source: "pippo", time: slot(D1, 2) }), ctx());
  check("da dove arriva sconosciuto → «altro»", src.ok && DB(`select source from "BookingRequest" where id=${q(src.id)}`) === "altro");
  const promo = DB(`select slug from "MenuPromo" where "deletedAt" is null and kind='EVENT' limit 1`);
  if (promo) {
    const ev = await S.createBookingRequest(base({ event: promo, source: "menu", time: slot(D1, 3) }), ctx());
    check("con lo slug di un evento: da «evento» e collegata all'evento", ev.ok && DB(`select source||'|'||("promoId" is not null) from "BookingRequest" where id=${q(ev.id)}`) === "evento|true");
  }

  // Avvisi dopo il salvataggio
  await S.afterCreate(ok.id, "http://localhost:3100");
  check("afterCreate: avviso per email al titolare (provider di prova) nella cronologia", /MAIL_OK:Avviso al titolare \(prova-c@example.com\)/.test(DB(`select string_agg(kind||':'||coalesce(message,''), ' | ') from "BookingLog" where "requestId"=${q(ok.id)}`)));
  const em = await S.createBookingRequest(base({ contact: "email", email: " Prova.C@Example.com ", time: slot(D2, 0), day: D2.day }), ctx());
  await S.afterCreate(em.id, "http://localhost:3100");
  check("email del cliente salvata in minuscolo, ricevuta inviata («Richiesta ricevuta…»)", DB(`select email from "BookingRequest" where id=${q(em.id)}`) === "prova.c@example.com" && /Email al cliente: Richiesta ricevuta/.test(DB(`select string_agg(coalesce(message,''), ' | ') from "BookingLog" where "requestId"=${q(em.id)}`)));

  // Doppio invio: stesso telefono, giorno e ora dallo stesso indirizzo (entro 15 minuti) → la stessa richiesta
  const okIp = randomIp();
  const first = await S.createBookingRequest({ ...okIn, phone: "333 9222222", name: "Prova C doppio" }, ctx({ ip: okIp }));
  const again = await S.createBookingRequest({ ...okIn, phone: "333 9222222", name: "Prova C doppio" }, ctx({ ip: okIp }));
  check("doppio invio dallo stesso indirizzo: torna la stessa richiesta, niente doppioni", first.ok && again.ok && again.id === first.id && again.reused === true && DB(`select count(*) from "BookingRequest" where phone='393339222222'`) === "1");
  // …ma chi conosce solo telefono, giorno e ora di qualcun altro non ottiene il suo link.
  const other = await S.createBookingRequest({ ...okIn, phone: "333 9222222", name: "Prova C altro" }, ctx());
  check("stesso telefono, giorno e ora da un altro indirizzo: niente link, «c'è già una richiesta»", !other.ok && !other.statusPath && /c'è già una richiesta/.test(other.error), JSON.stringify(other));
  DB(`update "BookingRequest" set "createdAt" = now() - interval '20 minutes' where phone='393339222222'`);
  const later = await S.createBookingRequest({ ...okIn, phone: "333 9222222", name: "Prova C doppio" }, ctx({ ip: okIp }));
  check("…e dallo stesso indirizzo dopo 15 minuti nemmeno", !later.ok && /c'è già una richiesta/.test(later.error));
  DB(`delete from "BookingRequest" where phone='393339222222'`);
  const sameIp = randomIp();
  const twoAtOnce = await Promise.all([0, 1].map(() => S.createBookingRequest(base({ phone: "333 9111111", time: slot(D3, 0), day: D3.day, name: "Prova C doppio click" }), ctx({ ip: sameIp }))));
  const twoRows = DB(`select count(*) from "BookingRequest" where phone='393339111111'`);
  check("doppio clic nello stesso istante (stesso indirizzo): una sola richiesta, tutti e due ok", twoAtOnce.every((r) => r.ok) && twoAtOnce[0].id === twoAtOnce[1].id && twoRows === "1", `righe: ${twoRows}`);
  DB(`delete from "BookingRequest" where phone='393339111111'`);
  const twoIps = await Promise.all([0, 1].map(() => S.createBookingRequest(base({ phone: "333 9111112", time: slot(D3, 0), day: D3.day, name: "Prova C doppio click" }), ctx())));
  const twoIpRows = DB(`select count(*) from "BookingRequest" where phone='393339111112'`);
  check("stesso istante da due indirizzi: una sola richiesta, l'altro legge «c'è già una richiesta»", twoIpRows === "1" && twoIps.filter((r) => r.ok).length === 1 && /c'è già una richiesta/.test(twoIps.find((r) => !r.ok)?.error ?? ""), `righe: ${twoIpRows}`);
  DB(`delete from "BookingRequest" where phone='393339111112'`);

  // Limite per IP: 10 all'ora
  const ip = randomIp();
  const fromIp = [];
  for (let i = 0; i < 11; i++) fromIp.push(await create({ time: slot(D2, i % D2.availability.slots.length), day: D2.day }, { ip }));
  check("stesso IP: le prime 10 passano, l'undicesima no («tante richieste»)", fromIp.slice(0, 10).every((r) => r.ok) && !fromIp[10].ok && /tante richieste/.test(fromIp[10].error), fromIp.map((r) => (r.ok ? "ok" : r.error)).join(" / "));
  check("stesso IP: il titolare non ha limiti", (await create({ time: slot(D2, 1), day: D2.day }, { ip, isAdmin: true })).ok);

  // Limite per telefono: 3 in attesa
  const phone = randomPhone();
  const byPhone = [];
  for (let i = 0; i < 4; i++) byPhone.push(await create({ phone, time: slot(D3, i), day: D3.day }));
  check("stesso telefono: 3 in attesa passano, la quarta no", byPhone.slice(0, 3).every((r) => r.ok) && !byPhone[3].ok && /già 3 richieste in attesa/.test(byPhone[3].error), byPhone.map((r) => (r.ok ? "ok" : r.error)).join(" / "));
  await S.declineBooking(byPhone[0].id, { name: "Prova C Marta" }, null, null);
  check("…rispondendo a una, il telefono può chiederne un'altra", (await create({ phone, time: slot(D3, 3), day: D3.day })).ok);

  // Chiusure dal database: giornata chiusa (Orari) e serata al completo
  const closedDay = days[3]?.day ?? addDays(D3.day, 1);
  if (DB(`select count(*) from "ClosureDay" where date='${closedDay}'`) === "0") {
    DB(`insert into "ClosureDay" (id, date, reason) values ('prova_c_chiusura', '${closedDay}', 'Prova C chiusura')`);
    const r = await create({ day: closedDay, time: "20:00" });
    check("giornata chiusa negli Orari: «Quel giorno siamo chiusi»", !r.ok && r.field === "day" && /siamo chiusi/.test(r.error), r.error);
    const opt = (await S.bookingDays(settings)).find((d) => d.day === closedDay);
    check("bookingDays: quel giorno «closed» col motivo", opt.availability.state === "closed" && opt.availability.reason === "Prova C chiusura");
    DB(`delete from "ClosureDay" where id='prova_c_chiusura'`);
  }
  await S.setDayFull(D2.day, true, { name: "Prova C Marta" }, "Prova C pieni");
  const full = await create({ day: D2.day, time: slot(D2, 2) });
  check("serata chiusa alle richieste: «già al completo»", !full.ok && full.field === "day" && /al completo/.test(full.error), full.error);
  check("bookingDays: quel giorno «full»", (await S.bookingDays(settings)).find((d) => d.day === D2.day).availability.state === "full");
  await S.setDayFull(D2.day, false, { name: "Prova C Marta" });
  check("riaperta con un tocco: si può chiedere di nuovo", (await create({ day: D2.day, time: slot(D2, 2) })).ok);
  let threw = false;
  try {
    await S.setDayFull("domani", true, { name: "Prova C" });
  } catch {
    threw = true;
  }
  check("setDayFull rifiuta un giorno scritto male", threw);

  // Funzione spenta
  setBookingSetting({ enabled: false });
  const off = await create({ day: D1.day, time: slot(D1, 1) });
  check("spenta: i clienti ricevono «non sono attive», niente salvato", !off.ok && /non sono attive/.test(off.error));
  const offAdmin = await create({ day: D1.day, time: slot(D1, 1) }, { isAdmin: true });
  check("spenta: il titolare può provare, la richiesta è «di prova»", offAdmin.ok && offAdmin.isTest === true && DB(`select "isTest" from "BookingRequest" where id=${q(offAdmin.id)}`) === "t");
  const countBefore = DB(`select count(*) from "BookingLog" where "requestId"=${q(offAdmin.id)}`);
  await S.afterCreate(offAdmin.id, null);
  check("richiesta di prova: nessun avviso (cronologia invariata)", DB(`select count(*) from "BookingLog" where "requestId"=${q(offAdmin.id)}`) === countBefore);
  setBookingSetting({ enabled: true, notifyEmail: "prova-c@example.com" });
  check("pendingCount non conta le richieste di prova", (await S.pendingCount()) === Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and status='PENDING' and "startsAt">=now()`)));
  setBookingSetting({ enabled: true, maxPeople: 4 });
  const big = await create({ people: 5, day: D1.day, time: slot(D1, 1) });
  check("maxPeople 4: 5 persone → «Per più di 4 persone chiamaci»", !big.ok && big.field === "people" && /Per più di 4 persone/.test(big.error));
  setBookingSetting({ enabled: true, notifyEmail: "prova-c@example.com" });

  // ---------- Risposte del locale
  const fresh = (over = {}) => create({ day: D1.day, time: slot(D1, 1 + (n % 3)), ...over });
  const marta = { name: "Prova C Marta" };
  const giulia = { name: "Prova C Giulia" };

  // Concorrenza: due conferme insieme
  const c1 = await fresh();
  const [r1, r2] = await Promise.all([S.confirmBooking(c1.id, marta, null, null), S.confirmBooking(c1.id, giulia, null, null)]);
  const winners = [r1, r2].filter((r) => r.ok);
  const loser = [r1, r2].find((r) => !r.ok);
  const winnerName = winners[0]?.booking.handledBy;
  check("due conferme insieme: una sola va a buon fine", winners.length === 1, JSON.stringify([r1.ok, r2.ok]));
  check("…l'altra legge «Già confermata da <chi ha vinto>.»", loser && loser.error === `Già confermata da ${winnerName}.`, loser?.error);
  check("…una sola «CONFIRMED» nella cronologia", DB(`select count(*) from "BookingLog" where "requestId"=${q(c1.id)} and kind='CONFIRMED'`) === "1");
  check("conferma: messaggio WhatsApp pronto per il numero del cliente", /^https:\/\/wa\.me\/39333\d+\?text=/.test(winners[0].whatsappHref) && decodeURIComponent(winners[0].whatsappHref).includes("ti aspettiamo") && winners[0].mailSent === false);
  check("conferma: il link nel messaggio porta alla pagina del cliente", decodeURIComponent(winners[0].whatsappHref).includes(`/menu/prenota/r/${S.tokenFor(c1.id)}`));

  // Conferma per chi ha scelto l'email
  const ce = await fresh({ contact: "email", email: "prova-c@example.com" });
  const cer = await S.confirmBooking(ce.id, marta, "Vi teniamo il tavolo in sala", "http://localhost:3100");
  check("conferma via email: mail partita (provider di prova) e WhatsApp comunque pronto", cer.ok && cer.mailSent === true && !!cer.whatsappHref && /Email al cliente: Prenotazione confermata/.test(DB(`select string_agg(coalesce(message,''),' | ') from "BookingLog" where "requestId"=${q(ce.id)}`)));
  check("conferma: messaggio del locale salvato", DB(`select "staffMessage" from "BookingRequest" where id=${q(ce.id)}`) === "Vi teniamo il tavolo in sala");

  // Proposta + accetta
  const p1 = await fresh();
  const tok1 = S.statusPath(p1.id).split("/").pop();
  const orig = DB(`select time from "BookingRequest" where id=${q(p1.id)}`);
  check("proposta: stesso orario → errore", !(await S.proposeTime(p1.id, marta, orig, null, null)).ok);
  check("proposta: orario scritto male → errore", !(await S.proposeTime(p1.id, marta, "21.30", null, null)).ok);
  const newTime = D1.availability.slots.map((s) => s.time).find((t) => t !== orig);
  const pr = await S.proposeTime(p1.id, marta, newTime, "Prima siamo pieni", null);
  check("proposta: stato «PROPOSED» con l'orario proposto", pr.ok && pr.booking.status === "PROPOSED" && pr.booking.proposedTime === newTime && pr.booking.proposedStartsAt.getTime() === romeInstant(D1.day, timeToDayMinutes(newTime)).getTime());
  check("proposta: messaggio WhatsApp «Ti va bene alle …?»", decodeURIComponent(pr.whatsappHref).includes(`Ti va bene alle ${newTime}?`));
  check("proposta: una seconda proposta insieme → «Già gestita da Prova C Marta: è stato proposto un altro orario.»", (await S.proposeTime(p1.id, giulia, orig === "20:00" ? "20:30" : "20:00", null, null)).error === "Già gestita da Prova C Marta: è stato proposto un altro orario.");
  check("proposta: «Conferma» non vale più → errore chiaro", /Già gestita/.test((await S.confirmBooking(p1.id, giulia, null, null)).error ?? ""));
  const acc = await S.customerAction(tok1, "accept", null);
  check("cliente accetta: confermata al nuovo orario, proposta svuotata", acc.ok && acc.booking.status === "CONFIRMED" && acc.booking.time === newTime && acc.booking.proposedTime === null && acc.booking.startsAt.getTime() === romeInstant(D1.day, timeToDayMinutes(newTime)).getTime());
  check("cliente accetta: in cronologia «Va bene alle …»", DB(`select message from "BookingLog" where "requestId"=${q(p1.id)} and kind='ACCEPTED'`) === `Va bene alle ${newTime}`);
  check("accettare di nuovo: «Non c'è nessun orario da accettare.»", (await S.customerAction(tok1, "accept", null)).error === "Non c'è nessun orario da accettare.");
  check("dopo l'accettazione: confermare → «Già confermata da Prova C Marta.»", (await S.confirmBooking(p1.id, giulia, null, null)).error === "Già confermata da Prova C Marta.");

  // Proposta + rifiuta
  const p2 = await fresh();
  const p2t = D1.availability.slots.map((s) => s.time).find((t) => t !== DB(`select time from "BookingRequest" where id=${q(p2.id)}`));
  await S.proposeTime(p2.id, marta, p2t, null, null);
  const ref = await S.customerAction(S.tokenFor(p2.id), "refuse", null);
  check("cliente rifiuta la proposta: «DECLINED», chiusa dal cliente", ref.ok && row(p2.id) === "DECLINED|Prova C Marta|cliente");

  // Proposta: il cliente accetta mentre il locale risponde «al completo»
  const p3 = await fresh();
  await S.proposeTime(p3.id, marta, D1.availability.slots.map((s) => s.time).find((t) => t !== DB(`select time from "BookingRequest" where id=${q(p3.id)}`)), null, null);
  const [ca, cd] = await Promise.all([S.customerAction(S.tokenFor(p3.id), "accept", null), S.declineBooking(p3.id, giulia, null, null)]);
  check("accetta (cliente) e «al completo» (locale) insieme: ne vince uno solo", [ca.ok, cd.ok].filter(Boolean).length === 1, `${ca.ok ? "accetta" : ca.error} / ${cd.ok ? "rifiuta" : cd.error}`);

  // Rifiuta (al completo)
  const d1 = await fresh();
  const dr = await S.declineBooking(d1.id, marta, "Riprova sabato prossimo", null);
  check("al completo: «DECLINED» e messaggio «siamo al completo»", dr.ok && dr.booking.status === "DECLINED" && decodeURIComponent(dr.whatsappHref).includes("siamo al completo") && decodeURIComponent(dr.whatsappHref).includes("Riprova sabato prossimo"));
  check("al completo due volte: «Già gestita da Prova C Marta: non c'era posto.»", (await S.declineBooking(d1.id, giulia, null, null)).error === "Già gestita da Prova C Marta: non c'era posto.");
  check("al completo: il cliente non può più annullare", !(await S.customerAction(S.tokenFor(d1.id), "cancel", null)).ok);

  // Annullo del cliente
  const a1 = await fresh();
  const can = await S.customerAction(S.tokenFor(a1.id), "cancel", null);
  check("il cliente annulla una richiesta in attesa: «CANCELLED» dal cliente", can.ok && row(a1.id) === "CANCELLED||cliente");
  check("…poi «Conferma» → «Il cliente l'ha annullata.»", (await S.confirmBooking(a1.id, marta, null, null)).error === "Il cliente l'ha annullata.");
  check("…annullare di nuovo → «Non si può più annullare da qui: chiamaci.»", (await S.customerAction(S.tokenFor(a1.id), "cancel", null)).error === "Non si può più annullare da qui: chiamaci.");
  const a2 = await fresh();
  await S.confirmBooking(a2.id, marta, null, null);
  check("il cliente annulla una confermata", (await S.customerAction(S.tokenFor(a2.id), "cancel", null)).ok && row(a2.id) === "CANCELLED|Prova C Marta|cliente");
  check("azione sconosciuta → «Azione non valida.»; link inventato → «non c'è più»", (await S.customerAction(S.tokenFor(a2.id), "boh", null)).error === "Azione non valida." && /non c'è più/.test((await S.customerAction("y".repeat(43), "cancel", null)).error));
  const a3 = await fresh();
  const [cc, cf] = await Promise.all([S.customerAction(S.tokenFor(a3.id), "cancel", null), S.confirmBooking(a3.id, giulia, null, null)]);
  const st3 = DB(`select status from "BookingRequest" where id=${q(a3.id)}`);
  check("annullo del cliente e conferma insieme: stato finale coerente", (cc.ok && st3 === "CANCELLED") || (!cc.ok && cf.ok && st3 === "CONFIRMED") || (cc.ok && cf.ok && st3 === "CANCELLED"), `${cc.ok}/${cf.ok} → ${st3}`);

  // Annullo del locale
  const v1 = await fresh();
  check("il locale annulla una richiesta non confermata → errore", !(await S.cancelByVenue(v1.id, marta, null, null)).ok);
  await S.confirmBooking(v1.id, marta, null, null);
  const vc = await S.cancelByVenue(v1.id, giulia, "Guasto in cucina", null);
  check("il locale annulla una confermata: «CANCELLED» dal locale, messaggio «dobbiamo annullare»", vc.ok && row(v1.id) === "CANCELLED|Prova C Giulia|locale" && decodeURIComponent(vc.whatsappHref).includes("dobbiamo annullare") && decodeURIComponent(vc.whatsappHref).includes("Guasto in cucina"));
  check("annullare di nuovo → «Già annullata da Prova C Giulia.»", (await S.cancelByVenue(v1.id, marta, null, null)).error === "Già annullata da Prova C Giulia.");

  // Arrivati / non venuti
  const m1 = await fresh();
  check("arrivati su una richiesta non confermata → errore", !(await S.markArrival(m1.id, marta, true)).ok);
  await S.confirmBooking(m1.id, marta, null, null);
  const early = await S.markArrival(m1.id, marta, true);
  check("«Arrivati» prima del giorno della prenotazione → errore", !early.ok && /solo dal giorno/.test(early.error), early.error);
  const notYet = await S.markArrival(m1.id, marta, false);
  check("«Non venuti» prima dell'orario → errore", !notYet.ok && /dopo l'orario/.test(notYet.error), notYet.error);
  // Diventa una prenotazione di stasera, già iniziata da mezz'ora.
  DB(`update "BookingRequest" set day='${businessDay(new Date())}', "startsAt" = now() - interval '30 minutes' where id=${q(m1.id)}`);
  await S.markArrival(m1.id, marta, true);
  check("«Arrivati»: arrivedAt segnato", DB(`select ("arrivedAt" is not null)||'|'||("noShowAt" is not null) from "BookingRequest" where id=${q(m1.id)}`) === "true|false");
  await S.markArrival(m1.id, marta, false);
  check("«Non venuti»: noShowAt segnato, arrivedAt tolto", DB(`select ("arrivedAt" is not null)||'|'||("noShowAt" is not null) from "BookingRequest" where id=${q(m1.id)}`) === "false|true");
  await S.markArrival(m1.id, marta, null);
  check("annulla il segno: tutti e due vuoti", DB(`select ("arrivedAt" is not null)||'|'||("noShowAt" is not null) from "BookingRequest" where id=${q(m1.id)}`) === "false|false");
  check("cronologia: ARRIVED, NOSHOW, ARRIVAL_CLEARED", DB(`select string_agg(kind, ',' order by at) from "BookingLog" where "requestId"=${q(m1.id)} and kind in ('ARRIVED','NOSHOW','ARRIVAL_CLEARED')`) === "ARRIVED,NOSHOW,ARRIVAL_CLEARED");
  await S.markWhatsappOpened(m1.id, marta);
  check("WhatsApp aperto: in cronologia", DB(`select count(*) from "BookingLog" where "requestId"=${q(m1.id)} and kind='WHATSAPP_OPENED'`) === "1");

  // Il cliente ha risposto all'orario proposto fuori dal sito: lo segna chi lavora
  const queue = async (id) => {
    const b = await prisma.bookingRequest.findUnique({ where: { id }, include: { log: true } });
    return whatsappPending(b, Date.now());
  };
  const y1 = await fresh();
  const y1t = D1.availability.slots.map((s) => s.time).find((t) => t !== DB(`select time from "BookingRequest" where id=${q(y1.id)}`));
  check("proposta: «Il cliente ha detto sì» su una richiesta non proposta → errore", !(await S.acceptProposalForCustomer(y1.id, marta, null)).ok);
  await S.proposeTime(y1.id, marta, y1t, null, null);
  const yes = await S.acceptProposalForCustomer(y1.id, giulia, null);
  check("«Il cliente ha detto sì»: confermata al nuovo orario da chi l'ha segnato", yes.ok && yes.booking.status === "CONFIRMED" && yes.booking.time === y1t && yes.booking.proposedTime === null && row(y1.id) === "CONFIRMED|Prova C Giulia|");
  check("…cronologia «ACCEPTED» di Giulia, messaggio di conferma pronto per WhatsApp", DB(`select actor||':'||kind from "BookingLog" where "requestId"=${q(y1.id)} and kind='ACCEPTED'`) === "Prova C Giulia:ACCEPTED" && decodeURIComponent(yes.whatsappHref ?? "").includes("ti aspettiamo"));
  check("…nella lista «Da mandare su WhatsApp» come conferma", (await queue(y1.id)) === "confirmed");
  check("…segnarlo di nuovo → «Già confermata»", /Già confermata/.test((await S.acceptProposalForCustomer(y1.id, marta, null)).error ?? ""));
  const n1 = await fresh();
  await S.proposeTime(n1.id, marta, D1.availability.slots.map((s) => s.time).find((t) => t !== DB(`select time from "BookingRequest" where id=${q(n1.id)}`)), null, null);
  const no = await S.refuseProposalForCustomer(n1.id, giulia, null);
  check("«Il cliente ha detto no»: chiusa dal cliente, nessun messaggio «al completo»", no.ok && row(n1.id) === "DECLINED|Prova C Giulia|cliente" && no.whatsappHref === null && no.mailSent === false);
  check("…cronologia «REFUSED» di Giulia, e niente nella lista WhatsApp", DB(`select actor||':'||kind from "BookingLog" where "requestId"=${q(n1.id)} and kind='REFUSED'`) === "Prova C Giulia:REFUSED" && (await queue(n1.id)) === null);
  check("…non conta tra le «al completo» nei numeri", (await S.bookingStats()).declined === Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and status='DECLINED' and "cancelledBy" is distinct from 'cliente' and "createdAt" >= now() - interval '90 days'`)));

  // «Ci ha avvisato il cliente»: annullata senza messaggi
  const g1 = await fresh();
  await S.confirmBooking(g1.id, marta, null, null);
  await S.markWhatsappOpened(g1.id, marta);
  const gone = await S.cancelForCustomer(g1.id, giulia, null);
  check("«Ci ha avvisato il cliente» su una confermata: annullata dal cliente, nessun messaggio", gone.ok && row(g1.id) === "CANCELLED|Prova C Giulia|cliente" && gone.whatsappHref === null);
  check("…cronologia «Ci ha avvisato il cliente», niente nella lista WhatsApp", DB(`select message from "BookingLog" where "requestId"=${q(g1.id)} and kind='CANCELLED'`) === S.CUSTOMER_TOLD_US && (await queue(g1.id)) === null);
  check("…il cliente dalla sua pagina non può più annullare", !(await S.customerAction(S.tokenFor(g1.id), "cancel", null)).ok);
  const g2 = await fresh();
  const gone2 = await S.cancelForCustomer(g2.id, marta, null);
  check("«Il cliente non viene più» su una richiesta da confermare: annullata dal cliente", gone2.ok && row(g2.id) === "CANCELLED|Prova C Marta|cliente");
  check("…poi «Conferma» → «Il cliente l'ha annullata.»", (await S.confirmBooking(g2.id, giulia, null, null)).error === "Il cliente l'ha annullata.");

  // Annullo del locale: messaggio da mandare su WhatsApp
  check("annullo del locale: nella lista WhatsApp come annullamento", (await queue(v1.id)) === "cancelledByVenue");

  // Cancella i dati (il cliente lo chiede)
  const e1 = await fresh();
  await S.confirmBooking(e1.id, marta, null, null);
  const er = await S.eraseBooking(e1.id);
  check("cancella i dati: richiesta e cronologia sparite", er.ok && DB(`select count(*) from "BookingRequest" where id=${q(e1.id)}`) === "0" && DB(`select count(*) from "BookingLog" where "requestId"=${q(e1.id)}`) === "0");
  check("…cancellare di nuovo → «non c'è più»", !(await S.eraseBooking(e1.id)).ok);
  check("…il link del cliente non trova più niente", (await S.findByToken(S.tokenFor(e1.id))) === null);

  // Elenchi e numeri
  const list = await S.listBookings();
  check("listBookings: contiene le richieste di prova, in ordine di orario", list.rows.some((r) => r.id === m1.id) && list.rows.every((r, i) => i === 0 || r.startsAt >= list.rows[i - 1].startsAt));
  const stats = await S.bookingStats();
  check("bookingStats: conta senza le richieste «di prova», tempo di risposta calcolato", stats.total === Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and "createdAt" >= now() - interval '90 days'`)) && stats.medianResponseMinutes !== null && stats.bySource.some(([s]) => s === "google"));
} catch (e) {
  check("le prove del servizio sono arrivate in fondo", false, e?.stack ?? String(e));
} finally {
  cleanBookings();
  // Le serate chiuse che c'erano prima restano; quelle create qui spariscono.
  restoreBookingSetting(savedSetting);
  await prisma.$disconnect();
}
check("pulizia: nessuna richiesta «Prova C» rimasta", DB(`select count(*) from "BookingRequest" where name like 'Prova C%'`) === "0");
check("pulizia: impostazione «bookings» come prima", snapshotBookingSetting() === savedSetting);
process.exit(finish());
