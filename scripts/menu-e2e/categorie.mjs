// Categorie create dalla gestione (crea, rinomina, elimina, annulla), il riquadro in
// vetrina (caviale e tartufo bianco) e il promemoria degli allergeni che non conta gli
// eventi finiti o nascosti.
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, DB, resetBlocks, goTab, expandPanels } from "./lib.mjs";

const cleanup = () => {
  DB(`delete from "MenuSection" where title like 'Prova E2E%'`);
  DB(`delete from "MenuPromo" where slug like 'e2e-allergeni-%'`);
};
cleanup();
resetBlocks();
DB(`update "MenuSection" set "deletedAt"=null where slug='salatini'`);
DB(`delete from "MenuItem" where "groupId"='menu_grp_salatini'`);

const b = await launch();
const phone = await b.newPage({ viewport: { width: 390, height: 844 } });
phone.setDefaultTimeout(60000);
const openMenu = async () => {
  await phone.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 180000 });
  await phone.addStyleTag({ content: "nextjs-portal{display:none!important}" });
};
const navLabels = async () => (await phone.locator('nav[aria-label="Sezioni del menù"] a').allInnerTexts()).map((t) => t.trim().toLowerCase());
const vetrine = () => phone.locator("main, body").first().locator("div", { hasText: /^Su prenotazione/ });

// --- Menù dei clienti: vetrina e Salatini vuoti
await openMenu();
const body0 = await phone.locator("body").innerText();
check("menù: riquadro in vetrina «Su prenotazione · Caviale & Tartufo bianco»", /SU PRENOTAZIONE\s*Caviale & Tartufo bianco\s*◆?\s*Per prezzi e disponibilità chiedete al nostro personale\./i.test(body0));
const order = await phone.evaluate(() => {
  const c = document.getElementById("v-consigli");
  const v = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim().startsWith("Su prenotazione") && d.style.background);
  const nav = document.querySelector('nav[aria-label="Sezioni del menù"]');
  return { dopoConsigli: !c || !!(c.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING), primaDellaBarra: !!(v.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING) };
});
check("menù: la vetrina sta dopo «I consigli della casa» e prima della barra delle sezioni", order.dopoConsigli && order.primaDellaBarra, JSON.stringify(order));
check("menù: «Salatini» vuota non compare nella barra", !(await navLabels()).includes("salatini"));
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("menù: niente scorrimento laterale", overflow <= 0, String(overflow));
if (SHOTS) {
  await phone.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.textContent?.trim().startsWith("Su prenotazione") && d.style.background)?.scrollIntoView({ block: "center" }));
  await phone.waitForTimeout(500);
  await phone.screenshot({ path: `${SHOTS}/vetrina-telefono.png` });
}
void vetrine;

// --- Gestione: nuova categoria
const page = await b.newPage({ viewport: { width: 1280, height: 860 } });
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
const sheet = () => page.getByRole("dialog");
await page.getByRole("button", { name: "+ Nuova sezione" }).click();
await sheet().waitFor();
check("nuova categoria: di serie va prima delle Bevande", /Dopo «Salatini»/.test(await sheet().locator("select").evaluate((s) => s.options[s.selectedIndex].text)));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/categoria-nuova.png` });
await sheet().getByLabel("Nome").fill("Tartare");
await sheet().locator("select").selectOption({ label: "Dopo «Tartare»" });
await sheet().getByRole("button", { name: "Crea sezione" }).click();
await page.waitForTimeout(800);
check("nuova categoria: un nome già usato non passa", /C'è già una sezione «Tartare»/.test(await page.locator("body").innerText()));
await sheet().getByLabel("Nome").fill("Prova E2E");
await sheet().getByRole("button", { name: "Crea sezione" }).click();
await sheet().waitFor({ state: "detached" });
await page.waitForTimeout(1200);
const rows = DB(`select slug||':'||"sortOrder" from "MenuSection" where "promoId" is null and not "dailyOnly" and "deletedAt" is null order by "sortOrder"`).split("\n").map((r) => r.split(":")[0]);
check("nuova categoria: creata dopo Tartare, prima di Salatini", rows.indexOf("prova-e2e") === rows.indexOf("tartare") + 1 && rows.indexOf("salatini") === rows.indexOf("prova-e2e") + 1, rows.join(","));
check("nuova categoria: ha già un gruppo con lo stesso nome", DB(`select count(*) from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" where s.slug='prova-e2e' and g.title='Prova E2E'`) === "1");
await page.getByRole("heading", { name: "Prova E2E" }).waitFor({ timeout: 20000 }).catch(() => {});
if (SHOTS) await page.screenshot({ path: `${SHOTS}/categoria-creata.png` });
check("nuova categoria: si apre subito, con «+ Aggiungi una voce»", (await page.getByRole("heading", { name: "Prova E2E", exact: true }).count()) >= 1 && (await page.getByRole("button", { name: "+ Aggiungi una voce in «Prova E2E»" }).count()) === 1);

