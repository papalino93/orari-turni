// Prenotazioni online, parte del personale (E2E sul server di prova): elenco «Da gestire», dettaglio,
// conferma (WhatsApp ed email), proposta + accettazione del cliente, «al completo», annullo del cliente
// e del locale, due persone che confermano insieme, permessi dei dipendenti (senza, con, revoca
// immediata), «Siamo pieni stasera» e chiusura di un altro giorno, «Arrivati»/«Non venuti», Numeri,
// accendi/spegni e impostazioni, voce del menù in alto, widget «Da fare».
// Uso: node scripts/menu-e2e/prenota-staff.mjs   (SHOTS=<cartella> per le foto)
import { createHash, randomBytes } from "node:crypto";
import {
  BASE,
  onInterrupt,
  ADMIN_PW,
  EMP_PW,
  SHOTS,
  check,
  finish,
  DB,
  q,
  snapshotBookingSetting,
  restoreBookingSetting,
  setBookingSetting,
  snapshotPermissions,
  restorePermissions,
  cleanBookings,
  bookableDays,
  formStamp,
  postRequest,
  launch,
  newContext,
  login,
  randomIp,
  randomPhone,
} from "./prenota-lib.mjs";

const savedSetting = snapshotBookingSetting();
const savedPerms = snapshotPermissions();
const savedClosed = DB(`select day from "BookingClosedDay"`).split("\n").filter(Boolean);
const emp = (u) => {
  const [id, name] = DB(`select id||'|'||name from "Employee" where username='${u}'`).split("|");
  return { id, name, username: u };
};
const MARTA = emp("marta");
const GIULIA = emp("giulia");
const SARA = emp("sara");
const ADMIN_NAME = DB(`select name from "User" where username='andrea'`);
onInterrupt(() => {
  cleanBookings();
  DB(`delete from "WidgetDevice" where name='Prova C'`);
  restoreBookingSetting(savedSetting);
  restorePermissions(savedPerms);
  try {
    for (const d of [TODAY, D2?.day].filter(Boolean)) if (!savedClosed.includes(d)) DB(`delete from "BookingClosedDay" where day='${d}'`);
  } catch {}
});
cleanBookings();
DB(`delete from "WidgetDevice" where name='Prova C'`);
setBookingSetting({ enabled: true });
DB(`update "Employee" set "canManageBookings"=true where id in ('${MARTA.id}','${GIULIA.id}')`);
DB(`update "Employee" set "canManageBookings"=false where id='${SARA.id}'`);

