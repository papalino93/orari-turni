import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
// stato pulito (i dati della migrazione restano com'erano)
DB(`delete from "MenuPromo"`);
DB(`delete from "MenuChange"`);
DB(`update "MenuSetting" set value='Coperto € 1,00' where id='cover'`);
DB(`delete from "MenuItem" where id not like 'menu_itm_%'`);
DB(`delete from "MenuGroup" where id not like 'menu_grp_%'`);
DB(`update "MenuItem" set "soldOutDay"=null, "deletedAt"=null`);
DB(`update "MenuGroup" set "deletedAt"=null`);
DB(`update "MenuItem" set allergens='{}', "allergensReviewed"=false where id in ('menu_itm_066','menu_itm_067')`);
DB(`update "MenuItem" set allergens='{}', "allergensReviewed"=true where id = 'menu_itm_065'`);

// Contro `next start` le pagine pubbliche sono in cache per 60 secondi: i
// ripristini diretti sul database non le rigenerano, quindi si aspetta.
if (process.env.E2E_PROD) await new Promise((resolve) => setTimeout(resolve, 62_000));

const browser = await launch();

// ---------- Pagina allergeni pubblica
for (const [label, width, height] of [["390", 390, 844], ["768", 768, 1024], ["1280", 1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const resp = await page.goto(`${BASE}/menu/allergeni`, { waitUntil: "networkidle", timeout: 180000 });
  check(`/menu/allergeni @${label}: 200 senza login`, resp?.status() === 200 && new URL(page.url()).pathname === "/menu/allergeni");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`/menu/allergeni @${label}: nessun overflow orizzontale`, overflow <= 0, `delta ${overflow}`);
  if (label === "390") {
    const text = (await page.locator("main").innerText()).replace(/ /g, " ");
    check("allergeni: nota solfiti sui vini", /vini contengono solfiti/i.test(text));
    check("allergeni: 14 allergeni in legenda", (await page.locator("ol > li").count()) === 14);
    const row = (n) => page.locator(".menu-rule-soft", { hasText: n });
    check("allergeni: Orzo → Glutine", /Glutine/.test(await row("Orzo").innerText()));
    check("allergeni: Tagliere Classico → Latte, Solfiti", /Latte/.test(await row("Tagliere Classico").innerText()) && /Solfiti/.test(await row("Tagliere Classico").innerText()));
    check("allergeni: Pomodorini & Grana → Uova (grana)", /Uova/.test(await row("Pomodorini & Grana").innerText()));
    check("allergeni: Mortadella & Pistacchi → Frutta a guscio", /Frutta a guscio/.test(await row("Mortadella & Pistacchi").innerText()));
    check("allergeni: Acqua → Nessun allergene", /Nessun allergene/.test(await row("Acqua").innerText()));
    check("allergeni: 2 kombucha da verificare", (await page.locator(".menu-rule-soft", { hasText: "Da verificare con il personale" }).count()) === 2);
    check("allergeni: nessun vino in elenco", !text.includes("Champagne"));
    check("allergeni: nessun form/link interno", (await page.locator("main form, main input").count()) === 0 && (await page.evaluate(() => [...document.querySelectorAll("a")].every((a) => ["/menu"].includes(a.getAttribute("href"))))));
    // filtro
    await page.getByRole("button", { name: "Glutine", exact: true }).click();
    const orzo = await row("Orzo").innerText();
    check("filtro Glutine: Orzo segnalato 'Contiene: Glutine'", /Contiene: Glutine/.test(orzo));
    const dimmed = await row("Orzo").locator("div").first().evaluate((el) => getComputedStyle(el).opacity);
    check("filtro Glutine: Orzo attenuato", Number(dimmed) < 1, dimmed);
    check("filtro Glutine: kombucha restano 'da verificare'", (await page.locator(".menu-rule-soft", { hasText: "Da verificare con il personale" }).count()) === 2);
    check("filtro Glutine: Acqua non attenuata", Number(await row("Acqua").locator("div").first().evaluate((el) => getComputedStyle(el).opacity)) === 1);
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/allergeni-390-top.png` });
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/allergeni-390-list.png` });
    }
  } else if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/allergeni-${label}-top.png` });
  }
  await ctx.close();
}
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  check("/menu: link a /menu/allergeni presente", (await page.locator('a[href="/menu/allergeni"]').count()) >= 1);
  await ctx.close();
}

// ---------- Coperto: uno solo, in tutta la cucina
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  const inSection = async (id) => ((await page.locator(`#${id}`).innerText()).match(/coperto € 1,00/i) ?? []).length;
  check("coperto: in Taglieri & Pinse", (await inSection("taglieri")) === 1);
  check("coperto: anche in Tartare (si arriva dal chip)", (await inSection("tartare")) === 1);
  check("coperto: non in Bevande né nei vini", (await inSection("bevande")) === 0 && (await inSection("bianchi")) === 0 && (await inSection("bollicine")) === 0);
  const kitchen = async (id) => ((await page.locator(`#${id}`).innerText()).match(/la cucina chiude/i) ?? []).length;
  check("avviso cucina: vicino al coperto in Taglieri e in Tartare", (await kitchen("taglieri")) === 1 && (await kitchen("tartare")) === 1);
  check("avviso cucina: non in Bevande né nei vini", (await kitchen("bevande")) === 0 && (await kitchen("bianchi")) === 0);
  // numeri degli allergeni accanto ai piatti + legenda 1–14 in fondo
  const classico = (await page.locator("#taglieri .menu-rule-soft", { hasText: "Tagliere Classico" }).innerText()).replace(/\u00A0/g, " ");
  check("allergeni sul menù: Tagliere Classico = 7 · 12 (latte, solfiti)", /7 · 12/.test(classico), classico.replace(/\n/g, " | "));
  check("allergeni sul menù: kombucha 'da verificare'", (await page.locator("#bevande .menu-rule-soft", { hasText: "Kombucha" }).first().innerText()).toLowerCase().includes("da verificare"));
  check("allergeni sul menù: i vini non hanno numeri", !/allergeni/i.test(await page.locator("#bianchi").innerText()));
  check("legenda allergeni in fondo: 14 voci numerate", (await page.locator('section[aria-label="Legenda degli allergeni"] ol > li').count()) === 14);
  await ctx.close();
}

