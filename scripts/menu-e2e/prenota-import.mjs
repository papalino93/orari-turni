// Prenotazioni, «IMPORTA DAL LIBRONE»:
// 1. lettura della lista incollata (src/lib/booking/import.ts, funzione pura): formati del giorno,
//    dell'ora e delle persone, telefono, nome e nota, tavolo, allergie, errori, giorni passati, anno
//    dopo, giorno della settimana che non torna, riga del giorno valida per le righe sotto, righe ripetute;
// 2. il servizio sul database di prova (importManualBookings): anteprima senza salvare, prenotazioni
//    confermate «dal librone» con la cronologia, doppioni già in agenda saltati o tenuti, limite di 200;
// 3. con --browser: il foglio sul server di prova (titolare, telefono e computer, tema chiaro e scuro),
//    con le foto in SHOTS=<cartella> se c'è.
// Dati di prova: nomi «Prova Import …», telefoni 300 006 xxxx; tutto si cancella alla fine.
// L'impostazione «bookings» non si tocca (con l'agenda spenta quello che si importa è «di prova»).
// Uso: npx tsx scripts/menu-e2e/prenota-import.mjs [--browser]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal, onInterrupt, check, finish, DB, BASE, ADMIN_PW, SHOTS, snapshotBookingSetting, launch, login, wait, waitServer, waitOtherTests } from "./prenota-lib.mjs";

loadEnvLocal();
process.env.MAIL_PROVIDER = "log";
process.env.PUSH_PROVIDER = "log";
delete process.env.VERCEL_ENV;

const I = await import("@/lib/booking/import");
const R = await import("@/lib/booking/rules");
const F = await import("@/app/(app)/prenotazioni/format");
const { parseImport, importCounts, importable } = I;
const { romeInstant, addDays, businessDay, weekdayOf } = R;

// ================= 1. Lettura della lista (pura) =================
const NOW = romeInstant("2026-11-13", 15 * 60); // venerdì 13 novembre 2026, 15:00 a Roma
const one = (line, now = NOW) => parseImport(line, now)[0];
const got = (r) => (r ? `${r.kind} ${r.day} ${r.time} ${r.people} «${r.name}» ${r.phoneIntl} t=${r.table} «${r.note}» all=${r.allergies} err=${r.errors.join("|")} warn=${r.warnings.join("|")}` : "niente");
const is = (name, line, want, now = NOW) => {
  const r = one(line, now);
  const ok = r && Object.entries(want).every(([k, v]) => (k === "errors" || k === "warnings" ? JSON.stringify(r[k]) === JSON.stringify(v) : r[k] === v));
  check(name, ok, ok ? "" : got(r));
};
const err = (name, line, error, now = NOW) => {
  const r = one(line, now);
  check(name, r && r.errors.includes(error) && !importable(r), got(r));
};

check("calendario: 13/11/2026 venerdì, 14/11 sabato, 21/11 sabato", weekdayOf("2026-11-13") === 4 && weekdayOf("2026-11-14") === 5 && weekdayOf("2026-11-21") === 5);

// Esempi del foglio
is("esempio 1: «14/11 20:30 4 Rossi 333 123 4567 seggiolone»", "14/11 20:30 4 Rossi 333 123 4567 seggiolone", { day: "2026-11-14", time: "20:30", people: 4, name: "Rossi", phoneIntl: "393331234567", note: "seggiolone", allergies: false, errors: [], warnings: [] });
is("esempio 2: «sab 21/11; 21:00; 2; Bianchi» (punto e virgola)", "sab 21/11; 21:00; 2; Bianchi", { day: "2026-11-21", time: "21:00", people: 2, name: "Bianchi", phone: "", note: "", errors: [], warnings: [] });

// Separatori
is("tabulazioni (da Excel), con anno e nota in colonna", "14/11/2026\t20:30\t4\tVerdi\t333 1234567\tcompleanno", { day: "2026-11-14", time: "20:30", people: 4, name: "Verdi", phoneIntl: "393331234567", note: "compleanno", errors: [] });
is("Excel con il telefono vuoto: la nota resta nella sua colonna", "14/11/2026\t20:30\t4\tVerdi\t\tseggiolone", { name: "Verdi", phone: "", note: "seggiolone", errors: [] });
is("barra verticale | ", "14/11 | 20:30 | 2 | Mario Rossi | tavolo fuori", { day: "2026-11-14", time: "20:30", people: 2, name: "Mario Rossi", note: "tavolo fuori", errors: [] });
is("Excel: ora con i secondi (20:30:00) e data 2026-11-14", "2026-11-14\t20:30:00\t3\tNeri", { day: "2026-11-14", time: "20:30", people: 3, name: "Neri", errors: [] });
{
  const rows = parseImport("Data\tOra\tPersone\tNome\tTelefono\n14/11\t20:30\t2\tBlu", NOW);
  check("intestazione delle colonne (Data, Ora, Persone…) saltata, la riga sotto letta", rows[0].kind === "skip" && rows[1].kind === "booking" && importable(rows[1]) && importCounts(rows).bookings === 1, rows.map(got).join(" / "));
}