const { days } = bookableDays();
const open = days.filter((d, i) => i >= 1 && d.state === "open" && d.slots.length >= 4);
const D1 = open[0];
const D2 = open[1];
const TODAY = days[0].day;
const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/prenotazioni-${name}.png`, fullPage: true });
const status = (id) => DB(`select status||'|'||coalesce("handledBy",'')||'|'||coalesce("cancelledBy",'') from "BookingRequest" where id=${q(id)}`);
let n = 0;
// Una richiesta vera (dalla route pubblica), come la manderebbe un cliente.
async function make(name, over = {}) {
  const day = over.day ?? D1.day;
  const slots = (days.find((d) => d.day === day) ?? D1).slots;
  const r = await postRequest({ day, time: slots[n++ % slots.length], people: 2, name, phone: randomPhone(), email: "", contact: "whatsapp", note: "", allergies: false, source: "menu", event: "", privacy: true, sito: "", t: await formStamp(), ...over });
  if (!r.json?.ok) throw new Error(`richiesta «${name}» non creata: ${JSON.stringify(r.json)}`);
  return { id: DB(`select id from "BookingRequest" where name=${q(name)}`), path: r.json.statusPath, name };
}
// Sposta una richiesta a oggi, a tanti minuti da adesso (es. -30 = mezz'ora fa).
function moveToToday(id, minutes, status = null) {
  DB(`update "BookingRequest" set day='${TODAY}', time=to_char((now() + interval '${minutes} minutes') at time zone 'Europe/Rome', 'HH24:MI'), "startsAt"=now() + interval '${minutes} minutes'${status ? `, status='${status}', "handledBy"='Prova C', "handledAt"=now()` : ""} where id='${id}'`);
}

let browser;
try {
  check("ci sono giorni prenotabili", !!D1 && !!D2);
  browser = await launch();
  const session = async (user, pw, kind = "phone") => {
    const ctx = await newContext(browser, kind);
    // WhatsApp non si apre davvero: la pagina di wa.me si finge.
    await ctx.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\/.*/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp</title>ok" }));
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.errs = [];
    p.on("pageerror", (e) => p.errs.push(e.message));
    await login(p, user, pw);
    return { ctx, p };
  };
  const goList = async (p) => {
    await p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    // L'invito alle notifiche non serve qui.
    const later = p.getByRole("button", { name: "Non ora" });
    if (await later.count()) await later.click();
  };
  const tab = async (p, label) => p.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
  const card = (p, name) => p.getByRole("tabpanel").getByRole("button", { name: new RegExp(name) }).first();
  const sheet = (p, name) => p.getByRole("dialog", { name });
  const openCard = async (p, name) => {
    await card(p, name).click();
    await sheet(p, name).waitFor();
    return sheet(p, name);
  };
  const bodyText = (p) => p.locator("body").innerText();
  const waitDb = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return fn();
  };

  // ================= Titolare, da computer =================
  const admin = await session("andrea", ADMIN_PW, "desktop");
  const A = admin.p;

  // Spenta: voce nascosta nel menù in alto, si arriva da Impostazioni, si accende da qui
  setBookingSetting({ enabled: false });
  await A.goto(`${BASE}/account`, { waitUntil: "networkidle", timeout: 180000 });
  check("spenta: nel menù in alto niente «Prenotazioni»", (await A.locator("nav").getByRole("link", { name: /^Prenotazioni/ }).count()) === 0);
  const fromAccount = A.getByRole("link", { name: /Prenotazioni online \(in prova\)/ });
  check("spenta: in Impostazioni «Prenotazioni online (in prova)»", (await fromAccount.count()) === 1);
  await fromAccount.click();
  await A.waitForURL(/\/prenotazioni$/);
  check("spenta: fascia «Le prenotazioni online sono spente: i clienti non le vedono.» con «Accendi»", /Le prenotazioni online sono spente:\s*i clienti non le vedono/.test(await bodyText(A)) && (await A.getByRole("button", { name: "Accendi", exact: true }).count()) === 1);
  await shot(A, "spenta");
  await A.getByRole("button", { name: "Accendi", exact: true }).click();
  const askOn = A.getByRole("alertdialog", { name: "Accendere le prenotazioni online?" });
  await askOn.getByRole("button", { name: "Accendi", exact: true }).click();
  check("«Accendi» con conferma: accese nel database", await waitDb(() => /"enabled":true/.test(DB(`select value from "MenuSetting" where id='bookings'`))));
  await A.reload({ waitUntil: "networkidle" });
  check("accesa: voce «Prenotazioni» nel menù in alto", (await A.getByRole("link", { name: /^Prenotazioni/ }).count()) >= 1);

  // Richieste di prova
  const R = {
    conf: await make("Prova C Conferma", { note: "Prova C seggiolone", allergies: true, source: "google" }),
    mail: await make("Prova C Email", { contact: "email", email: "prova-c@example.com" }),
    prop: await make("Prova C Proposta"),
    decl: await make("Prova C Completo"),
    canc: await make("Prova C Annulla"),
    race: await make("Prova C Insieme"),
    perm: await make("Prova C Permesso"),
  };

  await goList(A);
  const navLink = A.getByRole("link", { name: /^Prenotazioni/ }).first();
  const pending = Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and status='PENDING' and "startsAt">=now()`));
  check("menù in alto: il numero delle richieste da confermare", new RegExp(`${pending} da confermare`).test((await navLink.getAttribute("aria-label")) ?? (await navLink.innerText())), `${await navLink.getAttribute("aria-label")} (attese ${pending})`);
  const todo = A.getByRole("tab", { name: /^Da gestire/ });
  const todoN = Number((await todo.innerText()).match(/\d+/)?.[0] ?? 0);
  // Il numero della scheda conta anche le risposte ancora da mandare su WhatsApp.
  check("scheda «Da gestire» aperta, con il numero", (await todo.getAttribute("aria-selected")) === "true" && todoN >= pending, `${await todo.innerText()} (in attesa ${pending})`);
  for (const r of Object.values(R)) check(`«Da gestire»: c'è «${r.name}»`, (await card(A, r.name).count()) === 1);
  const confCard = await card(A, "Prova C Conferma").innerText();
  check("riga: nota, «⚠ Allergie» e da Google", /Prova C seggiolone/.test(confCard) && /Allergie/.test(confCard) && /Google/.test(confCard), confCard.replace(/\n/g, " "));
  await shot(A, "da-gestire");

  // Dettaglio e conferma (titolare: WhatsApp pronto)
  const s1 = await openCard(A, "Prova C Conferma");
  const s1t = await s1.innerText();
  check("dettaglio: allergie, nota, telefono, da dove arriva", /allergie o intolleranze/.test(s1t) && /Prova C seggiolone/.test(s1t) && /Telefono/i.test(s1t) && /Google/.test(s1t));
  check("dettaglio: pulsanti «✓ Conferma», «Proponi un altro orario», «Siamo al completo»", (await s1.getByRole("button", { name: "✓ Conferma" }).count()) === 1 && (await s1.getByRole("button", { name: "Proponi un altro orario" }).count()) === 1 && (await s1.getByRole("button", { name: "Siamo al completo" }).count()) === 1);
  await shot(A, "dettaglio");
  await s1.getByRole("button", { name: "✓ Conferma" }).click();
  await s1.getByText("✓ Confermata").waitFor();
  check("conferma: nel database «CONFIRMED» da chi ha risposto", status(R.conf.id) === `CONFIRMED|${ADMIN_NAME}|`, status(R.conf.id));
  const wa = s1.getByRole("link", { name: "Manda la risposta su WhatsApp" });
  const waHref = (await wa.getAttribute("href")) ?? "";
  check("conferma: «Manda la risposta su WhatsApp» con il messaggio già scritto per il numero del cliente", /^https:\/\/wa\.me\/39333\d+\?text=/.test(waHref) && decodeURIComponent(waHref).includes("ti aspettiamo"), waHref.slice(0, 60));
  const [popup] = await Promise.all([admin.ctx.waitForEvent("page"), wa.click()]);
  await popup.close();
  check("WhatsApp aperto: segnato nella cronologia", await waitDb(() => DB(`select count(*) from "BookingLog" where "requestId"='${R.conf.id}' and kind='WHATSAPP_OPENED'`) === "1"));
  await shot(A, "confermata");
  await s1.getByRole("button", { name: "Torna all'elenco" }).click();

  // Conferma per chi vuole l'email
  await goList(A);
  const s2 = await openCard(A, "Prova C Email");
  await s2.getByRole("button", { name: "✓ Conferma" }).click();
  await s2.getByText("✓ Confermata").waitFor();
  check("email: «✓ Email inviata a prova-c@example.com», niente pulsante WhatsApp", /✓ Email inviata a prova-c@example\.com/.test(await s2.innerText()) && (await s2.getByRole("link", { name: "Manda la risposta su WhatsApp" }).count()) === 0);
  await A.keyboard.press("Escape");

  // Proposta di un altro orario + il cliente accetta
  await goList(A);
  const s3 = await openCard(A, "Prova C Proposta");
  await s3.getByRole("button", { name: "Proponi un altro orario" }).click();
  const choices = s3.getByRole("radiogroup", { name: "Orario da proporre" }).getByRole("radio");
  check("proposta: orari dello stesso giorno (senza quello chiesto)", (await choices.count()) >= 1 && !(await choices.allInnerTexts()).includes(DB(`select time from "BookingRequest" where id='${R.prop.id}'`)));
  const newTime = (await choices.last().innerText()).trim();
  await choices.last().click();
  await s3.getByRole("button", { name: `Proponi le ${newTime}` }).click();
  await s3.getByText(`✓ Proposte le ${newTime}`).waitFor();
  check("proposta: «PROPOSED» con l'orario scelto", DB(`select status||'|'||"proposedTime" from "BookingRequest" where id='${R.prop.id}'`) === `PROPOSED|${newTime}`);
  await A.keyboard.press("Escape");
  const cust = await newContext(browser, "phone", { extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  const C = await cust.newPage();
  await C.goto(`${BASE}${R.prop.path}`, { waitUntil: "networkidle" });
  await C.getByRole("button", { name: `Sì, va bene alle ${newTime}` }).click();
  check("il cliente accetta: confermata alle " + newTime, await waitDb(() => DB(`select status||'|'||time from "BookingRequest" where id='${R.prop.id}'`) === `CONFIRMED|${newTime}`));
  await goList(A);
  await tab(A, "Prossimi giorni");
  check("«Prossimi giorni»: la proposta accettata c'è, con il nuovo orario", (await card(A, "Prova C Proposta").count()) === 1 && (await card(A, "Prova C Proposta").innerText()).includes(newTime));
  const nextTxt = await A.getByRole("tabpanel").innerText();
  check("«Prossimi giorni»: totale persone del giorno", /\d+ persone · \d+ tavol/.test(nextTxt));
  await shot(A, "prossimi-giorni");

  // Al completo
  await goList(A);
  const s4 = await openCard(A, "Prova C Completo");
  await s4.getByRole("button", { name: "Siamo al completo" }).click();
  await s4.getByLabel("Messaggio per il cliente (facoltativo)").fill("Prova C riprova sabato");
  await s4.getByRole("button", { name: "Rispondi: al completo" }).click();
  await s4.getByText("✓ Risposto: siamo al completo").waitFor();
  check("al completo: «DECLINED» con il messaggio", DB(`select status||'|'||"staffMessage" from "BookingRequest" where id='${R.decl.id}'`) === "DECLINED|Prova C riprova sabato");
  await C.goto(`${BASE}${R.decl.path}`, { waitUntil: "networkidle" });
  check("il cliente legge «Ci dispiace, siamo al completo» e il messaggio", /Ci dispiace, siamo al completo/.test(await C.locator("main").innerText()) && /Prova C riprova sabato/.test(await C.locator("main").innerText()));
  await A.keyboard.press("Escape");

  // Il cliente annulla: sparisce da «Da gestire», va in Archivio
  await C.goto(`${BASE}${R.canc.path}`, { waitUntil: "networkidle" });
  await C.getByRole("button", { name: "Annulla la richiesta" }).click();
  await C.getByRole("button", { name: "Sì, annulla" }).click();
  check("il cliente annulla dalla sua pagina", await waitDb(() => status(R.canc.id) === "CANCELLED||cliente"));
  await goList(A);
  check("annullata dal cliente: non è più in «Da gestire»", (await card(A, "Prova C Annulla").count()) === 0);
  await tab(A, "Archivio");
  check("…è in «Archivio»", (await card(A, "Prova C Annulla").count()) === 1);
  const s5 = await openCard(A, "Prova C Annulla");
  check("…e il dettaglio dice «Il cliente ha annullato dalla sua pagina.»", /Il cliente ha annullato dalla sua pagina/.test(await s5.innerText()));
  await shot(A, "archivio");
  await A.keyboard.press("Escape");

  // Il locale annulla una confermata
  await goList(A);
  await tab(A, "Prossimi giorni");
  const s6 = await openCard(A, "Prova C Conferma");
  await s6.getByRole("button", { name: "Annulla la prenotazione" }).click();
  await s6.getByRole("button", { name: "Sì, annulla e avvisa" }).click();
  await s6.getByText("✓ Prenotazione annullata").waitFor();
  check("il locale annulla: «CANCELLED» dal locale, WhatsApp pronto con le scuse", status(R.conf.id) === `CANCELLED|${ADMIN_NAME}|locale` && decodeURIComponent((await s6.getByRole("link", { name: "Manda la risposta su WhatsApp" }).getAttribute("href")) ?? "").includes("dobbiamo annullare"));
  await A.keyboard.press("Escape");

  // ================= Due dipendenti confermano insieme =================
  const marta = await session("marta", EMP_PW);
  const giulia = await session("giulia", EMP_PW);
  await goList(marta.p);
  await goList(giulia.p);
  check("dipendente con permesso: vede l'elenco e la voce nel menù", (await marta.p.getByRole("tab", { name: /^Da gestire/ }).count()) === 1 && (await marta.p.getByRole("link", { name: /^Prenotazioni/ }).count()) >= 1);
  await shot(marta.p, "telefono-da-gestire");
  const mS = await openCard(marta.p, "Prova C Insieme");
  const gS = await openCard(giulia.p, "Prova C Insieme");
  await Promise.all([mS.getByRole("button", { name: "✓ Conferma" }).click(), gS.getByRole("button", { name: "✓ Conferma" }).click()]);
  await marta.p.waitForTimeout(2500);
  const winner = DB(`select "handledBy" from "BookingRequest" where id='${R.race.id}'`);
  const [win, lose] = winner === MARTA.name ? [marta.p, giulia.p] : [giulia.p, marta.p];
  check("insieme: una sola conferma nel database", DB(`select count(*) from "BookingLog" where "requestId"='${R.race.id}' and kind='CONFIRMED'`) === "1" && [MARTA.name, GIULIA.name].includes(winner), winner);
  check("insieme: chi ha vinto legge «✓ Confermata»", /✓ Confermata/.test(await bodyText(win)));
  check(`insieme: l'altro legge «Già confermata da ${winner}.»`, (await bodyText(lose)).includes(`Già confermata da ${winner}.`), (await bodyText(lose)).match(/Già[^\n]*/)?.[0] ?? "nessun messaggio");
  check("dipendente (non dal telefono del locale): «la risposta su WhatsApp la manda il telefono del locale»", /La risposta su WhatsApp la manda il telefono del locale/.test(await bodyText(win)));
  await shot(lose, "gia-confermata");
  await marta.ctx.close();
  await giulia.ctx.close();

  // ================= Permessi =================
  const sara = await session("sara", EMP_PW);
  const S = sara.p;
  await S.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
  const saraTxt = await bodyText(S);
  check("senza permesso: «Non hai il permesso di gestire le prenotazioni»", /Non hai il permesso di gestire le prenotazioni/.test(saraTxt));
  check("senza permesso: nessun nome di cliente, nessuna voce nel menù", !/Prova C/.test(saraTxt) && (await S.getByRole("link", { name: /^Prenotazioni/ }).count()) === 0);
  await shot(S, "senza-permesso");
  // Il titolare dà il permesso da «Dipendenti»
  await A.goto(`${BASE}/dipendenti`, { waitUntil: "networkidle", timeout: 180000 });
  const sw = A.getByRole("switch", { name: `Può gestire le prenotazioni: ${SARA.name}` });
  // Le schede dei dipendenti sono chiuse: si aprono tutte (come in editor.mjs).
  while (await A.getByRole("button", { name: "Settimana, accesso e azioni" }).count()) await A.getByRole("button", { name: "Settimana, accesso e azioni" }).first().click();
  check("Dipendenti: interruttore «Può gestire le prenotazioni» spento", (await sw.getAttribute("aria-checked")) === "false");
  await sw.click();
  check("Dipendenti: acceso → salvato", await waitDb(() => DB(`select "canManageBookings" from "Employee" where id='${SARA.id}'`) === "t"));
  await goList(S);
  check("con permesso: Sara vede le richieste e la voce nel menù", (await card(S, "Prova C Permesso").count()) === 1 && (await S.getByRole("link", { name: /^Prenotazioni/ }).count()) >= 1);
  const sS = await openCard(S, "Prova C Permesso");
  // Revoca mentre Sara ha la richiesta aperta
  await sw.click();
  check("Dipendenti: spento → salvato", await waitDb(() => DB(`select "canManageBookings" from "Employee" where id='${SARA.id}'`) === "f"));
  await sS.getByRole("button", { name: "✓ Conferma" }).click();
  await S.waitForTimeout(2000);
  check("revoca immediata: la conferma di Sara non passa", status(R.perm.id) === "PENDING||", status(R.perm.id));
  check("revoca immediata: Sara legge «Non hai più il permesso…»", /Non hai più il permesso di gestire le prenotazioni/.test(await bodyText(S)), (await bodyText(S)).match(/permesso[^\n]*/)?.[0]);
  await S.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle" });
  check("revoca: ricaricando, la pagina è chiusa", /Non hai il permesso di gestire le prenotazioni/.test(await bodyText(S)) && !/Prova C/.test(await bodyText(S)));
  await sara.ctx.close();

  // ================= Stasera: chiusura, Arrivati / Non venuti =================
  const late = await make("Prova C Attesa stasera");
  moveToToday(late.id, 120);
  const t1 = await make("Prova C Tavolo arrivato", { people: 3 });
  moveToToday(t1.id, -30, "CONFIRMED");
  const t2 = await make("Prova C Tavolo dopo", { people: 4 });
  moveToToday(t2.id, 90, "CONFIRMED");
  await goList(A);
  const closeBtn = A.getByRole("button", { name: "Siamo pieni stasera" });
  const todayHasHours = (await closeBtn.count()) === 1;
  if (todayHasHours) {
    await closeBtn.click();
    const ask = A.getByRole("alertdialog", { name: "Siamo pieni stasera?" });
    // Contando anche richieste di altri (il database di prova è condiviso).
    const nToday = Number(DB(`select count(*) from "BookingRequest" where status='PENDING' and day='${TODAY}' and "startsAt">=now()`));
    const expect = nToday === 1 ? "C'è 1 richiesta in attesa per stasera: rispondi a ognuna" : `Ci sono ${nToday} richieste in attesa per stasera: rispondi a ognuna`;
    check("«Siamo pieni stasera» con richieste in attesa: avvisa «Ci sono N richieste in attesa… rispondi a ognuna»", (await ask.innerText()).replace(/\s+/g, " ").includes(expect), (await ask.innerText()).replace(/\s+/g, " "));
    await ask.getByRole("button", { name: "Chiudi le richieste" }).click();
    check("stasera chiusa: salvata", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${TODAY}'`) === "1"));
    await A.waitForTimeout(800);
    check("stasera chiusa: «Stasera siete pieni» e «Riapri le richieste»", /Stasera siete pieni/.test(await bodyText(A)) && (await A.getByRole("button", { name: "Riapri le richieste" }).count()) === 1);
    check("la richiesta in attesa resta da gestire (non si chiude da sola)", status(late.id) === "PENDING||");
    const pub = await (await newContext(browser, "phone")).newPage();
    await pub.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle" });
    check("il cliente vede oggi «Completo»", /Completo/.test(await pub.locator(`[data-day="${TODAY}"]`).innerText()));
    await pub.context().close();
    await A.getByRole("button", { name: "Riapri le richieste" }).click();
    check("«Riapri le richieste»: riaperta", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${TODAY}'`) === "0"));
  } else check("oggi il locale è aperto (per provare «Siamo pieni stasera»)", false, "oggi chiuso negli orari: prova saltata");

  // Chiudi le richieste di un altro giorno
  await goList(A);
  await tab(A, "Prossimi giorni");
  await A.getByLabel("Giorno da chiudere").fill(D2.day);
  await A.getByRole("tabpanel").getByRole("button", { name: "Chiudi le richieste" }).last().click();
  const askD2 = A.getByRole("alertdialog");
  if (await askD2.count()) await askD2.getByRole("button", { name: "Chiudi le richieste" }).click();
  check("altro giorno: richieste chiuse", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${D2.day}'`) === "1"));
  const r = await postRequest({ day: D2.day, time: D2.slots[0], people: 2, name: "Prova C Giorno chiuso", phone: randomPhone(), contact: "whatsapp", privacy: true, t: await formStamp() });
  check("altro giorno chiuso: il cliente riceve «già al completo»", r.json?.ok === false && /al completo/.test(r.json.error));
  await A.waitForTimeout(800);
  await A.getByRole("button", { name: "Riapri", exact: true }).first().click();
  check("«Riapri»: riaperto", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${D2.day}'`) === "0"));

  // Stasera: arrivati / non venuti
  await goList(A);
  await tab(A, "Stasera");
  const tonight = A.getByRole("region", { name: "Stasera" });
  const tt = await tonight.innerText();
  const ppl = DB(`select coalesce(sum(people),0)||'|'||count(*) from "BookingRequest" where status='CONFIRMED' and day='${TODAY}'`).split("|");
  check(`«Stasera»: le confermate di oggi, totale ${ppl[0]} persone · ${ppl[1]} tavoli`, tt.startsWith(`${ppl[0]} persone · ${ppl[1]} tavol`) && /Prova C Tavolo arrivato/.test(tt) && /Prova C Tavolo dopo/.test(tt), tt.split("\n")[0]);
  const row1 = tonight.getByRole("listitem").filter({ hasText: "Prova C Tavolo arrivato" });
  const row2 = tonight.getByRole("listitem").filter({ hasText: "Prova C Tavolo dopo" });
  check("«Non venuti» solo dopo l'orario", (await row1.getByRole("button", { name: "Non venuti" }).count()) === 1 && (await row2.getByRole("button", { name: "Non venuti" }).count()) === 0);
  check("telefono del cliente tocca-per-chiamare", /^tel:\+39/.test((await row1.getByRole("link").first().getAttribute("href")) ?? ""));
  await shot(A, "stasera");
  await row1.getByRole("button", { name: "✓ Arrivati" }).click();
  check("«✓ Arrivati»: segnato", await waitDb(() => DB(`select "arrivedAt" is not null from "BookingRequest" where id='${t1.id}'`) === "t"));
  await row1.getByRole("button", { name: "Togli il segno" }).click();
  check("«Togli il segno»: tolto", await waitDb(() => DB(`select "arrivedAt" is null and "noShowAt" is null from "BookingRequest" where id='${t1.id}'`) === "t"));
  await row1.getByRole("button", { name: "Non venuti" }).click();
  check("«Non venuti»: segnato", await waitDb(() => DB(`select "noShowAt" is not null from "BookingRequest" where id='${t1.id}'`) === "t"));

  // Numeri
  await goList(A);
  await tab(A, "Numeri");
  const total = DB(`select count(*) from "BookingRequest" where "isTest"=false and "createdAt" >= now() - interval '90 days'`);
  const nums = await A.getByRole("tabpanel").innerText();
  check("«Numeri»: richieste totali come nel database", new RegExp(`Richieste\\s*${total}\\b`, "i").test(nums), nums.replace(/\n/g, " ").slice(0, 160));
  check("«Numeri»: «Da dove arrivano» con Google e Menù", /Da dove arrivano/.test(nums) && /Google/.test(nums) && /Menù/.test(nums));
  check("«Numeri»: almeno 1 «Non venuti»", /Non venuti\s*[1-9]/i.test(nums));
  await shot(A, "numeri");

  // Impostazioni (solo titolare)
  await A.getByRole("button", { name: "Impostazioni" }).click();
  const st = A.getByRole("dialog");
  check("impostazioni: link per Google …/prenota?da=google", /\/prenota\?da=google/.test(await st.innerText()));
  await st.locator('input[name="maxPeople"]').fill("8");
  await st.getByRole("button", { name: "Salva" }).click();
  check("impostazioni: «Persone al massimo» 8 salvato", await waitDb(() => /"maxPeople":8/.test(DB(`select value from "MenuSetting" where id='bookings'`))));
  await shot(A, "impostazioni");
  const pub = await (await newContext(browser, "phone")).newPage();
  await pub.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle" });
  check("…e il modulo del cliente arriva a 8, poi «Più di 8»", (await pub.getByRole("radiogroup", { name: "Quante persone" }).getByRole("radio").count()) === 9 && (await pub.getByRole("radio", { name: "Più di 8" }).count()) === 1);
  await pub.context().close();
  setBookingSetting({ enabled: true });

  // Errori JavaScript
  check("nessun errore JavaScript nelle pagine del personale", A.errs.length === 0, A.errs.join(" | "));

  // ================= Widget «Da fare» =================
  {
    const k = "adv_" + randomBytes(32).toString("base64url");
    DB(`insert into "WidgetDevice" (id, "userId", name, "keyHash") values ('w_provac_${randomBytes(3).toString("hex")}', (select id from "User" where username='andrea'), 'Prova C', '${createHash("sha256").update(k).digest("hex")}')`);
    const get = async (w) => (await fetch(`${BASE}/api/widget/${w}`, { headers: { Authorization: `Bearer ${k}`, "X-Forwarded-For": randomIp() } })).json();
    const pend = Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and status='PENDING' and "startsAt">=now()`));
    const df = await get("dafare");
    const row = df.righe?.find((x) => x.breve === "prenotazioni");
    check("widget «Da fare»: riga delle richieste di prenotazione, con il numero e il link", pend > 0 && row?.n === pend && row.link === "/prenotazioni" && /richieste? di prenotazione/.test(row.testo), JSON.stringify(row));
    check("widget «Da fare»: le prenotazioni per prime", df.righe?.[0]?.breve === "prenotazioni");
    const pan = await get("pannello");
    check("widget «Pannello»: tra le cose da fare «Prenotazioni: N»", (pan.daFareVoci ?? []).some((v) => new RegExp(`Prenotazioni.*${pend}`).test(v)), JSON.stringify(pan.daFareVoci));
    setBookingSetting({ enabled: false });
    const off = await get("dafare");
    check("widget «Da fare»: spente, niente riga delle prenotazioni", !(off.righe ?? []).some((x) => x.breve === "prenotazioni"));
    setBookingSetting({ enabled: true });
    DB(`delete from "WidgetDevice" where name='Prova C'`);
  }
  await admin.ctx.close();
  await cust.close();
} catch (e) {
  check("la prova è arrivata in fondo", false, e?.stack ?? String(e));
} finally {
  await browser?.close();
  cleanBookings();
  // Le serate chiuse dalla prova (anche dal titolare, che le salva col suo nome) spariscono; quelle di prima restano.
  for (const d of [TODAY, D2?.day].filter(Boolean)) if (!savedClosed.includes(d)) DB(`delete from "BookingClosedDay" where day='${d}'`);
  DB(`delete from "WidgetDevice" where name='Prova C'`);
  restoreBookingSetting(savedSetting);
  restorePermissions(savedPerms);
}
check("pulizia: nessuna richiesta «Prova C» rimasta", DB(`select count(*) from "BookingRequest" where name like 'Prova C%'`) === "0");
check("pulizia: impostazione «bookings» come prima", snapshotBookingSetting() === savedSetting);
check("pulizia: permessi dei dipendenti come prima", JSON.stringify(snapshotPermissions()) === JSON.stringify(savedPerms));
process.exit(finish());
