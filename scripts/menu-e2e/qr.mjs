// Codice QR del menù: si scarica in SVG e PNG e, letto, porta a /menu.
// Richiede `npm i --no-save sharp jsqr`.
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, tool } from "./lib.mjs";
import sharp from "sharp";
import jsQR from "jsqr";
import { readFileSync } from "node:fs";

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await tool(page, "Codice QR");
const dlg = page.locator('[role="dialog"][aria-label="Codice QR del menù"]');
await dlg.waitFor();
await dlg.locator("svg").first().waitFor();
check("QR: l'indirizzo mostrato è quello del menù", (await dlg.innerText()).includes(`${BASE}/menu`));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/qr-390.png` });
const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("QR @390: nessun overflow orizzontale", ov <= 0, String(ov));

const [pngDl] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: "Scarica PNG" }).click()]);
check("PNG: nome del file", pngDl.suggestedFilename() === "menu-qr.png");
const pngPath = await pngDl.path();
const { data, info } = await sharp(readFileSync(pngPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
check("PNG: letto con un lettore QR porta a /menu", decoded?.data === `${BASE}/menu`, decoded?.data ?? "illeggibile");
check("PNG: grande abbastanza per la stampa (≥ 1000 px)", info.width >= 1000, String(info.width));

await dlg.getByRole("radio", { name: "Bordeaux" }).click();
const [svgDl] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: "Scarica SVG" }).click()]);
check("SVG: nome del file", svgDl.suggestedFilename() === "menu-qr.svg");
const svgText = readFileSync(await svgDl.path(), "utf8");
check("SVG: è un SVG con il colore bordeaux", svgText.includes("<svg") && /6b1020/i.test(svgText));
const svgPng = await sharp(Buffer.from(svgText), { density: 300 }).resize(900).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const decoded2 = jsQR(new Uint8ClampedArray(svgPng.data), svgPng.info.width, svgPng.info.height);
check("SVG bordeaux: si legge ancora e porta a /menu", decoded2?.data === `${BASE}/menu`, decoded2?.data ?? "illeggibile");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
