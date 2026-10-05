import { execFileSync } from "node:child_process";
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, openSection } from "./lib.mjs";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
DB(`delete from "MenuPromo"`);
DB(`delete from "MenuChange"`);
// Stato di partenza noto: tutto il cibo compilato tranne i due kombucha.
DB(`delete from "MenuItem" where name = 'Piatto Prova'`);
DB(`update "MenuItem" set "allergensReviewed"=true where "groupId" in (select g.id from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" where s.kind='FOOD')`);
DB(`update "MenuItem" set allergens='{}', "allergensReviewed"=false where id in ('menu_itm_066','menu_itm_067')`);
const totalFood = Number(DB(`select count(*) from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s.kind='FOOD' and s."promoId" is null and i."deletedAt" is null and g."deletedAt" is null`));

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);

const startBtn = page.getByRole("button", { name: /^Compila allergeni \(\d+ da fare\)$/ });
check("banner: pulsante «Compila allergeni (2 da fare)»", (await startBtn.count()) === 1, await startBtn.innerText());
check("niente barra fissa di filtro", (await page.locator('[role="progressbar"]').count()) === 0);
// Telefono: le sezioni stanno chiuse a fisarmonica; ne apro una.
await openSection(page, "");
check("righe normali: «Esaurito» resta disponibile", (await page.getByRole("button", { name: "Esaurito", exact: true }).count()) > 0);
await startBtn.click();
await dialog().waitFor();
check("guidata: titolo «Allergeni · 1 di 2»", (await dialog().getByRole("heading", { name: "Allergeni · 1 di 2" }).count()) === 1);
const firstName = await dialog().getByLabel("Nome", { exact: true }).inputValue();
await dialog().getByRole("radio", { name: "Nessuno" }).click();
check("guidata: «Salva e passa al successivo» presente", (await dialog().getByRole("button", { name: "Salva e passa al successivo" }).count()) === 1);
check("guidata: «Salta questo piatto» presente", (await dialog().getByRole("button", { name: "Salta questo piatto" }).count()) === 1);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("guidata: nessun overflow orizzontale a 390px", overflow <= 0, String(overflow));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/compila-390.png` });
await dialog().getByRole("button", { name: "Salva e passa al successivo" }).click();
await settle(2200);
await dialog().waitFor();
const secondName = await dialog().getByLabel("Nome", { exact: true }).inputValue();
check("guidata: si apre il piatto successivo", secondName !== firstName && /Kombucha/.test(secondName), `${firstName} → ${secondName}`);
check("guidata: titolo «Allergeni · 2 di 2»", (await dialog().getByRole("heading", { name: "Allergeni · 2 di 2" }).count()) === 1);
check("guidata: ultimo piatto, niente «Salta»", (await dialog().getByRole("button", { name: "Salta questo piatto" }).count()) === 0);
await dialog().getByRole("radio", { name: "Contiene…" }).click();
await dialog().getByLabel("Solfiti").check();
await dialog().getByRole("button", { name: "Salva e chiudi" }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("fine: l'avviso sparisce quando non resta nulla", (await page.getByText(/allergeni da compilare/i).count()) === 0);
check("DB: entrambi i kombucha compilati", DB(`select count(*) from "MenuItem" where id in ('menu_itm_066','menu_itm_067') and "allergensReviewed"=true`) === "2");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
