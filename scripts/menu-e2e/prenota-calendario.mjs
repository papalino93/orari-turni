// Prenotazioni, AGENDA A CALENDARIO (Giorno · Settimana · Mese), E2E sul server di prova:
// vista di partenza per dispositivo e vista ricordata, «Oggi», frecce, tastiera, scelta della data,
// totali (confermate, da confermare, da definire; le prove non contano), fasce di mezz'ora, dopo
// mezzanotte, cambio d'ora, eventi del menù che compaiono da soli, orari e giorni chiusi, «N in più»,
// giorno che si apre dalla settimana e dal mese, dettaglio, «+ Prenotazione» sul giorno aperto, prenotazione
// «da definire» (creazione, avvisi, conferma bloccata, «Completa i dati»), menù (foglio, riga, ricerca),
// note del giorno, «In servizio», giorno da 120 prenotazioni veloce, niente scorrimento orizzontale.
// Dati: scripts/menu-e2e/agenda-seed.mjs (id «agv_…»), cancellati alla fine; impostazione «bookings»
// rimessa com'era. Uso: node scripts/menu-e2e/prenota-calendario.mjs   (SHOTS=<cartella> per le foto)
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import {
  BASE,
  ROOT,
  ADMIN_PW,
  SHOTS,
  check,
  finish,
  DB,
  q,
  onInterrupt,
  snapshotBookingSetting,
  restoreBookingSetting,
  setBookingSetting,
  launch,
  newContext,
  login,
  waitServer,
  waitOtherTests,
} from "./prenota-lib.mjs";
import { seedAgenda, cleanAgendaSeed, addDays } from "./agenda-seed.mjs";

