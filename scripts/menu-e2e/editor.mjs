import { discardIfAsked, launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW, DB, resetBlocks, expandPanels } from "./lib.mjs";

resetBlocks();
DB(`delete from \"MenuChange\"`);
DB(`delete from \"MenuItem\" where id not like 'menu_itm_%'`);
DB(`delete from \"MenuGroup\" where id not like 'menu_grp_%'`);
DB(`update \"MenuItem\" set \"soldOutDay\"=null, \"deletedAt\"=null`);
DB(`update \"MenuGroup\" set \"deletedAt\"=null`);
DB(`update \"Employee\" set \"canEditMenu\"=true where username='marta'`);
const browser = await launch();
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
async function publicText() {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  return (await pub.locator("main").innerText()).replace(/\u00A0/g, " ");
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await expandPanels(page);
check("editor: titolo Menù", await page.locator("h1:has-text('Menù')").count() === 1);
const chips = await page.locator('nav[aria-label="Sezioni"] button').allInnerTexts();
check("editor: 7 sezioni", chips.length === 7, chips.map((c) => c.replace(/\n/g, " ")).join("|"));

const toast = () => page.locator('[role="status"]').last();
const section = (name) => page.locator('nav[aria-label="Sezioni"] button', { hasText: name }).click();
const row = (name) => page.locator("li", { has: page.locator(`button[aria-label="Modifica ${name}"]`) });
const dialog = () => page.locator('[role="dialog"]');
async function settle(ms = 1200) { await page.waitForTimeout(ms); }

// ---- Esaurito: vino sparisce, piatto sbiadito
await section("Bianchi");
await settle(300);
let pressed = await row("Alberelli di Giodo").locator("button[aria-pressed]").getAttribute("aria-pressed");
check("vino disponibile all'inizio", pressed === "false");
await row("Alberelli di Giodo").locator("button[aria-pressed]").click();
await settle();
pressed = await row("Alberelli di Giodo").locator("button[aria-pressed]").getAttribute("aria-pressed");
check("esaurito: pulsante premuto subito", pressed === "true");
check("esaurito: toast con Annulla", (await page.locator('[role="status"] button:has-text("Annulla")').count()) > 0);
let t = await publicText();
check("pubblico: vino esaurito sparisce", !t.includes("Alberelli di Giodo"));

await section("Tartare");
await row("Classica · 160 g").locator("button[aria-pressed]").click();
await settle();
t = await publicText();
check("pubblico: piatto esaurito resta con etichetta Esaurito", t.includes("Classica · 160") && /Esaurito/i.test(t));
const faded = await pub.evaluate(() => {
  const el = [...document.querySelectorAll("main .menu-rule-soft")].find((e) => e.textContent.includes("Classica"));
  return el ? getComputedStyle(el).opacity : null;
});
check("pubblico: piatto esaurito sbiadito", faded !== null && Number(faded) < 1, String(faded));

await page.locator("button", { hasText: /Riattiva tutto \(2\)/ }).click();
await settle();
t = await publicText();
check("riattiva tutto: vino torna in menù", t.includes("Alberelli di Giodo"));
check("riattiva tutto: nessun Esaurito sul pubblico", !/Esaurito/i.test(t));
check("riattiva tutto: pulsante sparisce", (await page.locator("button", { hasText: /Riattiva tutto/ }).count()) === 0);

// ---- Aggiungi vino
await section("Bianchi");
await page.locator("section", { has: page.locator("h3:has-text('Italia')") }).locator("button", { hasText: "+ Aggiungi vino" }).click();
await dialog().waitFor();
await dialog().getByLabel("Azienda", { exact: true }).fill("Vino Prova");
await dialog().getByLabel("Denominazione").fill("Test");
await dialog().getByLabel("Annata").fill("2024");
await dialog().getByLabel("Uvaggio").fill("100% Prova");
await dialog().getByLabel("Regione", { exact: true }).fill("Toscana");
await dialog().getByLabel("Calice (€)").fill("6,5");
await dialog().getByLabel("Bottiglia (€)").fill("32");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-1280-sheet.png` });
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("aggiunta: vino in lista editor", (await row("Vino Prova").count()) === 1);
t = await publicText();
check("aggiunta: vino sul pubblico con prezzi 6,50 e 32", t.includes("Vino Prova") && t.includes("6,50") && /Vino Prova[\s\S]{0,200}32/.test(t));

// ---- Validazione
await page.locator("section", { has: page.locator("h3:has-text('Italia')") }).locator("button", { hasText: "+ Aggiungi vino" }).click();
await dialog().waitFor();
await dialog().getByLabel("Azienda", { exact: true }).fill("Senza prezzo");
await dialog().getByLabel("Regione", { exact: true }).fill("Toscana");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await settle(800);
check("validazione: serve almeno un prezzo", /almeno un prezzo/i.test(await toast().innerText()));
await dialog().getByLabel("Bottiglia (€)").fill("abc");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await settle(800);
check("validazione: prezzo non valido rifiutato", /non valido/i.test(await toast().innerText()));
await dialog().getByRole("button", { name: "Chiudi" }).click();
await discardIfAsked(dialog().page());
await dialog().waitFor({ state: "detached" });

// ---- Modifica
await row("Vino Prova").locator(`button[aria-label="Modifica Vino Prova"]`).click();
await dialog().waitFor();
await dialog().getByLabel("Bottiglia (€)").fill("34");
await dialog().getByRole("button", { name: "Salva" }).click();
await dialog().waitFor({ state: "detached" });
await settle();
t = await publicText();
check("modifica: prezzo bottiglia aggiornato a 34", /Vino Prova[\s\S]{0,200}34/.test(t));

// ---- Duplica
await row("Vino Prova").locator(`button[aria-label="Modifica Vino Prova"]`).click();
await dialog().waitFor();
await dialog().getByRole("button", { name: "Duplica", exact: true }).click();
await settle(2500);
check("duplica: si apre la copia, con l'avviso", /Copia da completare/.test(await dialog().innerText()) && /Questa è una copia di «Vino Prova»/.test(await dialog().innerText()));
await dialog().getByRole("button", { name: "Chiudi" }).click();
await discardIfAsked(dialog().page());
await dialog().waitFor({ state: "detached" });
check("duplica: due voci con lo stesso nome", (await page.locator(`button[aria-label="Modifica Vino Prova"]`).count()) === 2);

// ---- Elimina + annulla dal toast
await page.locator(`button[aria-label="Modifica Vino Prova"]`).first().click();
await dialog().waitFor();
await dialog().getByRole("button", { name: "Elimina voce" }).click();
await dialog().getByRole("button", { name: "Sì, elimina" }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("elimina: una sola copia rimasta", (await page.locator(`button[aria-label="Modifica Vino Prova"]`).count()) === 1);
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(1500);
check("annulla dal toast: copia tornata", (await page.locator(`button[aria-label="Modifica Vino Prova"]`).count()) === 2);

// ---- Storico + ripristina
await page.locator("button", { hasText: "Storico" }).click();
await dialog().waitFor();
const hist = await dialog().innerText();
check("storico: elenca le modifiche con autore", /Andrea/.test(hist) && /Vino Prova/.test(hist) && /esaurito/i.test(hist), hist.split("\n").slice(0, 6).join(" | "));
const modEntry = dialog().locator("li", { hasText: /Modificato: Vino Prova/ }).first();
check("storico: voce 'Modificato' presente", (await modEntry.count()) === 1);
await modEntry.locator("button", { hasText: "Ripristina" }).click();
await settle(1500);
t = await publicText();
const prices = DB(`select "priceBottleCents" from "MenuItem" where name='Vino Prova' and "deletedAt" is null order by "sortOrder"`).split("\n");
check("storico: ripristino riporta l'originale a 32 (la copia resta a 34)", prices[0] === "3200" && prices[1] === "3400", prices.join(","));
check("storico: voce marcata Annullata", (await dialog().locator("li", { hasText: /Modificato: Vino Prova/ }).first().innerText()).includes("Annullata"));
await dialog().getByRole("button", { name: "Chiudi" }).click();
await discardIfAsked(dialog().page());

// ---- Gruppi
await page.locator("button", { hasText: "+ Aggiungi gruppo" }).click();
await page.getByPlaceholder(/Nome del gruppo/).fill("Vini dolci");
await page.locator("button", { hasText: /^Aggiungi$/ }).click();
await settle();
check("gruppo: creato", (await page.locator("h3", { hasText: "Vini dolci" }).count()) === 1);
const g = () => page.locator("section", { has: page.locator("h3:has-text('Vini dolci')") });
await g().locator('button[aria-label^="Rinomina"]').click();
const renameForm = page.locator("section:has(header form)");
await renameForm.locator("input").fill("Dolci");
await renameForm.locator("button", { hasText: "Salva" }).click();
await settle();
check("gruppo: rinominato", (await page.locator("h3", { hasText: /^Dolci/ }).count()) === 1);
const gd = () => page.locator("section", { has: page.locator("h3:has-text('Dolci')") });
await gd().locator("button", { hasText: "+ Aggiungi vino" }).click();
await dialog().waitFor();
await dialog().getByLabel("Azienda", { exact: true }).fill("Passito Prova");
await dialog().getByLabel("Regione", { exact: true }).fill("Sicilia");
await dialog().getByLabel("Calice (€)").fill("8");
await dialog().getByLabel("Bottiglia (€)").fill("");
await dialog().getByRole("button", { name: "Aggiungi", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
t = await publicText();
check("gruppo: titolo e vino nuovo sul pubblico, solo calice (—)", t.includes("DOLCI") || t.includes("Dolci"));
check("gruppo: vino senza bottiglia mostra —", /Passito Prova[\s\S]{0,120}—/.test(t));
await gd().locator('button[aria-label="Sposta gruppo su"]').click();
await settle();
const titles = await page.locator("h3").allInnerTexts();
check("gruppo: spostato su", titles.findIndex((x) => x.startsWith("Dolci")) < titles.findIndex((x) => x.startsWith("… dal mondo")), titles.join("|"));
await gd().locator('button[aria-label^="Elimina"]').click();
await gd().locator("button", { hasText: "Sì, elimina" }).click();
await settle();
check("gruppo: eliminato dall'editor", (await page.locator("h3", { hasText: /^Dolci/ }).count()) === 0);
t = await publicText();
check("gruppo: sparito dal pubblico (anche le sue voci)", !t.includes("Passito Prova"));
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(1500);
t = await publicText();
check("gruppo: annulla eliminazione lo ripristina con le voci", t.includes("Passito Prova"));

// ---- Testi della sezione
await page.getByRole("button", { name: "Modifica: Coperto € 1,00" }).click();
await dialog().waitFor();
await dialog().getByPlaceholder("1,00").fill("2,00");
await dialog().getByRole("button", { name: "Salva" }).click();
await dialog().waitFor({ state: "detached" });
await settle();
t = await publicText();
check("coperto: aggiornato una volta sola, compare in 2 sezioni di cucina", (t.match(/coperto € 2,00/gi) ?? []).length === 2, String((t.match(/coperto € 2,00/gi) ?? []).length));
check("DB: log storico popolato", Number(DB(`select count(*) from \"MenuChange\"`)) >= 10);

// ---- Layout responsivo dell'editor
for (const [label, w, h] of [["390", 390, 844], ["768", 768, 1024], ["1280", 1280, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  await section("Bianchi");
  await settle(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`editor @${label}: nessun overflow orizzontale`, overflow <= 0, `delta ${overflow}`);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main button, main a")]
      .map((b) => ({ t: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))
      .filter((b) => b.h > 0 && (b.h < 36 || b.w < 36) && !["Scopri come", "Chiudi"].includes(b.t)),
  );
  check(`editor @${label}: bersagli di tocco ≥ 36px`, small.length === 0, JSON.stringify(small.slice(0, 4)));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-${label}.png` });
}
await page.setViewportSize({ width: 390, height: 844 });
await row("Aquila del Torre").first().locator(`button[aria-label^="Modifica"]`).first().click();
await dialog().waitFor();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-390-sheet.png` });
const dlgBox = await dialog().boundingBox();
check("sheet @390: entra nello schermo in larghezza", dlgBox && dlgBox.width <= 390 + 0.5, JSON.stringify(dlgBox));
await page.keyboard.press("Escape");
await dialog().waitFor({ state: "detached" });
check("sheet: si chiude con Esc", true);
await page.setViewportSize({ width: 1280, height: 900 });

// ---- Permesso dipendente: revoca immediata + azione server bloccata
const martaCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const marta = await martaCtx.newPage();
await login(marta, "marta", EMP_PW);
await marta.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
check("marta con permesso: vede l'editor", new URL(marta.url()).pathname === "/gestione-menu");
const later = marta.locator("button", { hasText: "Ricordamelo più tardi" });
if (await later.count()) await later.click();

// cattura l'id dell'azione "esaurito" mentre Marta lavora, poi riusalo senza permesso
let actionId = null;
marta.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"] && !actionId) actionId = r.headers()["next-action"]; });
await marta.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
await marta.locator("li button[aria-pressed]").first().click();
await marta.waitForTimeout(1500);
check("marta con permesso: può segnare esaurito", Number(DB(`select count(*) from \"MenuItem\" where \"soldOutDay\" is not null`)) === 1);
await marta.locator("button", { hasText: /Riattiva tutto/ }).click();
await marta.waitForTimeout(1500);
check("marta: riattiva tutto", Number(DB(`select count(*) from \"MenuItem\" where \"soldOutDay\" is not null`)) === 0);

await page.goto(`${BASE}/dipendenti`, { waitUntil: "networkidle", timeout: 120000 });
const sw = page.locator(`button[role="switch"][aria-label="Può modificare il menù: ${DB(`select name from "Employee" where username='marta'`)}"]`);
check("dipendenti: interruttore menù presente e acceso per Marta", (await sw.getAttribute("aria-checked")) === "true");
await sw.click();
await settle();
check("dipendenti: interruttore spento", (await sw.getAttribute("aria-checked")) === "false");
await marta.goto(`${BASE}/gestione-menu`, { waitUntil: "domcontentloaded", timeout: 120000 });
check("revoca immediata: Marta rimandata a /mie-ore", new URL(marta.url()).pathname === "/mie-ore", marta.url());

// stessa azione server riusata da chi non ha più il permesso
const itemId = DB(`select id from \"MenuItem\" order by id limit 1`);
async function replay(requestCtx, label) {
  if (!actionId) { check(`${label}: id azione catturato`, false); return; }
  const res = await requestCtx.post(`${BASE}/gestione-menu`, {
    headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" },
    data: JSON.stringify([itemId, true]),
    maxRedirects: 0,
  });
  const body = await res.text();
  check(`${label}: azione rifiutata`, /permesso|login|Unauthorized/i.test(body) || res.status() >= 300, `status ${res.status()} ${body.slice(0, 80).replace(/\n/g, " ")}`);
}
await replay(martaCtx.request, "marta senza permesso");
const anon = await browser.newContext();
await replay(anon.request, "anonimo");
const fr = await browser.newContext();
const frp = await fr.newPage();
await login(frp, "francesco", EMP_PW);
await replay(fr.request, "francesco senza permesso");
check("DB invariato dopo i tentativi non autorizzati", Number(DB(`select count(*) from \"MenuItem\" where \"soldOutDay\" is not null`)) === 0);

// ripristina il permesso di Marta
await sw.click();
await settle();
check("dipendenti: interruttore riacceso", (await sw.getAttribute("aria-checked")) === "true");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
