// Modalità servizio: elenco unico per «Esaurito», interruttori grandi, conferma
// per «Riattiva tutto», annulla, permessi.
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" }, maxBuffer: 1 << 26 }).toString().trim();
const clean = () => {
  DB(`update "MenuItem" set "soldOutDay"=null, "deletedAt"=null`);
  DB(`delete from "MenuChange"`);
  DB(`delete from "MenuPromo"`);
  DB(`delete from "MenuItem" where "groupId" in ('menu_grp_oggi_piatti','menu_grp_oggi_vini')`);
  DB(`update "Employee" set "canEditMenu"=true where username='marta'`);
  DB(`update "Employee" set "canEditMenu"=false where username='francesco'`);
};
clean();
const today = DB(`select to_char((now() at time zone 'Europe/Rome') - interval '5 hours','YYYY-MM-DD')`);
DB(`insert into "MenuItem" ("id","groupId","name","description","priceCents","allergens","allergensReviewed","onlyDay","sortOrder","updatedAt") values ('svc_d1','menu_grp_oggi_piatti','Risotto del servizio','Riso e porcini',1400,'{}',true,'${today}',0,now())`);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
check("gestione: link «Modalità servizio» nell'intestazione", (await page.getByRole("link", { name: "Modalità servizio" }).count()) === 1);
// L'interruttore del tema nell'intestazione è anch'esso un «switch»: si contano solo quelli del contenuto.
const switches = () => page.locator("main").getByRole("switch");
await page.getByRole("link", { name: "Modalità servizio" }).click();
await page.waitForURL(/\/gestione-menu\/servizio/);
await switches().first().waitFor();
const settle = (ms = 1500) => page.waitForTimeout(ms);

const total = await switches().count();
const expected = Number(DB(`select count(*) from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where i."deletedAt" is null and g."deletedAt" is null and s."promoId" is null and (s."dailyOnly"=false or i."onlyDay"='${today}')`));
check("elenco: tutte le voci, compresa «Oggi fuori menù»", total === expected, `${total}/${expected}`);
const places = await page.locator("main h2").allInnerTexts();
check("elenco: «Oggi fuori menù» in cima", /oggi fuori menù/i.test(places[0] ?? ""), places.slice(0, 3).join(" | "));
check("elenco: nessun pulsante di modifica per sbaglio", (await page.getByRole("button", { name: /modifica|elimina|sposta/i }).count()) === 0);

const boxes = await switches().evaluateAll((els) => els.slice(0, 20).map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
check("interruttori grandi (≥ 64×40 px)", boxes.every(([w, h]) => w >= 64 && h >= 40), JSON.stringify(boxes[0]));
const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("servizio @390: nessun overflow orizzontale", ov <= 0, String(ov));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/servizio-390.png` });

// Segna esaurito un vino
const wine = "Aquila del Torre";
const first = page.getByRole("switch", { name: `${wine}: esaurito` }).first();
await first.click();
await settle();
check("esaurito: l'interruttore risulta acceso", (await first.getAttribute("aria-checked")) === "true");
check("esaurito: salvato sul database", Number(DB(`select count(*) from "MenuItem" where name='${wine}' and "soldOutDay"='${today}'`)) >= 1);
check("esaurito: il contatore sale a 1", /1 voce esaurita/.test(await page.locator("main").innerText()));
// il vino esaurito sparisce dal menù dei clienti
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
const rows = await pub.locator(`#bianchi .menu-rule-soft`, { hasText: "Aquila del Torre" }).count();
check("esaurito: il vino sparisce dal menù dei clienti (uno dei due)", rows <= 1, String(rows));

// Annulla dal toast
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(1800);
check("annulla: l'interruttore torna spento", (await first.getAttribute("aria-checked")) === "false");
check("annulla: tolto dal database", Number(DB(`select count(*) from "MenuItem" where name='${wine}' and "soldOutDay" is not null`)) === 0);

// Filtri
await page.getByRole("tab", { name: "Piatti" }).click();
const wineSwitchesInFood = await page.getByRole("switch", { name: /Champagne Henriot/ }).count();
check("filtro «Piatti»: niente vini", wineSwitchesInFood === 0 && (await switches().count()) > 0);
await page.getByRole("tab", { name: "Vini" }).click();
check("filtro «Vini»: niente piatti", (await page.getByRole("switch", { name: /Tagliere Classico/ }).count()) === 0 && (await switches().count()) > 20);
await page.getByRole("tab", { name: "Tutto" }).click();

// Ricerca
const search = page.getByRole("searchbox", { name: "Cerca nell'elenco del servizio" });
await search.fill("schloss");
await settle(300);
check("ricerca: «schloss» trova un solo vino", (await switches().count()) === 1);
await search.fill("zzzzqq");
await settle(300);
check("ricerca: nessuna voce lo dice", /nessuna voce trovata/i.test(await page.locator("main").innerText()));
await search.fill("");

// Esauriti + Riattiva tutto con conferma
for (const n of ["Tagliere Classico", "Champagne Henriot", "Acqua"]) {
  await page.getByRole("switch", { name: `${n}: esaurito` }).first().click();
  await settle(900);
}
check("esauriti: contatore a 3", /3 voci esaurite/.test(await page.locator("main").innerText()));
await page.getByRole("tab", { name: /^Esauriti/ }).click();
check("filtro «Esauriti»: mostra solo le 3 voci", (await switches().count()) === 3);
await page.getByRole("tab", { name: "Tutto" }).click();
const resetBtn = page.getByRole("button", { name: /^Riattiva tutto$/ });
await resetBtn.click();
check("riattiva tutto: serve una seconda conferma", (await page.getByRole("button", { name: /^Confermi\? Riattiva 3 voci$/ }).count()) === 1);
check("riattiva tutto: finché non si conferma nulla cambia", Number(DB(`select count(*) from "MenuItem" where "soldOutDay"='${today}'`)) === 3);
await page.getByRole("button", { name: /^Confermi\? Riattiva 3 voci$/ }).click();
await settle(1800);
check("riattiva tutto: azzera le tre voci", Number(DB(`select count(*) from "MenuItem" where "soldOutDay" is not null`)) === 0);
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(1800);
check("riattiva tutto → annulla: le tre voci tornano esaurite", Number(DB(`select count(*) from "MenuItem" where "soldOutDay"='${today}'`)) === 3);
check("storico: le azioni sono registrate", Number(DB(`select count(*) from "MenuChange" where action in ('SOLD_OUT','AVAILABLE','RESET_SOLD_OUT','RESTORE')`)) >= 6);

// Torna alla gestione
await page.getByRole("link", { name: "Esci dal servizio" }).click();
await page.waitForURL((u) => u.pathname === "/gestione-menu");
check("esci dal servizio: si torna alla gestione", true);

// Permessi
for (const [user, expected] of [["marta", true], ["francesco", false]]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.setDefaultTimeout(60000);
  await login(p, user, EMP_PW);
  await p.goto(`${BASE}/gestione-menu/servizio`, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (expected) {
    await p.locator("main").getByRole("switch").first().waitFor();
    check(`permessi: ${user} (con permesso) usa il servizio`, true);
  } else {
    check(`permessi: ${user} (senza permesso) non entra`, new URL(p.url()).pathname === "/mie-ore", p.url());
  }
  await c.close();
}
const anon = await (await browser.newContext()).newPage();
await anon.goto(`${BASE}/gestione-menu/servizio`, { waitUntil: "domcontentloaded" });
check("senza login: si va al login", new URL(anon.url()).pathname.startsWith("/login"), anon.url());

clean();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
