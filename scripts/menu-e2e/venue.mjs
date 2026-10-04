// Copertina, orari («Aperto ora»), contatti: modifica dalla gestione e effetto
// sul menù pubblico. Richiede `npm i --no-save sharp` (foto di prova).
import { discardIfAsked, launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW, expandPanels, tool, goTab } from "./lib.mjs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
const HOURS = `{"showStatus":true,"weekly":[[{"open":"17:00","close":"21:30"}],[{"open":"17:00","close":"21:30"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:00"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:30"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:00"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:00"}],[{"open":"16:30","close":"21:00"}]],"exceptions":[]}`;
const CONTACTS = `{"phone":"338 327 7053","whatsappMessage":"Ciao! Vorrei prenotare un tavolo per","address":"Via dei Rossi 53/C, 50018 Scandicci FI","instagram":"https://www.instagram.com/langolo.del.vino_enoteca/","review":"https://g.page/r/CQtef5OLe4RQEBM/review"}`;
function reset() {
  DB(`delete from "MenuPromo"`);
  DB(`delete from "MenuChange"`);
  DB(`delete from "MenuHeroImage"`);
  DB(`insert into "MenuSetting" ("id","value") values ('hours','${HOURS}'),('contacts','${CONTACTS.replace(/'/g, "''")}'),('hero','{"title":"Carta dei vini\\ne Menù"}') on conflict ("id") do update set "value"=excluded."value"`);
  DB(`update "Employee" set "canEditMenu"=true where username='marta'`);
  DB(`update "Employee" set "canEditMenu"=false where username='francesco'`);
}
reset();

const dir = mkdtempSync(join(tmpdir(), "venue-"));
const photo = join(dir, "copertina.png");
await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 40, g: 60, b: 90 } } }).png().toFile(photo);

const browser = await launch();
// Lunedì 5 ottobre 2026, 19:00 a Roma: aperto fino alle 21:30.
const FIXED = new Date("2026-10-05T19:00:00+02:00");
const pubCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await pubCtx.clock.setFixedTime(FIXED);
const pub = await pubCtx.newPage();
pub.setDefaultTimeout(60000);
const open = async () => {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  await pub.waitForTimeout(600);
};
const pillText = async () => ((await pub.locator("header [aria-live='polite']").innerText()) || "").replace(/ /g, " ");
const footer = async () => (await pub.locator('section[aria-label="Orari e contatti"]').innerText()).replace(/ /g, " ");

// --- Pubblico: valori di partenza
await open();
check("copertina: titolo «Carta dei vini / e Menù»", /Carta dei vini/.test(await pub.locator("header h1 ~ div, header").first().innerText()) && /Menù/.test(await pub.locator("header").innerText()));
check("aperto ora: «Aperto ora · chiude alle 21:30»", /aperto ora · chiude alle 21:30/i.test(await pillText()), await pillText());
const heroH = (await pub.locator("header").first().boundingBox()).height;
check("copertina: più bassa dello schermo (≤ 560 px)", heroH <= 561 && heroH < 844, String(heroH));
let f = await footer();
check("orari in fondo: «Lun – Mar 17:00–21:30»", /Lun – Mar\s+17:00–21:30/i.test(f));
check("orari in fondo: «Dom 16:30–21:00»", /Dom\s+16:30–21:00/i.test(f));
const hrefs = await pub.locator('section[aria-label="Orari e contatti"] a').evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute("href")]));
const href = (name) => hrefs.find(([t]) => t === name)?.[1];
check("contatti: Chiama → tel:+393383277053", href("Chiama") === "tel:+393383277053", String(href("Chiama")));
check("contatti: WhatsApp con messaggio precompilato", /^https:\/\/wa\.me\/393383277053\?text=Ciao/.test(href("WhatsApp") ?? ""));
check("contatti: Come arrivare → Google Maps", /google\.com\/maps\/search\/\?api=1&query=Via/.test(href("Come arrivare") ?? ""));
check("contatti: Lascia una recensione", href("Lascia una recensione") === "https://g.page/r/CQtef5OLe4RQEBM/review");
check("contatti: Instagram", /instagram\.com\/langolo/.test(href("Instagram") ?? ""));
// Nella stessa scheda: tornando indietro (es. dopo la recensione su Google) si torna al menù.
check("contatti: si aprono nella stessa scheda", (await pub.locator('section[aria-label="Orari e contatti"] a[target]').count()) === 0);
{
  await pub.route(/g\.page/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google</h1>" }));
  const link = pub.getByRole("link", { name: "Lascia una recensione" });
  await link.scrollIntoViewIfNeeded();
  const y = await pub.evaluate(() => scrollY);
  await link.click();
  await pub.waitForURL(/g\.page/);
  await pub.goBack({ waitUntil: "networkidle" });
  await pub.waitForTimeout(600);
  const back = await pub.evaluate(() => [location.pathname, scrollY]);
  check("recensione → indietro: di nuovo sul menù, nello stesso punto", back[0] === "/menu" && Math.abs(back[1] - y) < 60, JSON.stringify([y, back]));
  await pub.unroute(/g\.page/);
}
const small = await pub.locator('section[aria-label="Orari e contatti"] a').evaluateAll((as) => as.filter((a) => a.getBoundingClientRect().height < 44).length);
check("contatti: pulsanti ≥ 44 px", small === 0, String(small));

// --- Gestione
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await expandPanels(page);
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);
const panel = () => page.locator('section[aria-label="Il locale"]');
let pt = (await panel().innerText()).replace(/ /g, " ");
check("pannello «Il locale»: copertina, orari, contatti", /copertina/i.test(pt) && /Orari/.test(pt) && /Contatti/.test(pt) && /338 327 7053/.test(pt));