// Giorno
is("giorno dd-mm", "14-11 20:30 2 Bruni", { day: "2026-11-14", time: "20:30" });
is("giorno dd.mm con ora hh.mm («14.11 20.30»)", "14.11 20.30 4 Gialli", { day: "2026-11-14", time: "20:30", people: 4, name: "Gialli" });
is("giorno d/m («7/1» → gennaio dell'anno dopo)", "7/1 20:30 2 Primo", { day: "2027-01-07" });
is("giorno dd/mm/yy («14/11/26»)", "14/11/26 2030 2 Neri", { day: "2026-11-14", time: "20:30" });
is("giorno yyyy-mm-dd", "2026-11-14 20h30 2 Bruni", { day: "2026-11-14", time: "20:30" });
is("giorno dd/mm/yyyy e ora «20h»", "14/11/2026 20h 3 Rosa", { day: "2026-11-14", time: "20:00", people: 3 });
is("giorno della settimana per intero e in maiuscolo («SABATO 14/11»)", "SABATO 14/11 20:30 2 Rossi", { day: "2026-11-14", warnings: [] });
is("giorno della settimana con l'accento («Venerdì 20/11»)", "Venerdì 20/11 20:30 2 Rossi", { day: "2026-11-20", warnings: [] });
is("«14 nov» con il mese a parole", "14 nov 21:00 2 Rossi", { day: "2026-11-14", time: "21:00" });
is("«oggi»", "oggi 21h30 2 Viola", { day: "2026-11-13", time: "21:30", errors: [] });
is("«domani»", "domani 20:00 2 Viola", { day: "2026-11-14" });
is("«oggi» alle 2 di notte è ancora la sera prima (giorno commerciale)", "oggi 23:00 2 Viola", { day: "2026-11-13" }, romeInstant("2026-11-14", 2 * 60));
is("giorno della settimana che non torna → avviso, si segna lo stesso", "sab 15/11 21:00 2 Bianchi", { day: "2026-11-15", warnings: ["Il giorno della settimana non torna: il 15/11 è domenica"], errors: [] });
check("…e la riga resta da segnare", importable(one("sab 15/11 21:00 2 Bianchi")));
err("giorno passato (10/11) → «Giorno già passato»", "10/11 20:30 2 Passato", I.E_PAST);
is("oggi (13/11) va bene", "13/11 20:30 2 Oggi", { day: "2026-11-13", errors: [] });
err("passato da 54 giorni (20/09) → «Giorno già passato», non l'anno dopo", "20/09 20:30 2 Settembre", I.E_PAST);
is("passato da più di 2 mesi (01/09) → l'anno dopo", "01/09 20:30 2 Settembre", { day: "2027-09-01", errors: [] });
is("a dicembre, «03/01» → gennaio dell'anno dopo", "03/01 20:30 2 Capodanno", { day: "2027-01-03", errors: [] }, romeInstant("2026-12-20", 15 * 60));
err("anno scritto e passato (14/11/2025) → «Giorno già passato»", "14/11/2025 20:30 2 Vecchio", I.E_PAST);
err("più di un anno avanti (14/11/2028)", "14/11/2028 20:30 2 Lontano", I.E_FAR);
err("giorno che non esiste (31/02) → «Giorno non letto»", "31/02 20:00 2 Nessuno", I.E_DAY);
err("senza giorno → «Giorno non letto»", "20:30 4 Rossi", I.E_DAY);
err("solo il giorno della settimana, senza data → «Giorno non letto»", "sab 20:30 4 Rossi", I.E_DAY);

// Ora
is("ora 20,30", "14/11 20,30 2 Rossi", { time: "20:30" });
is("ora 2030", "14/11 2030 2 Rossi", { time: "20:30" });
is("ora 20 da sola → 20:00 (le persone dopo)", "14/11 20 4 Neri", { time: "20:00", people: 4, name: "Neri" });
is("ora 20h30", "14/11 20h30 2 Rossi", { time: "20:30" });
is("«alle 21» ", "14/11 alle 21 2 Rossi", { time: "21:00", people: 2, name: "Rossi" });
{
  const r = one("14/11 00:30 2 Notte");
  check("ora dopo mezzanotte (00:30): stessa serata del 14 (come nel foglio «Nuova prenotazione»)", r.day === "2026-11-14" && r.time === "00:30" && R.timeToDayMinutes(r.time) === 24 * 60 + 30, got(r));
}
// Senza ora: prenotazione vera «da completare» (avviso giallo, non un errore).
is("senza ora → «Ora da definire» (avviso giallo), si segna lo stesso", "14/11 4 Rossi", { time: null, people: 4, name: "Rossi", errors: [], warnings: [I.W_TIME] });
check("…e la riga senza ora resta da segnare", importable(one("14/11 4 Rossi")));

