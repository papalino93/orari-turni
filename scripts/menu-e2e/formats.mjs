// Formati del gruppo (birre alla spina 0,2 l · 0,4 l · 1 l): colonne sul gruppo,
// prezzi per colonna nella voce, tabella sul menù, casella vuota = «—», annulla.
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";

const GROUP = DB(`select g.id from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" where s.label='Bevande' and g."deletedAt" is null order by g."sortOrder" limit 1`);
const groupTitle = DB(`select title from "MenuGroup" where id='${GROUP}'`);
DB(`update "MenuGroup" set formats=null where id='${GROUP}'`);
DB(`delete from "MenuItem" where name like 'Birra Prova%'`);
DB(`delete from "MenuChange"`);
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Bevande" }).click();
const card = p.locator("section", { has: p.locator("h3", { hasText: groupTitle }) }).first();
await card.getByRole("button", { name: /^Formati/ }).click();
await card.getByLabel("Formato 1").fill("0,2 l");
check("un solo formato: «Salva formati» spento", await card.getByRole("button", { name: "Salva formati" }).isDisabled());
await card.getByLabel("Formato 2").fill("0,4 l");
await card.getByLabel("Formato 3").fill("1 l");
await card.getByRole("button", { name: "Salva formati" }).click();
await p.waitForTimeout(1500);
check("DB: formati salvati sul gruppo", DB(`select formats::text from "MenuGroup" where id='${GROUP}'`) === '["0,2 l", "0,4 l", "1 l"]', DB(`select formats::text from "MenuGroup" where id='${GROUP}'`));
check("gestione: il pulsante mostra i formati", /Formati: 0,2 l · 0,4 l · 1 l/.test(await card.innerText()));

await card.getByRole("button", { name: "+ Aggiungi voce" }).click();
const dlg = p.locator('[role="dialog"]');
await dlg.waitFor();
check("scheda: una casella per formato, niente prezzo singolo", (await dlg.getByLabel("0,2 l", { exact: true }).count()) === 1 && (await dlg.getByLabel("Prezzo (€)").count()) === 0);
await dlg.getByLabel("Nome", { exact: true }).fill("Birra Prova Helles");
await dlg.getByLabel("Descrizione").fill("Paulaner · Helles · 4,9% vol.");
await dlg.getByLabel("0,2 l", { exact: true }).fill("3,5");
await dlg.getByLabel("0,4 l", { exact: true }).fill("6");
await dlg.getByRole("radio", { name: "Contiene…" }).click();
await dlg.getByLabel("Glutine").check();
await dlg.getByRole("button", { name: "Aggiungi", exact: true }).click();
await dlg.waitFor({ state: "detached" });
await p.waitForTimeout(1200);
check("DB: prezzi salvati per formato (1 l vuoto)", DB(`select variants::text from "MenuItem" where name='Birra Prova Helles'`) === '[{"cents": 350, "label": "0,2 l"}, {"cents": 600, "label": "0,4 l"}]', DB(`select variants::text from "MenuItem" where name='Birra Prova Helles'`));

const pub = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
const sec = (await pub.locator("#bevande").innerText()).replace(/\s+/g, " ");
check("menù: intestazione con i formati", /0,2 l 0,4 l 1 l/.test(sec), sec.slice(0, 200));
check("menù: prezzi in colonna e «—» per il formato mancante", /Birra Prova Helles[\s\S]*?3,50\s*6\s*—/.test(sec), sec.slice(sec.indexOf("Birra Prova"), sec.indexOf("Birra Prova") + 120));
const ov = await pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("menù: niente scorrimento orizzontale a 390 px", ov <= 0, String(ov));

await card.getByRole("button", { name: /^Formati/ }).click();
await card.getByRole("button", { name: "Togli i formati" }).click();
await p.waitForTimeout(1200);
check("togli i formati: gruppo normale", DB(`select coalesce(formats::text,'null') from "MenuGroup" where id='${GROUP}'`) === "null");
await p.locator('[role="status"] button:has-text("Annulla")').last().click();
await p.waitForTimeout(1500);
check("annulla: formati di nuovo sul gruppo", DB(`select formats::text from "MenuGroup" where id='${GROUP}'`) === '["0,2 l", "0,4 l", "1 l"]');

DB(`update "MenuGroup" set formats=null where id='${GROUP}'`);
DB(`delete from "MenuItem" where name like 'Birra Prova%'`);
DB(`delete from "MenuChange"`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