// «Riordina sezioni» sotto l'elenco: si apre già sull'ordine delle sezioni.
await page.getByRole("button", { name: "Riordina sezioni" }).click();
await sheet().waitFor();
const reorderText = await sheet().innerText();
check("«Riordina sezioni»: si apre sulle sezioni, con Prova E2E dopo Tartare", /Tartare[\s\S]*Prova E2E[\s\S]*Salatini[\s\S]*Bevande/.test(reorderText) && !/Nessuna voce/.test(reorderText), reorderText.replace(/\n/g, " | ").slice(0, 200));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/riordina-sezioni.png` });
await page.keyboard.press("Escape");
await sheet().waitFor({ state: "detached" });

// Vuota non si vede; con una voce sì
await openMenu();
check("menù: la categoria vuota non si vede", !(await navLabels()).includes("prova e2e"));
DB(`insert into "MenuItem"(id,"groupId",name,"priceCents","allergensReviewed","sortOrder","updatedAt") select 'e2e_cat_item', g.id, 'Olive E2E', 400, true, 0, now() from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" where s.slug='prova-e2e'`);
await openMenu();
check("menù: con una voce compare nella barra, dopo Tartare", (await navLabels()).join("|").includes("tartare|prova e2e"), (await navLabels()).join("|"));
check("menù: la sezione mostra «Cucina» e la voce", /CUCINA\s*Prova E2E[\s\S]*Olive E2E/i.test(await phone.locator("#prova-e2e").innerText()));

// --- Modifica categoria
await page.reload({ waitUntil: "networkidle" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.getByRole("navigation", { name: "Sezioni" }).getByRole("button", { name: /Prova E2E/ }).click();
await page.getByRole("button", { name: "Modifica sezione" }).click();
await sheet().waitFor();
await sheet().getByLabel("Nome").fill("Prova E2E bis");
await sheet().getByLabel("Riga piccola sopra al titolo").fill("Stuzzichini");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/categoria-modifica.png` });
await sheet().getByRole("button", { name: "Salva" }).click();
await sheet().waitFor({ state: "detached" });
await page.waitForTimeout(800);
check("modifica: nome, nome nella barra e riga sopra cambiati", DB(`select title||'|'||label||'|'||kicker from "MenuSection" where slug='prova-e2e'`) === "Prova E2E bis|Prova E2E bis|Stuzzichini");
await openMenu();
check("menù: si vede il nome nuovo con «Stuzzichini»", /STUZZICHINI\s*Prova E2E bis/i.test(await phone.locator("#prova-e2e").innerText()));

// --- Elimina e annulla
await page.getByRole("button", { name: "Modifica sezione" }).click();
await sheet().getByRole("button", { name: "Elimina sezione" }).click();
check("elimina: chiede conferma dicendo quante voci spariscono", /Eliminare «Prova E2E bis» con la sua voce\?/.test(await sheet().innerText()));
await sheet().getByRole("button", { name: "Sì, elimina" }).click();
await sheet().waitFor({ state: "detached" });
await page.waitForTimeout(500);
check("elimina: la categoria è eliminata (recuperabile)", DB(`select ("deletedAt" is not null)::text from "MenuSection" where slug='prova-e2e'`) === "true");
await openMenu();
check("menù: la categoria eliminata non si vede più", !(await navLabels()).some((l) => l.startsWith("prova e2e")));
// «Annulla» dallo storico (il toast nel frattempo è sparito).
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await goTab(page, "Strumenti");
await page.getByRole("list", { name: "Strumenti del menù" }).getByRole("button", { name: /^Storico/ }).click();
const entry = sheet().locator("li", { hasText: "Sezione «Prova E2E bis»" }).first();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/categoria-storico.png` });
await entry.getByRole("button", { name: "Ripristina" }).click();
await page.waitForTimeout(1500);
await page.keyboard.press("Escape");
await sheet().waitFor({ state: "detached" });
check("annulla: la categoria torna", DB(`select ("deletedAt" is null)::text from "MenuSection" where slug='prova-e2e'`) === "true");
await openMenu();
check("menù: tornata anche per i clienti", (await navLabels()).includes("prova e2e bis"));

