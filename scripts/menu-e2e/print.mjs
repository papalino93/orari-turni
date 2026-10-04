// «Menù da stampare»: foglio A4 con tutto il menù fisso, solo per chi gestisce il
// menù; gli esauriti di oggi si tolgono (di norma) o si tengono.
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, DB, tool, goTab } from "./lib.mjs";

const SOLD = "menu_itm_051"; // Tagliere Classico
const today = DB(`select to_char((now() at time zone 'Europe/Rome') - interval '5 hours', 'YYYY-MM-DD')`);
DB(`update "MenuItem" set "soldOutDay"='${today}' where id='${SOLD}'`);

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1000, height: 1200 } })).newPage();
page.setDefaultTimeout(90000);

// Senza login: alla pagina di accesso
await page.goto(`${BASE}/gestione-menu/stampa`, { waitUntil: "networkidle", timeout: 180000 });
check("senza login: si va al login", page.url().includes("/login"), page.url());

await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await tool(page, "Menù da stampare");
await page.waitForURL(/\/gestione-menu\/stampa/);
await page.waitForLoadState("networkidle");
const text = await page.locator("main").innerText();
const sections = DB(`select string_agg(title, '|' order by "sortOrder") from "MenuSection" where "promoId" is null and "dailyOnly"=false`).split("|");
check("tutte le sezioni del menù", sections.every((t) => text.toUpperCase().includes(t.toUpperCase())), sections.join(", "));
check("data di aggiornamento", /Aggiornato al \d{1,2} \w+ \d{4}/.test(text));
check("legenda degli allergeni", /1\s*Glutine/.test(text) && /14\s*Molluschi/.test(text));
check("esaurito di oggi: tolto", !text.includes("Tagliere Classico"));
check("niente cornice dell'app (barra e menù in basso)", (await page.getByRole("link", { name: "Statistiche" }).count()) === 0);
await page.getByRole("checkbox", { name: /Togli gli esauriti di oggi/ }).click();
await page.waitForURL(/esauriti=1/);
await page.waitForLoadState("networkidle");
check("con gli esauriti: c'è, segnato «esaurito oggi»", /Tagliere Classico[\s\S]{0,40}esaurito oggi/i.test(await page.locator("main").innerText()));

await page.emulateMedia({ media: "print" });
check("in stampa la barra sparisce", !(await page.getByRole("button", { name: "Stampa o salva in PDF" }).isVisible()));
const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
check("PDF A4 di alcune pagine", pages >= 2 && pages <= 12, String(pages));

// «Guida»: il PDF della guida, solo per chi gestisce il menù
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await goTab(page, "Strumenti");
const guideLink = page.getByRole("list", { name: "Strumenti del menù" }).getByRole("link", { name: /Guida/ });
check("gestione: c'è «Guida»", (await guideLink.count()) === 1 && (await guideLink.getAttribute("href")) === "/gestione-menu/guida");
const g = await page.request.get(`${BASE}/gestione-menu/guida`);
const gBody = await g.body();
check("guida: PDF scaricato", g.status() === 200 && g.headers()["content-type"] === "application/pdf" && gBody.subarray(0, 5).toString() === "%PDF-", `${g.status()} ${g.headers()["content-type"]}`);
const anon = await (await browser.newContext()).request.get(`${BASE}/gestione-menu/guida`, { maxRedirects: 0 });
check("guida: senza login non si scarica", anon.status() >= 300 && anon.status() < 400, String(anon.status()));

// Dipendente senza permesso di gestire il menù: rimandato alla sua area
const emp = await (await browser.newContext()).newPage();
await login(emp, "francesco", EMP_PW);
await emp.goto(`${BASE}/gestione-menu/stampa`, { waitUntil: "networkidle", timeout: 120000 });
check("dipendente senza permesso: rimandata fuori", !emp.url().includes("/stampa"), emp.url());
const eg = await emp.request.get(`${BASE}/gestione-menu/guida`, { maxRedirects: 0 });
check("guida: dipendente senza permesso non la scarica", eg.status() >= 300 && eg.status() < 400, String(eg.status()));

DB(`update "MenuItem" set "soldOutDay"=null where id='${SOLD}'`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
