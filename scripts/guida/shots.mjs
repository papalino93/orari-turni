import { launch, login, BASE, ADMIN_PW, expandPanels } from "../menu-e2e/lib.mjs";
import { WORK } from "./work.mjs";
const OUT = `${WORK}/img`;
const browser = await launch();
const mk = async (w, h, dsf = 2) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: 'it-IT', timezoneId: 'Europe/Rome' });
  await ctx.clock.setFixedTime(new Date("2026-10-02T19:30:00+02:00"));
  await ctx.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = 'nextjs-portal{display:none!important} a[href="/gestione-menu/servizio"]{display:none!important}';
      document.head.appendChild(st);
    });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  return { ctx, page };
};
const settle = (p, ms = 700) => p.waitForTimeout(ms);
const scrollTo = async (page, sel, offset = 48) => {
  await page.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  await page.locator(sel).first().evaluate((el, o) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - o), offset);
  await settle(page, 600);
};

// --- Menù dei clienti (telefono)
{
  const { ctx, page } = await mk(390, 797);
  await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  await settle(page, 1200);
  await page.screenshot({ path: `${OUT}/pub-hero.png` });
  await scrollTo(page, "#evento-crudite-champagne", 12);
  await page.screenshot({ path: `${OUT}/pub-evento.png` });
  await scrollTo(page, "#oggi", 48);
  await page.screenshot({ path: `${OUT}/pub-oggi.png` });
  await scrollTo(page, "#bollicine", 48);
  await page.screenshot({ path: `${OUT}/pub-bollicine.png` });
  await scrollTo(page, "#rossi", 48);
  await page.screenshot({ path: `${OUT}/pub-rossi.png` });
  await scrollTo(page, "#taglieri", 48);
  await page.screenshot({ path: `${OUT}/pub-taglieri.png` });
  // Abbinamento consigliato: il piatto, poi il tocco che porta al vino
  await page.locator("a[data-pair-from]").first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 330));
  await settle(page, 600);
  await page.screenshot({ path: `${OUT}/pub-abbinamento.png` });
  await page.locator("a[data-pair-from]").first().click();
  await settle(page, 1600);
  await page.screenshot({ path: `${OUT}/pub-abbinamento-vino.png` });
  await page.getByRole("button", { name: /Torna a/ }).click();
  await settle(page, 1200);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settle(page, 700);
  await page.screenshot({ path: `${OUT}/pub-footer.png` });
  await scrollTo(page, 'section[aria-label="Legenda degli allergeni"]', 40);
  await page.screenshot({ path: `${OUT}/pub-legenda.png` });
  // Ricerca
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.getByRole("button", { name: "Cerca nel menù", exact: true }).click();
  await page.locator("input[type=search]").fill("sangiovese");
  await settle(page, 600);
  await page.screenshot({ path: `${OUT}/pub-ricerca.png` });
  await page.keyboard.press("Escape");
  // Testo grande
  await page.getByRole("button", { name: "Testo più grande" }).click();
  await scrollTo(page, "#bianchi", 48);
  await page.screenshot({ path: `${OUT}/pub-testo-grande.png` });
  await ctx.close();
}
// --- Pagina evento
{
  const { ctx, page } = await mk(390, 797);
  await page.goto(`${BASE}/menu/p/oktoberfest`, { waitUntil: "networkidle", timeout: 120000 });
  await settle(page, 800);
  await page.screenshot({ path: `${OUT}/pub-evento-pagina.png` });
  await page.goto(`${BASE}/menu/allergeni`, { waitUntil: "networkidle", timeout: 120000 });
  await settle(page, 800);
  await page.screenshot({ path: `${OUT}/pub-allergeni.png` });
  await page.locator("button", { hasText: "Latte" }).first().click().catch(() => {});
  await settle(page, 600);
  await page.screenshot({ path: `${OUT}/pub-allergeni-filtro.png` });
  await ctx.close();
}
// --- Gestione (telefono)
{
  const { ctx, page } = await mk(390, 797);
  await login(page, "andrea", ADMIN_PW);
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: "Chiudi", exact: false }).first().click().catch(() => {});
  await settle(page, 800);
  await page.screenshot({ path: `${OUT}/ges-top.png` });
  await page.getByRole("searchbox", { name: "Cerca una voce" }).fill("aquila");
  await settle(page, 600);
  await page.screenshot({ path: `${OUT}/ges-cerca.png` });
  await page.getByRole("searchbox", { name: "Cerca una voce" }).fill("");
  await expandPanels(page);
  await settle(page, 400);
  await scrollTo(page, 'section[aria-label="Informazioni del menù"]', 80);
  await page.screenshot({ path: `${OUT}/ges-info.png` });
  await page.getByRole("button", { name: "Modifica gli orari" }).click();
  await settle(page, 700);
  await page.screenshot({ path: `${OUT}/ges-orari.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Codice QR", exact: true }).click();
  await settle(page, 900);
  // Nella presentazione il QR deve portare al sito vero, non a localhost.
  const QRCode = (await import("qrcode")).default;
  const prodUrl = "https://orari-turni.vercel.app/menu";
  const prodSvg = await QRCode.toString(prodUrl, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#FFFFFF" } });
  await page.evaluate(({ svg, url }) => {
    const dlg = document.querySelector('[role="dialog"][aria-label="Codice QR del menù"]');
    dlg.querySelector('[aria-label="Anteprima del codice QR"] div').innerHTML = svg;
    [...dlg.querySelectorAll("p")].find((p) => p.textContent.includes("/menu")).textContent = url;
  }, { svg: prodSvg, url: prodUrl });
  await settle(page, 300);
  await page.screenshot({ path: `${OUT}/ges-qr.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Anteprima", exact: true }).click();
  await settle(page, 2500);
  await page.screenshot({ path: `${OUT}/ges-anteprima.png` });
  await page.keyboard.press("Escape");
  // Eventi e annunci (archivio, duplica)
  await page.getByRole("button", { name: /Crudité/ }).first().click().catch(() => {});
  await settle(page, 900);
  await scrollTo(page, 'nav[aria-label="Eventi e annunci"]', 90);
  await page.screenshot({ path: `${OUT}/ges-eventi.png` });
  // voce in modifica (vino con Regione e Nazione)
  await page.getByRole("searchbox", { name: "Cerca una voce" }).fill("mastrojanni");
  await settle(page, 500);
  await page.locator('section[aria-label="Cerca una voce"] li button[aria-label^="Modifica"]').first().click();
  await settle(page, 700);
  await page.screenshot({ path: `${OUT}/ges-voce.png` });
  await page.keyboard.press("Escape");
  await settle(page, 500);
  // Abbinamento consigliato nella scheda del piatto
  await page.getByRole("searchbox", { name: "Cerca una voce" }).fill("tagliere classico");
  await settle(page, 500);
  await page.locator('section[aria-label="Cerca una voce"] li button[aria-label^="Modifica"]').first().click();
  await settle(page, 700);
  await page.locator('[role="dialog"] p', { hasText: "Abbinamento consigliato" }).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(page, 500);
  await page.screenshot({ path: `${OUT}/ges-abbinamento.png` });
  await ctx.close();
}
// --- Gestione (computer)
{
  const { ctx, page } = await mk(1366, 900, 1.5);
  await login(page, "andrea", ADMIN_PW);
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: "Bianchi" }).first().click().catch(() => {});
  await settle(page, 900);
  await page.screenshot({ path: `${OUT}/ges-desktop.png` });
  await ctx.close();
}
// --- Computer: menù pubblico e gestione, finestra larga
{
  const { ctx, page } = await mk(1440, 900, 2);
  await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  await settle(page, 1200);
  await page.screenshot({ path: `${OUT}/pubd-hero.png` });
  await scrollTo(page, "#bollicine", 48);
  await page.screenshot({ path: `${OUT}/pubd-vini.png` });
  await ctx.close();
}
{
  const { ctx, page } = await mk(1440, 900, 2);
  await login(page, "andrea", ADMIN_PW);
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: "Rossi" }).first().click().catch(() => {});
  await settle(page, 900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/gesd-top.png` });
  await scrollTo(page, 'nav[aria-label="Sezioni"]', 120);
  await settle(page, 400);
  await page.screenshot({ path: `${OUT}/gesd-lista.png` });
  await ctx.close();
}
await browser.close();
console.log("ok");
