// PDF «a immagini»: ogni pagina è fotografata ad alta risoluzione (circa 190 dpi) e
// poi unita (unisci.py). Così ombre, trasparenze e caratteri escono identici in
// ogni visualizzatore (iPhone, Mac, Windows), senza riquadri grigi.
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";
import { WORK } from "./work.mjs";
const u = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--no-sandbox"], ...(u ? { proxy: { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } } : {}) });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`file://${WORK}/pdf2.html`, { waitUntil: "networkidle", timeout: 120000 });
const want = ["400 20px 'Cormorant Garamond'","500 20px 'Cormorant Garamond'","600 20px 'Cormorant Garamond'","italic 400 20px 'Cormorant Garamond'","italic 500 20px 'Cormorant Garamond'","400 12px 'EB Garamond'","500 12px 'EB Garamond'","italic 400 12px 'EB Garamond'","400 12px Jost","500 12px Jost","600 12px Jost"];
for (let i = 0; i < 6; i++) {
  await page.evaluate((w) => Promise.allSettled(w.map((f) => document.fonts.load(f, "Aàèéìòù0123456789"))), want);
  const ok = await page.evaluate((w) => w.every((f) => document.fonts.check(f, "Aàè")), want);
  if (ok) break;
  await page.waitForTimeout(1500);
}
const n11 = await page.evaluate(() => new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + f.weight + f.style)).size);
console.log("font:", n11);
// Senza i caratteri giusti la guida uscirebbe con un carattere di riserva: meglio fermarsi.
if (n11 < want.length) {
  console.error(`Caratteri non caricati (${n11} su ${want.length}): controlla la rete e rilancia.`);
  await browser.close();
  process.exit(1);
}
await page.emulateMedia({ media: "print" });
await page.waitForTimeout(1500);
rmSync(`${WORK}/pages`, { recursive: true, force: true });
mkdirSync(`${WORK}/pages`);
const pages = page.locator(".page");
const n = await pages.count();
for (let i = 0; i < n; i++) await pages.nth(i).screenshot({ path: `${WORK}/pages/${String(i + 1).padStart(2, "0")}.jpg`, type: "jpeg", quality: 82 });
await browser.close();
console.log("pagine", n);
