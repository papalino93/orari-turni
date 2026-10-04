// Blocchi informativi: creazione dei tre tipi, i tre punti del menù, più sezioni,
// date, nascondi, ordine, eliminazione e annullamento, eventi, permessi.
import { discardIfAsked, launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW, DB, resetBlocks, expandPanels, newPromo } from "./lib.mjs";

const biz = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() - 5 * 3600e3 + offset * 86400e3),
  );

resetBlocks();
DB(`delete from "MenuPromo"`);
DB(`delete from "MenuChange"`);
DB(`update "Employee" set "canEditMenu"=true where username='marta'`);
// Le pagine pubbliche sono in cache (60 s) con `next start`: i ripristini diretti sul database non le rigenerano.
if (process.env.E2E_PROD) await new Promise((resolve) => setTimeout(resolve, 62_000));

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await expandPanels(page);
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
const publicText = async () => {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  return (await pub.locator("body").innerText()).replace(/\u00a0/g, " ");
};
const sectionText = async (id) => (await pub.locator(`#${id}`).innerText()).replace(/\u00a0/g, " ");
const panel = () => page.locator('section[aria-label="Informazioni del menù"]');

async function openNew() {
  await panel().getByRole("button", { name: "+ Aggiungi" }).click();
  await dialog().waitFor();
}
async function save(label = "Aggiungi") {
  await dialog().getByRole("button", { name: label, exact: true }).click();
  await dialog().waitFor({ state: "detached" });
  await settle();
}

// ---------- La migrazione ha conservato coperto e chiusura cucina
const panelText = async () => (await panel().innerText()).replace(/\u00a0/g, " ");
check("pannello: «Informazioni del menù» mostra i due blocchi di partenza", (await panelText()).includes("Coperto € 1,00") && /cucina chiude/i.test(await panelText()));
let t = await publicText();
check("pubblico: coperto e chiusura cucina come prima (Taglieri e Tartare)", (await sectionText("taglieri")).match(/coperto € 1,00/i) && (await sectionText("tartare")).match(/coperto € 1,00/i));
check("pubblico: non nei vini né nelle bevande", !/coperto/i.test(await sectionText("bianchi")) && !/coperto/i.test(await sectionText("bevande")));

