// Caratteristiche dei vini (Biologico, Biodinamico, Vegano, Senza solfiti aggiunti):
// spunte nella scheda, riga sul menù, filtri della ricerca, abbinamento, annulla.
import { launch, login, check, BASE, results, ADMIN_PW, DB, tool, goTab } from "./lib.mjs";

const WINE = "menu_itm_033"; // Mastrojanni, Rossi
const DISH = "menu_itm_051"; // Tagliere Classico
const clean = () => {
  DB(`update "MenuItem" set traits='{}', "pairWineId"=null`);
  DB(`update "MenuItem" set "soldOutDay"=null where id='${WINE}'`);
  DB(`delete from "MenuChange"`);
};
clean();

const browser = await launch();
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
const menu = async () => {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  return (await pub.locator("main").innerText()).replace(/ /g, " ");
};
const searchChips = async () => {
  await pub.getByRole("button", { name: "Cerca nel menù", exact: true }).click();
  const dlg = pub.locator('[role="dialog"]');
  await dlg.waitFor();
  return dlg;
};

await menu();
let dlg = await searchChips();
check("partenza: nessun filtro «Bio» nella ricerca", (await dlg.getByRole("button", { name: "Bio", exact: true }).count()) === 0);
await pub.keyboard.press("Escape");

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);
const section = async (name) => {
  await goTab(page, "Menù");
  await page.locator('nav[aria-label="Sezioni"] button', { hasText: name }).click();
};
const row = (name) => page.locator("li", { has: page.getByRole("button", { name: `Modifica ${name}`, exact: true }) });

await section("Rossi");
await page.getByRole("button", { name: "Modifica Mastrojanni", exact: true }).click();
await dialog().waitFor();
check("scheda vino: quattro caratteristiche", (await dialog().locator("fieldset", { hasText: "Caratteristiche" }).locator("input[type=checkbox]").count()) === 4);
await dialog().getByLabel("Biologico", { exact: true }).check();
await dialog().getByLabel("Vegano", { exact: true }).check();
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("salvato nel database, in ordine fisso", DB(`select traits from "MenuItem" where id='${WINE}'`) === "{BIO,VEGAN}");
check("elenco gestione: «Biologico · Vegano»", /Biologico · Vegano/.test(await row("Mastrojanni").innerText()));

await section("Taglieri");
await page.getByRole("button", { name: "Modifica Tagliere Classico", exact: true }).click();
await dialog().waitFor();
check("scheda piatto: niente caratteristiche", (await dialog().locator("fieldset", { hasText: "Caratteristiche" }).count()) === 0);
await page.keyboard.press("Escape");

await menu();
const wineText = (await pub.locator(`#v-${WINE}`).innerText()).replace(/\s+/g, " ");
check("menù: «Bio» e «Vegano» sotto il vino", /Bio/.test(wineText) && /Vegano/.test(wineText), wineText);
check("menù: con i disegnini", (await pub.locator(`#v-${WINE} svg`).count()) >= 2);
check("menù: gli altri vini senza riga", !/Vegano/.test(await pub.locator("#v-menu_itm_028").innerText()));

dlg = await searchChips();
check("ricerca: filtri «Bio» e «Vegano» presenti", (await dlg.getByRole("button", { name: "Bio", exact: true }).count()) === 1 && (await dlg.getByRole("button", { name: "Vegano", exact: true }).count()) === 1);
check("ricerca: niente filtro «Biodinamico» (nessun vino)", (await dlg.getByRole("button", { name: "Biodinamico", exact: true }).count()) === 0);
await dlg.getByRole("button", { name: "Vegano", exact: true }).click();
await pub.waitForTimeout(400);
const res = await dlg.locator("ul li").allInnerTexts();
check("ricerca: il filtro «Vegano» mostra solo Mastrojanni", res.length === 1 && /Mastrojanni/.test(res[0]), res.join(" | "));
await dlg.locator("input[type=search]").fill("biologico");
await pub.waitForTimeout(300);
await dlg.getByRole("button", { name: "Vegano", exact: true }).click();
await pub.waitForTimeout(300);
check("ricerca: scrivere «biologico» trova il vino", /Mastrojanni/.test(await dlg.innerText()));
await pub.keyboard.press("Escape");

// Abbinamento: il riquadro mostra le caratteristiche
DB(`update "MenuItem" set "pairWineId"='${WINE}' where id='${DISH}'`);
await menu();
const box = (await pub.locator(`a[data-pair-from="${DISH}"]`).innerText()).replace(/\s+/g, " ");
check("abbinamento: anche nel riquadro", /Bio/.test(box) && /Vegano/.test(box), box);

// Annulla dallo storico
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await tool(page, "Storico");
await dialog().waitFor();
await dialog().locator("li", { hasText: /Modificato: Mastrojanni/ }).first().getByRole("button", { name: "Ripristina" }).click();
await settle(2000);
check("ripristina: caratteristiche tolte", DB(`select traits from "MenuItem" where id='${WINE}'`) === "{}");

// Overflow con tutte e quattro su un telefono stretto
DB(`update "MenuItem" set traits='{BIO,BIODYNAMIC,VEGAN,NO_ADDED_SULFITES}' where id='${WINE}'`);
{
  const p = await (await browser.newContext({ viewport: { width: 360, height: 740 } })).newPage();
  await p.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("360 px con quattro caratteristiche: nessuno scorrimento orizzontale", ov <= 0, String(ov));
  check("dicitura «Senza solfiti aggiunti»", /Senza solfiti aggiunti/.test(await p.locator(`#v-${WINE}`).innerText()));
}

clean();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
