// Gestione: ricerca di una voce con «Esaurito» a un tocco, e anteprima in cornice da telefono.
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
DB(`update "MenuItem" set "soldOutDay"=null, "deletedAt"=null`);
DB(`delete from "MenuChange"`);
DB(`delete from "MenuPromo"`);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const settle = (ms = 1500) => page.waitForTimeout(ms);
const box = page.getByRole("searchbox", { name: "Cerca una voce" });

check("ricerca: campo in cima alla gestione", (await box.count()) === 1);
await box.fill("aquila");
await settle(400);
const list = page.locator('section[aria-label="Cerca una voce"] li');
const n = await list.count();
check("ricerca: «aquila» trova più voci", n >= 2, String(n));
const first = list.first();
const name = (await first.locator("button").first().locator("span").first().innerText()).trim();
await first.getByRole("button", { name: /^Segna esaurita/ }).click();
await settle(1800);
check("esaurito dalla ricerca: il pulsante risulta premuto", (await list.first().getByRole("button", { name: /^Di nuovo disponibile/ }).count()) === 1);
const sold = Number(DB(`select count(*) from "MenuItem" where name='${name.replace(/'/g, "''")}' and "soldOutDay" is not null`));
check("esaurito dalla ricerca: salvato sul database", sold >= 1, `${name}: ${sold}`);
await first.getByRole("button", { name: /^Di nuovo disponibile/ }).click();
await settle(1800);
check("di nuovo disponibile: tolto", Number(DB(`select count(*) from "MenuItem" where name='${name.replace(/'/g, "''")}' and "soldOutDay" is not null`)) === 0);

await box.fill("zzzzqq");
await settle(300);
check("ricerca: nessuna voce lo dice", /nessuna voce trovata/i.test(await page.locator('section[aria-label="Cerca una voce"]').innerText()));
await box.fill("aquila");
await settle(300);
await list.first().getByRole("button", { name: /^Modifica/ }).click();
await page.locator('[role="dialog"]').waitFor();
check("ricerca: toccando il nome si apre la modifica", (await page.locator('[role="dialog"]').getByLabel(/^(Nome|Azienda)$/).inputValue()).length > 0);
await page.keyboard.press("Escape");
const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("gestione @390: nessun overflow orizzontale", ov <= 0, String(ov));

// Anteprima
await page.getByRole("button", { name: "Anteprima", exact: true }).click();
const dlg = page.locator('[role="dialog"][aria-label="Anteprima del menù"]');
await dlg.waitFor();
const frame = page.frameLocator('iframe[title="Anteprima del menù dei clienti"]');
await frame.locator("header").first().waitFor({ timeout: 60000 });
check("anteprima: il menù dei clienti si carica nella cornice", (await frame.locator("nav[aria-label='Sezioni del menù']").count()) === 1);
const fw = (await page.locator("iframe").boundingBox()).width;
check("anteprima: larga come un telefono (≤ 390 px)", fw <= 390.5, String(fw));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/anteprima-390.png` });
await dlg.getByRole("button", { name: "Aggiorna" }).click();
await settle(500);
await page.keyboard.press("Escape");
check("anteprima: si chiude con Esc", (await dlg.count()) === 0);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
