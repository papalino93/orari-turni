// Schermate delle novità 0.7–0.9: statistiche, tabella prezzi, riordina, scheda vino, menù da stampare.
import { discardIfAsked, launch, login, BASE, ADMIN_PW } from "../menu-e2e/lib.mjs";
const OUT = `${WORK}/img`;
import { execFileSync } from "node:child_process";
import { WORK } from "./work.mjs";
// Le visite fatte per le altre schermate contano come aperture: si tolgono, restano solo i dati di esempio.
execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", `delete from "MenuEvent" where hour between 5 and 15`], { env: { ...process.env, PGPASSWORD: "orari" } });
const browser = await launch();
const mk = async (w, h, dsf = 2) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: "it-IT", timezoneId: "Europe/Rome" });
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(st);
    });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  return { ctx, page };
};
const settle = (p, ms = 700) => p.waitForTimeout(ms);
const dialog = (p) => p.locator('[role="dialog"]');
const toEl = async (page, loc, offset = 70) => {
  await page.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  await loc.first().evaluate((el, o) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - o), offset);
  await settle(page, 500);
};
{
  const { ctx, page } = await mk(390, 797);
  await login(page, "andrea", ADMIN_PW);
  // Statistiche
  await page.goto(`${BASE}/statistiche`, { waitUntil: "networkidle", timeout: 180000 });
  await settle(page, 1000);
  await page.screenshot({ path: `${OUT}/ges-stat-top.png` });
  await toEl(page, page.getByText("Classifica dei giorni della settimana"), 130);
  await page.screenshot({ path: `${OUT}/ges-stat-giorni.png` });
  await toEl(page, page.getByText("Giorni e orari", { exact: true }), 80);
  await page.screenshot({ path: `${OUT}/ges-stat-orari.png` });
  await toEl(page, page.getByText("Le parole più cercate"), 80);
  await page.screenshot({ path: `${OUT}/ges-stat-ricerche.png` });
  // Gestione: la parte alta con gli strumenti
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
  await page.getByRole("button", { name: "Chiudi", exact: false }).first().click().catch(() => {});
  await settle(page, 800);
  await page.screenshot({ path: `${OUT}/ges-top.png` });
  // Tabella prezzi (Rossi), con un prezzo cambiato
  await page.getByRole("button", { name: "Tabella prezzi" }).click();
  await settle(page, 600);
  await dialog(page).getByRole("navigation", { name: "Sezione" }).getByRole("button", { name: /^Rossi/ }).click();
  await settle(page, 300);
  await dialog(page).getByRole("textbox", { name: /^Calice · Mastrojanni/ }).first().fill("9");
  await settle(page, 300);
  await page.screenshot({ path: `${OUT}/ges-prezzi.png` });
  await page.keyboard.press("Escape"); await discardIfAsked(page);
  await settle(page, 500);
  // Riordina: i vini di Rossi · Italia, uno «preso» in mano
  await page.getByRole("button", { name: "Riordina", exact: true }).click();
  await settle(page, 500);
  await dialog(page).getByRole("navigation", { name: "Livello" }).getByRole("button", { name: "Sezioni" }).click();
  await settle(page, 300);
  await page.screenshot({ path: `${OUT}/ges-riordina-sezioni.png` });
  await dialog(page).getByRole("button", { name: "Apri Rossi" }).click();
  await dialog(page).getByRole("button", { name: "Apri Italia" }).click();
  await settle(page, 400);
  await page.screenshot({ path: `${OUT}/ges-riordina.png` });
  await page.keyboard.press("Escape"); await discardIfAsked(page);
  await settle(page, 500);
  // Scheda del vino
  await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
  await page.getByRole("button", { name: /^Modifica Avignonesi/ }).first().click();
  await settle(page, 700);
  await page.screenshot({ path: `${OUT}/ges-vino-1.png` });
  await dialog(page).getByText("Sul menù si legge così").scrollIntoViewIfNeeded();
  await dialog(page).getByText("Caratteristiche", { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await settle(page, 500);
  await page.screenshot({ path: `${OUT}/ges-vino-2.png` });
  await ctx.close();
}
// Oktoberfest sul telefono, come nei giorni dell'evento (date spostate solo per la foto)
{
  const sql = (q) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", q], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
  const old = sql(`select "startDate"||'|'||"endDate" from "MenuPromo" where id='demo_degust'`).split("|");
  sql(`update "MenuPromo" set "startDate"=to_char(now() - interval '5 hours','YYYY-MM-DD') where id='demo_degust'`);
  const { ctx, page } = await mk(390, 797);
  await page.goto(`${BASE}/menu/p/oktoberfest`, { waitUntil: "networkidle", timeout: 120000 });
  await page.locator("text=Birre alla spina").first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 130));
  await settle(page, 700);
  await page.screenshot({ path: `${OUT}/pub-evento-birre.png` });
  await ctx.close();
  sql(`update "MenuPromo" set "startDate"='${old[0]}', "endDate"='${old[1]}' where id='demo_degust'`);
}
// Menù da stampare (computer)
{
  const { ctx, page } = await mk(1100, 1300, 1.6);
  await login(page, "andrea", ADMIN_PW);
  await page.goto(`${BASE}/gestione-menu/stampa`, { waitUntil: "networkidle", timeout: 180000 });
  await settle(page, 1200);
  await page.screenshot({ path: `${OUT}/stampa.png` });
  await ctx.close();
}
// Statistiche (computer)
{
  const { ctx, page } = await mk(1366, 900, 1.5);
  await login(page, "andrea", ADMIN_PW);
  await page.goto(`${BASE}/statistiche`, { waitUntil: "networkidle", timeout: 180000 });
  await settle(page, 1000);
  await page.screenshot({ path: `${OUT}/statd-top.png` });
  await ctx.close();
}
await browser.close();
console.log("ok");
