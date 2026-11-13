// Statistiche anonime: interruttore «Inizia a contare», raccolta dal menù dei
// clienti (aperture una volta per visita, ricerche, risultati scelti, sezioni,
// contatti), personale escluso, pagina Statistiche solo per il titolare.
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, DB } from "./lib.mjs";

DB(`delete from "MenuEvent"`);
DB(`delete from "MenuSetting" where id='stats'`);
DB(`update "Employee" set "canEditMenu"=true where username='marta'`);
const count = (kind) => Number(DB(`select count(*) from "MenuEvent"${kind ? ` where kind='${kind}'` : ""}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
const post = async (body) => fetch(`${BASE}/menu/e`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

// Spento: non si salva nulla
await post({ k: "open", l: "/menu" });
check("spento: nessun evento salvato", count() === 0);

// Il titolare accende
const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
admin.setDefaultTimeout(60000);
await login(admin, "andrea", ADMIN_PW);
await admin.goto(`${BASE}/statistiche`, { waitUntil: "networkidle", timeout: 180000 });
check("pagina: titolo «Statistiche del menù»", (await admin.getByRole("heading", { name: "Statistiche del menù" }).count()) === 1);
check("pagina: vuota prima di accendere", /Accendi «Inizia a contare»/.test(await admin.locator("main, body").first().innerText()));
const sw = admin.getByRole("switch", { name: "Inizia a contare" });
check("interruttore spento", (await sw.getAttribute("aria-checked")) === "false");
await sw.click();
await wait(1500);
check("interruttore acceso e salvato con la data", /"enabled":true,"since":"\d{4}-\d{2}-\d{2}"/.test(DB(`select value from "MenuSetting" where id='stats'`)));
check("navigazione: niente voce «Statistiche» in alto, «Menù» acceso su /statistiche", (await admin.locator("header nav, nav.brand-band-bar-bottom").getByRole("link", { name: "Statistiche" }).count()) === 0 && (await admin.locator("header nav").getByRole("link", { name: "Menù" }).getAttribute("class")).includes("nav-mark-bottom"));
{
  const tabs = admin.getByTestId("schede-menu");
  check("schede «Gestione · Statistiche» in cima, «Statistiche» scelta", (await tabs.getByRole("link").allInnerTexts()).join("|") === "Gestione|Statistiche" && (await tabs.getByRole("link", { name: "Statistiche" }).getAttribute("aria-current")) === "page");
  await tabs.getByRole("link", { name: "Gestione" }).click();
  await admin.waitForURL(/\/gestione-menu$/);
  check("«Gestione» porta alla gestione del menù, con le stesse schede", (await admin.getByTestId("schede-menu").getByRole("link", { name: "Gestione" }).getAttribute("aria-current")) === "page");
  await admin.getByTestId("schede-menu").getByRole("link", { name: "Statistiche" }).click();
  await admin.waitForURL(/\/statistiche$/);
}

// Un cliente apre il menù
const pubCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const pub = await pubCtx.newPage();
pub.setDefaultTimeout(60000);
await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
await wait(800);
check("cliente: un'apertura", count("open") === 1);
await pub.reload({ waitUntil: "networkidle" });
await wait(800);
check("cliente: ricaricare non conta di nuovo", count("open") === 1);
// Stesso telefono, nuova scheda (es. QR inquadrato di nuovo) pochi secondi dopo: non conta.
const pub2 = await pubCtx.newPage();
await pub2.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
await wait(800);
check("cliente: nuova scheda lo stesso giorno non conta di nuovo", count("open") === 1);
await pub2.close();
// Il giorno dopo sì: si simula un ricordo di ieri.
const pub3 = await pubCtx.newPage();
await pub3.goto(`${BASE}/menu/allergeni`, { waitUntil: "networkidle", timeout: 120000 });
await pub3.evaluate(() => localStorage.setItem("menu-stat-open", "2000-01-01"));
await pub3.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
await wait(800);
check("cliente: il giorno dopo conta di nuovo", count("open") === 2);
await pub3.close();
// Si torna a un'apertura sola, come se fosse sempre lo stesso giorno, per i controlli che seguono.
DB(`delete from "MenuEvent" where id in (select id from "MenuEvent" where kind='open' order by at desc limit 1)`);

await pub.getByRole("button", { name: "Cerca nel menù", exact: true }).click();
await pub.locator("input[type=search]").fill("prosecco");
await wait(300);
await pub.keyboard.press("Escape");
await wait(800);
check("ricerca senza risultati: «prosecco»", DB(`select count(*) from "MenuEvent" where kind='search_empty' and label='prosecco'`) === "1");

await pub.getByRole("button", { name: "Cerca nel menù", exact: true }).click();
await pub.locator("input[type=search]").fill("sangiovese");
await wait(300);
await pub.locator('[role="dialog"] ul button').first().click();
await wait(1000);
check("ricerca con risultati: «sangiovese»", DB(`select count(*) from "MenuEvent" where kind='search' and label='sangiovese'`) === "1");
check("risultato scelto registrato", count("pick") === 1);

await pub.locator('nav[aria-label="Sezioni del menù"] a', { hasText: "Rossi" }).click();
await wait(800);
check("sezione toccata: Rossi", DB(`select count(*) from "MenuEvent" where kind='section' and label='Rossi'`) === "1");

await pub.evaluate(() => document.querySelector('a[data-stat-k="contact"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
await wait(800);
check("contatto toccato", count("contact") === 1);
const dayHour = DB(`select day || ' ' || hour || ' ' || weekday from "MenuEvent" where kind='open'`);
check("giorno e ora italiani salvati", /^\d{4}-\d{2}-\d{2} \d{1,2} [1-7]$/.test(dayHour), dayHour);
check("nessun dato personale: solo cosa, giorno e ora", DB(`select count(*) from information_schema.columns where table_name='MenuEvent'`) === "8");

// Il personale con l'accesso fatto non conta
const before = count("open");
const staff = await admin.context().newPage();
await staff.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
await wait(800);
check("personale: aperture non contate", count("open") === before);
// Stesso telefono del personale, ma senza sessione (scaduta, o menù aperto da fuori): non conta lo stesso.
await admin.context().clearCookies();
await staff.evaluate(() => localStorage.removeItem("menu-stat-open"));
await staff.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
await wait(800);
check("personale senza sessione: il dispositivo resta escluso", count("open") === before);
await login(admin, "andrea", ADMIN_PW);

// Anteprima dentro la gestione (riquadro): non conta
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p3 = await ctx3.newPage();
await p3.setContent(`<iframe src="${BASE}/menu" style="width:390px;height:800px"></iframe>`);
await wait(6000);
check("anteprima nel riquadro: non conta", count("open") === before);

// Eventi non validi o troppi
await post({ k: "hack", l: "x" });
check("tipo non valido: ignorato", Number(DB(`select count(*) from "MenuEvent" where kind='hack'`)) === 0);

// La pagina mostra i dati
await admin.goto(`${BASE}/statistiche?p=7`, { waitUntil: "networkidle" });
const page = await admin.locator("body").innerText();
check("pagina: 1 apertura", /Aperture del menù\s*1\b/i.test(page), page.slice(0, 300).replace(/\n/g, " | "));
check("pagina: «prosecco» tra le non trovate", /Cercate ma non trovate[\s\S]*prosecco/.test(page));
check("pagina: «sangiovese» tra le più cercate", /Le parole più cercate[\s\S]*sangiovese/.test(page));
check("pagina: griglia giorni e orari", (await admin.locator("table").count()) === 1);
const ov = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("pagina: nessuno scorrimento orizzontale a 390 px", ov <= 0, String(ov));
// Con un giorno solo contato (il conteggio è partito oggi) le classifiche non hanno niente da
// mettere in fila: non compaiono.
check("classifiche: con un giorno solo non compaiono", !/Classifica dei giorni della settimana/.test(page) && !/Classifica dei mesi/.test(page));
// Per le classifiche servono più giorni e più mesi: per un momento il conteggio «parte» 40 giorni fa
// e 20 aperture cadono 36 giorni fa (un altro giorno della settimana, un altro mese). Si tolgono subito dopo.
const settingNow = DB(`select value from "MenuSetting" where id='stats'`);
const romeDay = (offset) => DB(`select to_char((now() at time zone 'Europe/Rome') - interval '${offset} days', 'YYYY-MM-DD')`);
const pastDay = romeDay(36);
const pastDate = new Date(`${pastDay}T12:00:00Z`);
const pastWd = ((pastDate.getUTCDay() + 6) % 7) + 1;
DB(`update "MenuSetting" set value='{"enabled":true,"since":"${romeDay(40)}"}' where id='stats'`);
for (let k = 0; k < 20; k++) DB(`insert into "MenuEvent" (id, day, hour, weekday, kind) values ('e2e_rank_${k}', '${pastDay}', 20, ${pastWd}, 'open')`);
await admin.goto(`${BASE}/statistiche?p=all`, { waitUntil: "networkidle" });
const ranks = await admin.locator("body").innerText();
const monthName = pastDate.toLocaleDateString("it-IT", { month: "long", timeZone: "UTC" });
const wdName = pastDate.toLocaleDateString("it-IT", { weekday: "long", timeZone: "UTC" });
check("classifica giorni: il giorno con più aperture al primo posto, col totale", new RegExp(`Classifica dei giorni della settimana[\\s\\S]*?1\\.?\\s*${wdName}\\s*[\\d,]+\\s*al giorno\\s*20\\s*aperture`, "i").test(ranks), wdName);
check("classifica mesi: il mese con più aperture al primo posto, col totale", new RegExp(`Classifica dei mesi[\\s\\S]*?1\\.?\\s*${monthName}\\s*[\\d,]+\\s*al giorno\\s*20\\s*aperture`, "i").test(ranks), monthName);
// Periodo a scelta: un intervallo tutto prima di «Inizia a contare» mostra il primo giorno contato
// (scritto nella riga «Giorno: …»), che qui non ha aperture.
await admin.goto(`${BASE}/statistiche?dal=2020-01-01&al=2020-01-31`, { waitUntil: "networkidle" });
const old = await admin.locator("body").innerText();
const firstDayLong = new Date(`${romeDay(40)}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", timeZone: "UTC" });
check("dal… al…: periodo prima di «Inizia a contare» → primo giorno contato, senza aperture", /Aperture del menù\s*0\b/i.test(old) && new RegExp(`Giorno: ${firstDayLong}`, "i").test(old), (old.match(/(Periodo|Giorno):[^\n]*/) ?? [""])[0]);
DB(`delete from "MenuEvent" where id like 'e2e_rank_%'`);
DB(`update "MenuSetting" set value='${settingNow.replace(/'/g, "''")}' where id='stats'`);
// Oggi sempre in vista, giorno per giorno, scorciatoie, scarico per Excel
await admin.goto(`${BASE}/statistiche`, { waitUntil: "networkidle" });
const todayCard = await admin.getByRole("region", { name: "Aperture di oggi" }).innerText();
check("oggi: riquadro sempre in cima con le aperture di oggi", /Aperture di oggi[\s\S]*?\b1\b/.test(todayCard) && /Ieri/.test(todayCard), todayCard.replace(/\n/g, " | "));
check("periodo: una riga sola con Oggi, Ieri, settimana, mese e i periodi a ritroso", (await admin.getByRole("navigation", { name: "Periodo" }).getByRole("link").count()) === 10 && (await admin.getByRole("navigation", { name: "Scorciatoie" }).count()) === 0);
const dayList = admin.locator("section", { has: admin.getByRole("heading", { name: "I numeri di ogni giorno", exact: true }) });
check("giorno per giorno: oggi in elenco con 1 apertura", /oggi\s*1\b/.test((await dayList.first().innerText()).replace(/\n/g, " ")));
await dayList.first().locator("ol li a").first().click();
await admin.waitForURL(/dal=\d{4}-\d{2}-\d{2}&al=\d{4}-\d{2}-\d{2}/);
check("un giorno: tocco su un giorno lo mostra da solo", /Giorno:/.test(await admin.locator("body").innerText()) && new URL(admin.url()).searchParams.get("dal") === new URL(admin.url()).searchParams.get("al"), admin.url());
await admin.getByRole("navigation", { name: "Periodo" }).getByRole("link", { name: "Questo mese" }).click();
await admin.waitForURL(/dal=\d{4}-\d{2}-01&al=/);
await admin.getByText(/Periodo: dal |Giorno: /).first().waitFor({ timeout: 60000 }).catch(() => {});
// Il conteggio è iniziato oggi: il periodo non parte mai prima di «Inizia a contare», quindi oggi resta il solo giorno mostrato.
check("questo mese: periodo scelto con la scorciatoia", /dal=\d{4}-\d{2}-01/.test(admin.url()) && /(Periodo: dal |Giorno: )/.test(await admin.locator("body").innerText()), (await admin.locator("body").innerText()).match(/(Periodo|Giorno):[^\n]*/g)?.join(" | ") + " " + admin.url());
const csv = await admin.request.get(`${BASE}/statistiche/giorni?p=all`);
const csvText = await csv.text();
check("Excel: file con giorno, giorno della settimana e aperture", csv.status() === 200 && /text\/csv/.test(csv.headers()["content-type"]) && /Giorno;Giorno della settimana;Aperture del menù/.test(csvText) && /;1\r?\n?$/m.test(csvText), `${csv.status()} ${csvText.slice(0, 120).replace(/\r?\n/g, " | ")}`);
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await login(p, "marta", EMP_PW);
  const r = await p.request.get(`${BASE}/statistiche/giorni?p=all`, { maxRedirects: 0 });
  check("Excel: il dipendente non lo scarica", r.status() >= 300 && r.status() < 400 && !(await r.text()).includes("Giorno;"), String(r.status()));
  await c.close();
}

// Mentre conta, «Inizia a contare» non sta più in cima: in fondo c'è «Metti in pausa», con conferma.
check("acceso: niente «Inizia a contare» in cima", (await admin.getByRole("switch", { name: "Inizia a contare" }).count()) === 0);
const conteggio = admin.getByRole("region", { name: "Conteggio" });
check("in fondo: «Si contano le aperture del menù dal …»", /Si contano le aperture del menù dal/.test(await conteggio.innerText()));
await conteggio.getByRole("button", { name: "Metti in pausa" }).click();
check("«Metti in pausa» chiede conferma", /Mettere in pausa il conteggio\?/.test(await conteggio.innerText()));
await conteggio.getByRole("button", { name: "Annulla" }).click();
check("«Annulla»: resta acceso", /Metti in pausa/.test(await conteggio.innerText()) && DB(`select value from "MenuSetting" where id='stats'`).includes('"enabled":true'));
// Spegnere: non si conta più
await conteggio.getByRole("button", { name: "Metti in pausa" }).click();
await conteggio.getByRole("button", { name: "Sì, metti in pausa" }).click();
await admin.getByRole("switch", { name: "Inizia a contare" }).waitFor();
check("in pausa: torna «Inizia a contare» in cima, con «Conteggio in pausa»", /Conteggio in pausa/.test(await admin.locator("body").innerText()));
await wait(1500);
await post({ k: "open", l: "/menu" });
await wait(300);
check("spento di nuovo: non si conta", count("open") === before);

// Dipendente con permesso menù: niente Statistiche
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await login(p, "marta", EMP_PW);
  await p.goto(`${BASE}/statistiche`, { waitUntil: "networkidle", timeout: 120000 });
  check("dipendente: rimandata fuori dalle Statistiche", !p.url().includes("/statistiche"), p.url());
  await c.close();
}

DB(`delete from "MenuEvent"`);
DB(`delete from "MenuSetting" where id='stats'`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