// Persone
for (const [w, n] of [["4p", 4], ["4 pers", 4], ["4 persone", 4], ["x4", 4], ["4px", 4], ["4pax", 4], ["3+1", 4], ["12", 12]]) is(`persone «${w}»`, `14/11 20:30 ${w} Rossi`, { people: n, name: "Rossi", errors: [] });
is("persone prima dell'ora («4p 20:30»)", "14/11 4p 20:30 Rossi", { people: 4, time: "20:30" });
err("61 persone → «Persone?»", "14/11 20:00 61 Troppi", I.E_PEOPLE);
err("0 persone → «Persone?»", "14/11 20:00 0 Nessuno", I.E_PEOPLE);
is("senza persone → «Persone da definire» (avviso giallo)", "14/11 20:30 Rossi", { time: "20:30", people: null, name: "Rossi", errors: [], warnings: [I.W_PEOPLE] });
is("senza ora né persone (dal librone: «Arianna, tel…, menù da 25 €») → da completare, con il menù", "14/11 Arianna 366 1234567 menù da 25 €", { time: null, people: null, name: "Arianna", phoneIntl: "393661234567", menu: "Menù da 25 €", note: "", errors: [], warnings: [I.W_TIME, I.W_PEOPLE] });
err("senza giorno resta un errore anche senza ora", "Arianna 366 1234567", I.E_DAY);

// Menù
is("«menù da 25 €» → campo Menù, non nella nota", "14/11 20:30 4 Rossi menù da 25 € seggiolone", { people: 4, name: "Rossi", menu: "Menù da 25 €", note: "seggiolone", errors: [] });
is("«menu 25€» (senza accento e attaccato) → «Menù da 25 €», e 25 non diventa le persone", "14/11 20:30 2 Bianchi menu 25€", { people: 2, menu: "Menù da 25 €", note: "", errors: [] });
is("«menù 30 euro»", "14/11 21:00 3 Verdi, menù 30 euro, compleanno", { menu: "Menù da 30 €", note: "compleanno", name: "Verdi" });
is("«menù degustazione»", "14/11 21:00 2 Neri menù degustazione", { menu: "Menù degustazione", name: "Neri", note: "", errors: [] });
is("menù in una colonna da Excel", "14/11/2026\t20:30\t4\tVerdi\tMenù 25 €\tcompleanno", { menu: "Menù da 25 €", name: "Verdi", note: "compleanno", errors: [] });
is("niente menù → null", "14/11 20:30 2 Rossi compleanno", { menu: null, note: "compleanno" });

// Telefono
is("telefono «+39 333 1234567»", "14/11 20:30 2 Rossi +39 333 1234567", { phoneIntl: "393331234567", name: "Rossi", note: "" });
is("telefono attaccato «3331234567»", "14/11 20:30 2 Rossi 3331234567 compleanno", { phoneIntl: "393331234567", note: "compleanno" });
is("fisso «02 1234567»", "14/11 20:30 2 Rossi 02 1234567", { phoneIntl: "39021234567", errors: [] });
is("telefono prima del nome", "14/11 20:30 2 333 123 4567 Rossi", { phoneIntl: "393331234567", name: "Rossi" });
is("«tel.» prima del numero non entra nel nome", "14/11 20:30 2 Rossi tel. 333 123 4567", { name: "Rossi", phoneIntl: "393331234567" });
is("il numero dopo il cellulare (10 cifre) va nella nota", "14/11 20:30 2 Rossi 333 123 4567 2 seggioloni", { phoneIntl: "393331234567", note: "2 seggioloni" });
err("cellulare incompleto → errore del telefono", "14/11 22:00 2 Bruno 333 12345", "Il numero sembra incompleto: un cellulare ha 10 cifre (es. 333 123 4567).");
{
  const r = one("14/11 22:00 2 Bruno 333 12345");
  const formErr = R.phoneProblem("333 12345", "email");
  check("…stesso testo del foglio «Nuova prenotazione» (phoneProblem)", r.errors.includes(formErr), formErr);
}

// Nome e nota
is("nome di due parole", "14/11 20:30 2 Mario Rossi", { name: "Mario Rossi", note: "" });
is("virgola: nome, poi nota", "14/11 20:30 2 Rossi, vicino alla finestra", { name: "Rossi", note: "vicino alla finestra" });
is("trattino: nome - nota", "14/11 20:30 2 Rossi - arrivano tardi", { name: "Rossi", note: "arrivano tardi" });
is("parentesi: nome (nota)", "14/11 20:30 2 Rossi (seggiolone)", { name: "Rossi", note: "seggiolone" });
is("parola da nota in minuscolo dopo il nome", "14/11 20:30 2 Rossi compleanno", { name: "Rossi", note: "compleanno" });
is("…ma «Mario Festa» (maiuscolo) resta il nome", "14/11 20:30 2 Mario Festa", { name: "Mario Festa", note: "" });
err("senza nome → «Manca il nome»", "14/11 20:30 4", I.E_NAME);
err("nome di una lettera → «Manca il nome»", "14/11 20:30 4 X", I.E_NAME);

