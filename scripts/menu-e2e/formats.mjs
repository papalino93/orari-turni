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
await card.getByLabel("Formato 1", { exact: true }).fill("0,2 l");
check("un solo formato: «Salva formati» spento", await card.getByRole("button", { name: "Salva formati" }).isDisabled());
await card.getByLabel("Formato 2").fill("0,4 l");
await card.getByLabel("Formato 3", { exact: true }).fill("1 l");
await card.getByRole("button", { name: "Salva formati" }).click();
await p.waitForTimeout(1500);
check("DB: formati salvati sul gruppo", DB(`select formats::text from "MenuGroup" where id='${GROUP}'`) === '["0,2 l", "0,4 l", "1 l"]', DB(`select formats::text from "MenuGroup" where id='${GROUP}'`));
check("gestione: il pulsante mostra i formati", /Formati: 0,2 l · 0,4 l · 1 l/.test(await card.innerText()));

await card.getByRole("button", { name: "+ Aggiungi voce" }).click();
const dlg = p.locator('[role="dialog"]');
await dlg.waitFor();
check("scheda: una casella per formato, niente prezzo singolo", (await dlg.getByLabel("Prezzo 0,2 l (€)").count()) === 1 && (await dlg.getByLabel("Prezzo (€)").count()) === 0);
await dlg.getByLabel("Nome", { exact: true }).fill("Birra Prova Helles");
await dlg.getByLabel("Descrizione").fill("Paulaner · Helles · 4,9% vol.");
await dlg.getByLabel("Prezzo 0,2 l (€)").fill("3,5");
await dlg.getByLabel("Prezzo 0,4 l (€)").fill("6");
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
const firstSingle = DB(`select name||'|'||"priceCents" from "MenuItem" where "groupId"='${GROUP}' and "deletedAt" is null and "textOnly"=false and variants is null and "priceCents" is not null order by "sortOrder" limit 1`);
if (firstSingle) {
  const [singleName, cents] = firstSingle.split("|");
  const euros = String(Number(cents) / 100).replace(".", ",");
  const rx = new RegExp(`${singleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^—]{0,40}?\\b${euros}\\b`);
  check("menù: una voce a prezzo unico nel gruppo con i formati mostra il suo prezzo", rx.test(sec) && !new RegExp(`${singleName}\\s*—\\s*—`).test(sec), sec.slice(sec.indexOf(singleName), sec.indexOf(singleName) + 60));
}

// Tabella prezzi: una casella per formato
await p.getByRole("toolbar", { name: "Strumenti del menù" }).getByRole("button", { name: "Tabella prezzi" }).click();
const dlg2 = p.locator('[role="dialog"]');
await dlg2.getByRole("button", { name: "Bevande", exact: true }).click();
check("tabella prezzi: colonne dei formati", (await dlg2.getByLabel("Prezzo · Birra Prova Helles · 1 l").count()) === 1);
await dlg2.getByLabel("Prezzo · Birra Prova Helles · 1 l").fill("10");
await dlg2.getByRole("button", { name: "Salva tutto" }).click();
await p.waitForTimeout(1500);
check("tabella prezzi: formato aggiunto dalla colonna", DB(`select variants::text from "MenuItem" where name='Birra Prova Helles'`) === '[{"cents": 350, "label": "0,2 l"}, {"cents": 600, "label": "0,4 l"}, {"cents": 1000, "label": "1 l"}]', DB(`select variants::text from "MenuItem" where name='Birra Prova Helles'`));
await p.keyboard.press("Escape");
await dlg2.waitFor({ state: "detached" }).catch(() => {});

// Incolla più voci: un prezzo per formato
await card.getByRole("button", { name: "Incolla più voci" }).click();
const dlg3 = p.locator('[role="dialog"]');
check("incolla: colonne con i formati del gruppo", /Nome; Descrizione; 0,2 l; 0,4 l; 1 l/.test(await dlg3.innerText()));
await dlg3.locator("textarea").fill("Birra Prova Dunkel; Scura · 5% vol.; 4; 7; ");
await dlg3.getByRole("button", { name: "Anteprima" }).click();
check("incolla: anteprima con i formati", /0,2 l 4\s*·\s*0,4 l 7\s*·\s*1 l —/.test(await dlg3.innerText()));
await dlg3.getByRole("button", { name: "Aggiungi 1 voce" }).click();
await p.waitForTimeout(1500);
check("incolla: prezzi salvati per formato", DB(`select variants::text from "MenuItem" where name='Birra Prova Dunkel'`) === '[{"cents": 400, "label": "0,2 l"}, {"cents": 700, "label": "0,4 l"}]', DB(`select variants::text from "MenuItem" where name='Birra Prova Dunkel'`));

