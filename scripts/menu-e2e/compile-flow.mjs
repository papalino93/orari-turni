import { execFileSync } from "node:child_process";
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW } from "./lib.mjs";

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

await page.getByRole("button", { name: "Vedi i piatti →" }).click();
await settle(800);
const bar = page.locator('[role="progressbar"]').locator("xpath=ancestor::div[contains(@class,'sticky')]");
const barText = (await bar.innerText()).replace(/ /g, " ");
check("vista da compilare: avanzamento 'N di N piatti compilati · 2 da fare'", new RegExp(`${totalFood - 2} di ${totalFood} piatti compilati · 2 da fare`).test(barText), barText.replace(/\n/g, " | "));
check("vista da compilare: barra di avanzamento presente", (await page.locator('[role="progressbar"]').getAttribute("aria-valuenow")) === String(totalFood - 2));
check("vista da compilare: apre la sezione Bevande con soli 2 piatti", (await page.locator("li button[aria-label^='Modifica']").count()) === 2);
check("vista da compilare: pulsante 'Compila' sulle righe", (await page.getByRole("button", { name: "Compila", exact: true }).count()) === 2);
check("vista da compilare: niente 'Esaurito' sulle righe", (await page.getByRole("button", { name: "Esaurito", exact: true }).count()) === 0);
const sticky = await bar.evaluate((el) => getComputedStyle(el).position);
check("vista da compilare: la barra resta visibile (sticky)", sticky === "sticky");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("vista da compilare: nessun overflow orizzontale a 390px", overflow <= 0, String(overflow));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/compila-390.png` });

// Compila il primo e passa al prossimo
await page.getByRole("button", { name: "Compila", exact: true }).first().click();
await dialog().waitFor();
const firstName = await dialog().getByLabel("Nome", { exact: true }).inputValue();
await dialog().getByRole("radio", { name: "Nessuno" }).click();
const nextBtn = dialog().getByRole("button", { name: /^Salva e vai a/ });
check("foglio: 'Salva e vai a …' presente per il piatto successivo", (await nextBtn.count()) === 1, await nextBtn.innerText());
await nextBtn.click();
await settle(2200);
await dialog().waitFor();
const secondName = await dialog().getByLabel("Nome", { exact: true }).inputValue();
check("foglio: si apre il piatto successivo", secondName !== firstName && /Kombucha/.test(secondName), `${firstName} → ${secondName}`);
check("foglio: ultimo piatto, niente 'Salva e vai'", (await dialog().getByRole("button", { name: /^Salva e vai a/ }).count()) === 0);
await dialog().getByRole("radio", { name: "Contiene…" }).click();
await dialog().getByLabel("Solfiti").check();
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("fine: la vista da compilare sparisce quando non resta nulla", (await page.locator('[role="progressbar"]').count()) === 0 && (await page.getByText(/allergeni da compilare/i).count()) === 0);
check("DB: entrambi i kombucha compilati", DB(`select count(*) from "MenuItem" where id in ('menu_itm_066','menu_itm_067') and "allergensReviewed"=true`) === "2");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
