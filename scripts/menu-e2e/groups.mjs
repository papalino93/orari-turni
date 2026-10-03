// Gestione: i gruppi (Champagne, Metodo classico…) si chiudono e si aprono; la
// scelta resta su quel browser anche ricaricando.
import { launch, login, check, BASE, results, ADMIN_PW } from "./lib.mjs";

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const openSection = async () => {
  await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Bollicine" }).click();
};
await openSection();
const toggle = (name) => page.locator("h3 button", { hasText: name });
const champagneVisible = () => page.getByRole("button", { name: "Modifica Henriot", exact: true }).isVisible();

check("all'inizio i gruppi sono aperti", (await toggle("Champagne").getAttribute("aria-expanded")) === "true" && (await champagneVisible()));
await toggle("Champagne").click();
check("tocco sul titolo: Champagne chiuso", (await toggle("Champagne").getAttribute("aria-expanded")) === "false" && !(await champagneVisible()));
check("chiuso: il titolo dice ancora quante voci", /Champagne · \d+/.test(await toggle("Champagne").innerText()));
check("gli altri gruppi restano aperti", (await toggle("Metodo classico").getAttribute("aria-expanded")) === "true");

await page.reload({ waitUntil: "networkidle" });
await openSection();
check("ricaricando: resta chiuso", (await toggle("Champagne").getAttribute("aria-expanded")) === "false");

await page.getByRole("button", { name: "Chiudi tutti i gruppi" }).click();
const states = await page.locator("h3 button[aria-expanded]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-expanded")));
check("«Chiudi tutti i gruppi»: tutti chiusi", states.length > 1 && states.every((s) => s === "false"), states.join(","));
check("tutti chiusi: sparisce «Chiudi tutti»", (await page.getByRole("button", { name: "Chiudi tutti i gruppi" }).count()) === 0);
await page.getByRole("button", { name: "Apri tutti i gruppi" }).click();
check("«Apri tutti i gruppi»: Henriot di nuovo visibile", await champagneVisible());

// La ricerca trova anche le voci dei gruppi chiusi
await toggle("Champagne").click();
await page.getByRole("searchbox", { name: "Cerca una voce" }).fill("henriot");
await page.waitForTimeout(500);
check("ricerca: trova Henriot anche col gruppo chiuso", (await page.locator('section[aria-label="Cerca una voce"] li', { hasText: "Henriot" }).count()) > 0);
await page.getByRole("searchbox", { name: "Cerca una voce" }).fill("");
await toggle("Champagne").click();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
