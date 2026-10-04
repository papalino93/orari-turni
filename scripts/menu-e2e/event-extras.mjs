// Eventi, novità di ottobre: annunci in una riga sotto la copertina, «In evidenza» senza
// scorrere di lato (1, 2, 3+ eventi), orario dell'evento, Prenota / Calendario / Condividi.
import { launch, login, check, BASE, results, ADMIN_PW, DB, SHOTS } from "./lib.mjs";

const biz = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() - 5 * 3600e3 + offset * 86400e3),
  );

// Si lavora solo con pagine di prova; quelle già presenti si nascondono e alla fine tornano come prima.
const hiddenBefore = DB(`select coalesce(string_agg(id, ','), '') from "MenuPromo" where "deletedAt" is null and hidden = false and id not like 'extra-%'`);
DB(`delete from "MenuPromo" where id like 'extra-%'`);
if (hiddenBefore) DB(`update "MenuPromo" set hidden = true where id in ('${hiddenBefore.split(",").join("','")}')`);
const add = (id, kind, title, start, extra = "") =>
  DB(
    `insert into "MenuPromo" (id, kind, slug, title, "showFrom", "startDate", "endDate", "updatedAt"${extra ? ", " + extra.split("=")[0] : ""}) values ('${id}', '${kind}', '${id}', '${title}', '${biz(-1)}', '${start}', '${start}', now()${extra ? ", " + extra.split("=")[1] : ""})`,
  );

const b = await launch();
const pub = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
await pub.addInitScript(() => localStorage.setItem("menu-staff-device", "1"));
const open = async (path = "/menu") => {
  await pub.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 180000 });
  return pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
};
const strip = () => pub.locator('section[aria-label="In evidenza"]');

// Annuncio + un evento
add("extra-avviso", "NOTICE", "Lunedì chiusi per ferie", biz(0));
add("extra-uno", "EVENT", "Serata Uno", biz(3));
await open();
check("annuncio: nella riga sotto la copertina", (await pub.locator('section[aria-label="Annunci"]').innerText()).includes("Lunedì chiusi per ferie"));
check("annuncio: non sta in «In evidenza»", !(await strip().innerText()).includes("Lunedì chiusi"));
check("annuncio: prima di «In evidenza»", await pub.evaluate(() => {
  const a = document.querySelector('section[aria-label="Annunci"]');
  const e = document.querySelector('section[aria-label="In evidenza"]');
  return Boolean(a && e && a.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
}));
check("un evento: una scheda", (await strip().locator("a").count()) === 1);

// Due eventi: uno sotto l'altro, interi
add("extra-due", "EVENT", "Serata Due", biz(5));
let ov = await open();
const boxes = await strip().locator("a").evaluateAll((as) => as.map((a) => a.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, right: r.right })));
check("due eventi: uno sotto l'altro", boxes.length === 2 && Math.abs(boxes[0].x - boxes[1].x) < 2 && boxes[1].y > boxes[0].y, JSON.stringify(boxes));
check("due eventi: tutti e due interi nello schermo", boxes.every((r) => r.right <= 390), JSON.stringify(boxes));
check("due eventi: niente scorrimento orizzontale", ov === 0, String(ov));
if (SHOTS) await strip().screenshot({ path: `${SHOTS}/evidenza-2.png` });

// Tre e quattro eventi: il primo grande, gli altri in fila
add("extra-tre", "EVENT", "Serata Tre", biz(7));
add("extra-quattro", "EVENT", "Serata Quattro", biz(9));
ov = await open();
const links = await strip().locator("a").evaluateAll((as) => as.map((a) => ({ t: a.innerText.replace(/\s+/g, " "), r: a.getBoundingClientRect().toJSON() })));
check("quattro eventi: tutti in «In evidenza»", links.length === 4, String(links.length));
check("quattro eventi: il primo grande (in ordine di data)", /Serata Uno/.test(links[0].t) && links[0].r.width > 300);
check("quattro eventi: gli altri tre in una fila", links.slice(1).every((l) => Math.abs(l.r.y - links[1].r.y) < 2 && l.r.width < 130), JSON.stringify(links.map((l) => l.r.width)));
check("quattro eventi: tutti visibili senza scorrere di lato", links.every((l) => l.r.right <= 390) && ov === 0);
if (SHOTS) await strip().screenshot({ path: `${SHOTS}/evidenza-4.png` });
// L'ordine scelto a mano vale anche qui
DB(`update "MenuPromo" set "sortOrder" = 0 where id = 'extra-tre'`);
await open();
check("ordine a mano: «Serata Tre» diventa la grande", /Serata Tre/.test(await strip().locator("a").first().innerText()));
DB(`update "MenuPromo" set "sortOrder" = null where id = 'extra-tre'`);
// Tablet: locandine piccole a larghezza fissa
await pub.setViewportSize({ width: 820, height: 1180 });
ov = await open();
const minis = await strip().locator("a").evaluateAll((as) => as.slice(1).map((a) => a.getBoundingClientRect().width));
check("tablet: locandine piccole non giganti", minis.every((w) => w <= 160), JSON.stringify(minis));
await pub.setViewportSize({ width: 390, height: 844 });

