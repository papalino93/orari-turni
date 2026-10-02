// Ordine dei vini per regione: un vino nuovo va al posto della sua regione
// (Toscana, poi le altre regioni in ordine alfabetico, poi estero), senza rifare l'ordine scelto a mano.
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";

const GROUP = "menu_grp_3_1"; // Rossi · Italia
const names = () => DB(`select string_agg(name, ' | ' order by "sortOrder", "createdAt") from "MenuItem" where "groupId"='${GROUP}' and "deletedAt" is null`).split(" | ");
const clean = () => {
  DB(`delete from "MenuItem" where name like 'Vino Ordine%'`);
  DB(`delete from "MenuChange"`);
};
clean();
const before = names();

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);

async function addWine(name, region, country = "") {
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
  await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
  const card = page.locator("section, div").filter({ has: page.getByText(/^Italia · \d+$/) }).last();
  await card.getByRole("button", { name: "+ Aggiungi vino" }).first().click();
  await dialog().waitFor();
  await dialog().getByLabel("Nome", { exact: true }).fill(name);
  if (region) await dialog().getByLabel("Regione (facoltativa)").fill(region);
  if (country) await dialog().getByLabel("Nazione (facoltativa)").fill(country);
  await dialog().getByLabel("Bottiglia (€)").fill("30");
  await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
  await dialog().waitFor({ state: "detached" });
  await settle();
}

check("partenza: Toscana in testa, poi regioni in ordine alfabetico", before.indexOf("Tenuta Argentiera") < before.indexOf("Borgo Canedo") && before.indexOf("Borgo Canedo") < before.indexOf("Medevì") && before.indexOf("Medevì") < before.indexOf("Claudio Mariotto"), before.join(", "));

await addWine("Vino Ordine Lombardo", "Lombardia");
let n = names();
const i = n.indexOf("Vino Ordine Lombardo");
check("Lombardia: dopo il Lazio e prima del Piemonte", i === n.indexOf("Medevì") + 1 && i === n.indexOf("Claudio Mariotto") - 1, n.join(", "));

await addWine("Vino Ordine Toscano", "Toscana");
n = names();
check("Toscana: tra i toscani, in ordine alfabetico", n.indexOf("Vino Ordine Toscano") > n.indexOf("Tenuta Argentiera") && n.indexOf("Vino Ordine Toscano") < n.indexOf("Aquila del Torre"), n.join(", "));

await addWine("Vino Ordine Senza Regione", "");
n = names();
check("senza regione: in fondo agli italiani", n.indexOf("Vino Ordine Senza Regione") === n.length - 1, n.join(", "));

// Ordine scelto a mano: Medevì in cima. Un vino nuovo non lo rimette a posto.
DB(`update "MenuItem" set "sortOrder"=-1 where name='Medevì' and "groupId"='${GROUP}'`);
await addWine("Vino Ordine Siciliano", "Sicilia");
n = names();
check("a mano: Medevì resta in cima", n[0] === "Medevì", n.join(", "));
check("a mano: il siciliano va dopo il Piemonte, prima dei vini senza regione", n.indexOf("Vino Ordine Siciliano") === n.indexOf("Claudio Mariotto") + 1 && n.indexOf("Vino Ordine Siciliano") < n.indexOf("Vino Ordine Senza Regione"), n.join(", "));

clean();
// Rimette Medevì al suo posto (Lazio, prima del Piemonte).
const c = DB(`select "sortOrder" from "MenuItem" where name='Claudio Mariotto' and "groupId"='${GROUP}'`);
DB(`update "MenuItem" set "sortOrder"="sortOrder"+1 where "groupId"='${GROUP}' and "sortOrder">=${c} and name<>'Medevì'`);
DB(`update "MenuItem" set "sortOrder"=${c} where name='Medevì' and "groupId"='${GROUP}'`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
