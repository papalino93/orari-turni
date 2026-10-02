import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW } from "./lib.mjs";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
// giorno commerciale (cambia alle 5:00 ora italiana)
const biz = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() - 5 * 3600e3 + offset * 86400e3),
  );

DB(`delete from "MenuPromo"`);
DB(`delete from "MenuChange"`);
DB(`update "MenuItem" set "soldOutDay"=null where "soldOutDay" is not null`);
const poster = join(tmpdir(), "locandina-test.png");
await sharp({ create: { width: 900, height: 1125, channels: 3, background: { r: 107, g: 16, b: 32 } } }).png().toFile(poster);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
let createActionId = null;
page.on("request", (r) => {
  if (r.method() === "POST" && r.headers()["next-action"] && /Crea|createPromo/.test(r.postData() ?? "") === false && !createActionId && (r.postData() ?? "").includes('"kind"')) {
    createActionId = r.headers()["next-action"];
  }
});
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
const publicText = async (path) => {
  const r = await pub.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  return { status: r?.status(), text: (await pub.locator("body").innerText()).replace(/ /g, " ") };
};

async function createPromo({ type, title, label, body, start, end, showFrom, withImage }) {
  await page.getByRole("button", { name: "+ Evento o annuncio" }).click();
  await dialog().waitFor();
  await dialog().getByRole("radio", { name: type === "EVENT" ? "Evento con menù speciale" : "Annuncio" }).click();
  await dialog().getByLabel("Titolo", { exact: true }).fill(title);
  if (label) await dialog().getByLabel("Tipo").fill(label);
  if (body) await dialog().getByLabel("Testo").fill(body);
  if (withImage) await dialog().locator('input[type="file"]').setInputFiles(poster);
  if (type === "EVENT") {
    await dialog().getByLabel("Mostra la locandina dal").fill(showFrom);
    await dialog().getByLabel("Inizio evento").fill(start);
    await dialog().getByLabel("Fine evento").fill(end);
  } else {
    await dialog().getByLabel("Dal", { exact: true }).fill(start);
    await dialog().getByLabel("Al", { exact: true }).fill(end);
  }
  await dialog().getByRole("button", { name: type === "EVENT" ? "Crea evento" : "Crea annuncio" }).click();
  await dialog().waitFor({ state: "detached" });
  await settle(2000);
}

// ---- default delle date nel foglio di creazione
await page.getByRole("button", { name: "+ Evento o annuncio" }).click();
await dialog().waitFor();
check("default: inizio tra 7 giorni", (await dialog().getByLabel("Inizio evento").inputValue()) === biz(7));
check("default: locandina da oggi (7 giorni prima)", (await dialog().getByLabel("Mostra la locandina dal").inputValue()) === biz(0));
await dialog().getByLabel("Inizio evento").fill(biz(20));
check("cambiando l'inizio la locandina segue (-7 giorni)", (await dialog().getByLabel("Mostra la locandina dal").inputValue()) === biz(13));
await dialog().getByRole("button", { name: "Chiudi" }).click();
await dialog().waitFor({ state: "detached" });

// ---- evento in corso con locandina
await createPromo({ type: "EVENT", title: "Oktoberfest", body: "Birre e cucina bavarese", start: biz(0), end: biz(2), showFrom: biz(-7), withImage: true });
check("evento creato: scheda con stato In corso", /In corso/i.test(await page.locator("section", { hasText: "Evento con menù speciale" }).first().innerText()));
check("DB: evento + sezione collegata + locandina", DB(`select (select count(*) from "MenuPromo" where title='Oktoberfest')||'|'||(select count(*) from "MenuSection" where "promoId" is not null)||'|'||(select count(*) from "MenuPromoImage")`) === "1|1|1");
const slug = DB(`select slug from "MenuPromo" where title='Oktoberfest'`);

for (const name of ["Birre", "Cucina bavarese"]) {
  await page.locator("button", { hasText: "+ Aggiungi gruppo" }).click();
  await page.getByPlaceholder(/Nome del gruppo/).fill(name);
  await page.locator("button", { hasText: /^Aggiungi$/ }).click();
  await settle();
}
const groupSection = (n) => page.locator("section", { has: page.locator(`h3:has-text("${n}")`) });
await groupSection("Birre").locator("button", { hasText: "+ Aggiungi voce" }).click();
await dialog().waitFor();
await dialog().getByLabel("Nome", { exact: true }).fill("Paulaner Helles");
await dialog().getByLabel("Descrizione").fill("Chiara, rinfrescante");
check("formati: prezzo singolo richiesto finché non ci sono formati", (await dialog().getByLabel("Prezzo (€)").count()) === 1);
for (const [i, [l, p]] of [["0,2 l", "3,50"], ["0,4 l", "6"], ["Maß 1 l", "11"]].entries()) {
  await dialog().getByRole("button", { name: "+ Aggiungi un formato" }).click();
  await dialog().getByLabel(`Formato ${i + 1}`, { exact: true }).fill(l);
  await dialog().getByLabel(`Prezzo del formato ${i + 1}`).fill(p);
}
check("formati: con i formati sparisce il prezzo singolo", (await dialog().getByLabel("Prezzo (€)").count()) === 0);
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
await groupSection("Cucina bavarese").locator("button", { hasText: "+ Aggiungi voce" }).click();
await dialog().waitFor();
await dialog().getByLabel("Nome", { exact: true }).fill("Brezel");
await dialog().getByLabel("Prezzo (€)").fill("4");
await dialog().getByRole("radio", { name: "Contiene…" }).click();
await dialog().getByLabel("Glutine").check();
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("DB: formati salvati come JSON", DB(`select variants::text from "MenuItem" where name='Paulaner Helles'`).includes('"cents": 600'));

