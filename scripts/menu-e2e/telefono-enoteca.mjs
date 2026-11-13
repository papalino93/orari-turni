// «Telefono enoteca»: il telefono che resta in sala, con un accesso condiviso solo per le prenotazioni.
// - Dipendenti: «+ Telefono dell'enoteca» (nome, username «enoteca», password, permessi, widget della
//   sala) e il foglio «Come collegarlo»; menù acceso solo dopo una domanda; fuori da Orari e Ferie;
// - sul telefono: si apre su Prenotazioni, «Chi sei?» (prima chi è in turno), il nome in cronologia;
// - WhatsApp: una coda sola con il lucchetto («In invio da…», «✓ Mandato», «Già mandato da…»),
//   «Mandalo io» del titolare con l'avviso sul WhatsApp personale;
// - avvisi: testi chiari per ruolo, «Telefoni che ricevono gli avvisi» con «Togli», password nuova = avvisi spenti.
// Uso: npx tsx scripts/menu-e2e/telefono-enoteca.mjs   (SHOTS=cartella per le foto)
import { mkdirSync } from "node:fs";
import {
  loadEnvLocal,
  onInterrupt,
  check,
  finish,
  DB,
  q,
  BASE,
  ADMIN_PW,
  SHOTS,
  snapshotBookingSetting,
  restoreBookingSetting,
  setBookingSetting,
  bookableDays,
  newContext,
  login,
  waitServer,
} from "./prenota-lib.mjs";
import { chromium } from "playwright-core";

loadEnvLocal();
process.env.MAIL_PROVIDER = "log";
process.env.PUSH_PROVIDER = "log";
if (!/\/orari_test(\?|$)/.test(process.env.DATABASE_URL || "")) {
  console.error("DATABASE_URL non è il database di prova orari_test: mi fermo.");
  process.exit(2);
}
const S = await import("@/lib/booking/service");

