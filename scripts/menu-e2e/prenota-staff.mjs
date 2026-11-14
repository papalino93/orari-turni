// Prenotazioni online, parte del personale (E2E sul server di prova): elenco «Da gestire», dettaglio,
// conferma (WhatsApp ed email), proposta + accettazione del cliente, «al completo», annullo del cliente
// e del locale, due persone che confermano insieme, permessi dei dipendenti (senza, con, revoca
// immediata), chiusura delle richieste di stasera e di un altro giorno (⋯ del Giorno), «Arrivati»/«Non venuti», Numeri,
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
  // La pagina è l'agenda: queste prove lavorano nel pannello «Richieste» (todo = false: resta sull'agenda).
  // p.scope: dove si cercano le schede (pannello Richieste, «Cerca», vista Giorno).
  const goList = async (p, todo = true) => {
    await p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    // Il suggerimento degli avvisi non serve qui.
    const later = p.getByRole("button", { name: /^Non ora/ });
    if (await later.count()) await later.click();
    p.scope = p.getByRole("region", { name: "Agenda" });
    if (todo) {
      await p.getByTestId("pulsante-richieste").click();
      p.scope = p.getByRole("dialog", { name: "Richieste" });
      await p.scope.waitFor();
    }
  };
  // Le vecchie schede: «Prossimi giorni» e «Archivio» → «Cerca» (⋯), «Stasera» → Giorno di oggi, «Numeri» → ⋯.
  const tab = async (p, label) => {
    if (label === "Stasera") {
      await p.goto(`${BASE}/prenotazioni?vista=oggi`, { waitUntil: "networkidle", timeout: 180000 });
      p.scope = p.getByRole("region", { name: "Agenda" });
      await p.getByTestId("agenda-orari").waitFor();
      return;
    }
    if (await p.getByRole("dialog", { name: "Richieste" }).count()) await p.getByRole("dialog", { name: "Richieste" }).getByRole("button", { name: "Chiudi" }).click();
    await p.getByRole("button", { name: "Altre azioni" }).click();
    await p.getByRole("menuitem", { name: label === "Numeri" ? /^Numeri/ : /^Cerca/ }).click();
    if (label === "Numeri") {
      p.scope = p.getByRole("dialog", { name: "Numeri delle prenotazioni" });
      return;
    }
    p.scope = p.getByRole("dialog", { name: "Cerca una prenotazione" });
    if (label === "Prossimi giorni") {
      await p.scope.getByRole("searchbox").fill("Prova C");
      await p.scope.getByText(/\d+ trovat[ae]/).waitFor();
    }
  };
  const card = (p, name) => (p.scope ?? p.getByRole("main")).getByRole("button", { name: new RegExp(name) }).first();
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
  const fromAccount = A.getByRole("link", { name: /Provala prima di accenderla/ });
  check("spenta: in Impostazioni la sezione «Prenotazioni» con i due interruttori e «Provala prima di accenderla»", (await fromAccount.count()) === 1 && (await A.getByRole("switch", { name: "Agenda delle prenotazioni" }).getAttribute("aria-checked")) === "false" && (await A.getByRole("switch", { name: "Prenotazioni online dei clienti" }).count()) === 1);
  await fromAccount.click();
  await A.waitForURL(/\/prenotazioni$/);
  check("spenta: una riga «Agenda in prova: quello che segni non è vero» con «Accendi l'agenda», niente fascia grande", /Agenda in prova: quello che segni non è vero/.test(await bodyText(A)) && (await A.getByRole("button", { name: "Accendi l'agenda", exact: true }).count()) === 1 && !/Agenda spenta · Richieste online spente/.test(await bodyText(A)));
  check("spenta: nella barra «Online: spente»", /Online: spente/.test(await A.getByTestId("stato-online").innerText()));
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
  check("agenda accesa: voce «Prenotazioni» nel menù in alto, niente riga «in prova», «Online: spente» nella barra", (await A.getByRole("link", { name: /^Prenotazioni/ }).count()) >= 1 && (await A.getByTestId("agenda-in-prova").count()) === 0 && /Online: spente/.test(await A.getByTestId("stato-online").innerText()));
  // Le richieste online si accendono toccando lo stato nella barra (apre gli interruttori).
  await A.getByTestId("stato-online").click();
  await A.getByRole("switch", { name: "Prenotazioni online dei clienti" }).last().click();
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
  check("la pagina si apre sull'agenda, senza schede", (await A.getByRole("region", { name: "Agenda" }).count()) === 1 && (await A.getByRole("tab").count()) === 0 && (await A.getByRole("dialog").count()) === 0);
  check("barra: «Oggi», ‹ ›, Giorno · Settimana · Mese, «Richieste», «+ Prenotazione», «⋯»", (await A.getByRole("button", { name: "Oggi", exact: true }).count()) === 1 && (await A.getByRole("radiogroup", { name: "Vista dell'agenda" }).getByRole("radio").count()) === 3 && (await A.getByTestId("pulsante-richieste").count()) === 1 && (await A.getByRole("button", { name: "Nuova prenotazione", exact: true }).count()) === 1 && (await A.getByRole("button", { name: "Altre azioni" }).count()) === 1);
  const navLink = A.getByRole("link", { name: /^Prenotazioni/ }).first();
  const pending = Number(DB(`select count(*) from "BookingRequest" where "isTest"=false and status='PENDING' and "startsAt">=now()`));
  check("menù in alto: il numero delle richieste da confermare", new RegExp(`${pending} (richiest[ae] )?da confermare`).test((await navLink.getAttribute("aria-label")) ?? (await navLink.innerText())), `${await navLink.getAttribute("aria-label")} (attese ${pending})`);
  const todo = A.getByTestId("pulsante-richieste");
  const todoN = Number((await todo.innerText()).match(/\d+/)?.[0] ?? 0);
  // Il numero di «Richieste» = da confermare + da mandare su WhatsApp + da completare (come il pallino del menù in alto).
  const pendingAll = Number(DB(`select count(*) from "BookingRequest" where status='PENDING' and "startsAt">=now() and day >= '${TODAY}'`));
  check("«Richieste (N)» nella barra, con almeno le richieste da confermare", todoN >= pendingAll && /^Richieste \(\d+\)/.test((await todo.getAttribute("aria-label")) ?? ""), `${await todo.getAttribute("aria-label")} (da confermare ${pendingAll})`);
  await todo.click();
  A.scope = A.getByRole("dialog", { name: "Richieste" });
  check("pannello «Richieste»: titolo «Da confermare (N)» sopra le richieste", (await A.scope.getByRole("heading", { name: `Da confermare (${pendingAll})` }).count()) === 1);
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
  check("conferma: «Manda la risposta su WhatsApp» con il messaggio già scritto per il numero del cliente", /^https:\/\/wa\.me\/39333\d+\?text=/.test(waHref) && decodeURIComponent(waHref).toLowerCase().includes("ti aspettiamo"), waHref.slice(0, 60));
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
  check("«Cerca»: la proposta accettata c'è, con il nuovo orario", (await card(A, "Prova C Proposta").count()) === 1 && (await card(A, "Prova C Proposta").innerText()).includes(newTime));
  await shot(A, "cerca");

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
  check("annullata dal cliente: non è più tra le «Richieste»", (await card(A, "Prova C Annulla").count()) === 0);
  await tab(A, "Archivio");
  check("…è in «Cerca» senza testo (passate e annullate)", (await card(A, "Prova C Annulla").count()) === 1);
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
  check("…con il messaggio di conferma pronto su WhatsApp", decodeURIComponent((await sy.getByRole("link", { name: "Manda la risposta su WhatsApp" }).getAttribute("href")) ?? "").toLowerCase().includes("ti aspettiamo"));
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
  check("…e non entra nella lista «Da mandare su WhatsApp»", !(await A.getByTestId("coda-whatsapp").innerText().catch(() => "")).includes(R.told.name));

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
  const waList = A.getByTestId("sezione-whatsapp");
  const waRound = waList.getByRole("link", { name: `Manda su WhatsApp a ${R.decl.name}` });
  check("lista WhatsApp (titolare): riga «nome · Al completo · giorno e ora» con il pulsante tondo", (await waRound.count()) === 1 && /Prova C Completo\s+Al completo · /.test(await waList.innerText()));
  const box = await waRound.boundingBox();
  check("…pulsante tondo di 44 px", box && Math.round(box.width) === 44 && Math.round(box.height) === 44, JSON.stringify(box));
  await shot(A, "lista-whatsapp");
  const [waPop] = await Promise.all([admin.ctx.waitForEvent("page"), waRound.click()]);
  await waPop.close();
  check("…aperta: segnata nella cronologia", await waitDb(() => DB(`select count(*) from "BookingLog" where "requestId"='${R.decl.id}' and kind='WHATSAPP_OPENED'`) === "1"));
  await A.waitForTimeout(1200);
  const declRow = waList.getByTestId("wa-riga").filter({ hasText: R.decl.name });
  check("…e la riga resta «in invio» con «✓ Mandato» e «Annulla» (aprire non vuol dire mandato)", (await declRow.getByTestId("wa-in-invio").count()) === 1 && (await declRow.getByRole("button", { name: "✓ Mandato" }).count()) === 1);
  await declRow.getByRole("button", { name: "✓ Mandato" }).click();
  check("«✓ Mandato»: segnato in cronologia", await waitDb(() => DB(`select count(*) from "BookingLog" where "requestId"='${R.decl.id}' and kind='WHATSAPP_DONE'`) === "1"));
  await A.waitForTimeout(1500);
  check("…e la riga diventa «Già mandato da … alle …»", new RegExp(`Prova C Completo · Già mandato da ${ADMIN_NAME} alle \\d{2}:\\d{2}`).test(await waList.innerText()), (await waList.innerText()).replace(/\n/g, " | "));

  // ---------- 1024 px: la barra in alto non scorre e il pulsante dell'account si vede tutto
  {
    const narrow = await newContext(browser, "desktop", { viewport: { width: 1024, height: 768 } });
    const np = await narrow.newPage();
    await login(np, "andrea", ADMIN_PW);
    await np.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    const bar = await np.evaluate(() => {
      const out = document.querySelector('header button[aria-label^="Account di"]')?.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, esciRight: out ? Math.round(out.right) : null, width: window.innerWidth };
    });
    check("1024 px: niente scorrimento orizzontale, il pulsante dell'account dentro lo schermo", bar.overflow <= 0 && bar.esciRight !== null && bar.esciRight <= bar.width, JSON.stringify(bar));
    await shot(np, "1024");
    await narrow.close();
  }

  // ================= Due dipendenti confermano insieme =================
  const marta = await session("marta", EMP_PW);
  const giulia = await session("giulia", EMP_PW);
  await goList(marta.p);
  await goList(giulia.p);
  check("dipendente con permesso: vede le richieste e la voce nel menù", (await marta.p.getByRole("dialog", { name: "Richieste" }).count()) === 1 && (await marta.p.getByRole("link", { name: /^Prenotazioni/ }).count()) >= 1);
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
  check("dipendente (non dal telefono enoteca): «La risposta su WhatsApp la manda il telefono enoteca»", /La risposta su WhatsApp la manda il telefono enoteca/.test(await bodyText(win)));
  check("dipendente (non dal telefono del locale): nel foglio «Chiama» sì, «Scrivi» no", (await win.getByRole("dialog").getByRole("link", { name: "Chiama" }).count()) === 1 && (await win.getByRole("dialog").getByRole("link", { name: "Scrivi" }).count()) === 0);
  await win.keyboard.press("Escape");
  await goList(win);
  const waN = Number((await win.getByRole("heading", { name: /Da mandare su WhatsApp/ }).innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
  const waSection = win.getByTestId("sezione-whatsapp");
  check("dipendente: la lista WhatsApp si vede soltanto («Le manda il telefono enoteca»), senza pulsanti verdi", waN > 0 && /Le manda il telefono enoteca: qui le vedi soltanto/.test(await waSection.innerText()) && (await waSection.getByRole("link").count()) === 0, String(waN));
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
  // Chiudere le richieste di stasera: dalla vista Giorno di oggi, «⋯» → «Chiudi le richieste online per questo giorno».
  await tab(A, "Stasera");
  const dayMenu = () => A.getByRole("button", { name: "Azioni del giorno" });
  await dayMenu().click();
  const closeItem = A.getByTestId("chiudi-richieste");
  const todayHasHours = (await closeItem.count()) === 1;
  if (!todayHasHours) {
    check("oggi chiuso: niente «Chiudi le richieste online per questo giorno»", bookableDays().days[0].state !== "open" || (await A.getByTestId("agenda-orari").innerText()).startsWith("Chiuso"));
    await A.keyboard.press("Escape");
  } else {
    check("Giorno di oggi, ⋯: «Chiudi le richieste online per questo giorno»", /Chiudi le richieste online per questo giorno/.test(await closeItem.innerText()));
    await closeItem.click();
    const nToday = Number(DB(`select count(*) from "BookingRequest" where status='PENDING' and day='${TODAY}' and "startsAt">=now()`));
    if (nToday > 0) {
      const ask = A.getByRole("alertdialog", { name: "Siamo pieni stasera?" });
      // Contando anche richieste di altri (il database di prova è condiviso).
      const expect = nToday === 1 ? "C'è 1 richiesta in attesa per stasera: rispondi a ognuna" : `Ci sono ${nToday} richieste in attesa per stasera: rispondi a ognuna`;
      check("«Siamo pieni stasera?» con richieste in attesa: avvisa «Ci sono N richieste in attesa… rispondi a ognuna»", (await ask.innerText()).replace(/\s+/g, " ").includes(expect), (await ask.innerText()).replace(/\s+/g, " "));
      await ask.getByRole("button", { name: "Chiudi le richieste" }).click();
    }
    check("stasera chiusa: salvata", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${TODAY}'`) === "1"));
    await A.waitForTimeout(1500);
    check("stasera chiusa: segno «Richieste chiuse» nel giorno", (await A.getByRole("region", { name: "Agenda" }).getByText("Richieste chiuse").count()) >= 1);
    check("la richiesta in attesa resta da gestire (non si chiude da sola)", status(late.id) === "PENDING||");
    const pub = await (await newContext(browser, "phone")).newPage();
    await pub.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle" });
    // Tra mezzanotte e le 5 la serata appena finita non compare più nel modulo del cliente.
    const calToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (calToday === TODAY) check("il cliente vede oggi «Completo»", /Completo/.test(await pub.locator(`[data-day="${TODAY}"]`).innerText()));
    else check("dopo mezzanotte il cliente non vede più la serata finita", (await pub.locator(`[data-day="${TODAY}"]`).count()) === 0);
    await pub.context().close();
    await dayMenu().click();
    await A.getByTestId("riapri-richieste").click();
    check("«Riapri le richieste online»: riaperta", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${TODAY}'`) === "0"));
  }

  // Chiudere le richieste di un altro giorno: lo stesso menù nel Giorno di quel giorno (niente più modulo a parte).
  await A.goto(`${BASE}/prenotazioni?vista=oggi`, { waitUntil: "networkidle", timeout: 180000 });
  await A.getByTestId("agenda-barra").locator('input[type="date"]').fill(D2.day);
  await A.getByTestId("agenda-orari").waitFor();
  await A.waitForTimeout(800);
  await dayMenu().click();
  await A.getByTestId("chiudi-richieste").click();
  const askD2 = A.getByRole("alertdialog");
  if (await askD2.count()) await askD2.getByRole("button", { name: "Chiudi le richieste" }).click();
  check("altro giorno: richieste chiuse", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${D2.day}'`) === "1"));
  const r = await postRequest({ day: D2.day, time: D2.slots[0], people: 2, name: "Prova C Giorno chiuso", phone: randomPhone(), contact: "whatsapp", privacy: true, t: await formStamp() });
  check("altro giorno chiuso: il cliente riceve «già al completo»", r.json?.ok === false && /al completo/.test(r.json.error));
  await A.getByRole("radio", { name: "Mese" }).click();
  await A.waitForTimeout(1500);
  check("Mese: il giorno chiuso ha il segno «Richieste chiuse»", (await A.getByRole("grid", { name: "Mese" }).getByRole("button", { name: /richieste chiuse/ }).count()) >= 1);
  await A.getByRole("radio", { name: "Giorno" }).click();
  await A.waitForTimeout(800);
  await dayMenu().click();
  await A.getByTestId("riapri-richieste").click();
  check("«Riapri»: riaperto", await waitDb(() => DB(`select count(*) from "BookingClosedDay" where day='${D2.day}'`) === "0"));

  // Stasera = vista Giorno di oggi: totali, arrivati con un tocco, linea «adesso», «Non venuti» dal foglio.
  await tab(A, "Stasera");
  const tonight = A.getByRole("region", { name: "Agenda" });
  const ppl = DB(`select coalesce(sum(people),0)||'|'||count(*) from "BookingRequest" where status='CONFIRMED' and day='${TODAY}' and "isTest"=false`).split("|");
  // Contano anche le prenotazioni segnate a mano in agenda.
  const tot = `${ppl[1]} ${ppl[1] === "1" ? "prenotazione" : "prenotazioni"} · ${ppl[0]} ${ppl[0] === "1" ? "persona" : "persone"}`;
  const tt = await tonight.innerText();
  check(`Giorno di oggi: le confermate, «${tot}»`, (await A.getByTestId("agenda-totali").innerText()).includes(tot) && /Prova C Tavolo arrivato/.test(tt) && /Prova C Tavolo dopo/.test(tt), await A.getByTestId("agenda-totali").innerText());
  check("Giorno di oggi: la linea «adesso»", (await A.getByTestId("agenda-adesso").count()) === 1);
  const navName = (await A.locator("nav").getByRole("link", { name: /^Prenotazioni/ }).first().getAttribute("aria-label")) ?? "";
  check("pallino del menù: aria-label con le cose da fare («… da confermare», «… da mandare su WhatsApp»)", /^Prenotazioni: .*(da confermare|messaggi? da mandare su WhatsApp)/.test(navName), navName);
  const row1 = tonight.getByTestId("agenda-riga").filter({ hasText: "Prova C Tavolo arrivato" });
  const callLink = row1.getByRole("link", { name: /^Chiama Prova C Tavolo arrivato/ });
  check("telefono del cliente tocca-per-chiamare nella riga", /^tel:\+39/.test((await callLink.getAttribute("href")) ?? ""));
  const arr = row1.getByRole("button", { name: "Segna arrivati: Prova C Tavolo arrivato" });
  const arrBox = await arr.boundingBox();
  check("«Arrivati?»: pulsante con la scritta, almeno 44 px", Math.round(arrBox?.width ?? 0) >= 44 && Math.round(arrBox?.height ?? 0) >= 44, JSON.stringify(arrBox));
  await shot(A, "stasera");
  await arr.click();
  check("«✓ Arrivati»: segnato", await waitDb(() => DB(`select "arrivedAt" is not null from "BookingRequest" where id='${t1.id}'`) === "t"));
  await A.waitForTimeout(800);
  await row1.getByRole("button", { name: "Togli «arrivati» a Prova C Tavolo arrivato" }).click();
  check("«Togli il segno»: tolto", await waitDb(() => DB(`select "arrivedAt" is null and "noShowAt" is null from "BookingRequest" where id='${t1.id}'`) === "t"));
  await A.waitForTimeout(800);
  const s9 = await openCard(A, "Prova C Tavolo arrivato");
  await s9.getByRole("button", { name: "Non venuti" }).click();
  check("«Non venuti» (dal foglio): segnato", await waitDb(() => DB(`select "noShowAt" is not null from "BookingRequest" where id='${t1.id}'`) === "t"));
  await A.keyboard.press("Escape");

  // Numeri
  await goList(A);
  await tab(A, "Numeri");
  // Le richieste dal sito, a parte quelle segnate a mano in agenda («Segnate a mano»).
  const total = DB(`select count(*) from "BookingRequest" where "isTest"=false and manual=false and "createdAt" >= now() - interval '90 days'`);
  const nums = await A.scope.innerText();
  check("«Numeri»: richieste online come nel database", new RegExp(`Richieste online\\s*${total}\\b`, "i").test(nums), nums.replace(/\n/g, " ").slice(0, 160));
  check("«Numeri»: «Da dove arrivano» con Google e Menù", /Da dove arrivano/.test(nums) && /Google/.test(nums) && /Menù/.test(nums));
  check("«Numeri»: almeno 1 «Non venuti»", /Non venuti\s*[1-9]/i.test(nums));
  await shot(A, "numeri");

  // Impostazioni (solo titolare): ⋯ → Impostazioni
  await A.keyboard.press("Escape");
  await A.getByRole("button", { name: "Altre azioni" }).click();
  await A.getByRole("menuitem", { name: /^Impostazioni/ }).click();
  const st = A.getByRole("dialog");
  check("impostazioni: link brevi …/g, …/ig, …/fb", /vercel\.app\/g\b|:\d+\/g\b/.test(await st.innerText()) && /\/ig\b/.test(await st.innerText()) && /\/fb\b/.test(await st.innerText()));
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
    check("widget «Da fare»: riga delle richieste di prenotazione, con il numero e il link", pend > 0 && row?.n === pend && row.link === "/prenotazioni?richieste=1" && /richieste? di prenotazione/.test(row.testo), JSON.stringify(row));
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