await card.getByRole("button", { name: /^Formati/ }).click();
await card.getByRole("button", { name: "Togli i formati" }).click();
await p.waitForTimeout(1200);
check("togli i formati: gruppo normale", DB(`select coalesce(formats::text,'null') from "MenuGroup" where id='${GROUP}'`) === "null");
await p.locator('[role="status"] button:has-text("Annulla")').last().click();
await p.waitForTimeout(1500);
check("annulla: formati di nuovo sul gruppo", DB(`select formats::text from "MenuGroup" where id='${GROUP}'`) === '["0,2 l", "0,4 l", "1 l"]');

// Prima birra di un gruppo nuovo: «Più formati», formati con un tocco e
// «Stessi formati per tutto il gruppo» → i formati diventano quelli del gruppo.
DB(`update "MenuGroup" set "deletedAt"=now() where title='Spina Prova'`);
await p.reload({ waitUntil: "networkidle" });
await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Bevande" }).click();
await p.getByRole("button", { name: "+ Aggiungi gruppo" }).click();
await p.getByPlaceholder("Nome del gruppo (es. Vini dolci)").fill("Spina Prova");
await p.getByRole("button", { name: "Aggiungi", exact: true }).click();
await p.waitForTimeout(1500);
const spina = p.locator("section", { has: p.locator("h3", { hasText: "Spina Prova" }) }).first();
await spina.getByRole("button", { name: "+ Aggiungi voce" }).click();
await dlg.waitFor();
await dlg.getByRole("radio", { name: "Più formati" }).click();
const lw = await dlg.getByLabel("Formato 1", { exact: true }).evaluate((e) => e.getBoundingClientRect().width);
const pw = await dlg.getByLabel("Prezzo del formato 1").evaluate((e) => e.getBoundingClientRect().width);
check("scheda: casella del formato larga, prezzo stretto", lw > pw && pw >= 90, `${lw} / ${pw}`);
for (const f of ["0,2 l", "0,4 l", "1 l"]) await dlg.getByRole("button", { name: f, exact: true }).click();
check("formati veloci: riempiono le righe", (await dlg.getByLabel("Formato 1", { exact: true }).inputValue()) === "0,2 l" && (await dlg.getByLabel("Formato 3", { exact: true }).inputValue()) === "1 l");
await dlg.getByLabel("Nome", { exact: true }).fill("Birra Prova Weisse");
await dlg.getByLabel("Prezzo del formato 1").fill("3,5");
await dlg.getByLabel("Prezzo del formato 2").fill("6");
await dlg.getByLabel("Prezzo del formato 3").fill("11");
check("scheda: «Stessi formati per tutto il gruppo» acceso", await dlg.getByRole("checkbox", { name: /Stessi formati per tutto il gruppo/ }).isChecked());
await dlg.getByRole("radio", { name: "Nessuno" }).click();
await dlg.getByRole("button", { name: "Aggiungi", exact: true }).click();
await dlg.waitFor({ state: "detached" });
await p.waitForTimeout(1500);
check("DB: formati scritti sul gruppo", DB(`select formats::text from "MenuGroup" where title='Spina Prova' and "deletedAt" is null`) === '["0,2 l", "0,4 l", "1 l"]');
check("DB: prezzi della prima birra", DB(`select variants::text from "MenuItem" where name='Birra Prova Weisse'`) === '[{"cents": 350, "label": "0,2 l"}, {"cents": 600, "label": "0,4 l"}, {"cents": 1100, "label": "1 l"}]');
await spina.getByRole("button", { name: "+ Aggiungi voce" }).click();
await dlg.waitFor();
check("seconda birra: parte già con i prezzi per colonna", (await dlg.getByLabel("Prezzo 1 l (€)").count()) === 1 && (await dlg.getByRole("radio", { name: "Più formati" }).getAttribute("aria-checked")) === "true");
check("seconda birra: descrizione da birra", (await dlg.getByLabel("Descrizione").getAttribute("placeholder")).includes("Helles"));
await dlg.getByRole("button", { name: "Chiudi" }).first().click().catch(() => p.keyboard.press("Escape"));
DB(`update "MenuGroup" set "deletedAt"=now() where title='Spina Prova'`);
DB(`update "MenuGroup" set formats=null where id='${GROUP}'`);
DB(`delete from "MenuItem" where name like 'Birra Prova%'`);
DB(`delete from "MenuChange"`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
