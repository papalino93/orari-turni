// «Tabella prezzi»: più prezzi cambiati insieme (vini e piatti, anche con
// formati), controlli prima di salvare, un solo «Annulla».
import { launch, login, check, BASE, results, ADMIN_PW, DB, tool } from "./lib.mjs";

const wine = DB(`select i.id || '|' || i.name || '|' || coalesce(i."priceGlassCents"::text,'') || '|' || coalesce(i."priceBottleCents"::text,'') from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s.label='Rossi' and i."deletedAt" is null and i."priceGlassCents" is not null order by g."sortOrder", i."sortOrder" limit 1`).split("|");
const [wineId, wineName, glass0, bottle0] = wine;
const food = DB(`select i.id || '|' || i.name || '|' || i."priceCents" from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s.kind='FOOD' and s."promoId" is null and s."dailyOnly"=false and i."deletedAt" is null and i."priceCents" is not null and i.variants is null order by s."sortOrder", g."sortOrder", i."sortOrder" limit 1`).split("|");
const [foodId, foodName, price0] = food;
const prices = (id) => DB(`select coalesce("priceGlassCents"::text,'') || '|' || coalesce("priceBottleCents"::text,'') || '|' || coalesce("priceCents"::text,'') from "MenuItem" where id='${id}'`);
const foodSection = DB(`select s.label from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where i.id='${foodId}'`);
DB(`delete from "MenuChange"`);

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');

await tool(page, "Tabella prezzi");
await dialog().waitFor();
check("si apre «Tabella prezzi»", (await dialog().getByRole("heading", { name: "Tabella prezzi" }).count()) === 1);
const save = dialog().getByRole("button", { name: "Salva tutto" });
check("«Salva tutto» spento senza modifiche", await save.isDisabled());

await dialog().getByRole("navigation", { name: "Sezione" }).getByRole("button", { name: /^Rossi/ }).click();
const glassInput = dialog().getByRole("textbox", { name: new RegExp(`^Calice · ${wineName}`) }).first();
const euro = (c) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2).replace(".", ","));
check("vini: casella del calice con il prezzo attuale", (await glassInput.inputValue()) === euro(Number(glass0)), await glassInput.inputValue());
const newGlass = Number(glass0) + 150;
await glassInput.fill("abc");
check("prezzo non valido: segnalato e non si salva", (await dialog().getByText("Prezzo non valido").count()) > 0 && (await save.isDisabled()));
await glassInput.fill(euro(newGlass));
check("prezzo valido: si può salvare", await save.isEnabled());

// Un piatto in un'altra sezione, senza perdere il vino cambiato
await dialog().getByRole("navigation", { name: "Sezione" }).getByRole("button", { name: new RegExp(`^${foodSection}`) }).click();
const priceInput = dialog().getByRole("textbox", { name: `Prezzo · ${foodName}` }).first();
await priceInput.fill("");
check("piatto senza prezzo: «Manca il prezzo»", (await dialog().getByText("Manca il prezzo.").count()) > 0 && (await save.isDisabled()));
const newPrice = Number(price0) === 2100 ? "22" : "21";
await priceInput.fill(newPrice);
check("contatore: 2 voci cambiate", (await dialog().getByText("2 voci cambiate").count()) === 1);
check("la sezione dei vini mostra quante voci cambiate", /Rossi\s*·\s*1/.test(await dialog().getByRole("navigation", { name: "Sezione" }).innerText()));
await save.click();
await page.waitForTimeout(1500);
check("salvato: nuovo prezzo al calice", prices(wineId).startsWith(`${newGlass}|`), prices(wineId));
check("salvato: nuovo prezzo del piatto", prices(foodId).endsWith(`|${Number(newPrice) * 100}`), prices(foodId));
check("un solo record nello storico", DB(`select count(*) from "MenuChange" where "entityId"='*prices'`) === "1");
check("dopo il salvataggio niente da salvare", await save.isDisabled());

const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
const body = await pub.locator("body").innerText();
const at = body.indexOf(foodName);
check("menù dei clienti: nuovo prezzo del piatto", at >= 0 && new RegExp(`\\b${newPrice}\\b`).test(body.slice(at, at + 300)), body.slice(at, at + 120).replace(/\n/g, " | "));

await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await page.waitForTimeout(2000);
check("annulla: prezzi del vino come prima", prices(wineId) === `${glass0}|${bottle0}|`, prices(wineId));
check("annulla: prezzo del piatto come prima", prices(foodId) === `||${price0}`, prices(foodId));

DB(`delete from "MenuChange"`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