// ---------- Parte del servizio (npx tsx … --servizio): regole delle prenotazioni da definire.
if (process.argv.includes("--servizio")) {
  const { loadEnvLocal } = await import("./prenota-lib.mjs");
  loadEnvLocal();
  delete process.env.VERCEL_ENV;
  if (!new RegExp(`/${process.env.E2E_DB || "orari_test"}(\\?|$)`).test(process.env.DATABASE_URL || "")) process.exit(2);
  const S = await import("@/lib/booking/service");
  const R = await import("@/lib/booking/rules");
  const A = await import("@/lib/booking/agenda");
  const { whatsappPending } = await import("@/lib/booking/whatsapp-queue");
  const { customerMessage } = await import("@/lib/booking/messages");
  const { prisma } = await import("@/lib/prisma");
  const day = process.argv[process.argv.indexOf("--servizio") + 1];
  const who = { name: "Agv Servizio" };
  const base = { day, time: "", people: 0, name: "Agv Servizio Arianna", phone: "366 123 4567", table: "", note: "", allergies: false, source: "telefono", dupOk: true, force: true };
  try {
    const e1 = await S.createManualBooking({ ...base, time: "", timeUnknown: false, people: 2 }, who, null);
    check("servizio: ora vuota senza «Ancora da definire» → errore sull'ora", !e1.ok && e1.field === "time", JSON.stringify(e1));
    const e2 = await S.createManualBooking({ ...base, time: "20:00", people: 0 }, who, null);
    check("servizio: persone 0 senza «Ancora da definire» → errore sulle persone", !e2.ok && e2.field === "people", JSON.stringify(e2));
    const c = await S.createManualBooking({ ...base, timeUnknown: true, peopleUnknown: true, menu: "menu da 25 euro" }, who, "http://localhost:3100");
    check("servizio: «Ancora da definire» per ora e persone → salvata, confermata", c.ok && c.booking.status === "CONFIRMED" && c.booking.timeUnknown && c.booking.peopleUnknown, JSON.stringify(c).slice(0, 200));
    if (c.ok) {
      const b = c.booking;
      check("servizio: ora da definire → time vuoto e startsAt alle 5:00 del giorno (resta in quel giorno)", b.time === "" && b.people === 0 && b.startsAt.getTime() === R.romeInstant(day, 300).getTime() && R.businessDay(b.startsAt) === day);
      check("servizio: menù scritto pulito («Menù da 25 €»)", b.menu === "Menù da 25 €", b.menu);
      check("servizio: niente conferma WhatsApp con un orario inventato (link null)", c.whatsappHref === null);
      const qd = await S.queueConfirmation(b.id, who);
      check("servizio: «Da mandare dal telefono del locale» rifiutato finché mancano ora e persone", !qd.ok && /ora e persone/.test(qd.error), JSON.stringify(qd));
      const fake = [{ at: new Date(), actor: "Marta", kind: "WA_QUEUED", message: null }];
      check("servizio: mai nella lista «Da mandare su WhatsApp» mentre è da completare", whatsappPending({ ...b, startsAt: new Date(Date.now() + 86400000), log: fake }, Date.now()) === null);
      const msg = customerMessage("cancelledByVenue", { name: b.name, day: b.day, time: "", people: 0, statusUrl: "x" });
      check("servizio: messaggio di annullo senza ora («il tavolo di <giorno>.»), mai «alle »", !/ alle /.test(msg) && msg.includes(R.dayLong(day)), msg.slice(0, 120));
      const todo = await S.bookingsToDo();
      check("servizio: conteggio «da completare» per il pallino del menù (non di prova)", todo.incomplete >= (b.isTest ? 0 : 1), JSON.stringify(todo));
      const u = await S.updateBooking(b.id, { ...base, time: "20:30", people: 4, timeUnknown: false, peopleUnknown: false, menu: "Menù da 25 €", force: true }, R.editVersion(b), who, "http://localhost:3100");
      const log = u.ok ? await prisma.bookingLog.findFirst({ where: { requestId: b.id, kind: "UPDATED" } }) : null;
      check("servizio: «Completa i dati» → ora e persone salvate, startsAt alle 20:30", u.ok && !u.booking.timeUnknown && !u.booking.peopleUnknown && u.booking.time === "20:30" && u.booking.people === 4 && u.booking.startsAt.getTime() === R.romeInstant(day, 20 * 60 + 30).getTime(), JSON.stringify(u).slice(0, 200));
      check("servizio: cronologia «ora da definire → 20:30, persone da definire → 4»", /ora da definire → 20:30/.test(log?.message ?? "") && /persone da definire → 4/.test(log?.message ?? ""), log?.message);
      check("servizio: completata → ora si può mandare la conferma (link WhatsApp pronto)", u.ok && (u.whatsappHref ?? "").startsWith("https://wa.me/39366"));
      await prisma.bookingRequest.deleteMany({ where: { id: b.id } });
    }
    // Fasce di mezz'ora e riepilogo (funzioni pure)
    const mk = (over) => ({ id: Math.random().toString(36), status: "CONFIRMED", day, time: "20:00", startsAt: 0, people: 2, name: "x", phone: "", note: null, allergies: false, table: null, menu: null, source: null, promoTitle: null, manual: true, createdBy: null, arrivedAt: null, noShowAt: null, isTest: false, timeUnknown: false, peopleUnknown: false, proposedTime: null, proposedStartsAt: null, createdAt: 0, wasInAgenda: true, ...over });
    const g = A.groupByTime([mk({ time: "20:45" }), mk({ time: "20:30" }), mk({ time: "00:30" }), mk({ timeUnknown: true, time: "" }), mk({ time: "19:59" }), mk({ time: "20:00", isTest: true, people: 9 })], false);
    check("fasce: «Ora da definire» prima, poi 19:30, 20:00, 20:30 (20:30 e 20:45 insieme), 00:30 in fondo", g.map((x) => `${x.label}:${x.rows.length}`).join(",") === "Ora da definire:1,19:30:1,20:00:1,20:30:2,00:30:1", g.map((x) => `${x.label}:${x.rows.length}`).join(","));
    check("fasce: le prove non contano nei totali della fascia (agenda accesa)", g.find((x) => x.label === "20:00").count === 0);
    const s = A.summarize([mk({ people: 4 }), mk({ peopleUnknown: true, people: 0 }), mk({ status: "PENDING", startsAt: Date.now() + 3600000 }), mk({ isTest: true, people: 7 })], false, Date.now());
    check("riepilogo: 2 confermate · 4 persone, 1 con persone da definire, 1 da confermare, prova esclusa", s.count === 2 && s.people === 4 && s.peopleUnknown === 1 && s.pending === 1, JSON.stringify(s));
    check("periodi: settimana da lunedì (anche a cavallo del cambio d'ora)", JSON.stringify(A.periodRange("week", "2027-03-28")) === JSON.stringify({ from: "2027-03-22", to: "2027-03-28" }));
    check("periodi: mese a settimane intere (novembre 2026: 26 ott – 6 dic)", JSON.stringify(A.periodRange("month", "2026-11-13")) === JSON.stringify({ from: "2026-10-26", to: "2026-12-06" }));
    check("periodi: «Mese dopo» dal 31 gennaio → 28 febbraio", A.shiftPeriod("month", "2027-01-31", 1) === "2027-02-28");
    check("titoli: «Novembre 2026», «Sabato 14 novembre», settimana a cavallo «Nov – dic 2026»", A.periodTitle("week", "2026-11-13", "2026-11-13") === "Novembre 2026" && A.periodTitle("day", "2026-11-14", "2026-11-13") === "Sabato 14 novembre" && A.periodTitle("week", "2026-12-01", "2026-11-13") === "Nov – dic 2026");
    check("pienezza: capienza 50 se non impostata; colori tranquillo/si riempie/quasi pieno/oltre", A.capacityOf(0) === 50 && A.fullness(10, 50) === 1 && A.fullness(30, 50) === 2 && A.fullness(45, 50) === 3 && A.fullness(51, 50) === 4);
    check("ricerca: nome, cifre del telefono, nota, menù", A.matchesSearch(mk({ name: "Rossi" }), "ross") && A.matchesSearch(mk({ phone: "393331234567" }), "123 45") && A.matchesSearch(mk({ menu: "Menù degustazione" }), "degust") && !A.matchesSearch(mk({ name: "Bianchi" }), "ross"));
  } catch (e) {
    check("le prove del servizio sono arrivate in fondo", false, e?.stack ?? String(e));
  }
  process.exit(finish());
}

