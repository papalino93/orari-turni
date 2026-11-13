// Prenotazioni online, parte del personale (E2E sul server di prova): elenco «Da gestire», dettaglio,
// conferma (WhatsApp ed email), proposta + accettazione del cliente, «al completo», annullo del cliente
// e del locale, due persone che confermano insieme, permessi dei dipendenti (senza, con, revoca
// immediata), «Stasera siamo al completo» e chiusura di un altro giorno, «Arrivati»/«Non venuti», Numeri,
// accendi/spegni e impostazioni, voce del menù in alto, widget «Da fare»; il cliente ha detto sì/no
// (segnato da chi lavora), «Ci ha avvisato il cliente», «Il cliente non viene più», «Cancella i dati»,
// lista «Da mandare su WhatsApp», tocco sulla notifica (?r=), barra in alto a 1024 px.
// Non dipende dall'ora: se oggi non ci sono più orari prenotabili, le prove della fascia di stasera
// controllano che non ci sia e la chiusura si prova su un altro giorno.
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
  // La pagina si apre sull'agenda: queste prove lavorano su «Da gestire» (todo = false: resta sull'agenda).
  const goList = async (p, todo = true) => {
    await p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    // L'invito alle notifiche non serve qui.
    const later = p.getByRole("button", { name: "Non ora" });
    if (await later.count()) await later.click();
    const todoTab = p.getByRole("tab", { name: /^Da gestire/ });
    if (todo && (await todoTab.count())) await todoTab.click();
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

  // Tutto spento: voce nascosta nel menù in alto, si arriva da Impostazioni, si accende da qui
  setBookingSetting({ agendaEnabled: false, enabled: false });
  // Una prova segnata a mano per domani (e una richiesta di prova): all'accensione si chiede che farne.
  DB(`delete from "BookingRequest" where "isTest"=true`);
  DB(`insert into "BookingRequest" (id, code, "tokenHash", status, day, time, "startsAt", people, name, phone, contact, "isTest", manual, "createdBy", "updatedAt") values ('provacprovavera01', 'PRVC11', 'prova-c-prova-vera', 'CONFIRMED', '${D1.day}', '20:00', now() + interval '2 days', 3, 'Prova C Prova vera', '', 'whatsapp', true, true, 'Andrea', now()), ('provacprovaonl01', 'PRVC12', 'prova-c-prova-onl', 'PENDING', '${D1.day}', '20:30', now() + interval '2 days', 2, 'Prova C Prova online', '393330000000', 'whatsapp', true, false, null, now())`);
  await A.goto(`${BASE}/account`, { waitUntil: "networkidle", timeout: 180000 });
  check("spenta: nel menù in alto niente «Prenotazioni»", (await A.locator("nav").getByRole("link", { name: /^Prenotazioni/ }).count()) === 0);
  const fromAccount = A.getByRole("link", { name: /Prenotazioni e agenda \(in prova\)/ });
  check("spenta: in Impostazioni «Prenotazioni e agenda (in prova)»", (await fromAccount.count()) === 1);
  await fromAccount.click();
  await A.waitForURL(/\/prenotazioni$/);
  check("spenta: fascia «Agenda spenta · Richieste online spente» con «Accendi l'agenda»", /Agenda spenta · Richieste online spente/.test(await bodyText(A)) && (await A.getByRole("button", { name: "Accendi l'agenda", exact: true }).count()) === 1);
  await shot(A, "spenta");
  await A.getByRole("button", { name: "Accendi l'agenda", exact: true }).click();
  const askOn = A.getByRole("alertdialog", { name: "Accendere l'agenda?" });
  await askOn.getByRole("button", { name: "Accendi", exact: true }).click();
  const askTests = A.getByRole("alertdialog", { name: /Ci sono 2 prenotazioni di prova: cancellarle\?/ });
  await askTests.waitFor({ timeout: 30000 }).catch(() => {});
  check("accendendo l'agenda: «Ci sono 2 prenotazioni di prova: cancellarle?» con tre scelte", (await askTests.count()) === 1 && (await askTests.getByRole("button", { name: "Cancella le prove" }).count()) === 1 && (await askTests.getByRole("button", { name: "Tienile e rendile vere" }).count()) === 1 && (await askTests.getByRole("button", { name: "Annulla" }).count()) === 1);
  await shot(A, "prove-domanda");
  await askTests.getByRole("button", { name: "Tienile e rendile vere" }).click();
  check("«Tienile e rendile vere»: l'agenda è accesa, le richieste online restano spente", await waitDb(() => /"agendaEnabled":true/.test(DB(`select value from "MenuSetting" where id='bookings'`)) && /"enabled":false/.test(DB(`select value from "MenuSetting" where id='bookings'`))));
  check("…la prova a mano di domani è diventata vera, la richiesta di prova è sparita", DB(`select string_agg(name||':'||"isTest", ',') from "BookingRequest" where id in ('provacprovavera01','provacprovaonl01')`) === "Prova C Prova vera:false");
  DB(`delete from "BookingRequest" where id='provacprovavera01'`);
  await A.reload({ waitUntil: "networkidle" });
  check("agenda accesa: voce «Prenotazioni» nel menù in alto e fascia «Agenda accesa · Richieste online spente»", (await A.getByRole("link", { name: /^Prenotazioni/ }).count()) >= 1 && /Agenda accesa · Richieste online spente/.test(await bodyText(A)));
  // Le richieste online si accendono dalle impostazioni (secondo interruttore).
  await A.getByRole("button", { name: "Impostazioni delle prenotazioni" }).click();
  await A.getByRole("switch", { name: "Richieste online dai clienti accese" }).click();
  await A.getByRole("alertdialog", { name: "Accendere le richieste online?" }).getByRole("button", { name: "Accendi", exact: true }).click();
  check("interruttore «Richieste online dai clienti»: accese nel database", await waitDb(() => /"enabled":true/.test(DB(`select value from "MenuSetting" where id='bookings'`))));
  await shot(A, "interruttori");
  await A.keyboard.press("Escape");
  await A.reload({ waitUntil: "networkidle" });

  // Richieste di prova
  const R = {
    conf: await make("Prova C Conferma", { note: "Prova C seggiolone", allergies: true, source: "google" }),
    mail: await make("Prova C Email", { contact: "email", email: "prova-c@example.com" }),
    prop: await make("Prova C Proposta"),
    decl: await make("Prova C Completo"),
    canc: await make("Prova C Annulla"),
    race: await make("Prova C Insieme"),
    perm: await make("Prova C Permesso"),
    yes: await make("Prova C Detto si"),
    no: await make("Prova C Detto no"),
    told: await make("Prova C Avvisato"),
    gone: await make("Prova C Sparito"),
    erase: await make("Prova C Dati"),
  };

  await goList(A, false);
  check("la pagina si apre sull'agenda (prima scheda)", (await A.getByRole("tab", { name: /^Agenda/ }).getAttribute("aria-selected")) === "true");
  await A.getByRole("tab", { name: /^Da gestire/ }).click();
  const navLink = A.getByRole("link", { name: /^Prenotazioni/ }).first();
  const pending = Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and status='PENDING' and "startsAt">=now()`));
  check("menù in alto: il numero delle richieste da confermare", new RegExp(`${pending} (richiest[ae] )?da confermare`).test((await navLink.getAttribute("aria-label")) ?? (await navLink.innerText())), `${await navLink.getAttribute("aria-label")} (attese ${pending})`);
  const todo = A.getByRole("tab", { name: /^Da gestire/ });
  const todoN = Number((await todo.innerText()).match(/\d+/)?.[0] ?? 0);
  // Il numero della scheda = solo le richieste da confermare (come il pallino del menù in alto); le prove del titolare comprese.
  const pendingAll = Number(DB(`select count(*) from "BookingRequest" where status='PENDING' and "startsAt">=now() and day >= '${TODAY}'`));
  check("scheda «Da gestire», con il numero delle richieste da confermare", (await todo.getAttribute("aria-selected")) === "true" && todoN === pendingAll, `${await todo.innerText()} (da confermare ${pendingAll})`);
  check("titolo «Da confermare (N)» sopra le richieste", (await A.getByRole("heading", { name: `Da confermare (${pendingAll})` }).count()) === 1);
  for (const r of Object.values(R)) check(`«Da gestire»: c'è «${r.name}»`, (await card(A, r.name).count()) === 1);
  const confCard = await card(A, "Prova C Conferma").innerText();
  check("riga: nota, «⚠ Allergie: chiedere al tavolo» e «da Google»", /Prova C seggiolone/.test(confCard) && /⚠ Allergie: chiedere al tavolo/.test(confCard) && /da Google/.test(confCard), confCard.replace(/\n/g, " "));
  await shot(A, "da-gestire");

  // Dettaglio e conferma (titolare: WhatsApp pronto)
  const s1 = await openCard(A, "Prova C Conferma");
  const s1t = await s1.innerText();
  check("dettaglio: allergie, nota, telefono, da dove arriva", /⚠ Allergie: chiedere al tavolo/.test(s1t) && /Prova C seggiolone/.test(s1t) && /Telefono/i.test(s1t) && /Da Google/.test(s1t));
  check("dettaglio: pulsanti «✓ Conferma», «Proponi un altro orario», «Rispondi: siamo al completo»", (await s1.getByRole("button", { name: "✓ Conferma" }).count()) === 1 && (await s1.getByRole("button", { name: "Proponi un altro orario" }).count()) === 1 && (await s1.getByRole("button", { name: "Rispondi: siamo al completo" }).count()) === 1);
  check("dettaglio (titolare): «Chiama» e «Scrivi» su WhatsApp", (await s1.getByRole("link", { name: "Chiama" }).count()) === 1 && (await s1.getByRole("link", { name: "Scrivi" }).count()) === 1);
  await shot(A, "dettaglio");
  await s1.getByRole("button", { name: "✓ Conferma" }).click();
  await s1.getByText("✓ Confermata").waitFor();
  check("dopo «Conferma»: l'etichetta di prima («Da confermare · arrivata…») non c'è più", !/Da confermare|arrivata .* fa/.test(await s1.innerText()));
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
  check("«Prossimi giorni»: totale del giorno «N prenotazioni · P persone» (niente «tavoli»)", /\d+ prenotazion[ei] · \d+ person[ae]/.test(nextTxt) && !/tavoli\b/.test(nextTxt));
  await shot(A, "prossimi-giorni");

  // Al completo
  await goList(A);
  const s4 = await openCard(A, "Prova C Completo");
  await s4.getByRole("button", { name: "Rispondi: siamo al completo" }).click();
  await s4.getByLabel("Messaggio per il cliente (facoltativo)").fill("Prova C riprova sabato");
  check("al completo: titolo e pulsante con lo stesso testo «Rispondi: siamo al completo»", (await s4.getByText("Rispondi: siamo al completo", { exact: true }).count()) === 2);
  await s4.getByRole("button", { name: "Rispondi: siamo al completo" }).click();
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
  check("annullo: due scelte, «Ci ha avvisato il cliente» e «Annulliamo noi»", (await s6.getByRole("button", { name: "Ci ha avvisato il cliente (nessun messaggio)" }).count()) === 1 && (await s6.getByRole("button", { name: "Annulliamo noi (il cliente riceve le scuse)" }).count()) === 1);
  await s6.getByRole("button", { name: "Annulliamo noi (il cliente riceve le scuse)" }).click();
  await s6.getByRole("button", { name: "Sì, annulla e avvisa" }).click();
  await s6.getByText("✓ Prenotazione annullata").waitFor();
  check("il locale annulla: «CANCELLED» dal locale, WhatsApp pronto con le scuse", status(R.conf.id) === `CANCELLED|${ADMIN_NAME}|locale` && decodeURIComponent((await s6.getByRole("link", { name: "Manda la risposta su WhatsApp" }).getAttribute("href")) ?? "").includes("dobbiamo annullare"));
  await A.keyboard.press("Escape");

  // ---------- Il cliente ha detto sì / no all'orario proposto (risposta arrivata su WhatsApp o al telefono)
  const proposeOn = async (r) => {
    await goList(A);
    const sh = await openCard(A, r.name);
    await sh.getByRole("button", { name: "Proponi un altro orario" }).click();
    const radios = sh.getByRole("radiogroup", { name: "Orario da proporre" }).getByRole("radio");
    const t = (await radios.last().innerText()).trim();
    await radios.last().click();
    await sh.getByRole("button", { name: `Proponi le ${t}` }).click();
    await sh.getByText(`✓ Proposte le ${t}`).waitFor();
    await A.keyboard.press("Escape");
    return t;
  };
  const yesTime = await proposeOn(R.yes);
  await goList(A);
  const sy = await openCard(A, R.yes.name);
  const yesBtn = sy.getByRole("button", { name: `Il cliente ha detto sì: conferma alle ${yesTime}` });
  check("proposta in attesa: pulsante «Il cliente ha detto sì: conferma alle …» e «Il cliente ha detto no»", (await yesBtn.count()) === 1 && (await sy.getByRole("button", { name: "Il cliente ha detto no" }).count()) === 1);
  await shot(A, "proposta-in-attesa");
  await yesBtn.click();
  await sy.getByText(`✓ Confermata alle ${yesTime}`).waitFor();
  check("«Il cliente ha detto sì»: confermata al nuovo orario", DB(`select status||'|'||time||'|'||"handledBy" from "BookingRequest" where id='${R.yes.id}'`) === `CONFIRMED|${yesTime}|${ADMIN_NAME}`);
  check("…con il messaggio di conferma pronto su WhatsApp", decodeURIComponent((await sy.getByRole("link", { name: "Manda la risposta su WhatsApp" }).getAttribute("href")) ?? "").includes("ti aspettiamo"));
  await A.keyboard.press("Escape");
  await goList(A);
  await tab(A, "Prossimi giorni");
  const sy2 = await openCard(A, R.yes.name);
  await sy2.getByText("Cronologia").click();
  check(`cronologia: «Confermata da ${ADMIN_NAME} per il cliente (alle ${yesTime})»`, (await sy2.innerText()).includes(`Confermata da ${ADMIN_NAME} per il cliente (alle ${yesTime})`), (await sy2.innerText()).match(/Confermata da[^\n]*/g)?.join(" | "));
  await A.keyboard.press("Escape");

  await proposeOn(R.no);
  await goList(A);
  const sn = await openCard(A, R.no.name);
  await sn.getByRole("button", { name: "Il cliente ha detto no" }).click();
  await sn.getByText("✓ Segnato: il cliente ha detto no").waitFor();
  check("«Il cliente ha detto no»: chiusa dal cliente, nessun messaggio «al completo» da mandare", status(R.no.id) === `DECLINED|${ADMIN_NAME}|cliente` && (await sn.getByRole("link", { name: "Manda la risposta su WhatsApp" }).count()) === 0);
  await A.keyboard.press("Escape");

  // ---------- «Ci ha avvisato il cliente»: annullata senza messaggi
  await goList(A);
  const st1 = await openCard(A, R.told.name);
  await st1.getByRole("button", { name: "✓ Conferma" }).click();
  await st1.getByText("✓ Confermata").waitFor();
  await A.keyboard.press("Escape");
  await goList(A);
  await tab(A, "Prossimi giorni");
  const st2 = await openCard(A, R.told.name);
  await st2.getByRole("button", { name: "Annulla la prenotazione" }).click();
  await st2.getByRole("button", { name: "Ci ha avvisato il cliente (nessun messaggio)" }).click();
  await st2.getByText("✓ Annullata: il cliente non viene").waitFor();
  check("«Ci ha avvisato il cliente»: annullata dal cliente, niente WhatsApp da mandare", status(R.told.id) === `CANCELLED|${ADMIN_NAME}|cliente` && (await st2.getByRole("link", { name: "Manda la risposta su WhatsApp" }).count()) === 0);
  await A.keyboard.press("Escape");
  await goList(A);
  check("…e non entra nella lista «Da mandare su WhatsApp»", !(await A.getByRole("region", { name: /Da mandare su WhatsApp/ }).innerText().catch(() => "")).includes(R.told.name));

  // ---------- «Il cliente non viene più» (richiesta ancora da confermare)
  const sg = await openCard(A, R.gone.name);
  await sg.getByRole("button", { name: "Il cliente non viene più" }).click();
  const askGone = A.getByRole("alertdialog", { name: "Il cliente non viene più?" });
  await askGone.getByRole("button", { name: "Sì, chiudi la richiesta" }).click();
  check("«Il cliente non viene più»: annullata dal cliente, senza messaggi", await waitDb(() => status(R.gone.id) === `CANCELLED|${ADMIN_NAME}|cliente`), status(R.gone.id));
  await A.keyboard.press("Escape");

  // ---------- Il tocco sulla notifica apre il foglio della richiesta (?r=<id>)
  await A.goto(`${BASE}/prenotazioni?r=${R.erase.id}`, { waitUntil: "networkidle", timeout: 180000 });
  check("/prenotazioni?r=<id>: si apre il foglio di quella richiesta", (await sheet(A, R.erase.name).count()) === 1);
  await A.waitForTimeout(300);
  check("…e l'indirizzo torna /prenotazioni (ricaricando non si riapre)", new URL(A.url()).search === "", A.url());

  // ---------- «Cancella i dati di questa richiesta» (solo titolare)
  const se = sheet(A, R.erase.name);
  await se.getByRole("button", { name: "Cancella i dati di questa richiesta" }).click();
  await A.getByRole("alertdialog", { name: "Cancellare i dati di questa richiesta?" }).getByRole("button", { name: "Cancella i dati" }).click();
  check("«Cancella i dati»: richiesta e cronologia sparite", await waitDb(() => DB(`select count(*) from "BookingRequest" where id='${R.erase.id}'`) === "0" && DB(`select count(*) from "BookingLog" where "requestId"='${R.erase.id}'`) === "0"));

  // ---------- Lista «Da mandare su WhatsApp»: righe compatte, dopo l'apertura «Aperto alle… · Riapri»
  await goList(A);
  const waList = A.getByRole("region", { name: /Da mandare su WhatsApp/ });
  const waRound = waList.getByRole("link", { name: `Manda su WhatsApp a ${R.decl.name}` });
  check("lista WhatsApp (titolare): riga «nome · Al completo · giorno e ora» con il pulsante tondo", (await waRound.count()) === 1 && /Prova C Completo\s+· Al completo · /.test(await waList.innerText()));
  const box = await waRound.boundingBox();
  check("…pulsante tondo di 44 px", box && Math.round(box.width) === 44 && Math.round(box.height) === 44, JSON.stringify(box));
  await shot(A, "lista-whatsapp");
  const [waPop] = await Promise.all([admin.ctx.waitForEvent("page"), waRound.click()]);
  await waPop.close();
  check("…aperta: segnata nella cronologia", await waitDb(() => DB(`select count(*) from "BookingLog" where "requestId"='${R.decl.id}' and kind='WHATSAPP_OPENED'`) === "1"));
  await A.waitForTimeout(1200);
  check("…e la riga resta con «Aperto alle …» e «Riapri»", /Prova C Completo\s+· Aperto alle \d{2}:\d{2}/.test(await waList.innerText()) && (await waList.getByRole("link", { name: "Riapri" }).count()) >= 1);

  // ---------- 1024 px: la barra in alto non scorre e «Esci» si vede tutto
  {
    const narrow = await newContext(browser, "desktop", { viewport: { width: 1024, height: 768 } });
    const np = await narrow.newPage();
    await login(np, "andrea", ADMIN_PW);
    await np.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    const bar = await np.evaluate(() => {
      const out = [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Esci")?.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, esciRight: out ? Math.round(out.right) : null, width: window.innerWidth };
    });
    check("1024 px: niente scorrimento orizzontale, «Esci» dentro lo schermo", bar.overflow <= 0 && bar.esciRight !== null && bar.esciRight <= bar.width, JSON.stringify(bar));
    await shot(np, "1024");
    await narrow.close();
  }

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
  check("dipendente (non dal telefono del locale): nel foglio «Chiama» sì, «Scrivi» no", (await win.getByRole("dialog").getByRole("link", { name: "Chiama" }).count()) === 1 && (await win.getByRole("dialog").getByRole("link", { name: "Scrivi" }).count()) === 0);
  await win.keyboard.press("Escape");
  await goList(win);
  const waN = Number((await win.getByRole("heading", { name: /Da mandare su WhatsApp/ }).innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
  check("dipendente: la lista WhatsApp è una riga sola «N risposte aspettano il telefono del locale»", waN > 0 && new RegExp(`${waN === 1 ? "1 risposta aspetta" : `${waN} risposte aspettano`} il telefono del locale`).test(await win.getByRole("region", { name: /Da mandare su WhatsApp/ }).innerText()) && (await win.getByRole("region", { name: /Da mandare su WhatsApp/ }).getByRole("link").count()) === 0, String(waN));
  // «Segna come già mandata» dal foglio, con «Annulla» nel messaggio
  await tab(win, "Prossimi giorni");
  const ws = await openCard(win, "Prova C Insieme");
  await ws.getByRole("button", { name: "Segna come già mandata" }).click();
  check("«Segna come già mandata» (nel foglio): segnata", await waitDb(() => DB(`select count(*) from "BookingLog" where "requestId"='${R.race.id}' and kind='WHATSAPP_DONE'`) === "1"));
  await win.getByRole("button", { name: "Annulla", exact: true }).click();
  check("…«Annulla» nel messaggio: tolta", await waitDb(() => DB(`select count(*) from "BookingLog" where "requestId"='${R.race.id}' and kind='WHATSAPP_DONE'`) === "0"));
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
  const closeBtn = A.getByRole("button", { name: "Stasera siamo al completo" });
  // La fascia c'è solo finché oggi si può ancora chiedere un tavolo online.
  const todayHasHours = (await closeBtn.count()) === 1;
  if (!todayHasHours) {
    // Senza fascia: deve essere perché oggi non ci sono più orari prenotabili online (si ricontrolla adesso).
    check("oggi niente più orari prenotabili: niente fascia «Stasera siamo al completo»", bookableDays().days[0].state !== "open", days[0].state);
  } else {
    check("fascia di stasera: «Stasera · … · si accettano richieste online»", /Stasera · .* · si accettano richieste online/.test(await bodyText(A)));
    await closeBtn.click();
    const ask = A.getByRole("alertdialog", { name: "Siamo pieni stasera?" });
    // Contando anche richieste di altri (il database di prova è condiviso).
    const nToday = Number(DB(`select count(*) from "BookingRequest" where status='PENDING' and day='${TODAY}' and "startsAt">=now()`));
    const expect = nToday === 1 ? "C'è 1 richiesta in attesa per stasera: rispondi a ognuna" : `Ci sono ${nToday} richieste in attesa per stasera: rispondi a ognuna`;
    check("«Siamo pieni stasera» con richieste in attesa: avvisa «Ci sono N richieste in attesa… rispondi a ognuna»", (await ask.innerText()).replace(/\s+/g, " ").includes(expect), (await ask.innerText()).replace(/\s+/g, " "));
    await ask.getByRole("button", { name: "Chiudi le richieste" }).click();
    check("stasera chiusa: salvata", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${TODAY}'`) === "1"));
    await A.waitForTimeout(800);
    check("stasera chiusa: «Stasera al completo: niente più richieste online.» e «Riapri le richieste»", /Stasera al completo: niente più richieste online\./.test(await bodyText(A)) && (await A.getByRole("button", { name: "Riapri le richieste" }).count()) === 1);
    check("la richiesta in attesa resta da gestire (non si chiude da sola)", status(late.id) === "PENDING||");
    const pub = await (await newContext(browser, "phone")).newPage();
    await pub.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle" });
    check("il cliente vede oggi «Completo»", /Completo/.test(await pub.locator(`[data-day="${TODAY}"]`).innerText()));
    await pub.context().close();
    await A.getByRole("button", { name: "Riapri le richieste" }).click();
    check("«Riapri le richieste»: riaperta", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${TODAY}'`) === "0"));
  }

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
  const tonight = A.getByRole("region", { name: "Stasera", exact: true });
  const pendTonight = Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and status='PENDING' and day='${TODAY}' and "startsAt">=now()`));
  if (pendTonight > 0) check(`«Stasera»: in cima «Da confermare per stasera (${pendTonight})»`, (await A.getByRole("region", { name: `Da confermare per stasera (${pendTonight})` }).count()) === 1);
  const tt = await tonight.innerText();
  const ppl = DB(`select coalesce(sum(people),0)||'|'||count(*) from "BookingRequest" where status='CONFIRMED' and day='${TODAY}'`).split("|");
  // Contano anche le prenotazioni segnate a mano in agenda: niente più «online» nel totale.
  const tot = `Stasera · ${ppl[1]} ${ppl[1] === "1" ? "prenotazione" : "prenotazioni"} · ${ppl[0]} ${ppl[0] === "1" ? "persona" : "persone"}`;
  check(`«Stasera»: le confermate di oggi, «${tot}»`, tt.includes(tot) && /Prova C Tavolo arrivato/.test(tt) && /Prova C Tavolo dopo/.test(tt), tt.split("\n")[0]);
  const navName = (await A.locator("nav").getByRole("link", { name: /^Prenotazioni/ }).first().getAttribute("aria-label")) ?? "";
  check("pallino del menù: aria-label con le cose da fare («… da confermare», «… da mandare su WhatsApp»)", /^Prenotazioni: .*(da confermare|messaggi? da mandare su WhatsApp)/.test(navName), navName);
  const row1 = tonight.getByRole("listitem").filter({ hasText: "Prova C Tavolo arrivato" });
  const row2 = tonight.getByRole("listitem").filter({ hasText: "Prova C Tavolo dopo" });
  check("«Non venuti» solo dopo l'orario", (await row1.getByRole("button", { name: "Non venuti" }).count()) === 1 && (await row2.getByRole("button", { name: "Non venuti" }).count()) === 0);
  const callIcon = row1.getByRole("link", { name: /^Chiama Prova C Tavolo arrivato/ });
  const callBox = await callIcon.boundingBox();
  check("telefono del cliente tocca-per-chiamare: icona di 44 px accanto al nome", /^tel:\+39/.test((await callIcon.getAttribute("href")) ?? "") && Math.round(callBox?.width ?? 0) === 44, JSON.stringify(callBox));
  const arrBox = await row1.getByRole("button", { name: "✓ Arrivati" }).boundingBox();
  const noBox = await row1.getByRole("button", { name: "Non venuti" }).boundingBox();
  check("«✓ Arrivati» e «Non venuti» affiancati, alti 44 px", arrBox && noBox && Math.round(arrBox.height) >= 44 && Math.abs(arrBox.y - noBox.y) < 2 && Math.abs(arrBox.width - noBox.width) < 2, JSON.stringify([arrBox, noBox]));
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
  // Le richieste dal sito, a parte quelle segnate a mano in agenda («Segnate a mano»).
  const total = DB(`select count(*) from "BookingRequest" where "isTest"=false and manual=false and "createdAt" >= now() - interval '90 days'`);
  const nums = await A.getByRole("tabpanel").innerText();
  check("«Numeri»: richieste online come nel database", new RegExp(`Richieste online\\s*${total}\\b`, "i").test(nums), nums.replace(/\n/g, " ").slice(0, 160));
  check("«Numeri»: «Da dove arrivano» con Google e Menù", /Da dove arrivano/.test(nums) && /Google/.test(nums) && /Menù/.test(nums));
  check("«Numeri»: almeno 1 «Non venuti»", /Non venuti\s*[1-9]/i.test(nums));
  await shot(A, "numeri");

  // Impostazioni (solo titolare)
  await A.getByRole("button", { name: "Impostazioni" }).click();
  const st = A.getByRole("dialog");
  check("impostazioni: link per Google …/prenota?da=google", /\/prenota\?da=google/.test(await st.innerText()));
  await st.locator('input[name="maxPeople"]').fill("8");
  await st.getByRole("button", { name: "Salva" }).click();
  check("impostazioni: «Persone massime» 8 salvato", await waitDb(() => /"maxPeople":8/.test(DB(`select value from "MenuSetting" where id='bookings'`))));
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
    check("widget «Pannello»: tra le cose da fare «Tavoli da confermare: N» (o «Richieste da confermare: N»)", (pan.daFareVoci ?? []).some((v) => new RegExp(`(Tavoli|Richieste) da confermare: ${pend}`).test(v)), JSON.stringify(pan.daFareVoci));
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
