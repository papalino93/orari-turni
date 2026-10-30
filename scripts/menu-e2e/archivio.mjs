// Eventi passati: la scheda «Eventi e annunci» non ne apre uno da sola, e la locandina di un
// evento nascosto si vede nella gestione ma non ai clienti.
import { launch, login, check, BASE, results, ADMIN_PW, DB, goTab } from "./lib.mjs";

const prima = DB(`select string_agg(id || '=' || "startDate" || '=' || "endDate" || '=' || hidden, ',') from "MenuPromo" where "deletedAt" is null`);
// Tutto nel passato, uno nascosto con la locandina.
DB(`update "MenuPromo" set "startDate"='2025-10-10', "endDate"='2025-10-11' where "deletedAt" is null`);
const conFoto = DB(`select p.slug from "MenuPromo" p join "MenuPromoImage" i on i."promoId"=p.id where p."deletedAt" is null limit 1`);
DB(`update "MenuPromo" set hidden=true where slug='${conFoto}'`);
const versione = DB(`select extract(epoch from "imageUpdatedAt")::bigint from "MenuPromo" where slug='${conFoto}'`);

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

for (const r of prima.split(",")) {
  const [id, s, e, h] = r.split("=");
  DB(`update "MenuPromo" set "startDate"='${s}', "endDate"='${e}', hidden=${h} where id='${id}'`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
