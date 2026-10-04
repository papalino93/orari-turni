// Menù speciale di un evento: PDF o foto al posto delle voci, note in cima,
// avviso allergeni unico, righe di solo testo tra le voci.
import sharp from "sharp";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, login, check, BASE, results, ADMIN_PW, DB, goTab } from "./lib.mjs";

const PDF = new URL("./fixtures-menu.pdf", import.meta.url).pathname;
const photo = join(tmpdir(), "menu-foto.png");
await sharp({ create: { width: 1000, height: 1400, channels: 3, background: { r: 240, g: 232, b: 218 } } }).png().toFile(photo);
const today = DB(`select to_char((now() at time zone 'Europe/Rome') - interval '5 hours','YYYY-MM-DD')`);
// Un evento in corso con un piccolo menù, creato qui: il test non dipende da altri dati.
DB(`delete from "MenuPromo" where id='e2e_evt'`);
DB(`insert into "MenuPromo" (id, kind, slug, title, "showFrom", "startDate", "endDate", "updatedAt") values ('e2e_evt','EVENT','e2e-serata','Serata di prova','${today}','${today}','${today}', now())`);
DB(`insert into "MenuSection" (id, slug, label, kicker, title, kind, "sortOrder", "promoId") values ('e2e_evt_sec','evento-e2e','Serata di prova','Evento','Serata di prova','FOOD',100,'e2e_evt')`);
DB(`insert into "MenuGroup" (id, "sectionId", title, columns, "sortOrder") values ('e2e_evt_g','e2e_evt_sec','Da mangiare',false,0)`);
DB(`insert into "MenuItem" (id, "groupId", name, "priceCents", allergens, "allergensReviewed", "sortOrder", "updatedAt") values ('e2e_evt_i','e2e_evt_g','Tagliere della serata',1500,'{}',false,0,now())`);
const PROMO = "e2e_evt";
check("c'è un evento in corso per la prova", PROMO.length > 0);
const slug = DB(`select slug from "MenuPromo" where id='${PROMO}'`);
const title = DB(`select title from "MenuPromo" where id='${PROMO}'`);
const firstDish = DB(`select i.name from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s."promoId"='${PROMO}' and i."deletedAt" is null and i."textOnly"=false order by g."sortOrder", i."sortOrder" limit 1`);
DB(`update "MenuPromo" set "menuMode"='ITEMS', "menuNote"=null, "allergenNotice"=null where id='${PROMO}'`);
DB(`delete from "MenuPromoPage" where "promoId"='${PROMO}'`);
DB(`delete from "MenuItem" where "textOnly"=true`);

const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await goTab(p, "Eventi e annunci");
await p.getByRole("button", { name: new RegExp(title.slice(0, 8)) }).first().click();
const panel = p.locator('section[aria-label="Impostazioni del menù speciale"]');
await panel.waitFor();
check("evento: riquadro «Come preparare il menù speciale»", (await panel.getByRole("radio", { name: /PDF o foto/ }).count()) === 1);

// Nota e avviso allergeni con il menù voce per voce
await panel.getByLabel(/Note del menù/).fill("Menù degustazione per tutto il tavolo.");
await panel.getByLabel("Avviso allergeni unico in fondo al menù").check();
await panel.getByRole("button", { name: "Salva" }).click();
await p.waitForTimeout(1500);
check("DB: nota e avviso salvati", DB(`select "menuMode"||'|'||"menuNote"||'|'||"allergenNotice" from "MenuPromo" where id='${PROMO}'`) === "ITEMS|Menù degustazione per tutto il tavolo.|Allergeni: chiedi al personale.");

// Riga di solo testo nel primo gruppo
await p.getByRole("button", { name: "+ Aggiungi testo" }).first().click();
await p.getByLabel("Testo della riga").fill("Tutto servito con pane fatto in casa.");
await p.getByRole("button", { name: "Aggiungi", exact: true }).click();
await p.waitForTimeout(1500);
check("DB: riga di testo creata", DB(`select count(*) from "MenuItem" where "textOnly"=true and name='Tutto servito con pane fatto in casa.'`) === "1");

const pub = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let text = (await (await pub.goto(`${BASE}/menu/p/${slug}`, { waitUntil: "networkidle", timeout: 120000 })).text(), await pub.locator("main, body").first().innerText());
check("cliente: nota in cima al menù speciale", text.includes("Menù degustazione per tutto il tavolo."));
check("cliente: riga di testo tra le voci", text.includes("Tutto servito con pane fatto in casa."));
check("cliente: avviso allergeni unico", text.includes("Allergeni: chiedi al personale."));
check("cliente: niente «da verificare» accanto ai piatti", !/Allergeni da verificare con il personale/.test(text));