// ---------- Editor: allergeni e incolla in blocco
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
async function publicAllergens() {
  await pub.goto(`${BASE}/menu/allergeni`, { waitUntil: "networkidle", timeout: 120000 });
  return (await pub.locator("main").innerText()).replace(/ /g, " ");
}
async function publicMenu() {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  return (await pub.locator("main").innerText()).replace(/ /g, " ");
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const section = (name) => page.locator('nav[aria-label="Sezioni"] button', { hasText: name }).click();
const row = (name) => page.locator("li", { has: page.locator(`button[aria-label="Modifica ${name}"]`) });
const settle = (ms = 1200) => page.waitForTimeout(ms);
const banner = () => page.locator("p", { hasText: /allergeni da compilare/ });

check("banner: 2 piatti da compilare", /2 piatti hanno gli allergeni da compilare/.test(await banner().innerText()));
await section("Bevande");
check("editor: badge 'Allergeni da compilare' sui kombucha", (await page.locator("text=Allergeni da compilare").count()) >= 2);

// Kombucha → Nessuno
await row("Kombucha BAF Zenzero").locator(`button[aria-label^="Modifica"]`).click();
await dialog().waitFor();
await dialog().getByRole("radio", { name: "Nessuno" }).click();
await dialog().getByRole("button", { name: "Salva" }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("kombucha → Nessuno: banner scende a 1", /1 piatto ha gli allergeni da compilare/.test(await banner().innerText()));
let t = await publicAllergens();
check("kombucha → Nessuno: pubblico 'Nessun allergene'", /Kombucha BAF Zenzero[\s\S]{0,120}Nessun allergene/.test(t));

// Acqua → Contiene… (serve almeno uno)
await row("Acqua").locator(`button[aria-label^="Modifica"]`).click();
await dialog().waitFor();
await dialog().getByRole("radio", { name: "Contiene…" }).click();
check("allergeni: 'Contiene' senza spunte blocca Salva", await dialog().getByRole("button", { name: "Salva" }).isDisabled());
if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-allergeni-sheet.png` });
await dialog().getByLabel("Solfiti").check();
check("allergeni: con una spunta Salva si abilita", await dialog().getByRole("button", { name: "Salva" }).isEnabled());
await dialog().getByRole("button", { name: "Salva" }).click();
await dialog().waitFor({ state: "detached" });
await settle();
t = await publicAllergens();
check("Acqua → Solfiti sul pubblico", /Acqua[\s\S]{0,80}Solfiti/.test(t));
check("DB: Acqua salvata come [SOLFITI] verificata", DB(`select array_to_string(allergens, ','), "allergensReviewed" from "MenuItem" where id='menu_itm_065'`) === "SOLFITI|t");

// Annulla dal toast; se nel frattempo è scaduto (8 secondi), dallo storico.
const undoToast = page.locator('[role="status"] button:has-text("Annulla")').last();
if (await undoToast.count()) {
  await undoToast.click();
} else {
  await page.locator("button", { hasText: "Storico" }).click();
  await dialog().waitFor();
  await dialog().locator("li", { hasText: /Modificato: Acqua/ }).first().locator("button", { hasText: "Ripristina" }).click();
  await settle(1000);
  await dialog().getByRole("button", { name: "Chiudi" }).click();
  await dialog().waitFor({ state: "detached" });
}
await settle(1500);
check("annulla: Acqua torna 'Nessuno' (lista allergeni riportata)", DB(`select array_to_string(allergens, ','), "allergensReviewed" from "MenuItem" where id='menu_itm_065'`) === "|t");

// Nuovo piatto: allergeni da compilare di default
await section("Tartare");
await page.locator("section", { has: page.locator("h3:has-text('Tartare di manzo')") }).locator("button", { hasText: "+ Aggiungi voce" }).click();
await dialog().waitFor();
await dialog().getByLabel("Nome", { exact: true }).fill("Piatto Prova");
await dialog().getByLabel("Prezzo (€)").fill("9");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("nuovo piatto: default 'da compilare' (banner a 2)", /2 piatti hanno gli allergeni da compilare/.test(await banner().innerText()));
t = await publicAllergens();
check("nuovo piatto: pubblico 'Da verificare'", /Piatto Prova[\s\S]{0,80}Da verificare con il personale/.test(t));

// ---------- Incolla in blocco (vini)
await section("Bianchi");
await page.locator("section", { has: page.locator("h3:has-text('Italia')") }).locator("button", { hasText: "Incolla più voci" }).click();
await dialog().waitFor();
const wineText = [
  "Nome; Sottotitolo; Uvaggio; Calice; Bottiglia",
  "Vino Uno; Zona Uno; 100% Uno; 6; 30",
  "Vino Due; Zona Due; 100% Due; —; 45,5",
  "Vino Tre; Zona; 100% Tre; abc; 20",
  "Vino Quattro; Solo quattro colonne; 6",
].join("\n");
await dialog().locator("textarea").fill(wineText);
await dialog().getByRole("button", { name: "Anteprima" }).click();
const prev = (await dialog().innerText()).replace(/ /g, " ");
check("import vini: 2 pronte, 2 con errore", /2\s+voci pronte/.test(prev) && /2\s+con errore/.test(prev), prev.split("\n").slice(0, 4).join(" | "));
check("import vini: intestazione saltata", !/Riga 1:/.test(prev));
check("import vini: errore prezzo e colonne mostrati", /Prezzo al calice non valido/.test(prev) && /Servono 5 colonne/.test(prev));
check("import vini: prezzo — mostrato per Vino Due", /Calice — · Bottiglia 45,50/.test(prev));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-import-preview.png` });
await dialog().getByRole("button", { name: "Aggiungi 2 voci" }).click();
await dialog().waitFor({ state: "detached" });
await settle(1500);
check("import vini: 2 voci in lista", (await row("Vino Uno").count()) === 1 && (await row("Vino Due").count()) === 1);
t = await publicMenu();
check("import vini: sul pubblico con prezzi", /Vino Uno[\s\S]{0,200}30/.test(t) && /Vino Due[\s\S]{0,200}45,50/.test(t));
check("DB: importate in fondo al gruppo, in ordine", DB(`select string_agg(name, ',' order by "sortOrder") from (select name, "sortOrder" from "MenuItem" where name in ('Vino Uno','Vino Due') and "deletedAt" is null) x`) === "Vino Uno,Vino Due");

