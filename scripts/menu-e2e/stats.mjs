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
check("navigazione: voce «Statistiche» per il titolare", (await admin.getByRole("link", { name: "Statistiche" }).count()) > 0);

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
check("pagina: 1 apertura", /Aperture del menù\s*1\b/.test(page), page.slice(0, 300).replace(/\n/g, " | "));
check("pagina: «prosecco» tra le non trovate", /Cercate ma non trovate[\s\S]*prosecco/.test(page));
check("pagina: «sangiovese» tra le più cercate", /Le parole più cercate[\s\S]*sangiovese/.test(page));
check("pagina: griglia giorni e orari", (await admin.locator("table").count()) === 1);
const ov = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("pagina: nessuno scorrimento orizzontale a 390 px", ov <= 0, String(ov));
const monthName = new Date().toLocaleDateString("it-IT", { month: "long", timeZone: "Europe/Rome" });
const wdName = new Date().toLocaleDateString("it-IT", { weekday: "long", timeZone: "Europe/Rome" });
check("classifica giorni: oggi al primo posto con 1 apertura", new RegExp(`Classifica dei giorni della settimana[\\s\\S]*?1\\.\\s*${wdName}\\s*1\\s*apertura`, "i").test(page), wdName);
check("classifica mesi: questo mese al primo posto con 1 apertura", new RegExp(`Classifica dei mesi[\\s\\S]*?1\\.\\s*${monthName}\\s*1\\s*apertura`, "i").test(page), monthName);
// Periodo a scelta: un intervallo nel passato, prima di «Inizia a contare», è vuoto.
await admin.goto(`${BASE}/statistiche?dal=2020-01-01&al=2020-01-31`, { waitUntil: "networkidle" });
const old = await admin.locator("body").innerText();
check("dal… al…: periodo nel passato senza aperture", /Aperture del menù\s*0\b/.test(old), old.slice(0, 300).replace(/\n/g, " | "));

// Spegnere: non si conta più
await admin.getByRole("switch", { name: "Inizia a contare" }).click();
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
