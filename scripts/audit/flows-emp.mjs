import fs from "node:fs";
import { launch, login, BASE } from "../menu-e2e/lib.mjs";
const OUT = process.env.SHOTS ?? "/tmp/claude-0/shots/flows";
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
async function step(name, fn) {
  try { const r = await fn(); console.log("OK  ", name, r ?? ""); }
  catch (e) { console.log("FAIL", name, "—", e.message.split("\n")[0]); }
}
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: "it-IT", timezoneId: "Europe/Rome" });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 150)));
await login(page, "sara", process.env.E2E_EMPLOYEE_PASSWORD);
const shot = (n, full) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: !!full });
await page.getByRole("button", { name: /Ricordamelo più tardi/i }).click().catch(() => {});
await step("Sara: home con mese rimandato", async () => { await shot("e01-sara-home"); return (await page.locator("main").innerText()).replace(/\n+/g, " / ").slice(0, 500); });
await page.goto(`${BASE}/mie-ore/revisione?year=2026&month=9`, { waitUntil: "networkidle" });
await step("Sara: revisione settembre", async () => { await shot("e02-sara-revisione"); return (await page.locator("main").innerText()).replace(/\n+/g, " / ").slice(0, 700); });
await step("Sara: corregge sab 19/09 pomeriggio fino alle 21:30", async () => {
  await page.getByText("SAB 19/09").first().click();
  await page.waitForTimeout(400);
  await shot("e03-sara-modifica-giorno");
  const times = page.locator("div.fixed input[type=time]");
  const n = await times.count();
  const vals = [];
  for (let i = 0; i < n; i++) vals.push(await times.nth(i).inputValue());
  await times.nth(3).fill("21:30");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await page.waitForTimeout(1200);
  const body = await page.locator("main").innerText();
  return `prima: ${vals.join(" ")} — dopo: ${(body.match(/SAB\s*19\/09[^A-Z]*/) || [""])[0].replace(/\n+/g, " ")}`;
});
await step("Sara: invia le ore", async () => {
  await shot("e04-sara-prima-invio", true);
  const btn = page.getByRole("button", { name: /Invia|Reinvia/i }).first();
  const label = await btn.innerText();
  await btn.click();
  await page.waitForTimeout(800);
  await shot("e05-sara-conferma-invio");
  return "pulsante: " + label + " / overlay: " + ((await page.locator("div.fixed").first().innerText().catch(() => "")).replace(/\n+/g, " / ").slice(0, 400));
});
await browser.close();
console.log(errs.length ? "ERRORI JS: " + errs.join(" ; ") : "nessun errore JS");