// Contatti: tolgo la recensione e cambio il messaggio
await page.getByRole("button", { name: "Modifica i contatti" }).click();
await dialog().waitFor();
await dialog().getByLabel("Link per la recensione su Google").fill("");
await dialog().getByLabel("Messaggio WhatsApp").fill("Buonasera, un tavolo per due?");
await dialog().getByLabel("Link Instagram").fill("http://non-sicuro.example");
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await settle(900);
check("contatti: link non https rifiutato", (await dialog().count()) === 1);
await page.keyboard.press("Escape");
await discardIfAsked(page);
await page.getByRole("button", { name: "Modifica i contatti" }).click();
await dialog().waitFor();
await dialog().getByLabel("Link per la recensione su Google").fill("");
await dialog().getByLabel("Messaggio WhatsApp").fill("Buonasera, un tavolo per due?");
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
await open();
const hrefs2 = await pub.locator('section[aria-label="Orari e contatti"] a').evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute("href")]));
check("contatti: senza link recensione il pulsante sparisce", !hrefs2.some(([t]) => t === "Lascia una recensione"));
check("contatti: nuovo messaggio WhatsApp", decodeURIComponent(hrefs2.find(([t]) => t === "WhatsApp")?.[1] ?? "").includes("Buonasera, un tavolo per due?"));

