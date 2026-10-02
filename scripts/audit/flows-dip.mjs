import fs from "node:fs";
import { launch, login, BASE } from "../menu-e2e/lib.mjs";
const OUT = process.env.SHOTS ?? "/tmp/claude-0/shots/flows";
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
async function step(name, fn) {
  try { const r = await fn(); console.log("OK  ", name, r ?? ""); }
  catch (e) { console.log("FAIL", name, "—", e.message.split("\n")[0]); }
}
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 150)));
await login(page, "andrea", process.env.E2E_ADMIN_PASSWORD);
await page.goto(`${BASE}/dipendenti`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Ricordamelo più tardi/i }).click().catch(() => {});
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await step("elenco dipendenti (desktop)", async () => { await shot("d01-dipendenti"); return (await page.locator("h1").innerText()); });
await step("aggiungi dipendente 'Paolo Verdi'", async () => {
  await page.getByPlaceholder("Nome e cognome").fill("Paolo Verdi");
  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await page.getByText("Paolo Verdi").first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  await shot("d02-nuovo-dipendente");
  return "creato";
});
await step("testo completo scheda Marta (con permesso menù)", async () => {
  const card = page.locator("div.rounded-2xl", { has: page.getByText("Marta Neri") }).last();
  return (await card.innerText()).replace(/\n+/g, " / ").slice(0, 900);
});
await step("Approva settembre di Giulia", async () => {
  const card = page.locator("div.rounded-2xl", { has: page.getByText("Giulia Bernardi") }).last();
  await card.getByRole("button", { name: "Approva" }).click();
  await page.waitForTimeout(1000);
  await shot("d03-approvato");
  return (await card.innerText()).replace(/\n+/g, " / ").slice(0, 300);
});
await step("Riapri settembre di Luca con motivo", async () => {
  const card = page.locator("div.rounded-2xl", { has: page.getByText("Luca Marchetti") }).last();
  await card.getByRole("button", { name: "Riapri" }).click();
  await page.waitForTimeout(500);
  await shot("d04-riapri");
  return (await page.locator("div.fixed").first().innerText().catch(() => "")).replace(/\n+/g, " / ").slice(0, 400) || "(nessun overlay)";
});
await browser.close();
console.log(errs.length ? "ERRORI JS: " + errs.join(" ; ") : "nessun errore JS");