// Allergie e tavolo
is("allergie nella nota (dopo il telefono)", "14/11 20:30 2 Rossi 3331234567 allergia alle noci", { allergies: true, note: "allergia alle noci" });
is("«celiaco» dopo il nome → nota e allergie", "14/11 20:30 2 Rossi celiaco", { name: "Rossi", note: "celiaco", allergies: true });
is("«seggiolone» non è un'allergia", "14/11 20:30 2 Rossi, seggiolone", { allergies: false });
for (const [w, t] of [["t5", "5"], ["T12", "12"], ["tav 5", "5"], ["tav. 3", "3"], ["tavolo 7", "7"], ["tavolo n. 4", "4"]]) is(`tavolo «${w}»`, `14/11 20:30 2 Rossi ${w}`, { table: t, name: "Rossi", note: "" });
is("tavolo in mezzo alla riga", "14/11 21:00 x6 t5 Rossi - vicino finestra", { table: "5", name: "Rossi", note: "vicino finestra", people: 6 });
is("«tavolo fuori» (senza numero) resta nella nota", "14/11 20:30 2 Rossi, tavolo fuori", { table: "", note: "tavolo fuori" });

// Riga del giorno (pagina del librone)
{
  const rows = parseImport("Sabato 21/11\n20:30 4 Rossi\n21:00 2 Bianchi 333 123 4567\n\n22/11 20:00 2 Verdi\ndom 22/11\n21:00 3 Neri", NOW);
  const [h, a, b, c, h2, d] = rows;
  check("riga col solo giorno («Sabato 21/11») → riga del giorno", h.kind === "day" && h.day === "2026-11-21" && h.errors.length === 0, got(h));
  check("…le righe sotto senza giorno lo prendono (con il numero della riga del giorno)", a.day === "2026-11-21" && a.dayFrom === 1 && b.day === "2026-11-21" && importable(a) && importable(b), `${got(a)} / ${got(b)}`);
  check("…una riga con il suo giorno tiene il suo", c.day === "2026-11-22" && c.dayFrom === null, got(c));
  check("…righe vuote saltate, numeri di riga del testo (la 5 è dopo una vuota)", c.line === 5 && h2.line === 6 && d.line === 7 && d.day === "2026-11-22" && d.dayFrom === 6);
  check("…nel conto solo le prenotazioni (4), non le righe del giorno", importCounts(rows).bookings === 4 && importCounts(rows).ok === 4, JSON.stringify(importCounts(rows)));
  const wrong = parseImport("sab 22/11\n20:30 2 Rossi", NOW);
  check("riga del giorno con il giorno della settimana sbagliato → avviso", wrong[0].kind === "day" && /non torna/.test(wrong[0].warnings[0] ?? "") && importable(wrong[1]), got(wrong[0]));
  const old = parseImport("10/11\n20:30 2 Rossi", NOW);
  check("riga del giorno già passato → errore, e le righe sotto non hanno il giorno", old[0].errors.includes(I.E_PAST) && old[1].errors.includes(I.E_DAY), `${got(old[0])} / ${got(old[1])}`);
}

// Ripetute nella stessa lista
{
  const rows = parseImport("14/11 20:30 4 Rossi 333 123 4567\n14/11 20:30 4 rossi +39 333 1234567\n14/11 21:30 2 Rossi\n14/11 20:30 4 Bianchi", NOW);
  check("riga uguale a una più in alto (anche scritta diversa) → ripetuta, non si segna", rows[1].repeatOf === 1 && !importable(rows[1]), got(rows[1]));
  check("stesso nome, altra ora → si segna, con l'avviso «Anche alla riga 1 c'è Rossi lo stesso giorno»", importable(rows[2]) && rows[2].warnings[0] === "Anche alla riga 1 c'è Rossi lo stesso giorno", got(rows[2]));
  const c = importCounts(rows);
  check("conto: 4 prenotazioni, 3 da segnare, 1 ripetuta", c.bookings === 4 && c.ok === 3 && c.repeats === 1 && c.errors === 0, JSON.stringify(c));
}
check("testo vuoto o di soli spazi → nessuna riga", parseImport("\n   \n\t\n", NOW).length === 0);

// Testi dell'interfaccia
check("«librone»: etichetta «Dal librone», frase «dal librone», non tra i pulsanti del foglio né online", R.SOURCE_LABEL.librone === "Dal librone" && F.sourceText("librone", null) === "dal librone" && !R.MANUAL_SOURCES.includes("librone") && R.normalizeSource("librone") === "altro");
check("riga dell'agenda: «Dal librone · Andrea»", F.originShort({ manual: true, source: "librone", createdBy: "Andrea" }) === "Dal librone · Andrea");
check("cronologia: «Segnata da Andrea (dal librone)»", F.logText({ at: 0, actor: "Andrea", kind: "CREATED", message: "dal librone · di prova" }).text === "Segnata da Andrea (dal librone)");