// =====================================================================================================
const saved = snapshotBookingSetting();
const restore = () => {
  try {
    cleanAgendaSeed();
  } finally {
    restoreBookingSetting(saved);
  }
};
onInterrupt(restore);
let browser;
const shot = async (p, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${SHOTS}/${name}.png` });
};
try {
  await waitServer();
  await waitOtherTests();
  setBookingSetting({ agendaEnabled: true, enabled: false });
  const S = seedAgenda();
  const { today, BIG, FULLREQ, CLOSED } = S;
  const FREE = addDays(today, 9);

  // Servizio (deterministico, senza browser)
  {
    const out = (() => {
      try {
        return execFileSync("npx", ["tsx", "scripts/menu-e2e/prenota-calendario.mjs", "--servizio", FREE], { cwd: ROOT, env: process.env }).toString();
      } catch (e) {
        return String(e.stdout ?? "") + String(e.stderr ?? "");
      }
    })();
    for (const l of out.split("\n")) {
      const m = l.match(/^(OK  |FAIL) (.*)$/);
      if (m) check(m[2], m[1] === "OK  ");
    }
  }

  browser = await launch();
  const ctxFor = async (kind, viewport) => {
    const ctx = await newContext(browser, kind, viewport ? { viewport, deviceScaleFactor: 1 } : {});
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("prenotazioni-avvisi-non-ora", "1");
        localStorage.setItem("prenotazioni-iphone-non-ora", "1");
      } catch {}
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.errs = [];
    p.on("pageerror", (e) => p.errs.push(e.message));
    p.on("dialog", (d) => d.accept().catch(() => {}));
    await login(p, "andrea", ADMIN_PW);
    return { ctx, p };
  };
  const agenda = (p) => p.getByRole("region", { name: "Agenda", exact: true });
  const go = async (p) => {
    await p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    await agenda(p).waitFor();
  };
  const vista = (p) => agenda(p).getAttribute("data-vista");
  const title = (p) => agenda(p).getByTestId("agenda-titolo").innerText();
  const pick = async (p, day) => {
    await agenda(p).getByLabel("Scegli la data").fill(day);
    await p.waitForTimeout(300);
  };
  const setView = async (p, label) => {
    await agenda(p).getByRole("radiogroup", { name: "Vista dell'agenda" }).getByRole("radio", { name: label }).click();
    await p.waitForTimeout(300);
  };
  const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const rows = (p) => agenda(p).getByTestId("agenda-riga");
  const waitRows = (p, name) => agenda(p).getByTestId("agenda-riga").filter({ hasText: name }).first().waitFor({ timeout: 20000 });
  const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const WD = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
  const MO = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const dayTitle = (d) => `${capital(WD[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7])} ${Number(d.slice(8))} ${MO[Number(d.slice(5, 7)) - 1]}${d.slice(0, 4) !== today.slice(0, 4) ? ` ${d.slice(0, 4)}` : ""}`;

  // ================= Vista di partenza e vista ricordata =================
  const phone = await ctxFor("phone");
  const P = phone.p;
  await go(P);
  check("telefono: si parte dalla vista Giorno, su oggi", (await vista(P)) === "day" && (await title(P)) === dayTitle(today), `${await vista(P)} ${await title(P)}`);
  const mac = await ctxFor("desktop", { width: 1440, height: 900 });
  const M = mac.p;
  await go(M);
  check("computer: si parte dalla vista Settimana («Novembre 2026» come Google)", (await vista(M)) === "week" && /^[A-Z][a-z]+ \d{4}$|–/.test(await title(M)), `${await vista(M)} ${await title(M)}`);
  const tab = await ctxFor("desktop", { width: 768, height: 1024 });
  const T = tab.p;
  await go(T);
  check("tablet verticale (768): si parte dalla Settimana", (await vista(T)) === "week");
  await setView(M, "Mese");
  await go(M);
  check("vista ricordata su questo dispositivo (Mese dopo aver ricaricato)", (await vista(M)) === "month");
  await setView(M, "Settimana");

  // ================= Oggi, frecce, tastiera, data =================
  const w0 = await title(M);
  await agenda(M).getByRole("button", { name: "Settimana dopo" }).click();
  await M.waitForTimeout(300);
  const w1 = await agenda(M).getByRole("columnheader").first().innerText();
  await agenda(M).getByRole("button", { name: "Settimana prima" }).click();
  await M.waitForTimeout(300);
  const w2 = await agenda(M).getByRole("columnheader").first().innerText();
  check("frecce della settimana: avanti e indietro di 7 giorni (colonne da lunedì)", /^LUN/.test(w1) && /^LUN/.test(w2) && w1 !== w2, `${w1.replace(/\n/g, " ")} → ${w2.replace(/\n/g, " ")}`);
  await M.keyboard.press("ArrowRight");
  await M.waitForTimeout(300);
  const k1 = await agenda(M).getByRole("columnheader").first().innerText();
  await M.keyboard.press("t");
  await M.waitForTimeout(300);
  check("tastiera: → settimana dopo, «t» torna a oggi", k1 === w1 && (await agenda(M).getByRole("columnheader").first().innerText()) === w2 && (await title(M)) === w0);
  check("«Oggi» segnato quando oggi è in vista", (await agenda(M).getByRole("button", { name: "Oggi", exact: true }).getAttribute("aria-current")) === "date");
  const todayHead = agenda(M).getByRole("columnheader").filter({ hasText: String(Number(today.slice(8))) }).first();
  const circle = await todayHead.locator("span.rounded-full").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  check("oggi nella settimana: numero nel cerchio color vino", circle !== "rgba(0, 0, 0, 0)" && circle !== "transparent", circle);
  await pick(P, BIG);
  check("scelta della data (telefono): titolo del giorno «Lunedì 16 novembre»", (await title(P)) === dayTitle(BIG), await title(P));

  // ================= Giorno da 120 prenotazioni =================
  await go(P);
  const t0 = Date.now();
  await pick(P, BIG);
  await waitRows(P, "Agv Nottambuli");
  const ms = Date.now() - t0;
  check(`giorno con 120 prenotazioni: pronto in meno di 2,5 s (${ms} ms)`, ms < 2500, `${ms} ms`);
  const counted = DB(`select count(*)||'|'||sum(people) from "BookingRequest" where day=${q(BIG)} and status='CONFIRMED' and not "isTest"`).split("|");
  const tot = await agenda(P).getByTestId("agenda-totali").innerText();
  check(`totali: ${counted[0]} prenotazioni · ${counted[1]} persone (le prove non contano)`, tot.trim() === `${counted[0]} prenotazioni · ${counted[1]} persone` && Number(counted[0]) === 120, tot);
  const extra = await agenda(P).getByTestId("agenda-totali-extra").innerText();
  check("totali: «+ 4 da confermare», «+ 2 con persone da definire», «2 con l'ora da definire»", /\+ 4 da confermare/.test(extra) && /\+ 2 con persone da definire/.test(extra) && /2 con l'ora da definire/.test(extra), extra);
  const rowCount = await rows(P).count();
  check("righe: 120 confermate + 4 da confermare + 2 di prova + 1 annullata", rowCount === 127, String(rowCount));
  const groups = await agenda(P).locator("section[data-gruppo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-gruppo")));
  check("fasce: «Ora da definire» in cima, poi dalle 18:30, l'ultima dopo mezzanotte (01:00)", groups[0] === "da-definire" && groups[1] === "ore-1830" && groups[groups.length - 1] === "ore-0100", groups.join(","));
  const g2030 = agenda(P).locator('section[data-gruppo="ore-2030"]');
  check("fascia 20:30: «20:45» scritta sulla riga, le 20:30 no", (await g2030.getByTestId("agenda-riga").filter({ hasText: "20:45" }).count()) > 0, "");
  const nightHead = await agenda(P).locator('section[data-gruppo="ore-0030"] h3').innerText();
  check("00:30 nella stessa serata, con «dopo mezzanotte»", /00:30/.test(nightHead) && /dopo mezzanotte/.test(nightHead) && (await agenda(P).locator('section[data-gruppo="ore-0030"]').innerText()).includes("Agv Nottambuli"), nightHead);
  const pend = rows(P).filter({ hasText: "Agv Richiesta 1" });
  check("richiesta online al suo posto, tratteggiata, «Da confermare»", (await pend.innerText()).includes("Da confermare") && /dashed/.test(await pend.evaluate((el) => getComputedStyle(el).outlineStyle)));
  const inc = rows(P).filter({ hasText: "Agv Dainelli" });
  check("da definire: «Mancano: ora, persone» in giallo e «?» al posto delle persone", (await inc.innerText()).includes("Mancano: ora, persone") && (await inc.innerText()).startsWith("?"));
  check("«Manca il numero» sulla riga senza telefono", (await rows(P).filter({ hasText: "Agv Senza numero" }).innerText()).includes("Manca il numero"));
  check("telefono toccabile per chiamare", (await rows(P).filter({ hasText: "Agv Allergici" }).getByRole("link", { name: /^Chiama/ }).getAttribute("href"))?.startsWith("tel:+39"));
  check("allergie in rosso sulla riga", (await rows(P).filter({ hasText: "Agv Allergici" }).innerText()).includes("⚠ Allergie"));
  check("menù sulla riga", (await rows(P).filter({ hasText: "Agv Con menù" }).innerText()).includes("Menù degustazione"));
  check("annullata barrata in fondo", (await rows(P).last().innerText()).includes("Agv Annullata"));
  // Evento, nota, orari
  const head = await agenda(P).innerText();
  check("evento del menù nel giorno («Degustazione Brunello · dalle 19:00»), link alla sua pagina", head.includes("Degustazione Brunello") && (await agenda(P).getByRole("link", { name: /Degustazione Brunello/ }).getAttribute("href")) === "/menu/p/agv-degustazione-brunello");
  check("nota del giorno in cima", head.includes("EVENTO DAINELLI"));
  check("orari del giorno accanto al giorno", /\d{2}:\d{2}–\d{2}:\d{2}|Chiuso/.test(await agenda(P).getByTestId("agenda-orari").innerText()));
  // Ricerca
  await agenda(P).getByLabel(/Cerca nel giorno/).fill("degustazione");
  await P.waitForTimeout(300);
  const found = await rows(P).allInnerTexts();
  check("cerca nel giorno: «degustazione» trova le righe con quel menù (e solo quelle, più le annullate)", found.length > 0 && found.filter((t) => !t.includes("Annullata")).every((t) => /degustazione/i.test(t)), String(found.length));
  await agenda(P).getByLabel(/Cerca nel giorno/).fill("366 123");
  await P.waitForTimeout(300);
  check("cerca nel giorno: per telefono («366 123» → Agv Arianna)", (await rows(P).filter({ hasText: "Agv Arianna" }).count()) === 1);
  await agenda(P).getByLabel(/Cerca nel giorno/).fill("");
  // In servizio
  const servizio = agenda(P).getByTestId("in-servizio");
  const working = DB(`select count(distinct "employeeId") from "ShiftBlock" where date=${q(BIG)}::date`);
  check(`«In servizio (${working})» chiuso all'inizio`, (await servizio.evaluate((el) => el.open)) === false && new RegExp(`In servizio \\(${working}\\)`).test(await servizio.locator("summary").innerText()), await servizio.locator("summary").innerText());
  await servizio.locator("summary").click();
  const servTxt = await servizio.innerText();
  check("«In servizio» si apre: chi lavora con gli orari, chi è in ferie", servizio && /\d{2}:\d{2}–\d{2}:\d{2}/.test(servTxt) && (S.employees < 4 || /Ferie/.test(servTxt)), servTxt.replace(/\n/g, " ").slice(0, 160));
  check("Giorno a 390 px: niente scorrimento orizzontale", (await overflow(P)) <= 0);
  // Dettaglio
  await rows(P).filter({ hasText: "Agv Arianna" }).getByRole("button", { name: /^Agv Arianna/ }).click();
  const det = P.getByRole("dialog", { name: /Agv Arianna/ });
  await det.waitFor();
  check("tocco sulla riga → dettaglio, con «Manca l'ora» e «Completa i dati»", (await det.getByTestId("da-completare-dettaglio").innerText()).includes("Manca l'ora") && (await det.getByRole("button", { name: "Completa i dati" }).count()) === 1);
  check("dettaglio: conferma al cliente bloccata con un messaggio chiaro", (await det.getByTestId("conferma-bloccata").count()) === 1 && (await det.getByRole("link", { name: /conferma su WhatsApp/ }).count()) === 0);
  await P.keyboard.press("Escape");
  await P.waitForTimeout(300);

  // ================= Note del giorno =================
  await agenda(P).getByRole("button", { name: "+ Scrivi una nota per la giornata" }).click();
  let ns = P.getByRole("dialog", { name: "Nuova nota del giorno" });
  await ns.getByRole("textbox", { name: "Nota" }).fill("Cena aziendale (prova agv)");
  await ns.getByRole("button", { name: "Salva la nota" }).click();
  await agenda(P).getByText("Cena aziendale (prova agv)").waitFor({ timeout: 20000 });
  check("nota del giorno: aggiunta, si vede in cima con chi l'ha scritta", DB(`select count(*) from "BookingDayNote" where day=${q(BIG)} and text='Cena aziendale (prova agv)'`) === "1");
  await agenda(P).getByRole("button", { name: /Cena aziendale \(prova agv\)/ }).click();
  ns = P.getByRole("dialog", { name: "Nota del giorno" });
  await ns.getByRole("textbox", { name: "Nota" }).fill("Cena aziendale spostata (prova agv)");
  await ns.getByRole("button", { name: "Salva la nota" }).click();
  await agenda(P).getByText("Cena aziendale spostata (prova agv)").waitFor({ timeout: 20000 });
  check("nota del giorno: cambiata", DB(`select text from "BookingDayNote" where day=${q(BIG)} and text like 'Cena%'`) === "Cena aziendale spostata (prova agv)");
  await agenda(P).getByRole("button", { name: /Cena aziendale spostata/ }).click();
  ns = P.getByRole("dialog", { name: "Nota del giorno" });
  await ns.getByRole("button", { name: "Togli la nota" }).click();
  await P.getByRole("alertdialog").getByRole("button", { name: "Togli la nota" }).click();
  await agenda(P).getByRole("button", { name: /^Nota del giorno: Cena aziendale spostata/ }).waitFor({ state: "detached", timeout: 20000 });
  check("nota del giorno: tolta", DB(`select count(*) from "BookingDayNote" where text like 'Cena%'`) === "0");

  // ================= Giorni chiusi, richieste chiuse =================
  await pick(P, CLOSED);
  await P.waitForTimeout(800);
  const ct = await agenda(P).getByTestId("agenda-orari").innerText();
  check("giorno chiuso: «Chiuso · Inventario»", /Chiuso/.test(ct) && (!S.closedSeeded || /Inventario/.test(ct)), ct);
  await pick(P, FULLREQ);
  await P.waitForTimeout(800);
  await agenda(P).getByRole("button", { name: "Azioni del giorno" }).click();
  check("richieste online chiuse: segno discreto «Richieste chiuse», e nel ⋯ del giorno «Riapri le richieste online»", (await agenda(P).getByTestId("agenda-orari").locator("..").innerText()).includes("Richieste chiuse") && (await P.getByRole("menuitem", { name: /^Riapri le richieste online/ }).count()) === 1);
  await P.keyboard.press("Escape");

  // ================= Cambio d'ora =================
  await pick(P, "2027-03-28");
  await waitRows(P, "Agv Ora legale domenica");
  const dst = await agenda(P).innerText();
  check("ora legale (28 marzo 2027): domenica con le 20:30 e le 00:30 della stessa serata", dst.includes("Agv Ora legale domenica") && dst.includes("Agv Ora legale notte") && !dst.includes("Agv Ora legale lunedì") && (await title(P)).startsWith("Domenica 28 marzo"));
  await pick(P, "2026-10-25");
  await waitRows(P, "Agv Ora solare");
  check("ora solare (25 ottobre 2026, già passato): sera e notte nello stesso giorno", (await agenda(P).innerText()).includes("Agv Ora solare notte"));
  await setView(M, "Settimana");
  await pick(M, "2027-03-25");
  await M.waitForTimeout(1200);
  const sunCol = await agenda(M).getByRole("gridcell").nth(13).innerText();
  const monCol = await agenda(M).getByRole("gridcell").nth(14).innerText().catch(() => "");
  check("settimana del cambio d'ora: le prenotazioni della domenica nella colonna della domenica", /Agv Ora legale/.test(sunCol) && (await agenda(M).getByRole("columnheader").nth(6).innerText()).includes("28"), sunCol.replace(/\n/g, " ").slice(0, 120) + " | " + monCol.slice(0, 40));

  // ================= Settimana: «N in più», giorno che si apre, chip =================
  await pick(M, BIG);
  await M.waitForTimeout(1500);
  const more = agenda(M).getByRole("button", { name: /^\d+ in più$/ }).first();
  check("settimana: troppe prenotazioni → le prime e «N in più»", (await more.count()) === 1 && Number((await more.innerText()).split(" ")[0]) > 100, await more.innerText());
  check("settimana: evento del menù nella fascia in alto, senza passaggi in più", (await agenda(M).getByRole("row").nth(1).innerText()).includes("Degustazione"));
  check("settimana: giorno chiuso «Chiuso» e richieste chiuse in alto", /Chiuso/.test(await agenda(M).getByRole("row").nth(1).innerText()) && /Richieste chiuse/.test(await agenda(M).getByRole("row").nth(1).innerText()));
  check("settimana a 1440: niente scorrimento orizzontale", (await overflow(M)) <= 0);
  await shot(M, "settimana-mac");
  await more.click();
  await waitRows(M, "Agv Nottambuli");
  check("«N in più» → apre il giorno (vista Giorno)", (await vista(M)) === "day" && (await title(M)) === dayTitle(BIG));
  await setView(M, "Settimana");
  await agenda(M).getByRole("button", { name: /^Agv Con menù/ }).first().click().catch(() => {});
  const chipDlg = M.getByRole("dialog", { name: /Agv Con menù/ });
  const chipOpened = await chipDlg.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  check("settimana: tocco su una prenotazione → dettaglio (se è tra le prime della colonna)", chipOpened || (await agenda(M).getByRole("button", { name: /Agv Con menù/ }).count()) === 0);
  if (chipOpened) {
    check("dettaglio: il menù si vede", (await chipDlg.innerText()).includes("Menù degustazione"));
    await M.keyboard.press("Escape");
  }
  const dayHead = agenda(M).getByRole("button", { name: new RegExp(`^Apri ${WD[(new Date(`${FULLREQ}T12:00:00Z`).getUTCDay() + 6) % 7]} ${Number(FULLREQ.slice(8))}`) }).first();
  await dayHead.click();
  await M.waitForTimeout(800);
  check("settimana: tocco sull'intestazione del giorno → vista Giorno di quel giorno", (await vista(M)) === "day" && (await title(M)) === dayTitle(FULLREQ));
  // Tablet verticale
  await pick(T, BIG);
  await T.waitForTimeout(1500);
  check("settimana a 768 (tablet verticale): sette colonne, niente scorrimento orizzontale", (await agenda(T).getByRole("columnheader").count()) === 7 && (await overflow(T)) <= 0, String(await overflow(T)));
  for (const w of [1024]) {
    await T.setViewportSize({ width: w, height: 768 });
    await T.waitForTimeout(400);
    check(`settimana a ${w}: niente scorrimento orizzontale`, (await overflow(T)) <= 0);
  }

  // ================= Mese =================
  await setView(T, "Mese");
  await T.waitForTimeout(1200);
  const cells = agenda(T).getByRole("gridcell");
  check("mese: settimane intere da lunedì (35 o 42 giorni)", [35, 42].includes(await cells.count()), String(await cells.count()));
  const bigCell = agenda(T).getByRole("button", { name: new RegExp(`^Apri ${WD[(new Date(`${BIG}T12:00:00Z`).getUTCDay() + 6) % 7]} ${Number(BIG.slice(8))} `) });
  const bigLabel = await bigCell.getAttribute("aria-label");
  check("mese: nel giorno pieno quante prenotazioni e persone, da confermare, da completare, evento", /120 prenotazioni, \d+ persone/.test(bigLabel) && /4 da confermare/.test(bigLabel) && /da completare/.test(bigLabel) && /Degustazione Brunello/.test(bigLabel), bigLabel);
  const closedCell = agenda(T).getByRole("button", { name: new RegExp(`^Apri ${WD[(new Date(`${CLOSED}T12:00:00Z`).getUTCDay() + 6) % 7]} ${Number(CLOSED.slice(8))} `) });
  check("mese: giorno chiuso «Chiuso»", (await closedCell.innerText()).includes("Chiuso"));
  check("mese a 1024: niente scorrimento orizzontale", (await overflow(T)) <= 0);
  await bigCell.click();
  await waitRows(T, "Agv Nottambuli");
  check("mese: tocco su un giorno → si apre la vista Giorno", (await vista(T)) === "day" && (await title(T)) === dayTitle(BIG));
  await setView(P, "Mese");
  await P.waitForTimeout(1200);
  check("mese a 390 px: niente scorrimento orizzontale, caselle da almeno 44 px", (await overflow(P)) <= 0 && (await agenda(P).getByRole("gridcell").first().locator("button").evaluate((el) => el.getBoundingClientRect().height)) >= 44);
  await setView(P, "Settimana");
  await P.waitForTimeout(1200);
  check("settimana sul telefono: un giorno per riga (7 righe), niente scorrimento orizzontale", (await agenda(P).getByRole("list", { name: "Giorni della settimana" }).getByRole("listitem").count()) === 7 && (await overflow(P)) <= 0);
  await setView(P, "Giorno");

  // ================= Evento creato nel menù → compare da solo =================
  const EVT = addDays(today, 12);
  DB(`insert into "MenuPromo" (id, kind, slug, title, "showFrom", "startDate", "endDate", "startTime", "updatedAt") values ('agv_evt2', 'EVENT', 'agv-oktoberfest', 'Oktoberfest', ${q(today)}, ${q(EVT)}, ${q(addDays(EVT, 1))}, '18:30', now())`);
  await go(P);
  await pick(P, EVT);
  await P.waitForTimeout(1200);
  const evLink = agenda(P).getByRole("link", { name: /Oktoberfest/ });
  check("evento aggiunto nel menù («Oktoberfest») → in agenda da solo, con l'ora, link in una nuova scheda", (await evLink.count()) === 1 && /dalle 18:30/.test(await evLink.innerText()) && (await evLink.getAttribute("target")) === "_blank");
  await pick(P, addDays(EVT, 1));
  await P.waitForTimeout(800);
  check("…anche il secondo giorno dell'evento", (await agenda(P).getByRole("link", { name: /Oktoberfest/ }).count()) === 1);
  DB(`update "MenuPromo" set hidden=true where id='agv_evt2'`);
  await go(P);
  await pick(P, EVT);
  await P.waitForTimeout(1000);
  check("evento nascosto nel menù → sparisce dall'agenda", (await agenda(P).getByRole("link", { name: /Oktoberfest/ }).count()) === 0);

  // ================= «+ Segna in questo giorno», da definire, Completa i dati =================
  await pick(P, FREE);
  await P.waitForTimeout(800);
  await P.getByRole("button", { name: "Nuova prenotazione" }).first().click();
  let d = P.getByRole("dialog", { name: "Nuova prenotazione" });
  await d.waitFor();
  await d.getByRole("radiogroup", { name: "Scegli il giorno" }).getByRole("radio", { name: "Altro giorno" }).click();
  check("«+ Prenotazione» con un giorno aperto: giorno già scelto", (await d.getByLabel("Giorno", { exact: true }).inputValue()) === FREE);
  await d.getByRole("radiogroup", { name: "Persone" }).getByRole("radio", { name: "6", exact: true }).click();
  await d.getByRole("radiogroup", { name: "Ora" }).getByRole("radio", { name: "Ancora da definire" }).click();
  check("«Ancora da definire» per l'ora: scelta esplicita con la spiegazione", (await d.getByTestId("avviso-da-definire").innerText()).includes("da completare"));
  await d.getByRole("textbox", { name: /^Nome/ }).fill("Agv Nuova senza ora");
  await d.getByRole("textbox", { name: /^Telefono/ }).fill("366 765 4321");
  const sugg = d.getByRole("button", { name: "Menù da 25 €" });
  check("menù: suggerimenti con un tocco (anche «Menù da 25 €»)", (await sugg.count()) === 1);
  await sugg.click();
  check("menù: il suggerimento riempie il campo", (await d.getByRole("combobox", { name: "Menù" }).inputValue().catch(() => d.getByLabel("Menù").inputValue())) === "Menù da 25 €");
  await d.getByRole("button", { name: "Segna in agenda", exact: true }).click();
  const bar = P.getByRole("status").filter({ hasText: "✓ Segnata:" });
  await bar.waitFor({ timeout: 20000 });
  check("salvata: «✓ Segnata: …, ora da definire, 6 persone», senza «Manda conferma»", /ora da definire, 6 persone/.test(await bar.innerText()) && (await bar.getByRole("link", { name: /Manda conferma/ }).count()) === 0, await bar.innerText());
  const nid = DB(`select id from "BookingRequest" where name='Agv Nuova senza ora'`);
  check("nel database: ora da definire, 6 persone, menù", DB(`select "timeUnknown"||'|'||"peopleUnknown"||'|'||people||'|'||coalesce(menu,'')||'|'||day from "BookingRequest" where id=${q(nid)}`) === `true|false|6|Menù da 25 €|${FREE}`);
  await waitRows(P, "Agv Nuova senza ora");
  check("in agenda: nella fascia «Ora da definire» con «Manca l'ora» e il menù", (await agenda(P).locator('section[data-gruppo="da-definire"]').innerText()).includes("Agv Nuova senza ora") && /Manca l'ora/.test(await rows(P).filter({ hasText: "Agv Nuova senza ora" }).innerText()) && /Menù da 25 €/.test(await rows(P).filter({ hasText: "Agv Nuova senza ora" }).innerText()));
  await bar.getByRole("button", { name: "Chiudi il messaggio" }).click().catch(() => {});
  await P.getByTestId("pulsante-richieste").click();
  const dc = P.getByRole("dialog", { name: "Richieste" }).getByTestId("da-completare");
  await dc.waitFor();
  check("«Richieste» → «Da completare (N)» con la prenotazione", (await dc.innerText()).includes("Agv Nuova senza ora") && /Da completare \(\d+\)/i.test(await dc.innerText()));
  const dcText = await dc.innerText();
  const pos = ["Agv Oggi senza ora", "Agv Arianna", "Agv Nuova senza ora"].map((n) => dcText.indexOf(n));
  check("«Da completare» in ordine di giorno", pos.every((x, i) => x >= 0 && (i === 0 || x > pos[i - 1])), pos.join(","));
  await dc.getByRole("button", { name: /Agv Nuova senza ora/ }).click();
  const det2 = P.getByRole("dialog", { name: /Agv Nuova senza ora/ });
  await det2.getByRole("button", { name: "Completa i dati" }).click();
  d = P.getByRole("dialog", { name: "Modifica la prenotazione" });
  await d.waitFor();
  check("«Completa i dati»: nel foglio «Ancora da definire» è scelto per l'ora", (await d.getByRole("radiogroup", { name: "Ora" }).getByRole("radio", { name: "Ancora da definire" }).getAttribute("aria-checked")) === "true");
  const r2030 = d.getByRole("radiogroup", { name: "Ora" }).getByRole("radio", { name: "20:30", exact: true });
  if (await r2030.count()) await r2030.click();
  else await d.getByLabel("Un altro orario").fill("20:30");
  await d.getByRole("button", { name: "Salva le modifiche", exact: true }).click();
  const ask = P.getByRole("alertdialog");
  const res = await Promise.race([d.getByText("✓ Modifiche salvate").waitFor({ timeout: 15000 }).then(() => "ok"), ask.waitFor({ timeout: 15000 }).then(() => "ask")]).catch(() => "none");
  if (res === "ask") {
    await ask.getByRole("button", { name: "Segna lo stesso" }).click();
    await d.getByText("✓ Modifiche salvate").waitFor({ timeout: 15000 }).catch(() => {});
  }
  check("completata: ora 20:30, non più «da definire»", DB(`select "timeUnknown"||'|'||time from "BookingRequest" where id=${q(nid)}`) === "false|20:30");
  check("completata: ora si può mandare la conferma su WhatsApp", (await d.getByRole("link", { name: /conferma aggiornata su WhatsApp/ }).count()) === 1);
  await d.getByRole("button", { name: "Fatto" }).click();

  // ================= Import con una riga da completare =================
  // «Importa dal librone» sta nel menù «⋯» della barra.
  if (await P.getByRole("dialog", { name: "Richieste" }).count()) await P.getByRole("dialog", { name: "Richieste" }).getByRole("button", { name: "Chiudi", exact: true }).click();
  await P.getByRole("button", { name: "Altre azioni" }).click();
  await P.getByRole("menuitem", { name: /^Importa dal librone/ }).click();
  const imp = P.getByRole("dialog", { name: "Importa dal librone" });
  const dmy = (x) => `${Number(x.slice(8))}/${Number(x.slice(5, 7))}`;
  await imp.getByLabel("Prenotazioni da importare").fill(`${dmy(FREE)} 21:00 4 Agv Import completo menu 25€\n${dmy(FREE)} Agv Import Arianna 366 111 2233 menù da 25 €`);
  const r2 = imp.locator('[data-testid="import-row"][data-line="2"]');
  await r2.waitFor();
  check("import: riga senza ora e persone → gialla «Da completare», non un errore", (await r2.getAttribute("data-state")) === "incomplete" && /Da completare: ora e persone da definire/.test(await r2.innerText()), await r2.innerText());
  check("import: menù riconosciuto sulle righe", (await imp.locator('[data-testid="import-row"][data-line="1"]').innerText()).includes("Menù da 25 €"));
  await shot(P, "import-da-completare");
  await imp.getByRole("button", { name: /^Segna 2 prenotazioni/ }).click();
  await imp.waitFor({ state: "detached", timeout: 20000 });
  check("import: tutte e due segnate, quella senza dati «da completare»", DB(`select "timeUnknown"||'|'||"peopleUnknown"||'|'||menu from "BookingRequest" where name='Agv Import Arianna'`) === "true|true|Menù da 25 €" && DB(`select menu from "BookingRequest" where name='Agv Import completo'`) === "Menù da 25 €");

  // ================= Rotta dei dati: permessi =================
  const anon = await browser.newContext();
  const r = await anon.request.get(`${BASE}/prenotazioni/agenda?dal=${today}&al=${today}`, { maxRedirects: 0 });
  check("dati dell'agenda: senza accesso niente dati", r.status() !== 200 || !(await r.text()).includes("bookings"), String(r.status()));
  await anon.close();
  const bad = await P.evaluate(async () => (await fetch("/prenotazioni/agenda?dal=2026-01-01&al=2026-12-31")).status);
  check("dati dell'agenda: periodo troppo lungo → rifiutato (400)", bad === 400);

  check("nessun errore nelle pagine", [P, M, T].every((p) => p.errs.length === 0), [P, M, T].flatMap((p) => p.errs).join(" | "));
  for (const c of [phone, mac, tab]) await c.ctx.close();
} catch (e) {
  check("la prova è arrivata in fondo", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  restore();
}
process.exit(finish());
