import { launch, login, BASE, ADMIN_PW } from "../menu-e2e/lib.mjs";
import { WORK } from "./work.mjs";
const OUT = `${WORK}/img`;
const browser = await launch();
const mk = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: "it-IT", timezoneId: "Europe/Rome" });
  await ctx.clock.setFixedTime(new Date("2026-10-02T19:30:00+02:00"));
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
const close = async (p) => { await p.keyboard.press("Escape"); await settle(p, 500); };

{
  const { ctx, page } = await mk(390, 797);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await settle(page, 800);
  await page.screenshot({ path: `${OUT}/guide-login.png` });
  await login(page, "andrea", ADMIN_PW);
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
  await settle(page, 1000);
  // per la schermata lunga: via il banner «Aggiungi l'app» e la barra fissa in basso
  const hidden = await page.evaluate(() => {
    const els = [...document.querySelectorAll("body *")].filter((el) => getComputedStyle(el).position === "fixed");
    els.forEach((el) => el.setAttribute("data-hid", el.style.display || "-"));
    els.forEach((el) => (el.style.display = "none"));
    const b = [...document.querySelectorAll("p")].find((x) => x.textContent.includes("Aggiungi l'app alla schermata Home"));
    const box = b?.closest("div.rounded-2xl, div[class*='rounded']");
    if (box) box.style.display = "none";
    return els.length;
  });
  await settle(page, 300);
  await page.screenshot({ path: `${OUT}/guide-gestione-lunga.png`, fullPage: true });
  await page.evaluate(() => document.querySelectorAll("[data-hid]").forEach((el) => { el.style.display = el.getAttribute("data-hid") === "-" ? "" : el.getAttribute("data-hid"); el.removeAttribute("data-hid"); }));
  // storico con qualche voce
  const sw = page.locator('li button[aria-pressed]').first();
  await sw.click(); await settle(page, 1500); await sw.click(); await settle(page, 1500);
  await page.getByRole("button", { name: "Storico", exact: true }).click();
  await settle(page, 900);
  await page.screenshot({ path: `${OUT}/guide-storico.png` });
  await close(page);
  // + Piatto del giorno
  await page.locator('section[aria-label="Oggi fuori menù"]').getByRole("button", { name: "+ Piatto" }).click();
  await settle(page, 700);
  await page.screenshot({ path: `${OUT}/guide-piatto-giorno.png` });
  await close(page);
  // nuovo evento
  await page.getByRole("button", { name: "+ Evento o annuncio" }).click();
  await settle(page, 800);
  await page.screenshot({ path: `${OUT}/guide-evento.png` });
  await close(page);
  // dipendenti: permesso menù
  await page.goto(`${BASE}/dipendenti`, { waitUntil: "networkidle", timeout: 120000 });
  await settle(page, 800);
  const sw2 = page.locator('button[role="switch"][aria-label^="Può modificare il menù"]').first();
  if (await sw2.count()) await sw2.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(page, 500);
  await page.screenshot({ path: `${OUT}/guide-dipendenti.png` });
  await ctx.close();
}
await browser.close();
console.log("ok");
