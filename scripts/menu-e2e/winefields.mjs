// Vini: azienda, nome del vino, denominazione e annata in campi separati
// (dati divisi dalla migrazione) e come compaiono sul menù.
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";

const ID = "menu_itm_032"; // Tenuta Argentiera · Villa Donoratico · Bolgheri Doc · 2023
DB(`update "MenuItem" set name='Tenuta Argentiera', "wineName"='Villa Donoratico', denomination='Bolgheri Doc', vintage='2023', sub=null where id='${ID}'`);
DB(`delete from "MenuChange"`);

const browser = await launch();
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
const row = (await pub.locator(`#v-${ID}`).innerText()).replace(/\s+/g, " ");
check("menù: azienda, nome del vino, denominazione · annata", /Tenuta Argentiera/.test(row) && /Villa Donoratico/.test(row) && /Bolgheri Doc · 2023/.test(row), row);
const italic = await pub.locator(`#v-${ID} div`, { hasText: /^Villa Donoratico$/ }).first().evaluate((el) => getComputedStyle(el).fontStyle);
check("menù: il nome del vino è in corsivo", italic === "italic", italic);
check("dati divisi: nessun vecchio sottotitolo nei vini della carta", DB(`select count(*) from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s.kind='WINE' and s."promoId" is null and s."dailyOnly"=false and i."deletedAt" is null and i.sub is not null and i.name not like 'Vino %'`) === "0");

const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
check("elenco gestione: «Villa Donoratico · Bolgheri Doc · 2023»", /Villa Donoratico · Bolgheri Doc · 2023/.test(await page.locator("li", { has: page.getByRole("button", { name: "Modifica Tenuta Argentiera", exact: true }) }).innerText()));
await page.getByRole("button", { name: "Modifica Tenuta Argentiera", exact: true }).click();
await dialog().waitFor();
check("scheda: campo Azienda", (await dialog().getByLabel("Azienda", { exact: true }).inputValue()) === "Tenuta Argentiera");
check("scheda: Nome del vino", (await dialog().getByLabel(/Nome del vino/).inputValue()) === "Villa Donoratico");
check("scheda: Denominazione e Annata", (await dialog().getByLabel("Denominazione").inputValue()) === "Bolgheri Doc" && (await dialog().getByLabel("Annata").inputValue()) === "2023");
check("scheda: niente «Vecchio sottotitolo»", (await dialog().getByLabel("Vecchio sottotitolo").count()) === 0);
await dialog().getByLabel("Annata").fill("2024");
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await page.waitForTimeout(1500);
check("salva: annata aggiornata", DB(`select vintage from "MenuItem" where id='${ID}'`) === "2024");
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await page.waitForTimeout(1800);
check("annulla: annata di nuovo 2023", DB(`select vintage from "MenuItem" where id='${ID}'`) === "2023");

// Vino con il vecchio sottotitolo: la scheda lo mostra per spostarlo
DB(`update "MenuItem" set sub='Vecchio testo' where id='${ID}'`);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
await page.getByRole("button", { name: "Modifica Tenuta Argentiera", exact: true }).click();
await dialog().waitFor();
check("vecchio sottotitolo: visibile per essere spostato", (await dialog().getByLabel("Vecchio sottotitolo").inputValue()) === "Vecchio testo");
await page.keyboard.press("Escape");
DB(`update "MenuItem" set sub=null where id='${ID}'`);

// Regione obbligatoria per i vini italiani (non per gli esteri)
DB(`delete from "MenuItem" where name like 'Prova Regione%'`);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
await page.getByRole("button", { name: "+ Aggiungi vino" }).first().click();
await dialog().waitFor();
check("scheda nuova: «Regione» senza «facoltativa»", (await dialog().getByLabel("Regione", { exact: true }).count()) === 1);
await dialog().getByLabel("Azienda", { exact: true }).fill("Prova Regione IT");
await dialog().getByLabel("Bottiglia (€)").fill("30");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await page.waitForTimeout(1200);
check("italiano senza regione: non si salva", DB(`select count(*) from "MenuItem" where name='Prova Regione IT'`) === "0" && (await dialog().count()) === 1);
await dialog().getByLabel("Nazione (vuota = Italia)").fill("Francia");
check("estero: la regione torna facoltativa", (await dialog().getByLabel("Regione (facoltativa)").count()) === 1);
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await page.waitForTimeout(1200);
check("estero senza regione: salvato", DB(`select count(*) from "MenuItem" where name='Prova Regione IT' and country='Francia'`) === "1");
// Un vino italiano senza regione arrivato da «Incolla più voci»: la gestione lo segnala.
DB(`update "MenuItem" set country=null where name='Prova Regione IT'`);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
check("gestione: «Manca la regione»", /Manca la regione/.test(await page.locator("li", { has: page.getByRole("button", { name: "Modifica Prova Regione IT", exact: true }) }).innerText()));
DB(`delete from "MenuItem" where name like 'Prova Regione%'`);
DB(`delete from "MenuChange"`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
