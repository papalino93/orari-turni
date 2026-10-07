// Schermate da telefono per la pagina «I consigli della casa» della guida PDF:
// la riga sotto la copertina, «Sta bene con» sotto un vino, e la scheda del vino in gestione.
import { discardIfAsked, launch, login, BASE, ADMIN_PW } from "../menu-e2e/lib.mjs";
import { WORK } from "./work.mjs";
const OUT = `${WORK}/img`;
const browser = await launch();
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 797 }, deviceScaleFactor: 2, locale: "it-IT", timezoneId: "Europe/Rome" });
  await ctx.clock.setFixedTime(new Date("2026-10-02T19:30:00+02:00"));
  await ctx.addInitScript(() => {
    try { localStorage.setItem("menu-staff-device", "1"); localStorage.setItem("install-banner-dismissed", "1"); } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important} html{scroll-behavior:auto!important}";
      document.head.appendChild(st);
    });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  return { ctx, page };
};
const settle = (p, ms = 700) => p.waitForTimeout(ms);

// Menù dei clienti
{
  const { ctx, page } = await mk();
  await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  await settle(page, 1200);
  await page.locator('section[aria-label="I consigli della casa"]').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 24));
  await settle(page, 600);
  await page.screenshot({ path: `${OUT}/pub-consigli.png` });
  // Un vino consigliato con «Sta bene con»
  await page.locator('div[id^="v-"]', { has: page.getByRole("link", { name: "Tagliere Classico" }) }).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 150));
  await settle(page, 600);
  await page.screenshot({ path: `${OUT}/pub-stabenecon.png` });
  await ctx.close();
}
// Gestione: scheda del vino con «Sta bene con» e «Consigliato dalla casa»
{
  const { ctx, page } = await mk();
  await login(page, "andrea", ADMIN_PW);
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("searchbox", { name: "Cerca una voce" }).fill("mastrojanni");
  await settle(page, 500);
  // Il Mastrojanni di Montalcino (è quello consigliato, con «Sta bene con» il Tagliere Classico).
  await page.locator('section[aria-label="Cerca una voce"] li', { hasText: "Montalcino" }).locator('button[aria-label^="Modifica"]').first().click();
  await settle(page, 700);
  await page.locator('[role="dialog"]').getByRole("group", { name: "Sta bene con" }).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(page, 500);
  await page.screenshot({ path: `${OUT}/ges-consigli.png` });
  await page.keyboard.press("Escape"); await discardIfAsked(page);
  await ctx.close();
}
await browser.close();
console.log("schermate dei consigli pronte");