// ---------- Voce con prezzo in cima
await openNew();
await dialog().getByRole("radio", { name: "Voce con prezzo" }).click();
await dialog().getByLabel("Nome", { exact: true }).fill("Tavolo all'aperto");
await dialog().getByLabel("Prezzo (€)").fill("2");
await save();
t = await publicText();
check("in cima: voce con prezzo «Tavolo all'aperto € 2,00»", /tavolo all'aperto € 2,00/i.test(t));
const topPos = await pub.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find((d) => /tavolo all'aperto/i.test(d.textContent ?? "") && d.children.length === 0);
  const nav = document.querySelector("nav");
  const first = document.querySelector("main section[id]");
  return { aboveNav: !!el && !!nav && (el.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, aboveSections: !!el && !!first && (el.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 };
});
check("in cima: sta sopra la barra delle sezioni e le sezioni", topPos.aboveNav && topPos.aboveSections, JSON.stringify(topPos));
check("DB: blocco PRICE da 200 centesimi in cima", DB(`select kind||'|'||"priceCents"||'|'||placement from "MenuBlock" where label='Tavolo all''aperto'`) === "PRICE|200|TOP");

// ---------- Avviso in fondo, con titolo
await openNew();
await dialog().getByRole("radio", { name: "Avviso" }).click();
await dialog().getByLabel("Titolo (facoltativo)").fill("Attenzione");
await dialog().getByLabel("Testo").fill("Domenica cucina chiusa");
await dialog().getByRole("radio", { name: /In fondo al menù/ }).click();
await save();
t = await publicText();
check("in fondo: avviso con titolo e testo", /attenzione/i.test(t) && t.includes("Domenica cucina chiusa"));
const bottomPos = await pub.evaluate(() => {
  const el = [...document.querySelectorAll("p")].find((p) => p.textContent === "Domenica cucina chiusa");
  const lastSection = [...document.querySelectorAll("main section[id]")].pop();
  const legend = [...document.querySelectorAll("main *")].find((e) => /Allergeni · legenda|Legenda/i.test(e.textContent ?? "") && e.children.length < 6);
  return { afterSections: !!el && !!lastSection && (lastSection.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, beforeLegend: !legend || (el.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 };
});
check("in fondo: dopo le sezioni e prima della legenda", bottomPos.afterSections && bottomPos.beforeLegend, JSON.stringify(bottomPos));

// ---------- Voce con prezzo e descrizione; avviso con prezzo (richiesta del titolare)
await openNew();
await dialog().getByRole("radio", { name: "Voce con prezzo" }).click();
await dialog().getByLabel("Nome", { exact: true }).fill("Oli aromatizzati");
await dialog().getByLabel("Prezzo (€)").fill("1,50");
await dialog().getByLabel("Descrizione (facoltativa)").fill("Arancia, basilico o peperoncino");
await save();
t = await publicText();
check("prezzo con descrizione: riga e descrizione sotto", /oli aromatizzati € 1,50/i.test(t) && t.includes("Arancia, basilico o peperoncino"));
await openNew();
await dialog().getByRole("radio", { name: "Avviso" }).click();
await dialog().getByLabel("Titolo (facoltativo)").fill("Novità · Olio al tartufo");
await dialog().getByLabel("Prezzo (facolt.)").fill("2");
await dialog().getByLabel("Testo").fill("Da aggiungere a ogni tartare.");
await save();
t = await publicText();
check("avviso con prezzo: «Novità · Olio al tartufo € 2,00» e il testo", /novità · olio al tartufo € 2,00/i.test(t) && t.includes("Da aggiungere a ogni tartare."));
check("pannello: riassunto con il prezzo dell'avviso", /Olio al tartufo € 2,00/.test(await panelText()));

// ---------- Testo sotto più sezioni
await openNew();
await dialog().getByLabel("Titoletto (facoltativo)").fill("Vini");
await dialog().getByLabel("Testo").fill("Chiedi al personale la lista dei vini al calice.");
await dialog().getByRole("radio", { name: /Sotto il titolo di una sezione/ }).click();
await dialog().getByRole("checkbox", { name: "Bianchi" }).check();
await dialog().getByRole("checkbox", { name: "Rossi" }).check();
await save();
t = await publicText();
check("più sezioni: testo sotto Bianchi e sotto Rossi", (await sectionText("bianchi")).includes("lista dei vini al calice") && (await sectionText("rossi")).includes("lista dei vini al calice"));
check("più sezioni: non sotto Bollicine", !(await sectionText("bollicine")).includes("lista dei vini al calice"));
check("pannello: il blocco mostra le sezioni scelte", /Bianchi, Rossi/.test(await panel().innerText()));

// ---------- Validazioni del foglio
await openNew();
await dialog().getByLabel("Testo").fill("Senza sezioni");
await dialog().getByRole("radio", { name: /Sotto il titolo di una sezione/ }).click();
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
check("validazione: «sotto una sezione» senza sezioni scelte è rifiutato", /almeno una sezione/i.test(await dialog().innerText()));
await dialog().getByRole("radio", { name: /In cima al menù/ }).click();
await dialog().getByLabel("Dal", { exact: true }).fill(biz(5));
await dialog().getByLabel("Al", { exact: true }).fill(biz(2));
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
check("validazione: «Al» prima di «Dal» è rifiutato", /non può essere prima/i.test(await dialog().innerText()));
await dialog().getByLabel("Al", { exact: true }).fill("");
await dialog().getByLabel("Dal", { exact: true }).fill("");
await dialog().getByLabel("Testo").fill("");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await settle(800);
check("validazione: testo vuoto è rifiutato", (await dialog().count()) === 1 && /obbligatorio/i.test(await page.locator("body").innerText()));
await dialog().getByRole("radio", { name: "Voce con prezzo" }).click();
await dialog().getByLabel("Nome", { exact: true }).fill("Servizio");
await dialog().getByLabel("Prezzo (€)").fill("abc");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await settle(800);
check("validazione: prezzo non valido è rifiutato", (await dialog().count()) === 1 && /prezzo.*non valido|inserisci il prezzo/i.test(await page.locator("body").innerText()));
await dialog().getByRole("button", { name: "Chiudi" }).click();
await discardIfAsked(dialog().page());
await dialog().waitFor({ state: "detached" });
check("DB: nessun blocco creato dalle prove rifiutate", Number(DB(`select count(*) from "MenuBlock" where "deletedAt" is null`)) === 7);

// ---------- Date: non ancora visibile / scaduto / oggi
await page.getByRole("button", { name: /Modifica: Tavolo all'aperto/ }).click();
await dialog().waitFor();
await dialog().getByLabel("Dal", { exact: true }).fill(biz(3));
await save("Salva");
check("date: nel pannello «non ancora visibile»", /non ancora visibile/i.test(await panel().innerText()));
t = await publicText();
check("date: prima del «dal» non compare", !/tavolo all'aperto/i.test(t));
await page.getByRole("button", { name: /Modifica: Tavolo all'aperto/ }).click();
await dialog().waitFor();
await dialog().getByLabel("Dal", { exact: true }).fill(biz(-3));
await dialog().getByLabel("Al", { exact: true }).fill(biz(-1));
await save("Salva");
check("date: nel pannello «scaduto»", /scaduto/i.test(await panel().innerText()));
t = await publicText();
check("date: dopo l'«al» sparisce da solo", !/tavolo all'aperto/i.test(t));
await page.getByRole("button", { name: /Modifica: Tavolo all'aperto/ }).click();
await dialog().waitFor();
await dialog().getByLabel("Dal", { exact: true }).fill(biz(0));
await dialog().getByLabel("Al", { exact: true }).fill(biz(0));
await save("Salva");
t = await publicText();
check("date: «solo oggi» compare", /tavolo all'aperto € 2,00/i.test(t));

// ---------- Nascondi
await page.getByRole("button", { name: /Modifica: Tavolo all'aperto/ }).click();
await dialog().waitFor();
await dialog().getByRole("checkbox", { name: /Nascondi per ora/ }).check();
await save("Salva");
check("nascondi: nel pannello «nascosto»", /nascosto/i.test(await panel().innerText()));
t = await publicText();
check("nascondi: non compare sul menù", !/tavolo all'aperto/i.test(t));
await page.getByRole("button", { name: /Modifica: Tavolo all'aperto/ }).click();
await dialog().waitFor();
await dialog().getByRole("checkbox", { name: /Nascondi per ora/ }).uncheck();
await save("Salva");
t = await publicText();
check("nascondi: tolto, ricompare", /tavolo all'aperto/i.test(t));

// ---------- Ordine con le frecce (dentro lo stesso punto)
const order = async (id) => {
  await publicText();
  const txt = await sectionText(id);
  return { chiusura: txt.toLowerCase().indexOf("la cucina chiude"), coperto: txt.toLowerCase().indexOf("coperto € 1,00") };
};
let o = await order("taglieri");
check("ordine: di partenza chiusura cucina sopra il coperto", o.chiusura >= 0 && o.chiusura < o.coperto, JSON.stringify(o));
await page.getByRole("button", { name: /Modifica: Coperto € 1,00/ }).locator("xpath=ancestor::li").getByRole("button", { name: "Sposta su" }).click();
await settle();
o = await order("taglieri");
let o2 = await order("tartare");
check("ordine: spostato su → coperto sopra la chiusura cucina (in tutte le sezioni)", o.coperto < o.chiusura && o2.coperto < o2.chiusura, JSON.stringify([o, o2]));
check("ordine: «Sposta su» del primo è disattivato", await page.getByRole("button", { name: /Modifica: Coperto € 1,00/ }).locator("xpath=ancestor::li").getByRole("button", { name: "Sposta su" }).isDisabled());
await page.getByRole("button", { name: /Modifica: Coperto € 1,00/ }).locator("xpath=ancestor::li").getByRole("button", { name: "Sposta giù" }).click();
await settle();
o = await order("taglieri");
check("ordine: rimesso com'era", o.chiusura < o.coperto);

// ---------- «Testi della sezione» elenca i blocchi della sezione, uno per riga
await goTab(page, "Menù");
await page.locator('nav[aria-label="Sezioni"] button', { hasText: "Taglieri & Pinse" }).first().click();
await settle(600);
const texts = (await page.locator("main").innerText()).replace(/\u00a0/g, " ");
check("sezione: «Testi della sezione» elenca coperto e chiusura cucina", /PREZZO\s*Coperto € 1,00/i.test(texts) && /TESTO\s*Si informa/i.test(texts), texts.slice(0, 200));
await page.getByRole("button", { name: "Modifica" }).filter({ hasText: /^Modifica$/ }).nth(1).click().catch(() => {});
await dialog().waitFor({ timeout: 5000 }).catch(() => {});
if (await dialog().count()) {
  check("sezione: il foglio dei testi non ha più «Mostra il coperto»", !/Mostra il coperto/i.test(await dialog().innerText()));
  await dialog().getByRole("button", { name: "Chiudi" }).click();
await discardIfAsked(dialog().page());
  await dialog().waitFor({ state: "detached" });
}

// ---------- Elimina e annulla
await expandPanels(page);
await page.getByRole("button", { name: /Modifica: Attenzione/ }).click();
await dialog().waitFor();
await dialog().getByRole("button", { name: "Elimina informazione" }).click();
await dialog().getByRole("button", { name: "Sì, elimina" }).click();
await dialog().waitFor({ state: "detached" });
await settle();
t = await publicText();
check("elimina: l'avviso sparisce dal menù", !t.includes("Domenica cucina chiusa"));
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(1800);
t = await publicText();
check("annulla: l'avviso torna", t.includes("Domenica cucina chiusa"));
check("DB: log storico dei blocchi", Number(DB(`select count(*) from "MenuChange" where entity='block'`)) >= 8);

// ---------- Eventi: scelta dei blocchi nel menù speciale
await newPromo(page);
await dialog().waitFor();
await dialog().getByLabel("Titolo", { exact: true }).fill("Serata Prova");
await dialog().getByLabel("Mostra la locandina dal").fill(biz(-2));
await dialog().getByLabel("Inizio evento").fill(biz(0));
await dialog().getByLabel("Fine evento").fill(biz(1));
const fieldset = dialog().locator("fieldset", { hasText: "Nel menù speciale mostra anche" });
check("evento: elenca i blocchi «sotto una sezione» (coperto e chiusura cucina, già spuntati)", (await fieldset.getByRole("checkbox").count()) >= 3 && (await fieldset.getByRole("checkbox", { name: /Coperto € 1,00/ }).isChecked()));
await fieldset.getByRole("checkbox", { name: /Si informa/ }).uncheck();
await dialog().getByRole("button", { name: "Crea evento" }).click();
await dialog().waitFor({ state: "detached" });
await settle(2000);
const slug = DB(`select slug from "MenuPromo" where title='Serata Prova'`);
const eventSection = DB(`select id from "MenuSection" where "promoId" = (select id from "MenuPromo" where title='Serata Prova')`);
check("DB: il coperto è stato aggiunto al menù speciale, la chiusura cucina no", DB(`select count(*) from "MenuBlock" where id='blk_cover' and '${eventSection}' = any("sectionIds")`) === "1" && DB(`select count(*) from "MenuBlock" where id='blk_kitchen_note' and '${eventSection}' = any("sectionIds")`) === "0");
// il menù speciale va guardato nella pagina dell'evento; serve almeno una voce
DB(`insert into "MenuGroup"(id,"sectionId",title,columns,"sortOrder") values ('grp_test_blk','${eventSection}','Piatti',false,0)`);
DB(`insert into "MenuItem"(id,"groupId",name,"priceCents","sortOrder","updatedAt","allergensReviewed") values ('itm_test_blk','grp_test_blk','Piatto prova',900,0,now(),true)`);
if (process.env.E2E_PROD) await new Promise((resolve) => setTimeout(resolve, 2000));
await pub.goto(`${BASE}/menu/p/${slug}`, { waitUntil: "networkidle", timeout: 120000 });
const evText = (await pub.locator("body").innerText()).replace(/\u00a0/g, " ");
check("evento: nel menù speciale compare il coperto", /coperto € 1,00/i.test(evText));
check("evento: la chiusura cucina non compare (deselezionata)", !/la cucina chiude/i.test(evText));
// duplica: la copia mostra gli stessi blocchi
await goTab(page, "Eventi e annunci");
await page.locator("nav[aria-label='Eventi e annunci'] button", { hasText: "Serata Prova" }).first().click();
await settle(600);
await goTab(page, "Eventi e annunci");
await page.getByRole("button", { name: "Duplica", exact: true }).first().click();
await dialog().waitFor();
await dialog().getByLabel("Titolo", { exact: true }).fill("Serata Prova bis");
await dialog().getByLabel("Inizio evento").fill(biz(0));
await dialog().getByLabel("Fine evento").fill(biz(1));
await dialog().getByRole("button", { name: "Duplica", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(2000);
const copySection = DB(`select id from "MenuSection" where "promoId" = (select id from "MenuPromo" where title='Serata Prova bis')`);
check("evento duplicato: la copia mostra gli stessi blocchi (solo il coperto)", DB(`select count(*) from "MenuBlock" where id='blk_cover' and '${copySection}' = any("sectionIds")`) === "1" && DB(`select count(*) from "MenuBlock" where id='blk_kitchen_note' and '${copySection}' = any("sectionIds")`) === "0");

// ---------- Layout responsivo
for (const [label, w, h] of [["390", 390, 844], ["768", 768, 1024], ["1280", 1280, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
await expandPanels(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`pannello @${label}: nessun overflow orizzontale`, overflow <= 0, `delta ${overflow}`);
  await panel().getByRole("button", { name: "+ Aggiungi" }).click();
  await dialog().waitFor();
  const o2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`foglio @${label}: nessun overflow orizzontale`, o2 <= 0, `delta ${o2}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/blocks-${label}.png` });
  await dialog().getByRole("button", { name: "Chiudi" }).click();
await discardIfAsked(dialog().page());
  await dialog().waitFor({ state: "detached" });
}

// ---------- Permessi
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mctx.newPage();
mp.setDefaultTimeout(60000);
await login(mp, "marta", EMP_PW);
await mp.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
await goTab(mp, "Orari e contatti");
check("permessi: Marta (con permesso) vede e può aggiungere informazioni", await mp.locator('section[aria-label="Informazioni del menù"]').getByRole("button", { name: "+ Aggiungi" }).isVisible());
const fctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const fp = await fctx.newPage();
await login(fp, "francesco", EMP_PW);
await fp.goto(`${BASE}/gestione-menu`, { waitUntil: "domcontentloaded", timeout: 120000 });
check("permessi: Francesco (senza permesso) non entra", new URL(fp.url()).pathname === "/mie-ore");

// pulizia: lo stato torna quello della migrazione
DB(`delete from "MenuItem" where id='itm_test_blk'`);
DB(`delete from "MenuGroup" where id='grp_test_blk'`);
DB(`delete from "MenuPromo"`);
resetBlocks();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
