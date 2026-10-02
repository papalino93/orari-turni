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
await page.goto(`${BASE}/orari?view=week&date=2026-10-12`, { waitUntil: "networkidle" });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await step("Invia orari: apre il riquadro", async () => {
  await page.getByRole("button", { name: /Invia orari/ }).first().click();
  await page.waitForTimeout(700);
  await shot("a10-invia-orari");
  return (await page.locator("div.fixed").first().innerText()).replace(/\n+/g, " / ").slice(0, 500);
});
await step("chiudi riquadro con Esc", async () => {
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  return (await page.locator("div.fixed.inset-0").count()) + " overlay";
});
await step("Ripeti settimana: apre il riquadro", async () => {
  await page.getByRole("button", { name: /Ripeti settimana/ }).first().click();
  await page.waitForTimeout(500);
  await shot("a11-ripeti-settimana");
  return (await page.locator("div.fixed").first().innerText()).replace(/\n+/g, " / ").slice(0, 600);
});
await browser.close();
console.log(errs.length ? "ERRORI JS: " + errs.join(" ; ") : "nessun errore JS");
