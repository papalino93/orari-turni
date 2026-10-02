import fs from "node:fs";
import { launch, login, BASE } from "../menu-e2e/lib.mjs";
const OUT = process.env.SHOTS ?? "/tmp/claude-0/shots/flows";
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
const res = [];
async function step(name, fn) {
  try { const r = await fn(); res.push(["OK", name, r ?? ""]); console.log("OK  ", name, r ?? ""); }
  catch (e) { res.push(["FAIL", name, e.message.split("\n")[0]]); console.log("FAIL", name, "—", e.message.split("\n")[0]); }
}
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 150)));
await login(page, "andrea", process.env.E2E_ADMIN_PASSWORD);
await page.goto(`${BASE}/orari?view=week&date=2026-10-12`, { waitUntil: "networkidle" });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
await page.getByRole("button", { name: /Ricordamelo più tardi/i }).click().catch(() => {});
await page.getByLabel("Chiudi").first().click({ timeout: 800 }).catch(() => {});

await step("settimana vuota 12-18 ottobre", async () => {
  await shot("a01-settimana-vuota");
  return (await page.locator("h1").first().innerText());
});
await step("apre modale su cella (Luca, mar 13/10, mattina)", async () => {
  const row = page.locator("tbody tr", { hasText: "Luca Marchetti" }).first();
  await row.locator("td").nth(2).click();
  await page.getByRole("heading", { name: "Luca Marchetti" }).waitFor();
  await shot("a02-modale-turno");
});
await step("imposta mattina 10:00–13:00 e salva", async () => {
  const dlg = page.locator("form");
  await dlg.getByRole("checkbox", { name: "Mattina" }).check();
  await dlg.getByLabel("Mattina — inizio — ora", { exact: true }).fill("10");
  await dlg.getByLabel("Mattina — inizio — minuti", { exact: true }).fill("00");
  await dlg.getByRole("button", { name: "Salva", exact: true }).click();
  await page.waitForTimeout(1200);
  await shot("a03-dopo-salvataggio");
  const row = page.locator("tbody tr", { hasText: "Luca Marchetti" }).first();
  const txt = await row.innerText();
  if (!/10:00.13:00/.test(txt)) throw new Error("turno non visibile: " + txt.replace(/\n/g, " "));
  return txt.replace(/\n/g, " ");
});
await step("Tutta la settimana: Marco mattina lun-sab", async () => {
  const row = page.locator("tbody tr", { hasText: "Marco Fiorini" }).first();
  await row.locator("td").nth(1).click();
  const dlg = page.locator("form");
  await dlg.getByRole("checkbox", { name: "Mattina" }).check();
  await dlg.getByRole("button", { name: "Tutta la settimana" }).click();
  await shot("a04-ripeti-tutta-settimana");
  await dlg.getByRole("button", { name: "Salva", exact: true }).click();
  await page.waitForTimeout(1200);
  const txt = (await row.innerText()).replace(/\n/g, " ");
  const n = (txt.match(/09:30.13:00/g) || []).length;
  if (n !== 7) throw new Error(`attesi 7 turni, trovati ${n}: ${txt}`);
  return txt;
});
await step("Ferie: Giulia mer 14/10", async () => {
  const row = page.locator("tbody tr", { hasText: "Giulia Bernardi" }).first();
  await row.locator("td").nth(3).click();
  const dlg = page.locator("form");
  await dlg.getByRole("button", { name: "Ferie", exact: true }).click();
  await shot("a05-ferie");
  await dlg.getByRole("button", { name: "Salva", exact: true }).click();
  await page.waitForTimeout(1200);
  const txt = (await row.innerText()).replace(/\n/g, " ");
  if (!/Ferie/i.test(txt)) throw new Error(txt);
  return txt;
});
await step("Chiudi il locale giovedì 15/10", async () => {
  await page.getByRole("button", { name: /Gio/ }).filter({ hasText: /^.{0,3}Gio$/ }).first().click();
  await page.waitForTimeout(500);
  await shot("a06-chiudi-giorno");
  const body = await page.locator("body").innerText();
  return body.includes("Locale chiuso") || body.includes("Chiudi") ? "modale aperto" : "nessuna modale";
});
await browser.close();
console.log(errs.length ? "ERRORI JS: " + errs.join(" ; ") : "nessun errore JS");
