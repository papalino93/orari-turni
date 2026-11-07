// Eventi passati: la scheda «Eventi e annunci» non ne apre uno da sola, e la locandina di un
// evento nascosto si vede nella gestione ma non ai clienti.
import sharp from "sharp";
import { launch, login, check, BASE, results, ADMIN_PW, DB, goTab } from "./lib.mjs";

// Un evento passato con la locandina, creato qui: il test non dipende dagli eventi già presenti
// (possono non essercene, o essere tutti senza locandina).
const ID = "e2e_archivio";
DB(`delete from "MenuPromo" where id='${ID}'`);
const prima = DB(`select string_agg(id || '=' || "startDate" || '=' || "endDate" || '=' || hidden, ',') from "MenuPromo" where "deletedAt" is null`);
const jpg = await sharp({ create: { width: 400, height: 500, channels: 3, background: { r: 107, g: 16, b: 32 } } }).jpeg().toBuffer();
DB(`insert into "MenuPromo" (id, kind, slug, title, "showFrom", "startDate", "endDate", "imageUpdatedAt", "imageWidth", "imageHeight", "updatedAt") values ('${ID}','EVENT','e2e-archivio','Archivio di prova','2025-10-03','2025-10-10','2025-10-11', now(), 400, 500, now())`);
DB(`insert into "MenuPromoImage" ("promoId", data, "mimeType", "updatedAt") values ('${ID}', decode('${jpg.toString("hex")}','hex'), 'image/jpeg', now())`);
// Tutto nel passato; quello di prova nascosto.
DB(`update "MenuPromo" set "startDate"='2025-10-10', "endDate"='2025-10-11' where "deletedAt" is null`);
const conFoto = "e2e-archivio";
DB(`update "MenuPromo" set hidden=true where id='${ID}'`);
const versione = DB(`select extract(epoch from "imageUpdatedAt")::bigint from "MenuPromo" where id='${ID}'`);

const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await goTab(p, "Eventi e annunci");
await p.waitForTimeout(800);
check("nessun evento in programma: niente evento passato aperto da solo", (await p.getByText(/Quelli passati sono nell.«Archivio»/).count()) === 1 && (await p.getByRole("button", { name: "Modifica" }).count()) === 0);
const loggato = await p.evaluate(async (u) => (await fetch(u)).status, `/menu/p/${conFoto}/immagine?v=${versione}`);
check("locandina di un evento nascosto: si vede nella gestione", loggato === 200, String(loggato));
const anonimo = await fetch(`${BASE}/menu/p/${conFoto}/immagine?v=${versione}`);
check("…ma non ai clienti (senza accesso)", anonimo.status === 404, String(anonimo.status));
await b.close();

for (const r of prima ? prima.split(",") : []) {
  const [id, s, e, h] = r.split("=");
  DB(`update "MenuPromo" set "startDate"='${s}', "endDate"='${e}', hidden=${h} where id='${id}'`);
}
DB(`delete from "MenuPromo" where id='${ID}'`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
