// «Abbinamento consigliato» sui piatti: gestione, menù dei clienti (tocco che
// porta al vino e «Torna a …»), vino esaurito o eliminato, annulla, duplica,
// campo assente dove non serve, permessi.
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, DB, goTab } from "./lib.mjs";

const WINE = "menu_itm_033"; // Mastrojanni, Rossi
const DISH = "menu_itm_051"; // Tagliere Classico
const clean = () => {
  DB(`update "MenuItem" set "pairWineId"=null`);
  DB(`update "MenuItem" set "soldOutDay"=null, "deletedAt"=null where id in ('${WINE}','${DISH}')`);
  DB(`delete from "MenuItem" where name='Tagliere Classico' and id<>'${DISH}'`);
  DB(`delete from "MenuItem" where "groupId" in ('menu_grp_oggi_piatti','menu_grp_oggi_vini')`);
  DB(`delete from "MenuChange"`);
  DB(`update "Employee" set "canEditMenu"=true where username='marta'`);
};
clean();

const browser = await launch();
const pub = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
const menu = async () => {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  await pub.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  return (await pub.locator("main").innerText()).replace(/ /g, " ");
};
const inView = (sel) =>
  pub.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight;
  });

let t = await menu();
check("partenza: nessun abbinamento sul menù", !/abbinamento consigliato/i.test(t));

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dialog = () => page.locator('[role="dialog"]');
const settle = (ms = 1500) => page.waitForTimeout(ms);
const section = async (name) => {
  await goTab(page, "Menù");
  await page.locator('nav[aria-label="Sezioni"] button', { hasText: name }).click();
};
const row = (name) => page.locator("li", { has: page.getByRole("button", { name: `Modifica ${name}`, exact: true }) });

// ---- Il vino non ha il campo dell'abbinamento
await section("Rossi");
await page.getByRole("button", { name: "Modifica Mastrojanni", exact: true }).click();
await dialog().waitFor();
check("vino: niente abbinamento nella scheda", (await dialog().getByLabel("Cerca un vino da abbinare").count()) === 0);
check("vino: nella scheda «Sta bene con» e «Consigliato dalla casa»", (await dialog().getByRole("group", { name: "Sta bene con" }).count()) === 1 && (await dialog().getByRole("checkbox", { name: /Consigliato/ }).count()) === 1);
await page.keyboard.press("Escape");
await dialog().waitFor({ state: "detached" });

// ---- Abbinamento sul piatto
await section("Taglieri");
await page.getByRole("button", { name: "Modifica Tagliere Classico", exact: true }).click();
await dialog().waitFor();
await dialog().getByLabel("Cerca un vino da abbinare").fill("montalcino rossi");
await settle(300);
const results1 = await dialog().locator("ul button").allInnerTexts();
check("piatto: la ricerca trova solo Mastrojanni dei Rossi", results1.length === 1 && /Mastrojanni/.test(results1[0]), results1.join(" | "));
await dialog().locator("ul button").first().click();
check("piatto: il vino scelto è in evidenza", (await dialog().getByRole("button", { name: "Togli l'abbinamento con Mastrojanni" }).count()) === 1);
check("piatto: la ricerca si chiude dopo la scelta", (await dialog().getByLabel("Cerca un vino da abbinare").count()) === 0);
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("piatto: nell'elenco «Abbinamento: Mastrojanni»", /Abbinamento: Mastrojanni/.test(await row("Tagliere Classico").innerText()));
check("piatto: salvato nel database", DB(`select "pairWineId" from "MenuItem" where id='${DISH}'`) === WINE);

t = await menu();
const box = pub.locator(`a[data-pair-from="${DISH}"]`);
check("menù: riquadro sotto il piatto", (await box.count()) === 1);
const boxText = (await box.innerText()).replace(/\s+/g, " ");
check("menù: titolo, nome e zona del vino", /Abbinamento consigliato/i.test(boxText) && /Mastrojanni/.test(boxText) && /Rosso di Montalcino/.test(boxText), boxText);
check("menù: prezzo al calice e alla bottiglia", /Calice ?8/.test(boxText) && /Bottiglia ?40/.test(boxText), boxText);
const bb = await box.boundingBox();
check("menù: riquadro toccabile (almeno 44 px)", bb && bb.height >= 44);
// I riquadri «Abbinamento consigliato» (con data-stat-k) sono sotto i piatti; i tocchi di «Sta bene con» sotto i vini sono un'altra cosa.
check("menù: un solo riquadro nel menù", (await pub.locator("a[data-pair-from][data-stat-k]").count()) === 1);

await box.scrollIntoViewIfNeeded();
await box.click();
await pub.waitForTimeout(900);
const back = pub.getByRole("button", { name: /Torna a «Tagliere Classico»/ });
check("tocco: il vino è sullo schermo", await inView(`#v-${WINE}`));
check("tocco: compare «Torna a «Tagliere Classico»»", (await back.count()) === 1);
check("tocco: il vino si illumina", await pub.locator(`#v-${WINE}`).evaluate((el) => el.classList.contains("menu-found")));
await back.click();
await pub.waitForTimeout(900);
check("ritorno: il piatto è di nuovo sullo schermo", await inView(`#v-${DISH}`));
check("ritorno: il pulsante sparisce", (await back.count()) === 0);

