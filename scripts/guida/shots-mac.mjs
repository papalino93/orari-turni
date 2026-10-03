// Schermate da computer (Mac), tema chiaro, per la guida alla gestione del menù.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { launch, login, BASE, ADMIN_PW } from "../menu-e2e/lib.mjs";
import { WORK } from "./work.mjs";
const OUT = `${WORK}/img`;
execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", `delete from "MenuEvent" where hour between 5 and 15`], { env: { ...process.env, PGPASSWORD: "orari" } });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2, locale: "it-IT", timezoneId: "Europe/Rome" });
await ctx.addInitScript(() => {
  try { localStorage.setItem("theme", "light"); } catch {}
  document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = "nextjs-portal{display:none!important}";
    document.head.appendChild(st);
  });
});
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const settle = (ms = 700) => page.waitForTimeout(ms);
const dialog = () => page.locator('[role="dialog"]');
const shot = (name) => page.screenshot({ path: `${OUT}/mac-${name}.png` });
const noBanner = async () => {
  const close = page.locator("div", { hasText: "Scopri come" }).getByRole("button", { name: "Chiudi", exact: true });
  if (await close.count()) await close.first().click();
  await settle(300);
};

await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
await settle(800);
await shot("login");
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await noBanner();
await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await settle(900);
await shot("gestione");
// Posizione delle parti della pagina, per i numeri della guida (in % dello schermo).
const parts = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: (b.left / innerWidth) * 100, y: ((b.top + b.height / 2) / innerHeight) * 100 }; };
  const byText = (sel, t) => [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim().startsWith(t));
  return {
    top: r(byText("a", "Vedi menù")),
    tools: r(document.querySelector('[role="toolbar"]')),
    search: r(document.querySelector('input[type="search"], [role="searchbox"]')),
    oggi: r(document.querySelector('section[aria-label="Oggi fuori menù"]')),
    info: r(byText("button", "Informazioni del menù") ?? byText("button", "INFORMAZIONI")),
    sezioni: r(document.querySelector('nav[aria-label="Sezioni"]')),
    voci: r(document.querySelector("section h3 button")),
  };
});
writeFileSync(`${OUT}/mac-gestione.json`, JSON.stringify(parts, null, 1));
// Scheda del vino
await page.getByRole("button", { name: /^Modifica Avignonesi/ }).first().click();
await settle(800);
await shot("vino");
await page.keyboard.press("Escape");
await settle(500);
// Tabella prezzi
await page.getByRole("button", { name: "Tabella prezzi" }).click();
await settle(600);
await dialog().getByRole("navigation", { name: "Sezione" }).getByRole("button", { name: /^Rossi/ }).click();
await dialog().getByRole("textbox", { name: /^Calice · Mastrojanni/ }).first().fill("9");
await settle(400);
await shot("prezzi");
await page.keyboard.press("Escape");
await settle(500);
// Riordina
await page.getByRole("button", { name: "Riordina", exact: true }).click();
await settle(500);
await dialog().getByRole("button", { name: "Apri Italia" }).click().catch(async () => {
  await dialog().getByRole("navigation", { name: "Livello" }).getByRole("button", { name: "Sezioni" }).click();
  await dialog().getByRole("button", { name: "Apri Rossi" }).click();
  await dialog().getByRole("button", { name: "Apri Italia" }).click();
});
await settle(500);
await shot("riordina");
await page.keyboard.press("Escape");
await settle(500);
// Piatto del giorno
await page.locator('section[aria-label="Oggi fuori menù"]').getByRole("button", { name: "+ Piatto" }).click();
await settle(700);
await shot("piatto-giorno");
await page.keyboard.press("Escape");
// Statistiche
await page.goto(`${BASE}/statistiche`, { waitUntil: "networkidle", timeout: 180000 });
await noBanner();
await settle(900);
await shot("statistiche");
// Menù da stampare
await page.goto(`${BASE}/gestione-menu/stampa`, { waitUntil: "networkidle", timeout: 180000 });
await settle(1200);
await shot("stampa");
await browser.close();
console.log("ok", JSON.stringify(parts));