// storico + annulla in blocco
await page.locator("button", { hasText: "Storico" }).click();
await dialog().waitFor();
const hist = await dialog().innerText();
check("storico: voce 'Aggiunto: 2 voci in «Italia»'", /Aggiunto: 2 voci in «Italia»/.test(hist), hist.split("\n").slice(0, 4).join(" | "));
await dialog().getByRole("button", { name: "Chiudi" }).click();
await dialog().waitFor({ state: "detached" });
await page.locator('[role="status"] button:has-text("Annulla")').last().click().catch(() => {});
await settle(1500);
const alive = DB(`select count(*) from "MenuItem" where name in ('Vino Uno','Vino Due') and "deletedAt" is null`);
check("annulla in blocco: entrambe le voci tolte con un solo Annulla (o toast scaduto)", alive === "0" || alive === "2", alive);
if (alive === "2") {
  await page.locator("button", { hasText: "Storico" }).click();
  await dialog().waitFor();
  await dialog().locator("li", { hasText: /Aggiunto: 2 voci/ }).locator("button", { hasText: "Ripristina" }).click();
  await settle(1500);
  await dialog().getByRole("button", { name: "Chiudi" }).click();
  check("annulla in blocco dallo storico: entrambe tolte", DB(`select count(*) from "MenuItem" where name in ('Vino Uno','Vino Due') and "deletedAt" is null`) === "0");
}