const savedSetting = snapshotBookingSetting();
const savedVenues = DB(`select coalesce(string_agg(id, ','), '') from "Employee" where "isVenueDevice"=true`).split(",").filter(Boolean);
const TEST_NAME = "Prova T";
function cleanup() {
  DB(`delete from "BookingRequest" where name like 'Prova T %'`);
  DB(`delete from "PushSubscription" where id like 'provatpush%'`);
  DB(`delete from "ShiftBlock" where id like 'provat\\_%'`);
  // Il telefono creato dalla prova (quelli che c'erano prima restano).
  DB(`delete from "Employee" where "isVenueDevice"=true ${savedVenues.length ? `and id not in (${savedVenues.map(q).join(",")})` : ""}`);
  if (savedVenues.length) DB(`update "Employee" set "isVenueDevice"=true where id in (${savedVenues.map(q).join(",")})`);
  restoreBookingSetting(savedSetting);
}
onInterrupt(cleanup);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/enoteca-${name}.png` }).catch(() => {});
};
const waitDb = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return fn();
};

let browser;
try {
  await waitServer();
  // Gli accessi enoteca di prima si mettono da parte (la prova parte da «nessun telefono»).
  if (savedVenues.length) DB(`update "Employee" set "isVenueDevice"=false where id in (${savedVenues.map(q).join(",")})`);
  setBookingSetting({ agendaEnabled: true, enabled: true, whatsappSenders: "venue" });
  const days = bookableDays().days;
  const D = days.find((d) => d.state === "open" && d.slots.length > 2) ?? days.find((d) => d.slots?.length > 2);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--lang=it"] });
  const fakeWa = (ctx) => ctx.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\/.*/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp</title>ok" }));

  // ================= Dipendenti: «+ Telefono dell'enoteca» =================
  const adminCtx = await newContext(browser, "desktop", { deviceScaleFactor: 2 });
  await fakeWa(adminCtx);
  const A = await adminCtx.newPage();
  A.setDefaultTimeout(30000);
  const errs = [];
  A.on("pageerror", (e) => errs.push(e.message));
  await login(A, "andrea", ADMIN_PW);
  await A.goto(`${BASE}/dipendenti`, { waitUntil: "networkidle", timeout: 180000 });
  const add = A.getByRole("button", { name: "+ Telefono dell'enoteca" });
  check("Dipendenti: pulsante «+ Telefono dell'enoteca»", (await add.count()) === 1);
  await shot(A, "dipendenti");
  await add.click();
  const how = A.getByRole("dialog", { name: "Come collegarlo" });
  await how.waitFor();
  const username = (await how.getByTestId("collega-username").innerText()).trim();
  const password = (await how.getByTestId("collega-password").innerText()).trim();
  const howText = await how.innerText();
  check("«Come collegarlo»: username «enoteca» e una password", /^enoteca\d*$/.test(username) && password.length >= 8, `${username} / ${password.length}`);
  check("«Come collegarlo»: tre passi", (await how.locator("ol > li").count()) === 3);
  check("«Come collegarlo»: codice di sblocco e «se si perde cambia la password»", /codice di sblocco/i.test(howText) && /Se il telefono si perde/.test(howText) && /Nuova password/.test(howText));
  await shot(A, "come-collegarlo");
  const row = DB(`select name||'|'||"canManageBookings"||'|'||"canEditMenu"||'|'||array_to_string(widgets, ',')||'|'||role from "Employee" where username=${q(username)}`);
  check("creato: «Telefono enoteca», prenotazioni sì, menù no, widget della sala", row === "Telefono enoteca|true|false|menuqr,qr,apri,clienti|EMPLOYEE", row);
  const venueId = DB(`select id from "Employee" where username=${q(username)}`);
  await how.getByRole("button", { name: "Fatto" }).click();
  await A.waitForTimeout(800);
  const card = A.getByTestId("telefono-enoteca");
  check("scheda a parte «Telefono enoteca · solo prenotazioni»", (await card.count()) === 1 && /solo prenotazioni/.test(await card.innerText()));
  check("niente più «+ Telefono dell'enoteca» (c'è già): solo «Aggiungi un altro telefono»", (await A.getByRole("button", { name: "+ Telefono dell'enoteca" }).count()) === 0 && (await A.getByRole("button", { name: "Aggiungi un altro telefono" }).count()) === 1);
  // Menù: si accende solo dopo la domanda.
  await card.getByRole("switch", { name: "Può modificare il menù" }).click();
  const askMenu = A.getByRole("alertdialog", { name: /Chiunque abbia in mano il telefono dell'enoteca potrà cambiare prezzi/ });
  check("menù: prima la domanda «Chiunque abbia in mano il telefono… Accenderlo?»", (await askMenu.count()) === 1);
  await shot(A, "menu-domanda");
  await askMenu.getByRole("button", { name: "Annulla" }).click();
  check("…«Annulla»: resta spento", DB(`select "canEditMenu" from "Employee" where id=${q(venueId)}`) === "f");
  await card.getByRole("switch", { name: "Può modificare il menù" }).click();
  await A.getByRole("alertdialog").getByRole("button", { name: "Sì, accendi" }).click();
  check("…«Sì, accendi»: acceso", await waitDb(() => DB(`select "canEditMenu" from "Employee" where id=${q(venueId)}`) === "t"));
  await A.waitForTimeout(800);
  await card.getByRole("switch", { name: "Può modificare il menù" }).click();
  check("…e si spegne senza domande", await waitDb(() => DB(`select "canEditMenu" from "Employee" where id=${q(venueId)}`) === "f"));

  // Fuori da Orari e Ferie
  await A.goto(`${BASE}/orari`, { waitUntil: "networkidle", timeout: 180000 });
  check("Orari: il telefono enoteca non c'è", !(await A.locator("main").innerText()).includes("Telefono enoteca"));
  const ferie = await A.goto(`${BASE}/ferie`, { waitUntil: "networkidle", timeout: 180000 });
  if (ferie?.ok() && new URL(A.url()).pathname === "/ferie") check("Ferie: il telefono enoteca non c'è", !(await A.locator("main").innerText()).includes("Telefono enoteca"));

  // ================= Sul telefono della sala =================
  // Qualcuno in turno oggi (per «Chi sei?»: prima chi è in turno).
  const today = DB(`select to_char(((now() at time zone 'Europe/Rome') - interval '5 hours')::date, 'YYYY-MM-DD')`);
  const giulia = DB(`select id||'|'||name from "Employee" where username='giulia'`).split("|");
  DB(`insert into "ShiftBlock" (id, "employeeId", date, "startTime", "endTime", "updatedAt") values ('provat_turno', ${q(giulia[0])}, '${today}', '18:00', '23:30', now()) on conflict do nothing`);
  const venueCtx = await newContext(browser, "phone");
  await fakeWa(venueCtx);
  const V = await venueCtx.newPage();
  V.setDefaultTimeout(30000);
  V.on("pageerror", (e) => errs.push(e.message));
  await login(V, username, password);
  await V.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 180000 });
  check("telefono enoteca: entra e si apre su Prenotazioni", new URL(V.url()).pathname === "/prenotazioni", V.url());
  const navLinks = await V.locator("nav a").allInnerTexts();
  check("telefono enoteca: niente Orari, Le mie ore, Ferie, Dipendenti nel menù", !navLinks.some((t) => /Orari|Le mie ore|Ferie|Dipendenti/.test(t)), navLinks.join("|"));
  const mieOre = await V.goto(`${BASE}/mie-ore`, { waitUntil: "networkidle", timeout: 180000 });
  check("telefono enoteca: «Le mie ore» rimanda a Prenotazioni", mieOre?.ok() && new URL(V.url()).pathname === "/prenotazioni", V.url());
  const who = V.getByRole("dialog", { name: "Chi sei?" });
  await who.waitFor();
  const whoText = await who.innerText();
  check("«Chi sei?» all'apertura, con «In turno oggi» e chi è in turno per primo", /In turno oggi/i.test(whoText) && whoText.indexOf(giulia[1]) > -1 && whoText.indexOf(giulia[1]) < whoText.toLowerCase().indexOf("gli altri"), whoText.replace(/\n/g, " | ").slice(0, 200));
  check("«Chi sei?»: niente telefono enoteca tra i nomi", !whoText.includes("Telefono enoteca"));
  await shot(V, "chi-sei");
  // Senza scegliere: non si salva niente.
  const noWho = await V.evaluate(async () => {
    const r = await fetch("/prenotazioni/agenda?coda=1");
    return r.status;
  });
  check("…la pagina funziona anche prima di scegliere (sola lettura)", noWho === 200);
  await who.getByRole("button", { name: new RegExp(`^${giulia[1]}`) }).click();
  await who.waitFor({ state: "detached" });
  const chip = V.getByTestId("chi-sei").filter({ hasText: giulia[1] }).first();
  await chip.waitFor({ timeout: 15000 }).catch(() => {});
  check(`chip «Sei ${giulia[1]} · cambia» in cima`, (await chip.count()) === 1);
  await shot(V, "agenda");

  // Avvisi su questo telefono: testi per il telefono enoteca, niente interruttore «telefono del locale».
  await V.getByRole("button", { name: "Altre azioni" }).click();
  await V.getByRole("menuitem", { name: /^Avvisi su questo telefono/ }).click();
  const av = V.getByRole("dialog", { name: "Avvisi su questo telefono" });
  const avText = await av.innerText();
  check("avvisi (telefono enoteca): «Questo è il telefono enoteca: da qui partono le risposte… dal numero del locale»", /Questo è il telefono enoteca/.test(avText) && /dal numero del locale/.test(avText));
  check("avvisi: niente interruttore «Questo è il telefono del locale»", (await av.getByRole("switch").count()) === 0);
  await V.keyboard.press("Escape");

  // ================= WhatsApp: una coda sola con il lucchetto =================
  const mk = await S.createManualBooking({ day: D.day, time: D.slots[1], people: 3, name: `${TEST_NAME} Rossi`, phone: "333 9123456", table: "", note: "", allergies: false, source: "telefono", force: true }, { name: "Andrea" }, null);
  check("prenotazione di prova segnata", mk.ok, mk.error);
  await S.queueConfirmation(mk.booking.id, { name: "Andrea" });
  const id = mk.booking.id;
  await V.reload({ waitUntil: "networkidle" });
  await V.getByTestId("pulsante-richieste").click();
  const vPanel = V.getByRole("dialog", { name: "Richieste" });
  const vRow = vPanel.getByTestId("wa-riga").filter({ hasText: `${TEST_NAME} Rossi` });
  check("telefono enoteca: nella coda con il pulsante verde", (await vRow.getByRole("link", { name: `Manda su WhatsApp a ${TEST_NAME} Rossi` }).count()) === 1);
  check("telefono enoteca: niente avviso «WhatsApp personale»", (await vPanel.getByTestId("wa-avviso-personale").count()) === 0);
  await shot(V, "coda");
  const [pop] = await Promise.all([venueCtx.waitForEvent("page"), vRow.getByRole("link", { name: `Manda su WhatsApp a ${TEST_NAME} Rossi` }).click()]);
  await pop.close();
  check("lucchetto: preso dal telefono enoteca a nome di chi l'ha in mano", await waitDb(() => DB(`select coalesce("waClaimBy",'') from "BookingRequest" where id=${q(id)}`) === `${giulia[1]} (telefono enoteca)`));
  await V.waitForTimeout(800);
  check("…la riga resta «in invio» con «✓ Mandato» e «Annulla»", (await vRow.getByTestId("wa-in-invio").count()) === 1);
  await shot(V, "in-invio");

  // Il titolare intanto: «In invio da … (telefono enoteca)»
  await A.goto(`${BASE}/prenotazioni?richieste=1`, { waitUntil: "networkidle", timeout: 180000 });
  const aPanel = A.getByRole("dialog", { name: "Richieste" });
  await aPanel.waitFor();
  const aRow = aPanel.getByTestId("wa-riga").filter({ hasText: `${TEST_NAME} Rossi` });
  check(`titolare: «In invio da ${giulia[1]} (telefono enoteca)…»`, new RegExp(`In invio da ${giulia[1]} \\(telefono enoteca\\)`).test(await aRow.innerText()), await aRow.innerText());
  check("titolare (solo il telefono enoteca): avviso «Partirà dal tuo WhatsApp personale…»", (await aPanel.getByTestId("wa-avviso-personale").count()) === 1);
  await shot(A, "titolare-in-invio");
  // Il telefono enoteca tocca «✓ Mandato»
  await vRow.getByRole("button", { name: "✓ Mandato" }).click();
  check("«✓ Mandato»: in cronologia «dal numero dell'enoteca»", await waitDb(() => DB(`select count(*) from "BookingLog" where "requestId"=${q(id)} and kind='WHATSAPP_DONE' and message='dal numero dell''enoteca'`) === "1"));
  await A.goto(`${BASE}/prenotazioni?richieste=1`, { waitUntil: "networkidle", timeout: 180000 });
  await A.getByRole("dialog", { name: "Richieste" }).waitFor();
  const done = A.getByRole("dialog", { name: "Richieste" }).getByTestId("wa-mandato").filter({ hasText: `${TEST_NAME} Rossi` });
  check(`titolare: «Già mandato da ${giulia[1]} (telefono enoteca) alle …»`, new RegExp(`Già mandato da ${giulia[1]} \\(telefono enoteca\\) alle \\d{2}:\\d{2}`).test(await done.innerText().catch(() => "")), await done.innerText().catch(() => "—"));
  await shot(A, "titolare-gia-mandato");

  // «Mandalo io» su una nuova: domanda con l'avviso sul WhatsApp personale
  const mk2 = await S.createManualBooking({ day: D.day, time: D.slots[2], people: 2, name: `${TEST_NAME} Bianchi`, phone: "333 9123457", table: "", note: "", allergies: false, source: "telefono", force: true }, { name: "Andrea" }, null);
  await S.queueConfirmation(mk2.booking.id, { name: "Andrea" });
  await A.goto(`${BASE}/prenotazioni?richieste=1`, { waitUntil: "networkidle", timeout: 180000 });
  const p2 = A.getByRole("dialog", { name: "Richieste" });
  await p2.waitFor();
  const r2 = p2.getByTestId("wa-riga").filter({ hasText: `${TEST_NAME} Bianchi` });
  await r2.getByRole("link", { name: /^Mandalo io dal mio WhatsApp/ }).click();
  const ask = A.getByRole("alertdialog", { name: "Mandarlo tu dal tuo WhatsApp?" });
  check("«Mandalo io»: prima «Mandarlo tu dal tuo WhatsApp?» con «Partirà dal tuo WhatsApp personale»", (await ask.count()) === 1 && /Partirà dal tuo WhatsApp personale/.test(await ask.innerText()));
  await shot(A, "mandalo-io");
  await ask.getByRole("button", { name: "Annulla" }).click();

  // ================= Impostazioni: «Chi manda i WhatsApp», «Telefoni che ricevono gli avvisi» =================
  DB(`insert into "PushSubscription" (id, endpoint, p256dh, auth, "employeeId", "userAgent", "lastOkAt") values ('provatpush1', 'https://fcm.googleapis.com/prova-t-1', 'x', 'y', ${q(venueId)}, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148', now() - interval '20 minutes')`);
  DB(`insert into "PushSubscription" (id, endpoint, p256dh, auth, username, "userAgent") values ('provatpush2', 'https://fcm.googleapis.com/prova-t-2', 'x', 'y', 'andrea', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')`);
  await A.goto(`${BASE}/prenotazioni?apri=impostazioni`, { waitUntil: "networkidle", timeout: 180000 });
  const st = A.getByRole("dialog", { name: "Impostazioni delle prenotazioni" });
  await st.waitFor();
  check("Impostazioni: «Chi manda i WhatsApp ai clienti», «Solo il telefono enoteca» scelto", (await st.getByTestId("chi-manda-whatsapp").getByRole("radio", { name: /^Solo il telefono enoteca/ }).isChecked()));
  const devs = st.getByTestId("telefoni-avvisi");
  const devText = await devs.innerText();
  check("«Telefoni che ricevono gli avvisi»: Telefono enoteca · iPhone, con l'ultimo avviso", /Telefono enoteca/.test(devText) && /iPhone · ultimo avviso (oggi|ieri) alle \d{2}:\d{2}/.test(devText), devText.replace(/\n/g, " | "));
  check("…e il computer del titolare", /Computer · attivato/.test(devText));
  await devs.scrollIntoViewIfNeeded();
  await shot(A, "telefoni-avvisi");
  await devs.getByRole("button", { name: /^Togli gli avvisi: Computer/ }).click();
  check("«Togli»: tolto", await waitDb(() => DB(`select count(*) from "PushSubscription" where id='provatpush2'`) === "0"));
  await A.keyboard.press("Escape");

  // Password nuova del telefono enoteca: gli avvisi di quel telefono si spengono
  await A.goto(`${BASE}/dipendenti`, { waitUntil: "networkidle", timeout: 180000 });
  await A.getByTestId("telefono-enoteca").getByRole("button", { name: "Nuova password" }).click();
  await A.getByRole("alertdialog", { name: "Creare una nuova password?" }).getByRole("button", { name: "Sì, nuova password" }).click();
  check("«Nuova password» del telefono enoteca: i suoi avvisi si spengono", await waitDb(() => DB(`select count(*) from "PushSubscription" where id='provatpush1'`) === "0"));
  await V.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
  check("…e il vecchio accesso non entra più", new URL(V.url()).pathname.startsWith("/login"), V.url());

  check("nessun errore JavaScript", errs.length === 0, errs.join(" | "));
  await browser.close();
} catch (e) {
  check("la prova è arrivata in fondo", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  cleanup();
}
check("pulizia: nessuna prenotazione «Prova T» rimasta", DB(`select count(*) from "BookingRequest" where name like 'Prova T %'`) === "0");
check("pulizia: impostazione «bookings» come prima", snapshotBookingSetting() === savedSetting);
process.exit(finish());
