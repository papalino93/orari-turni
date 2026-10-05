// «Oggi fuori menù»: piatti e vini solo di oggi, «Togli», «Riproponi» e
// scomparsa al cambio di giorno.
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW, openDaily } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
const clean = () => {
  DB(`delete from "MenuItem" where "groupId" in ('menu_grp_oggi_piatti','menu_grp_oggi_vini')`);
  DB(`delete from "MenuChange"`);
  DB(`update "Employee" set "canEditMenu"=true where username='marta'`);
};
clean();

const browser = await launch();
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
const menu = async () => {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  return (await pub.locator("body").innerText()).replace(/ /g, " ");
};

let t = await menu();
check("senza voci: «Oggi fuori menù» non compare", !/oggi fuori menù/i.test(t));
check("senza voci: Bollicine ha il numero I", /\nI\n/.test(await pub.locator("#bollicine").innerText().then((x) => `\n${x}`)));

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);
const panel = () => page.locator('section[aria-label="Oggi fuori menù"]');
await openDaily(page);

check("pannello: «Niente di speciale oggi»", /niente di speciale oggi/i.test(await panel().innerText()));

// Piatto
await panel().getByRole("button", { name: "+ Piatto" }).click();
await dialog().waitFor();
await dialog().getByLabel("Nome", { exact: true }).fill("Risotto ai porcini");
await dialog().locator("textarea").first().fill("Riso carnaroli, porcini, parmigiano");
await dialog().getByPlaceholder("es. 13").fill("14");
await dialog().getByRole("radio", { name: "Contiene…" }).click();
await dialog().getByLabel("Latte").check();
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("piatto: compare nel pannello", /Risotto ai porcini/.test(await panel().innerText()));

// Vino
await panel().getByRole("button", { name: "+ Vino" }).click();
await dialog().waitFor();
await dialog().getByLabel("Azienda", { exact: true }).fill("Vermentino di Gallura");
await dialog().getByLabel("Denominazione").fill("Vermentino di Gallura Docg");
await dialog().getByLabel("Regione", { exact: true }).fill("Sardegna");
await dialog().getByLabel("Calice (€)").fill("8");
await dialog().getByLabel("Bottiglia (€)").fill("35");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("vino: compare nel pannello", /Vermentino di Gallura/.test(await panel().innerText()));
const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("gestione @390: nessun overflow orizzontale", ov <= 0, String(ov));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/oggi-pannello-390.png` });

// Pubblico
t = await menu();
check("pubblico: «Oggi fuori menù» in cima al menù", t.toLowerCase().indexOf("oggi fuori menù") > 0);
const oggi = (await pub.locator("#oggi").innerText()).replace(/ /g, " ");
check("pubblico: piatto con descrizione e prezzo", /Risotto ai porcini/.test(oggi) && /Riso carnaroli/.test(oggi) && /14/.test(oggi));
check("pubblico: allergeni del piatto (7 = latte)", /Allergeni\s*7/i.test(oggi.replace(/\n/g, " ")));
check("pubblico: vino con prezzo bottiglia 35 e calice 8", /Vermentino di Gallura/.test(oggi) && /\b35\b/.test(oggi) && /\b8\b/.test(oggi));
const firstChip = (await pub.locator("nav[aria-label='Sezioni del menù'] a").first().innerText()).trim();
check("pubblico: il primo chip è «Oggi»", /oggi/i.test(firstChip), firstChip);
const roman = (await pub.locator("#bollicine").innerText()).split("\n")[0].trim();
check("pubblico: Bollicine resta la sezione I", roman === "I", roman);
const ovp = await pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("pubblico @390: nessun overflow orizzontale", ovp <= 0, String(ovp));
if (SHOTS) {
  await pub.locator("#oggi").scrollIntoViewIfNeeded();
  await pub.screenshot({ path: `${SHOTS}/oggi-pubblico-390.png` });
}
await pub.goto(`${BASE}/menu/allergeni`, { waitUntil: "networkidle" });
check("allergeni: il piatto del giorno è nella pagina", /Risotto ai porcini/.test(await pub.locator("main").innerText()));

// Togli + annulla
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await openDaily(page);
await panel().getByRole("button", { name: "Togli Risotto ai porcini da oggi" }).click();
await settle();
check("togli: sparisce dal pannello e dal menù", !/Risotto ai porcini/.test(await panel().innerText()) && !/Risotto ai porcini/.test(await menu()));
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(1500);
check("annulla: il piatto torna", /Risotto ai porcini/.test(await menu()));

// Cambio di giorno: le voci passano a ieri
DB(`update "MenuItem" set "onlyDay"=to_char((now() at time zone 'Europe/Rome') - interval '29 hours','YYYY-MM-DD') where "groupId" in ('menu_grp_oggi_piatti','menu_grp_oggi_vini')`);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await settle(300);
await openDaily(page);
t = await menu();
check("giorno dopo: «Oggi fuori menù» sparisce dal menù", !/oggi fuori menù/i.test(t) && !/Risotto ai porcini/.test(t));
check("giorno dopo: il pannello propone «Riproponi (2 …)»", /Riproponi \(2/.test(await panel().innerText()), (await panel().innerText()).replace(/\n/g, " | ").slice(0, 160));
await panel().getByRole("button", { name: /^Riproponi \(2/ }).click();
await panel().getByRole("button", { name: "Riproponi Risotto ai porcini" }).click();
await settle(2000);
check("riproponi: il piatto torna oggi", /Risotto ai porcini/.test(await menu()));
check("riproponi: il vino resta fuori", !/Vermentino di Gallura/.test(await menu()));
check("riproponi: l'elenco dei giorni scorsi scende a 1", /Riproponi \(1/.test(await (async () => { await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" }); await openDaily(page); return panel().innerText(); })()));

// Permessi
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.setDefaultTimeout(60000);
  await login(p, "marta", EMP_PW);
  await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
  check("permessi: dipendente con permesso vede «Oggi fuori menù»", (await p.locator('section[aria-label="Oggi fuori menù"]').count()) === 1);
  await c.close();
}

clean();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