// ---- pubblico: evento in corso a pagina piena subito dopo la copertina
await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
const order = await pub.evaluate(() => {
  const ev = document.querySelector('[id^="evento-"]');
  const carta = document.getElementById("carta");
  const strip = document.querySelector('section[aria-label="In evidenza"]');
  return { ev: !!ev, before: ev && carta ? !!(ev.compareDocumentPosition(carta) & Node.DOCUMENT_POSITION_FOLLOWING) : false, strip: !!strip };
});
check("pubblico: evento in corso aperto prima del menù", order.ev && order.before);
check("pubblico: evento in corso non duplicato nella striscia", !order.strip);
const live = (await pub.locator('[id^="evento-"]').innerText()).replace(/ /g, " ");
check("pubblico: menù speciale con formati e prezzi", /Paulaner Helles/.test(live) && /0,2 l\s*3,50/.test(live) && /0,4 l\s*6/.test(live) && /Maß 1 l\s*11/.test(live));
check("pubblico: 'Vai al menù' presente", (await pub.locator('a[href="#carta"]').count()) >= 2);
check("pubblico: locandina caricata", await pub.locator('[id^="evento-"] img').first().evaluate((i) => i.complete && i.naturalWidth > 0));
if (SHOTS) {
  await pub.evaluate(() => document.querySelector('[id^="evento-"]')?.scrollIntoView());
  await pub.waitForTimeout(500);
  await pub.screenshot({ path: `${SHOTS}/evento-live-390.png` });
}
const overflow = await pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("pubblico: nessun overflow orizzontale con l'evento", overflow <= 0, String(overflow));