// Orario e pulsanti nella pagina dell'evento
DB(`update "MenuPromo" set "startTime" = '19:00', "endTime" = '23:00', body = 'Birre, cibo e musica' where id = 'extra-uno'`);
ov = await open("/menu/p/extra-uno");
const page = await pub.locator("main").innerText();
check("pagina evento: «Dalle 19:00 alle 23:00»", page.includes("Dalle 19:00 alle 23:00"));
const book = await pub.getByRole("link", { name: "Prenota" }).getAttribute("href");
check("Prenota: WhatsApp con evento, data e ora", /^https:\/\/wa\.me\/393383277053\?text=/.test(book ?? "") && decodeURIComponent(book).includes("«Serata Uno»") && decodeURIComponent(book).includes("dalle 19:00"), decodeURIComponent(book ?? ""));
const cal = await pub.getByRole("link", { name: "Aggiungi al calendario" }).getAttribute("href");
const ics = await pub.request.get(`${BASE}${cal}`);
const icsText = await ics.text();
const day = biz(3).replace(/-/g, "");
check("calendario: file .ics", ics.status() === 200 && /text\/calendar/.test(ics.headers()["content-type"] ?? ""));
check("calendario: inizio e fine con l'ora di Roma", icsText.includes(`DTSTART;TZID=Europe/Rome:${day}T190000`) && icsText.includes(`DTEND;TZID=Europe/Rome:${day}T230000`), icsText.slice(0, 600));
check("calendario: titolo e indirizzo", /SUMMARY:Serata Uno · L'Angolo del Vino/.test(icsText) && /LOCATION:/.test(icsText));
check("pagina evento: niente scorrimento orizzontale", ov === 0);
if (SHOTS) await pub.screenshot({ path: `${SHOTS}/evento-pulsanti.png` });
// Condividi: senza la condivisione del telefono il link si copia
await pub.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await pub.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
await pub.getByRole("button", { name: "Condividi" }).click();
await pub.getByText("Link copiato").waitFor({ timeout: 5000 }).catch(() => {});
check("Condividi: link copiato", (await pub.getByText("Link copiato").count()) === 1 && (await pub.evaluate(() => navigator.clipboard.readText())).endsWith("/menu/p/extra-uno"));
// Un evento senza orario: tutto il giorno nel calendario
const ics2 = await (await pub.request.get(`${BASE}/menu/p/extra-due/calendario`)).text();
check("calendario senza orario: tutto il giorno", ics2.includes(`DTSTART;VALUE=DATE:${biz(5).replace(/-/g, "")}`));
// Un annuncio non ha i pulsanti
await open("/menu/p/extra-avviso");
check("annuncio: niente Prenota/Calendario", (await pub.getByRole("link", { name: "Aggiungi al calendario" }).count()) === 0);

// Gestione: orario nel modulo dell'evento
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await p.locator("button", { hasText: /^Serata Due/ }).first().click();
await p.getByRole("button", { name: "Modifica", exact: true }).first().click();
const dlg = p.locator('[role="dialog"]');
await dlg.waitFor();
check("gestione: «Alle» disattivato senza «Dalle»", await dlg.getByLabel("Alle (facoltativo)", { exact: true }).isDisabled());
await dlg.getByLabel("Dalle (facoltativo)").fill("18:30");
await dlg.getByRole("button", { name: /^Salva/ }).click();
await dlg.waitFor({ state: "detached" });
check("gestione: orario salvato", DB(`select "startTime" from "MenuPromo" where id = 'extra-due'`) === "18:30");

DB(`delete from "MenuChange" where label like 'Serata %'`);
DB(`delete from "MenuPromo" where id like 'extra-%'`);
if (hiddenBefore) DB(`update "MenuPromo" set hidden = false where id in ('${hiddenBefore.split(",").join("','")}')`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
