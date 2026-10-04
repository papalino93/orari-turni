// Foto in gestione: un clic la ingrandisce, Esc o un altro clic tornano alla scheda.
import sharp from "sharp";
import { launch, login, check, BASE, results, ADMIN_PW, DB, goTab } from "./lib.mjs";

// Un evento con locandina, creato qui: il test non dipende da altri dati.
const today = DB(`select to_char((now() at time zone 'Europe/Rome') - interval '5 hours','YYYY-MM-DD')`);
const jpg = await sharp({ create: { width: 400, height: 500, channels: 3, background: { r: 107, g: 16, b: 32 } } }).jpeg().toBuffer();
DB(`delete from "MenuPromo" where id='e2e_zoom'`);
DB(`insert into "MenuPromo" (id, kind, slug, title, "showFrom", "startDate", "endDate", "imageUpdatedAt", "imageWidth", "imageHeight", "updatedAt") values ('e2e_zoom','NOTICE','e2e-zoom','Zoom di prova','${today}','${today}','${today}', now(), 400, 500, now())`);
DB(`insert into "MenuPromoImage" ("promoId", data, "mimeType", "updatedAt") values ('e2e_zoom', decode('${jpg.toString("hex")}','hex'), 'image/jpeg', now())`);
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await goTab(p, "Eventi e annunci");
await p.getByRole("button", { name: /Zoom di prova/ }).first().click();
await p.getByRole("button", { name: "Modifica", exact: true }).first().click();
const sheet = p.locator('[role="dialog"]').first();
await sheet.getByRole("button", { name: "Ingrandisci la locandina" }).click();
const big = p.locator('[role="dialog"][aria-label="Foto ingrandita"]');
check("clic sulla foto: si ingrandisce", (await big.count()) === 1);
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("Esc: chiude l'ingrandimento ma non la scheda", (await big.count()) === 0 && (await p.locator('[role="dialog"]').count()) === 1);
await p.locator('[role="dialog"]').getByRole("button", { name: "Ingrandisci la locandina" }).click();
await big.click();
await p.waitForTimeout(300);
check("clic sulla foto grande: torna alla scheda", (await big.count()) === 0 && (await p.locator('[role="dialog"]').count()) === 1);
await b.close();
DB(`delete from "MenuPromo" where id='e2e_zoom'`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
