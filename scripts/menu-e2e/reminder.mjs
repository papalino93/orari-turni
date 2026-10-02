// Avviso allergeni mancanti: messaggio «mancano gli allergeni» con «Compila ora»
// dopo aver aggiunto un piatto senza allergeni, e piatti di «Oggi fuori menù»
// contati nel richiamo e nel percorso «Compila allergeni».
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";

const clean = () => {
  DB(`delete from "MenuItem" where name in ('Piatto Senza Allergeni','Piatto Con Allergeni')`);
  DB(`delete from "MenuItem" where "groupId" in ('menu_grp_oggi_piatti','menu_grp_oggi_vini')`);
  DB(`delete from "MenuChange"`);
  DB(`update "MenuItem" set "allergensReviewed"=true where "groupId" in (select g.id from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" where s.kind='FOOD')`);
};
clean();

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const toast = () => page.locator('[role="status"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);
const section = (name) => page.locator('nav[aria-label="Sezioni"] button', { hasText: name }).click();
const banner = () => page.getByRole("button", { name: /^Compila allergeni \(\d+ da fare\)$/ });

check("partenza: nessun richiamo allergeni", (await banner().count()) === 0);

// ---- Piatto nuovo senza allergeni → «Compila ora»
await section("Taglieri");
await page.getByRole("button", { name: "+ Aggiungi voce" }).first().click();
await dialog().waitFor();
await dialog().getByLabel("Nome", { exact: true }).fill("Piatto Senza Allergeni");
await dialog().getByPlaceholder("es. 13").fill("9");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(800);
const t = (await toast().allInnerTexts()).join(" | ");
check("messaggio: «mancano gli allergeni»", /Piatto Senza Allergeni.*mancano gli allergeni/.test(t), t);
check("messaggio: niente «Voce aggiunta» doppio", !/Voce aggiunta/.test(t), t);
const compila = toast().getByRole("button", { name: "Compila ora" });
check("messaggio: pulsante «Compila ora»", (await compila.count()) === 1);
check("richiamo: compare «Compila allergeni (1 da fare)»", /\(1 da fare\)/.test(await banner().innerText().catch(() => "")));
await compila.click();
await dialog().waitFor();
await settle(600);
check("compila ora: si apre la scheda del piatto", (await dialog().getByLabel("Nome", { exact: true }).inputValue()) === "Piatto Senza Allergeni");
const legendInView = await dialog().locator("legend", { hasText: "Allergeni" }).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= innerHeight;
});
check("compila ora: la scheda mostra subito gli allergeni", legendInView);
await dialog().getByRole("radio", { name: "Nessuno" }).click();
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("dopo la compilazione: richiamo sparito", (await banner().count()) === 0);

// ---- Piatto nuovo con allergeni: messaggio normale con «Annulla»
await page.getByRole("button", { name: "+ Aggiungi voce" }).first().click();
await dialog().waitFor();
await dialog().getByLabel("Nome", { exact: true }).fill("Piatto Con Allergeni");
await dialog().getByPlaceholder("es. 13").fill("9");
await dialog().getByRole("radio", { name: "Nessuno" }).click();
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(800);
const t2 = (await toast().allInnerTexts()).join(" | ");
check("con allergeni: «Voce aggiunta» con «Annulla»", /Voce aggiunta/.test(t2) && /Annulla/.test(t2) && !/Compila ora/.test(t2), t2);

// ---- Piatto del giorno senza allergeni: contato e nel percorso
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await page.locator('section[aria-label="Oggi fuori menù"]').getByRole("button", { name: "+ Piatto" }).click();
await dialog().waitFor();
await dialog().getByLabel("Nome", { exact: true }).fill("Zuppa del giorno");
await dialog().getByPlaceholder("es. 13").fill("10");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(800);
check("piatto del giorno: «Compila ora» anche qui", (await toast().getByRole("button", { name: "Compila ora" }).count()) === 1);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
check("piatto del giorno: contato nel richiamo", /\(1 da fare\)/.test(await banner().innerText().catch(() => "")));
await banner().click();
await dialog().waitFor();
check("percorso: parte dal piatto del giorno", (await dialog().getByLabel("Nome", { exact: true }).inputValue()) === "Zuppa del giorno");
await dialog().getByRole("radio", { name: "Nessuno" }).click();
await dialog().getByRole("button", { name: /Salva e chiudi|Salva e passa/ }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("percorso: dopo il salvataggio il richiamo sparisce", (await banner().count()) === 0);

clean();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