// ================= 2. Il servizio sul database di prova =================
const dbOk = new RegExp(`/${process.env.E2E_DB || "orari_test"}(\\?|$)`).test(process.env.DATABASE_URL || "");
const cleanImport = () => DB(`delete from "BookingRequest" where name like 'Prova Import%' or phone like '39300006%'`);
const savedSetting = snapshotBookingSetting();
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const today = businessDay(new Date());
const [D1, D2, D3] = [addDays(today, 3), addDays(today, 4), addDays(today, 5)];
let prisma = null;
if (!dbOk) {
  check("DATABASE_URL è il database di prova orari_test (altrimenti niente prove sul database)", false, process.env.DATABASE_URL ?? "");
} else {
  await waitOtherTests();
  onInterrupt(cleanImport);
  cleanImport();
  const S = await import("@/lib/booking/service");
  ({ prisma } = await import("@/lib/prisma"));
  const settings = await S.loadBookingSettings();
  const expectTest = !settings.agendaEnabled;
  const who = { name: "Prova Import Servizio" };
  try {
    // Già in agenda prima dell'import: stesso nome quel giorno.
    const pre = await S.createManualBooking({ day: D1, time: "20:00", people: 2, name: "Prova Import Doppio", phone: "", table: "", note: "", allergies: false, source: "telefono", force: true, dupOk: true }, who, null);
    check("servizio: prenotazione già in agenda per la prova dei doppioni", pre.ok, JSON.stringify(pre).slice(0, 160));
    const text = [
      `${dmy(D1)} 20:30 4 Prova Import Rossi 300 006 0001 seggiolone t5`,
      `${dmy(D1)} 21:00 2 Prova Import Doppio`,
      `${dmy(D1)} 21:30 2 Prova Import Rossi`,
      `${dmy(D1)} 20:30 4 Prova Import Rossi 300 006 0001 seggiolone t5`,
      `${dmy(addDays(today, -3))} 20:00 2 Prova Import Passato`,
      `${dmy(D2)} 08:00 3 Prova Import Mattina, celiaco`,
      `${dmy(D2)} 00:30 2 Prova Import Notte`,
      `${dmy(D2)} Prova Import Arianna 300 006 0009 menù da 25 €`,
    ].join("\n");
    const before = DB(`select count(*) from "BookingRequest" where name like 'Prova Import%'`);
    const dry = await S.importManualBookings(text, [], who, { dryRun: true });
    const byLine = (res, l) => res.results.find((r) => r.line === l);
    check("anteprima: niente salvato", dry.ok && DB(`select count(*) from "BookingRequest" where name like 'Prova Import%'`) === before);
    check("anteprima: una risposta per prenotazione (8), con la stessa impronta della lettura nel browser", dry.ok && dry.results.length === 8 && dry.results.every((r, i) => r.sig === I.importSig(parseImport(text, new Date())[i])));
    check("anteprima: «Prova Import Doppio» già in agenda → «C'è già Prova Import Doppio alle 20:00 (2 persone)», non si segna", dry.ok && byLine(dry, 2).dup === "C'è già Prova Import Doppio alle 20:00 (2 persone)" && byLine(dry, 2).skippedDuplicate === true && !byLine(dry, 2).ok, JSON.stringify(byLine(dry, 2)));
    check("anteprima: due «Rossi» diversi nella lista → tutti e due da segnare", dry.ok && byLine(dry, 1).ok && byLine(dry, 3).ok);
    check("anteprima: riga ripetuta → repeatOf 1", dry.ok && byLine(dry, 4).repeatOf === 1 && !byLine(dry, 4).ok);
    check("anteprima: giorno passato → errore «Giorno già passato»", dry.ok && byLine(dry, 5).error === I.E_PAST);
    check("anteprima: ora fuori apertura → avviso («… risulta chiuso»), ma si segna", dry.ok && byLine(dry, 6).ok && /risulta chiuso/.test(byLine(dry, 6).warning ?? ""), JSON.stringify(byLine(dry, 6)));
    check("anteprima: isTest come «Nuova prenotazione» (agenda spenta → di prova)", dry.ok && dry.isTest === expectTest);

    const res = await S.importManualBookings(text, [], who, { dryRun: false });
    const okLines = res.ok ? res.results.filter((r) => r.ok).map((r) => r.line) : [];
    check("import: segnate le righe 1, 3, 6, 7, 8 (doppione, ripetuta e passata saltate; la 8 senza ora e persone)", JSON.stringify(okLines) === "[1,3,6,7,8]", JSON.stringify(res).slice(0, 300));
    const saved = await prisma.bookingRequest.findMany({ where: { id: { in: res.results.filter((r) => r.id).map((r) => r.id) } }, include: { log: true }, orderBy: { startsAt: "asc" } });
    check(
      "import: confermate, a mano, «librone», createdBy e handledBy = chi importa, isTest come l'agenda",
      saved.length === 5 && saved.every((b) => b.status === "CONFIRMED" && b.manual && b.source === "librone" && b.createdBy === who.name && b.handledBy === who.name && b.isTest === expectTest && b.contact === "whatsapp"),
      JSON.stringify(saved.map((b) => [b.status, b.source, b.createdBy, b.isTest])),
    );
    check(
      "import: cronologia «CREATED» come «Nuova prenotazione» («dal librone · di prova»)",
      saved.every((b) => b.log.length === 1 && b.log[0].kind === "CREATED" && b.log[0].actor === who.name && b.log[0].message === `dal librone${expectTest ? " · di prova" : ""}`),
      JSON.stringify(saved.map((b) => b.log.map((l) => l.message))),
    );
    const rossi = saved.find((b) => b.phone === "393000060001");
    check("import: telefono, tavolo e nota come letti", rossi && rossi.table === "5" && rossi.note === "seggiolone" && rossi.people === 4 && rossi.time === "20:30" && rossi.day === D1, JSON.stringify(rossi));
    const mattina = saved.find((b) => b.name === "Prova Import Mattina");
    check("import: «celiaco» nella nota → allergie", mattina && mattina.allergies && mattina.note === "celiaco");
    const notte = saved.find((b) => b.name === "Prova Import Notte");
    check("import: 00:30 → dopo mezzanotte della stessa serata", notte && notte.startsAt.getTime() === romeInstant(D2, 24 * 60 + 30).getTime());
    const arianna = saved.find((b) => b.name === "Prova Import Arianna");
    check(
      "import: riga senza ora e persone → prenotazione vera da completare (ora e persone da definire, menù, 5:00 del giorno)",
      arianna && arianna.timeUnknown && arianna.peopleUnknown && arianna.time === "" && arianna.people === 0 && arianna.menu === "Menù da 25 €" && arianna.status === "CONFIRMED" && arianna.startsAt.getTime() === romeInstant(D2, 5 * 60).getTime() && !arianna.note,
      JSON.stringify(arianna),
    );
    check("import: codice e link del cliente come le altre (tokenHash vero, non «tmp_»)", saved.every((b) => /^[A-Z0-9]{6}$/.test(b.code) && !b.tokenHash.startsWith("tmp_")));

    const again = await S.importManualBookings(text, [], who, { dryRun: false });
    check("import rifatto (doppio tocco): niente di nuovo, ora sono tutte già in agenda", again.ok && again.results.every((r) => !r.ok) && DB(`select count(*) from "BookingRequest" where name like 'Prova Import%' and source='librone'`) === "5", JSON.stringify(again).slice(0, 200));
    const kept = await S.importManualBookings(`${dmy(D1)} 21:00 2 Prova Import Doppio`, [1], who, { dryRun: false });
    check("«Importa lo stesso» su un doppione → segnato", kept.ok && kept.results[0].ok && kept.results[0].dup && DB(`select count(*) from "BookingRequest" where name='Prova Import Doppio'`) === "2", JSON.stringify(kept));

    const big = Array.from({ length: 201 }, (_, i) => `${dmy(D3)} 20:00 2 Prova Import Tanti ${i}`).join("\n");
    const tooMany = await S.importManualBookings(big, [], who, { dryRun: true });
    check("più di 200 prenotazioni → «Al massimo 200…», niente salvato", !tooMany.ok && /Al massimo 200/.test(tooMany.error), JSON.stringify(tooMany).slice(0, 120));
    const empty = await S.importManualBookings("", [], who, { dryRun: false });
    check("lista vuota → nessuna riga, nessun errore", empty.ok && empty.results.length === 0);
  } catch (e) {
    check("le prove del servizio sono arrivate in fondo", false, e?.stack ?? String(e));
  }
}