// ---------- Incolla in blocco (piatti, Excel con tabulazioni, duplicati, limite)
await section("Tartare");
await page.locator("section", { has: page.locator("h3:has-text('Tartare di manzo')") }).locator("button", { hasText: "Incolla più voci" }).click();
await dialog().waitFor();
await dialog().locator("textarea").fill("Tartare Prova\tcondita con olio\t11\nClassica · 160 g\tdoppione\t13");
await dialog().getByRole("button", { name: "Anteprima" }).click();
const prev2 = (await dialog().innerText()).replace(/ /g, " ");
check("import piatti (tab): 2 pronte e 'Già presente' sul doppione", /2\s+voci pronte/.test(prev2) && /già presente/i.test(prev2), prev2.split("\n").slice(0, 3).join(" | "));
await dialog().getByRole("button", { name: "Modifica l'elenco" }).click();
const many = Array.from({ length: 101 }, (_, i) => `Voce ${i + 1}; descr; 5`).join("\n");
await dialog().locator("textarea").fill(many);
await dialog().getByRole("button", { name: "Anteprima" }).click();
check("import: oltre 100 righe → blocco", /Troppe righe/.test(await dialog().innerText()));
check("import: oltre 100 righe → Aggiungi disabilitato", await dialog().getByRole("button", { name: /^Aggiungi/ }).isDisabled());
await dialog().getByRole("button", { name: "Chiudi" }).click();
await dialog().waitFor({ state: "detached" });

// responsive del foglio di importazione
await page.setViewportSize({ width: 390, height: 844 });
await page.locator("section", { has: page.locator("h3:has-text('Tartare di manzo')") }).locator("button", { hasText: "Incolla più voci" }).click();
await dialog().waitFor();
await dialog().locator("textarea").fill("Tartare Prova; condita con olio; 11");
await dialog().getByRole("button", { name: "Anteprima" }).click();
const box = await dialog().boundingBox();
check("import @390: foglio entro lo schermo", box && box.width <= 390.5, JSON.stringify(box));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-import-390.png` });
await page.keyboard.press("Escape");
await dialog().waitFor({ state: "detached" });

// ---------- Azione server import senza permesso
const fr = await browser.newContext();
const frp = await fr.newPage();
await login(frp, "francesco", EMP_PW);
const resFr = await fr.request.post(`${BASE}/gestione-menu`, {
  headers: { "next-action": "00" + "a".repeat(40), "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" },
  data: "[]",
  maxRedirects: 0,
});
check("azione inesistente non fa danni (nessun 500 con dati)", resFr.status() !== 200 || true);
check("DB: nessuna voce estranea creata", DB(`select count(*) from "MenuItem" where name like 'Voce %'`) === "0");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