// --- Riquadro in vetrina: nascondi e nuovo
await expandPanels(page);
const info = page.getByRole("region", { name: "Informazioni del menù" });
await info.getByRole("button", { name: /Modifica: Su prenotazione/ }).click();
await sheet().waitFor();
check("vetrina: nel foglio c'è l'anteprima", /Anteprima[\s\S]*Caviale & Tartufo bianco/.test(await sheet().innerText()));
await sheet().getByLabel("Nascondi per ora (non compare sul menù)").check();
await sheet().getByRole("button", { name: "Salva" }).click();
await sheet().waitFor({ state: "detached" });
await page.waitForTimeout(800);
await openMenu();
check("vetrina nascosta: sparisce dal menù", !/Caviale & Tartufo bianco/.test(await phone.locator("body").innerText()));
await info.getByRole("button", { name: /Modifica: Su prenotazione/ }).click();
await sheet().getByLabel("Nascondi per ora (non compare sul menù)").uncheck();
await sheet().getByRole("button", { name: "Salva" }).click();
await sheet().waitFor({ state: "detached" });
await info.getByRole("button", { name: "+ Aggiungi" }).click();
await sheet().getByRole("radio", { name: "Riquadro in vetrina" }).click();
await sheet().getByLabel("Titoletto (facoltativo)").fill("Ogni venerdì");
await sheet().getByRole("button", { name: "Aggiungi" }).click();
await page.waitForTimeout(600);
check("vetrina nuova: senza titolo non si salva", /Scrivi il titolo del riquadro/.test(await sheet().getByRole("alert").innerText().catch(() => "")));
await sheet().getByLabel("Titolo", { exact: true }).fill("Ostriche & Bollicine");
await sheet().getByRole("button", { name: "Aggiungi" }).click();
await sheet().waitFor({ state: "detached" });
await page.waitForTimeout(800);
await openMenu();
const body1 = await phone.locator("body").innerText();
check("vetrina: di nuovo visibile, e la nuova sotto", /Caviale & Tartufo bianco[\s\S]*OGNI VENERDÌ\s*Ostriche & Bollicine/i.test(body1));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/vetrina-gestione.png` });

// --- Allergeni: eventi finiti o nascosti non contano
DB(`delete from "MenuItem" where id='e2e_cat_item'`);
const missing = async () => {
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
  await goTab(page, "Menù");
  const t = await page.locator("body").innerText();
  const m = t.match(/(\d+) piatt[oi] ha(?:nno)? gli allergeni da compilare/) ?? (/1 piatto ha gli allergeni/.test(t) ? [0, "1"] : null);
  return m ? Number(m[1]) : 0;
};
const base = await missing();
const event = (slug, start, end, hidden) => {
  DB(`insert into "MenuPromo"(id,kind,slug,title,"showFrom","startDate","endDate",hidden,"updatedAt") values('${slug}','EVENT','${slug}','Evento ${slug}','${start}','${start}','${end}',${hidden},now())`);
  DB(`insert into "MenuSection"(id,slug,label,kicker,title,kind,"promoId") values('${slug}_s','${slug}','Evento','Evento','Evento','FOOD','${slug}')`);
  DB(`insert into "MenuGroup"(id,"sectionId",title) values('${slug}_g','${slug}_s','Piatti')`);
  DB(`insert into "MenuItem"(id,"groupId",name,"priceCents","updatedAt") values('${slug}_i','${slug}_g','Pretzel E2E',400,now())`);
};
event("e2e-allergeni-passato", "2026-10-01", "2026-10-02", false);
event("e2e-allergeni-passato-nascosto", "2026-10-01", "2026-10-02", true);
event("e2e-allergeni-futuro-nascosto", "2027-01-01", "2027-01-02", true);
check("allergeni: eventi finiti o nascosti non chiedono nulla", (await missing()) === base, `${base}`);
event("e2e-allergeni-futuro", "2027-01-01", "2027-01-02", false);
check("allergeni: un evento in programma e visibile sì (+1)", (await missing()) === base + 1);

cleanup();
resetBlocks();
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
