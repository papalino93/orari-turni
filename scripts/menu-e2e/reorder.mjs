// «Riordina» (sezioni, gruppi, voci; trascinando o con le frecce; un solo
// Annulla) e «In cima» / «In fondo» nella scheda della voce.
import { launch, login, check, BASE, results, ADMIN_PW, DB, tool } from "./lib.mjs";

const GROUP = "menu_grp_3_1"; // Rossi · Italia
const sectionsOrder = () => DB(`select string_agg(label, ' | ' order by "sortOrder") from "MenuSection" where "promoId" is null and "dailyOnly"=false`);
const itemsOrder = () => DB(`select string_agg(name, ' | ' order by "sortOrder", "createdAt") from "MenuItem" where "groupId"='${GROUP}' and "deletedAt" is null`).split(" | ");
const startSections = sectionsOrder();
const startItems = DB(`select string_agg(id || ':' || "sortOrder", ',') from "MenuItem" where "groupId"='${GROUP}'`);
DB(`delete from "MenuChange"`);

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 1100 } })).newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);

await tool(page, "Riordina");
await dialog().waitFor();
check("si apre «Riordina»", (await dialog().getByRole("heading", { name: "Riordina" }).count()) === 1);
await dialog().getByRole("navigation", { name: "Livello" }).getByRole("button", { name: "Sezioni" }).click();
check("livello sezioni: tutte le sezioni fisse", (await dialog().locator("li[data-id]").count()) === startSections.split(" | ").length);
check("«Salva ordine» spento finché non si cambia", await dialog().getByRole("button", { name: "Salva ordine" }).isDisabled());

// Rosé & Orange prima dei Rossi, con la freccia
await dialog().getByRole("button", { name: "Sposta su Rosé & Orange" }).click();
check("dopo lo spostamento «Salva ordine» si accende", await dialog().getByRole("button", { name: "Salva ordine" }).isEnabled());
await dialog().getByRole("button", { name: "Salva ordine" }).click();
await settle();
const s1 = sectionsOrder();
check("sezioni: Rosé & Orange prima dei Rossi", s1.indexOf("Rosé & Orange") < s1.indexOf("Rossi"), s1);
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
const chips = await pub.locator('nav[aria-label="Sezioni del menù"] a').allInnerTexts();
check("menù: la barra delle sezioni segue il nuovo ordine", chips.findIndex((c) => /ros[ée] & orange/i.test(c)) < chips.findIndex((c) => /^rossi$/i.test(c.trim())), chips.join(", "));
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(2000);
check("annulla: ordine delle sezioni di prima", sectionsOrder() === startSections, sectionsOrder());

// Voci: trascinare l'ultima in cima
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await tool(page, "Riordina");
await dialog().waitFor();
await dialog().getByRole("navigation", { name: "Livello" }).getByRole("button", { name: "Sezioni" }).click();
await dialog().getByRole("button", { name: "Apri Rossi" }).click();
await dialog().getByRole("button", { name: "Apri Italia" }).click();
check("livello voci: i vini di Rossi · Italia", (await dialog().locator("li[data-id]").count()) === itemsOrder().length);
check("vini: c'è «Ordina per regione»", (await dialog().getByRole("button", { name: "Ordina per regione" }).count()) === 1);
const before = itemsOrder();
const last = before[before.length - 1];
const handle = dialog().getByRole("button", { name: `Trascina ${last}` });
await handle.scrollIntoViewIfNeeded();
const firstRow = dialog().locator("li[data-id]").first();
const hb = await handle.boundingBox();
const fb = await firstRow.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
for (let y = hb.y; y > fb.y - 10; y -= 25) await page.mouse.move(hb.x + hb.width / 2, y);
// La lista può scorrere mentre si trascina: si punta alla prima riga dov'è adesso.
for (let k = 0; k < 3; k++) {
  const top = await dialog().locator("li[data-id]").first().boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, top.y + 3);
  await page.waitForTimeout(150);
}
await page.mouse.up();
const firstLabel = await dialog().locator("li[data-id] p").first().innerText();
check("trascinando: l'ultimo vino va in cima", firstLabel === last, firstLabel);
await dialog().getByRole("button", { name: "Salva ordine" }).click();
await settle();
check("salvato: primo nel database", itemsOrder()[0] === last, itemsOrder().join(", "));

// «Ordina per regione» rimette l'ordine della carta
await dialog().getByRole("button", { name: "Ordina per regione" }).click();
await dialog().getByRole("button", { name: "Salva ordine" }).click();
await settle();
check("ordina per regione: torna l'ordine della carta", itemsOrder().join("|") === before.join("|"), itemsOrder().join(", "));
await page.keyboard.press("Escape");

// «In cima» e «In fondo» nella scheda
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
await page.getByRole("button", { name: `Modifica ${before[3]}`, exact: true }).click();
await dialog().waitFor();
await dialog().getByRole("button", { name: "⤒ In cima" }).click();
await settle();
check("«In cima»: la voce è la prima", itemsOrder()[0] === before[3], itemsOrder().join(", "));
await dialog().getByRole("button", { name: "⤓ In fondo" }).click();
await settle();
const io = itemsOrder();
check("«In fondo»: la voce è l'ultima", io[io.length - 1] === before[3], io.join(", "));

// Ripristino dell'ordine di partenza
for (const pair of startItems.split(",")) {
  const [id, so] = pair.split(":");
  DB(`update "MenuItem" set "sortOrder"=${so} where id='${id}'`);
}
DB(`delete from "MenuChange"`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