const pageRes = await publicText(`/menu/p/${slug}`);
check("pagina dedicata: 200 con titolo e menù speciale", pageRes.status === 200 && /Oktoberfest/.test(pageRes.text) && /Menù speciale/.test(pageRes.text));
const og = await pub.locator('meta[property="og:image"]').getAttribute("content");
check("pagina dedicata: anteprima social (og:image) con locandina", !!og && og.includes(`/menu/p/${slug}/immagine`), String(og));
const imgRes = await pub.request.get(`${BASE}/menu/p/${slug}/immagine`);
check("locandina: 200 image/jpeg con cache lunga", imgRes.status() === 200 && /image\//.test(imgRes.headers()["content-type"]) && /immutable/.test(imgRes.headers()["cache-control"] ?? ""));
const allergens = await publicText("/menu/allergeni");
check("allergeni: il cibo dell'evento in corso compare", /Brezel/.test(allergens.text) && /Glutine/.test(allergens.text));

// ---- evento annunciato (non ancora iniziato)
await createPromo({ type: "EVENT", title: "Serata Jazz", label: "Musica dal vivo", body: "Musica dal vivo", start: biz(5), end: biz(5), showFrom: biz(0), withImage: false });
let menu = await publicText("/menu");
check("annunciato: scheda nella striscia In evidenza", /In evidenza/i.test(menu.text) && /Serata Jazz/.test(menu.text));
check("tipo personalizzato: compare sulla scheda", /Musica dal vivo · dal/i.test(menu.text));
check("annunciato: non aperto a pagina piena", (await pub.locator('[id^="evento-"]').count()) === 1);
const jazzSlug = DB(`select slug from "MenuPromo" where title='Serata Jazz'`);
const jazzPage = await publicText(`/menu/p/${jazzSlug}`);
check("tipo personalizzato: compare sulla pagina dell'evento", /musica dal vivo/i.test(jazzPage.text));
check("annunciato: la pagina dice quando arriva il menù speciale", /menù speciale sarà disponibile dal/i.test(jazzPage.text));
check("allergeni: il menù di un evento non iniziato non compare", !(await publicText("/menu/allergeni")).text.includes("Serata Jazz"));

// ---- annuncio in corso
await createPromo({ type: "NOTICE", title: "Chiusi il 25 dicembre", body: "Riapriamo il 26.", start: biz(0), end: biz(1), showFrom: biz(0), withImage: false });
menu = await publicText("/menu");
check("annuncio in corso: scheda nella striscia", /Chiusi il 25 dicembre/.test(menu.text));

// ---- nascondi / mostra
await page.locator("nav[aria-label='Eventi e annunci'] button", { hasText: "Serata Jazz" }).click();
await page.getByRole("button", { name: "Nascondi", exact: true }).click();
await settle();
menu = await publicText("/menu");
check("nascosto: sparisce dal menù", !menu.text.includes("Serata Jazz"));
check("nascosto: la sua pagina non esiste (404)", (await publicText(`/menu/p/${jazzSlug}`)).status === 404);
await page.getByRole("button", { name: "Mostra", exact: true }).click();
await settle();
check("mostra: torna visibile", (await publicText("/menu")).text.includes("Serata Jazz"));

// ---- evento concluso
await createPromo({ type: "EVENT", title: "Vendemmia", body: "", start: biz(-9), end: biz(-8), showFrom: biz(-16), withImage: false });
menu = await publicText("/menu");
check("concluso: non compare nel menù", !menu.text.includes("Vendemmia"));
const pastSlug = DB(`select slug from "MenuPromo" where title='Vendemmia'`);
check("concluso: il link condiviso mostra 'concluso'", /conclus/i.test((await publicText(`/menu/p/${pastSlug}`)).text));

// ---- duplica
await page.locator("nav[aria-label='Eventi e annunci'] button", { hasText: "Oktoberfest" }).click();
await page.getByRole("button", { name: "Duplica", exact: true }).first().click();
await dialog().waitFor();
await dialog().getByLabel("Titolo", { exact: true }).fill("Oktoberfest 2027");
await dialog().getByLabel("Inizio evento").fill(biz(300));
await dialog().getByLabel("Fine evento").fill(biz(302));
await dialog().getByRole("button", { name: "Duplica", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(2500);
check("duplica: copia con gruppi, voci, formati e locandina", DB(`select (select count(*) from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" join "MenuPromo" p on p.id=s."promoId" where p.title='Oktoberfest 2027')||'|'||(select count(*) from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" join "MenuPromo" p on p.id=s."promoId" where p.title='Oktoberfest 2027')||'|'||(select count(*) from "MenuPromoImage" im join "MenuPromo" p on p.id=im."promoId" where p.title='Oktoberfest 2027')`) === "2|2|1");
check("duplica: la copia è selezionata nella gestione", (await page.locator("h2", { hasText: "Oktoberfest 2027" }).count()) === 1);

// ---- elimina + annulla
await page.getByRole("button", { name: "Elimina", exact: true }).click();
await page.getByRole("button", { name: "Sì, elimina" }).click();
await settle();
check("elimina: sparisce dall'elenco", (await page.locator("nav[aria-label='Eventi e annunci'] button", { hasText: "Oktoberfest 2027" }).count()) === 0);
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(2000);
check("annulla: torna nell'elenco", (await page.locator("nav[aria-label='Eventi e annunci'] button", { hasText: "Oktoberfest 2027" }).count()) === 1);

// ---- layout della gestione
for (const [label, w, h] of [["390", 390, 844], ["768", 768, 1024], ["1280", 1280, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.locator("nav[aria-label='Eventi e annunci'] button", { hasText: "Oktoberfest" }).first().click();
  await settle(500);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`gestione evento @${label}: nessun overflow orizzontale`, ov <= 0, String(ov));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/gestione-evento-${label}.png` });
}

// ---- permessi
const fr = await browser.newContext();
const frp = await fr.newPage();
await login(frp, "francesco", EMP_PW);
const before = DB(`select count(*) from "MenuPromo"`);
if (createActionId) {
  const res = await fr.request.post(`${BASE}/gestione-menu`, {
    headers: { "next-action": createActionId, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" },
    data: JSON.stringify([{ kind: "NOTICE", title: "Intruso", showFrom: biz(0), startDate: biz(0), endDate: biz(1) }]),
    maxRedirects: 0,
  });
  check("senza permesso: creazione rifiutata", /permesso/i.test(await res.text()) || res.status() >= 300);
  const anon = await browser.newContext();
  const res2 = await anon.request.post(`${BASE}/gestione-menu`, {
    headers: { "next-action": createActionId, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" },
    data: JSON.stringify([{ kind: "NOTICE", title: "Intruso", showFrom: biz(0), startDate: biz(0), endDate: biz(1) }]),
    maxRedirects: 0,
  });
  check("anonimo: creazione rifiutata", res2.status() >= 300 || /login|permesso/i.test(await res2.text()));
} else {
  check("id azione di creazione catturato", false);
}
check("DB: nessuna pagina creata senza permesso", DB(`select count(*) from "MenuPromo"`) === before);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