// PDF al posto delle voci
await panel.getByRole("radio", { name: /PDF o foto/ }).click();
await panel.locator('input[type="file"]').setInputFiles(PDF);
for (let i = 0; i < 40 && DB(`select count(*) from "MenuPromoPage" where "promoId"='${PROMO}'`) !== "2"; i++) await p.waitForTimeout(500);
await p.waitForTimeout(1500);
check("PDF: due pagine salvate come immagini", DB(`select count(*) from "MenuPromoPage" where "promoId"='${PROMO}'`) === "2");
check("PDF: si passa da solo a «PDF o foto»", DB(`select "menuMode" from "MenuPromo" where id='${PROMO}'`) === "FILE");
check("gestione: le voci non si vedono con il PDF", (await p.getByRole("button", { name: "+ Aggiungi gruppo" }).count()) === 0);
await pub.goto(`${BASE}/menu/p/${slug}`, { waitUntil: "networkidle" });
text = await pub.locator("body").innerText();
check("cliente: due pagine del menù", (await pub.locator('img[alt^="Menù speciale, pagina"]').count()) === 2);
const ok = await pub.locator('img[alt="Menù speciale, pagina 1"]').evaluate((img) => img.complete && img.naturalWidth > 500);
check("cliente: la pagina si carica (immagine vera)", ok);
check("cliente: con il PDF le voci non compaiono", !text.includes(firstDish), firstDish);
check("cliente: avviso allergeni anche con il PDF", text.includes("Allergeni: chiedi al personale."));
const ov = await pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("cliente: niente scorrimento orizzontale a 390 px", ov <= 0, String(ov));

// Ordine, togli, foto
const ids = DB(`select string_agg(id, ',' order by "sortOrder") from "MenuPromoPage" where "promoId"='${PROMO}'`).split(",");
await panel.getByRole("button", { name: "Sposta giù la pagina 1" }).click();
await p.waitForTimeout(1500);
check("pagine: spostata giù", DB(`select string_agg(id, ',' order by "sortOrder") from "MenuPromoPage" where "promoId"='${PROMO}'`) === `${ids[1]},${ids[0]}`);
await panel.getByRole("button", { name: "Togli la pagina 2" }).click();
await p.waitForTimeout(1500);
check("pagine: tolta una", DB(`select count(*) from "MenuPromoPage" where "promoId"='${PROMO}'`) === "1");
await panel.locator('input[type="file"]').setInputFiles(photo);
for (let i = 0; i < 30 && DB(`select count(*) from "MenuPromoPage" where "promoId"='${PROMO}'`) !== "2"; i++) await p.waitForTimeout(500);
check("foto: aggiunta come pagina", DB(`select count(*) from "MenuPromoPage" where "promoId"='${PROMO}'`) === "2");
check("con il PDF l'avviso non si può spegnere", await panel.getByLabel("Avviso allergeni unico in fondo al menù").isDisabled());

// Si torna a voce per voce: le voci erano rimaste
await panel.getByRole("radio", { name: /Voce per voce/ }).click();
await panel.getByRole("button", { name: "Salva" }).click();
await p.waitForTimeout(1500);
await pub.goto(`${BASE}/menu/p/${slug}`, { waitUntil: "networkidle" });
text = await pub.locator("body").innerText();
check("di nuovo voce per voce: le voci tornano", text.includes(firstDish) && (await pub.locator('img[alt^="Menù speciale, pagina"]').count()) === 0);

// Locandina in PDF: si prende la prima pagina come immagine.
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await goTab(p, "Eventi e annunci");
await p.getByRole("button", { name: new RegExp(title.slice(0, 8)) }).first().click();
await p.getByRole("button", { name: "Modifica", exact: true }).first().click();
const sheet = p.locator('[role="dialog"]');
await sheet.waitFor();
check("locandina: il pulsante dice che va bene anche un PDF", (await sheet.getByRole("button", { name: "Scegli foto o PDF" }).count()) === 1);
await sheet.getByLabel("Scegli la foto o la locandina").setInputFiles(PDF);
await sheet.getByText("Dal PDF ho preso la prima pagina (su 2).").waitFor();
check("locandina da PDF: anteprima pronta", (await sheet.getByRole("button", { name: "Ingrandisci la locandina" }).count()) === 1);
await sheet.getByRole("button", { name: "Salva", exact: true }).click();
await sheet.waitFor({ state: "detached" });
await p.waitForTimeout(1500);
check("locandina da PDF: salvata come immagine", DB(`select "mimeType" from "MenuPromoImage" where "promoId"='${PROMO}'`) === "image/jpeg", DB(`select "mimeType" from "MenuPromoImage" where "promoId"='${PROMO}'`));
const poster = await pub.request.get(`${BASE}/menu/p/${slug}/immagine?v=1`);
check("locandina da PDF: si vede sul menù", poster.ok() && (poster.headers()["content-type"] ?? "").includes("image/jpeg"));

DB(`update "MenuPromo" set "menuMode"='ITEMS', "menuNote"=null, "allergenNotice"=null where id='${PROMO}'`);
DB(`delete from "MenuPromoPage" where "promoId"='${PROMO}'`);
DB(`delete from "MenuItem" where "textOnly"=true`);
DB(`delete from "MenuPromo" where id='e2e_evt'`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