// Orari: lunedì chiuso → «Chiuso · riapre domani alle 17:00»
await page.getByRole("button", { name: "Modifica gli orari" }).click();
await dialog().waitFor();
const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("orari @390: nessun overflow orizzontale", ov <= 0, String(ov));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/orari-foglio-390.png` });
await dialog().getByLabel("Lunedì: aperto").uncheck();
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
await open();
check("orari: lunedì chiuso → «Chiuso · riapre domani alle 17:00»", /chiuso · riapre domani alle 17:00/i.test(await pillText()), await pillText());
f = await footer();
check("orari in fondo: «Lun Chiuso» e «Mar 17:00–21:30»", /Lun\s+Chiuso/i.test(f) && /Mar\s+17:00–21:30/i.test(f));

// Eccezione: oggi (5/10) aperto con orario 20:00–23:00, con motivo, e annuncio
await page.getByRole("button", { name: "Modifica gli orari" }).click();
await dialog().waitFor();
await dialog().getByLabel("Lunedì: aperto").check();
await dialog().getByRole("button", { name: "+ Aggiungi chiusura o apertura straordinaria" }).click();
const today = DB(`select to_char((now() at time zone 'Europe/Rome') - interval '5 hours','YYYY-MM-DD')`);
await dialog().getByLabel("Eccezione 1: dal").fill("2026-10-05");
await dialog().getByLabel("Eccezione 1: al").fill("2026-10-05");
await dialog().getByRole("radio", { name: "Chiuso", exact: true }).click();
await dialog().getByLabel("Eccezione 1: motivo").fill("Serata privata");
await dialog().getByLabel("Pubblica anche un annuncio sul menù").check();
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(2500);
await open();
check("eccezione: «Chiuso oggi · Serata privata · riapre domani…»", /chiuso oggi · serata privata · riapre domani alle 17:00/i.test(await pillText()), await pillText());
check("eccezione: annuncio creato (Serata privata)", Number(DB(`select count(*) from "MenuPromo" where title='Serata privata' and kind='NOTICE'`)) === 1);
check("eccezione: salvata (1)", JSON.parse(DB(`select value from "MenuSetting" where id='hours'`)).exceptions.length === 1);

// Spengo «Aperto ora»
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await expandPanels(page);
await page.getByRole("button", { name: "Modifica gli orari" }).click();
await dialog().waitFor();
await dialog().getByLabel("Mostra «Aperto ora / Chiuso» in copertina").uncheck();
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
await open();
check("«Aperto ora» spento: l'indicazione non compare", (await pub.locator("header [aria-live='polite']").count()) === 0);

// Copertina: titolo a 3 righe e foto
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await expandPanels(page);
await page.getByRole("button", { name: "Modifica la copertina" }).click();
await dialog().waitFor();
await dialog().locator("textarea").fill("Vendemmia 2026\nCarta dei vini\ne Menù");
await dialog().locator('input[type="file"]').setInputFiles(photo);
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(2500);
await open();
const headerText = (await pub.locator("header").first().innerText()).replace(/ /g, " ");
check("copertina: nuovo titolo a 3 righe", /Vendemmia 2026/.test(headerText) && /Carta dei vini/.test(headerText) && /Menù/.test(headerText));
const src = await pub.locator("header img[src^='/menu/copertina']").getAttribute("src");
check("copertina: usa la foto caricata", /^\/menu\/copertina\?v=\d+$/.test(src ?? ""), String(src));
const res = await pub.request.get(`${BASE}${src}`);
check("copertina: la foto si scarica (JPEG, cache lunga)", res.status() === 200 && res.headers()["content-type"] === "image/jpeg" && /immutable/.test(res.headers()["cache-control"] ?? ""), `${res.status()} ${res.headers()["content-type"]}`);
if (SHOTS) await pub.screenshot({ path: `${SHOTS}/copertina-390.png` });

// Torno alla foto predefinita
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await expandPanels(page);
await page.getByRole("button", { name: "Modifica la copertina" }).click();
await dialog().waitFor();
await dialog().getByRole("button", { name: "Torna alla foto predefinita" }).click();
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(2500);
await open();
check("copertina: tornata alla foto predefinita", (await pub.locator("header img[src^='/menu/copertina']").count()) === 0);
check("copertina: foto rimossa dal database", DB(`select count(*) from "MenuHeroImage"`) === "0");

// Storico e annulla: l'ultima modifica agli orari si annulla
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await expandPanels(page);
await tool(page, "Storico");
await dialog().waitFor();
const hist = (await dialog().innerText()).replace(/ /g, " ");
check("storico: compaiono Copertina, Orari e Contatti", /Copertina/.test(hist) && /Orari/.test(hist) && /Contatti/.test(hist));
await page.keyboard.press("Escape");
await discardIfAsked(page);

// Permessi
for (const [user, expected] of [["marta", true], ["francesco", false]]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.setDefaultTimeout(60000);
  await login(p, user, EMP_PW);
  await p.goto(`${BASE}/gestione-menu`, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (expected) {
    await goTab(p, "Orari e contatti");
    await p.waitForSelector('section[aria-label="Il locale"]');
    check(`permessi: ${user} (con permesso) vede «Il locale»`, true);
  } else {
    check(`permessi: ${user} (senza permesso) non entra`, new URL(p.url()).pathname === "/mie-ore", p.url());
  }
  await c.close();
}

reset();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