// ================= 3. Il foglio nel browser =================
if (dbOk && process.argv.includes("--browser")) {
  const shots = SHOTS || null;
  if (shots) mkdirSync(shots, { recursive: true });
  await waitServer();
  const browser = await launch();
  const S = await import("@/lib/booking/service");
  const who = { name: "Prova Import Pre" };
  const wd = (d) => ["lun", "mar", "mer", "gio", "ven", "sab", "dom"][weekdayOf(d)];
  const dm = (d) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  const past = addDays(today, -2);
  const contexts = [
    ["tel-chiaro", { width: 390, height: 844 }, "light", true],
    ["tel-scuro", { width: 390, height: 844 }, "dark", true],
    ["pc-chiaro", { width: 1440, height: 900 }, "light", false],
    ["pc-scuro", { width: 1440, height: 900 }, "dark", false],
  ];
  try {
    for (const [label, viewport, theme, phone] of contexts) {
      const first = label === "tel-chiaro";
      const tag = label.replace("-", " ");
      const ctx = await browser.newContext({
        viewport,
        deviceScaleFactor: phone ? 2 : 1,
        isMobile: phone,
        hasTouch: phone,
        locale: "it-IT",
        timezoneId: "Europe/Rome",
        ...(phone ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" } : {}),
      });
      await ctx.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
          localStorage.setItem("install-banner-dismissed", "1");
          localStorage.setItem("prenotazioni-avvisi-non-ora", "1");
          localStorage.setItem("prenotazioni-iphone-non-ora", "1");
          sessionStorage.setItem("employee-install-prompt-dismissed", "1");
          sessionStorage.setItem("festa-8-anni-vista", "1");
        } catch {}
      }, theme);
      const p = await ctx.newPage();
      p.setDefaultTimeout(30000);
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      p.on("dialog", (d) => d.accept().catch(() => {}));
      await login(p, "andrea", ADMIN_PW);
      await p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
      const shot = async (name) => {
        if (!shots) return;
        await wait(400);
        await p.screenshot({ path: path.join(shots, `${label}-${name}.png`), fullPage: false });
      };
      // «Importa dal librone» sta nel menù «⋯» della barra, accanto a «+ Prenotazione».
      await p.getByRole("button", { name: "Altre azioni" }).click();
      const open = p.getByRole("menuitem", { name: /^Importa dal librone/ });
      check(`[${tag}] «⋯» → «Importa dal librone», con «+ Prenotazione» nella barra`, (await open.count()) === 1 && (await p.getByRole("button", { name: "Nuova prenotazione" }).count()) >= 1);
      if (first && shots) await p.screenshot({ path: path.join(shots, `${label}-0-pagina.png`) });
      await open.click();
      const sheet = p.getByRole("dialog", { name: "Importa dal librone" });
      await sheet.waitFor();
      check(`[${tag}] il foglio si apre con la spiegazione e l'esempio`, /Una prenotazione per riga/.test(await sheet.innerText()) && (await sheet.locator("pre").count()) === 1);
      const btn = sheet.getByRole("button", { name: /^Segna/ });
      check(`[${tag}] vuoto: pulsante «Segna in agenda» spento`, (await btn.isDisabled()) && (await btn.innerText()).trim() === "Segna in agenda");
      await shot("1-vuoto");

      // Uno già in agenda (per l'avviso giallo).
      const dupName = `Prova Import Doppio ${tag}`;
      await S.createManualBooking({ day: D1, time: "20:00", people: 2, name: dupName, phone: "", table: "", note: "", allergies: false, source: "telefono", force: true, dupOk: true }, who, null);
      const n = `${contexts.findIndex((c) => c[0] === label)}`;
      const list = [
        `${dm(D1)} 20:30 4 Prova Import Rossi ${tag} 300 006 1${n}01 seggiolone`,
        `${wd(D2)} ${dm(D2)}; 21:00; 2; Prova Import Bianchi ${tag}`,
        `${dm(D1)} 21:00 2 ${dupName}`,
        `20:30 4 Prova Import Senza giorno`,
        `${dm(past)} 20:00 2 Prova Import Passato`,
        `${dm(D1)} 20:30 4 Prova Import Rossi ${tag} 300 006 1${n}01 seggiolone`,
        `${dm(D2)} 22:00 x3 Prova Import Verdi ${tag} t5 - celiaco, arrivano tardi`,
      ].join("\n");
      await sheet.getByLabel("Prenotazioni da importare").fill(list);
      const row = (l) => sheet.locator(`[data-testid="import-row"][data-line="${l}"]`);
      await row(3).and(p.locator('[data-state="dup"]')).waitFor({ timeout: 20000 });
      const states = await sheet.locator('[data-testid="import-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")).join(","));
      if (first) {
        check("anteprima: stati ok, ok, già in agenda, errore, errore, ripetuta, ok", states === "ok,ok,dup,error,error,repeat,ok", states);
        check("anteprima: «Giorno non letto» in rosso sulla riga senza giorno", /Giorno non letto/.test(await row(4).innerText()));
        check("anteprima: «Giorno già passato» sulla riga passata", /Giorno già passato/.test(await row(5).innerText()));
        check("anteprima: «Uguale alla riga 1: non la segno due volte»", /Uguale alla riga 1: non la segno due volte/.test(await row(6).innerText()));
        check("anteprima: giorno, ora e persone come letti («… · 20:30 · 4 pers.»), telefono leggibile", new RegExp(`${R.dayShort(D1)} · 20:30 · 4 pers\\.`).test(await row(1).innerText()) && /\+39 300 006 1\d{3}/.test(await row(1).innerText()), await row(1).innerText());
        check("anteprima: tavolo, allergie e nota sulla riga 7", /Tavolo 5/.test(await row(7).innerText()) && /Allergie/.test(await row(7).innerText()) && /«celiaco, arrivano tardi»/.test(await row(7).innerText()), await row(7).innerText());
        check("anteprima: «C'è già … alle 20:00 (2 persone): non la segno» con «Importa lo stesso»", /C'è già .* alle 20:00 \(2 persone\): non la segno/.test(await row(3).innerText()) && (await row(3).getByRole("checkbox", { name: "Importa lo stesso" }).count()) === 1);
        check("pulsante «Segna 3 prenotazioni in agenda»", (await btn.innerText()).trim() === "Segna 3 prenotazioni in agenda", await btn.innerText());
        check("riepilogo «3 da segnare · 2 da correggere · 1 già in agenda · 1 ripetuta»", /3 da segnare · 2 da correggere · 1 già in agenda · 1 ripetuta/.test(await sheet.getByTestId("import-riepilogo").innerText()), await sheet.getByTestId("import-riepilogo").innerText());
        const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check("telefono: niente scorrimento di lato", wide <= 0, `${wide}px`);
      }
      await shot("2-anteprima");
      if (phone) {
        await sheet.locator('[data-testid="import-row"]').last().scrollIntoViewIfNeeded();
        await shot("2b-anteprima-fondo");
      }
      await row(3).getByRole("checkbox", { name: "Importa lo stesso" }).check();
      if (first) check("«Importa lo stesso» spuntato → «Segna 4 prenotazioni in agenda»", (await btn.innerText()).trim() === "Segna 4 prenotazioni in agenda" && (await row(3).getAttribute("data-state")) === "dup-kept");
      await btn.click();
      await p.getByText(/Segnate 4 prenotazioni/).first().waitFor({ timeout: 30000 });
      check(`[${tag}] dopo il salvataggio: messaggio «Segnate 4 prenotazioni»`, true);
      const left = await sheet.getByLabel("Prenotazioni da importare").inputValue();
      check(`[${tag}] il foglio resta aperto con le 2 righe da correggere`, (await sheet.isVisible()) && left.split("\n").length === 2 && /Senza giorno/.test(left) && /Passato/.test(left), JSON.stringify(left));
      check(`[${tag}] riepilogo «Segnate 4 prenotazioni. Queste 2 righe non sono state segnate…»`, /Segnate 4 prenotazioni\. Queste 2 righe non sono state segnate/.test(await sheet.innerText()));
      const inDb = DB(`select count(*) from "BookingRequest" where source='librone' and name like '%${tag}' and "createdBy" is not null`);
      check(`[${tag}] nel database: 4 «dal librone» (anche il doppione tenuto)`, inDb === "4", inDb);
      await shot("3-dopo");
      if (first) {
        // Si corregge una riga e si segna: il foglio si chiude.
        await sheet.getByLabel("Prenotazioni da importare").fill(`${dm(D2)} 20:30 4 Prova Import Corretta ${tag}`);
        await sheet.getByRole("button", { name: "Segna 1 prenotazione in agenda" }).click();
        await p.getByText("Segnata 1 prenotazione").first().waitFor();
        await sheet.waitFor({ state: "detached" });
        check("riga corretta e segnata → «Segnata 1 prenotazione», il foglio si chiude", true);
        // Nella pagina: si trova con la ricerca, con «Dal librone».
        await p.getByRole("button", { name: "Altre azioni" }).click();
        await p.getByRole("menuitem", { name: /^Cerca/ }).click();
        await p.getByRole("dialog", { name: "Cerca una prenotazione" }).getByRole("searchbox").fill(`Prova Import Bianchi ${tag}`);
        const res = p.getByRole("region", { name: "Risultati della ricerca" });
        await res.getByText(`Prova Import Bianchi ${tag}`).first().waitFor();
        check("nella pagina: la prenotazione importata dice «Dal librone · …»", /Dal librone/.test(await res.innerText()), (await res.innerText()).slice(0, 200));
        await res.getByText(`Prova Import Bianchi ${tag}`).first().click();
        const det = p.getByRole("dialog").last();
        await det.getByText(/dal librone/i).first().waitFor();
        await det.getByText("Cronologia").click();
        await det.getByText(/Segnata da .* \(dal librone\)/).first().waitFor();
        check("scheda della prenotazione: «Dal librone · segnata da …» e «Segnata da … (dal librone)»", /Dal librone · segnata da/i.test(await det.innerText()) && /Segnata da .* \(dal librone\)/.test(await det.innerText()));
        await shot("4-scheda");
      }
      check(`[${tag}] nessun errore nella pagina`, errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
  } catch (e) {
    check("le prove nel browser sono arrivate in fondo", false, e?.stack ?? String(e));
  } finally {
    await browser.close();
  }
}

if (dbOk) {
  cleanImport();
  check("pulizia: nessuna prenotazione «Prova Import» rimasta", DB(`select count(*) from "BookingRequest" where name like 'Prova Import%' or phone like '39300006%'`) === "0");
  check("pulizia: impostazione «bookings» come prima (non toccata)", snapshotBookingSetting() === savedSetting);
  await prisma?.$disconnect();
}
process.exit(finish());