await box.click();
await pub.waitForTimeout(900);
await pub.evaluate(() => window.scrollBy(0, innerHeight * 3));
await pub.waitForTimeout(400);
check("lontano: scorrendo via il pulsante sparisce", (await back.count()) === 0);

// Testo grande: il riquadro resta dentro lo schermo
await pub.getByRole("button", { name: "Testo più grande" }).click();
await pub.waitForTimeout(300);
const overflow = await pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("testo grande: nessuno scorrimento orizzontale", overflow <= 0, String(overflow));
await pub.getByRole("button", { name: "Testo più grande" }).click();

// ---- Vino esaurito o eliminato
DB(`update "MenuItem" set "soldOutDay"=to_char((now() at time zone 'Europe/Rome') - interval '5 hours','YYYY-MM-DD') where id='${WINE}'`);
await menu();
check("vino esaurito: il riquadro sparisce", (await pub.locator(`a[data-pair-from="${DISH}"]`).count()) === 0);
DB(`update "MenuItem" set "soldOutDay"=null where id='${WINE}'`);
await menu();
check("vino di nuovo disponibile: il riquadro torna", (await pub.locator(`a[data-pair-from="${DISH}"]`).count()) === 1);

DB(`update "MenuItem" set "soldOutDay"=to_char((now() at time zone 'Europe/Rome') - interval '5 hours','YYYY-MM-DD') where id='${DISH}'`);
await menu();
check("piatto esaurito: niente riquadro", (await pub.locator(`a[data-pair-from="${DISH}"]`).count()) === 0);
DB(`update "MenuItem" set "soldOutDay"=null where id='${DISH}'`);

DB(`update "MenuItem" set "deletedAt"=now() where id='${WINE}'`);
await menu();
check("vino eliminato: il riquadro sparisce", (await pub.locator(`a[data-pair-from="${DISH}"]`).count()) === 0);
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await section("Taglieri");
check("vino eliminato: in elenco niente abbinamento", !/Abbinamento:/.test(await row("Tagliere Classico").innerText()));
await page.getByRole("button", { name: "Modifica Tagliere Classico", exact: true }).click();
await dialog().waitFor();
check("vino eliminato: la scheda lo spiega", /non è più nel menù/.test(await dialog().innerText()));
await dialog().getByLabel("Descrizione").fill("Prosciutto crudo Perugino, Salame Toscano, Sbriciolona, Pecorino agli Agrumi, Pecorino fresco. ");
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle();
check("vino eliminato: si salva e l'abbinamento cade", DB(`select coalesce("pairWineId",'') from "MenuItem" where id='${DISH}'`) === "");
DB(`update "MenuItem" set "deletedAt"=null where id='${WINE}'`);
DB(`update "MenuItem" set "pairWineId"='${WINE}', description='Prosciutto crudo Perugino, Salame Toscano, Sbriciolona, Pecorino agli Agrumi, Pecorino fresco.' where id='${DISH}'`);

// ---- Togli e Annulla
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await section("Taglieri");
await page.getByRole("button", { name: "Modifica Tagliere Classico", exact: true }).click();
await dialog().waitFor();
await dialog().getByRole("button", { name: "Togli l'abbinamento con Mastrojanni" }).click();
check("togli: torna la ricerca", (await dialog().getByLabel("Cerca un vino da abbinare").count()) === 1);
await dialog().getByRole("button", { name: "Salva", exact: true }).click();
await dialog().waitFor({ state: "detached" });
await settle(800);
check("togli: abbinamento rimosso", DB(`select coalesce("pairWineId",'') from "MenuItem" where id='${DISH}'`) === "");
await page.locator('[role="status"] button:has-text("Annulla")').last().click();
await settle(2000);
check("annulla: l'abbinamento torna", DB(`select coalesce("pairWineId",'') from "MenuItem" where id='${DISH}'`) === WINE);

// ---- Duplica: l'abbinamento segue il piatto
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await section("Taglieri");
await page.getByRole("button", { name: "Modifica Tagliere Classico", exact: true }).click();
await dialog().waitFor();
await dialog().getByRole("button", { name: "Duplica" }).click();
await settle(2500);
check("duplica: la copia ha lo stesso vino", DB(`select count(*) from "MenuItem" where name='Tagliere Classico' and "deletedAt" is null and "pairWineId"='${WINE}'`) === "2");
if (await dialog().count()) await page.keyboard.press("Escape");
DB(`delete from "MenuItem" where name='Tagliere Classico' and id<>'${DISH}'`);
// ---- Niente abbinamento per «Oggi fuori menù»
await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
await page.locator('section[aria-label="Oggi fuori menù"]').getByRole("button", { name: "+ Piatto" }).click();
await dialog().waitFor();
check("oggi fuori menù: niente abbinamento", (await dialog().getByLabel("Cerca un vino da abbinare").count()) === 0);
await page.keyboard.press("Escape");

// ---- Permessi: chi ha il permesso vede e usa i campi
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.setDefaultTimeout(60000);
  await login(p, "marta", EMP_PW);
  await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 120000 });
  const later = p.locator("button", { hasText: "Ricordamelo più tardi" });
  if (await later.count()) await later.click();
  await goTab(p, "Menù");
  await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Taglieri" }).click();
  await p.getByRole("button", { name: "Modifica Tagliere Premium", exact: true }).click();
  check("permessi: la dipendente con permesso vede l'abbinamento", (await p.getByLabel("Cerca un vino da abbinare").count()) === 1);
  await c.close();
}

clean();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
