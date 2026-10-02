import fs from "node:fs";
import { launch, login, BASE } from "../menu-e2e/lib.mjs";
const OUT = process.env.SHOTS ?? "/tmp/claude-0/shots/menu";
fs.mkdirSync(OUT, { recursive: true });
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: "it-IT", timezoneId: "Europe/Rome" });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 150)));
await login(p, "andrea", process.env.E2E_ADMIN_PASSWORD);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Ricordamelo più tardi/i }).click().catch(() => {});
const dialog = () => p.locator('[role="dialog"]').last();
async function dump(name) {
  await p.waitForTimeout(450);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  const t = await dialog().innerText().catch(() => "(nessun dialog)");
  console.log(`## ${name}\n${t.replace(/\n+/g, " / ").slice(0, 500)}`);
}
// 1 apre voce esistente (tap sul nome)
await p.getByText("Champagne Henriot", { exact: true }).first().click();
await dump("h01-voce-vino");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
console.log("dopo Esc dialog:", await p.locator('[role="dialog"]').count());
// 2 modifica gruppo
await p.getByRole("button", { name: /Modifica gruppo|Rinomina/i }).first().click().catch(() => console.log("no btn modifica gruppo"));
await dump("h02-gruppo");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// 3 aggiungi vino
await p.getByRole("button", { name: "+ Aggiungi vino" }).first().click();
await dump("h03-aggiungi-vino");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// 4 incolla più voci
await p.getByRole("button", { name: "Incolla più voci" }).first().click();
await dump("h04-incolla");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// 5 testi di sezione
await p.getByRole("button", { name: /Modifica/ }).filter({ hasText: /^Modifica$/ }).nth(1).click();
await dump("h05-testi-sezione");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// 6 storico
await p.getByRole("button", { name: "Storico" }).click();
await dump("h06-storico");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// 7 evento
await p.getByRole("button", { name: /\+ Evento o annuncio/ }).click();
await dump("h07-evento");
await b.close();
console.log(errs.length ? "ERRORI JS: " + errs.join(" ; ") : "nessun errore JS");
