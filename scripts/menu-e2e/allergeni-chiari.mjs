// Allergeni chiari per i clienti: nomi al posto dei numeri, «Può contenere tracce di…»
// per voce, ricerca che riconosce gli allergeni, pagina allergeni già filtrata.
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, DB } from "./lib.mjs";

const id = DB(`select id from "MenuItem" where name='Tagliere Classico' and "deletedAt" is null limit 1`);
DB(`update "MenuItem" set allergens='{LATTE,SOLFITI}', "allergensReviewed"=true, "allergenTraces"='{}' where id='${id}'`);

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem("install-banner-dismissed", "1"));
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
const menu = async (path = "/menu?festa=0") => {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
};

// Menù: nomi, non numeri
await menu();
const row = p.locator(`#v-${id}`);
const txt = await row.innerText();
check("menù: allergeni per nome («Latte · Solfiti»)", /Latte · Solfiti/.test(txt), txt.replace(/\n/g, " | "));
check("menù: niente numeri degli allergeni", !/Allergeni\s*\d/i.test(txt));
check("menù: sopra i prezzi dei vini c'è scritto «calice» e «bottiglia»", (await p.getByText("calice", { exact: true }).count()) > 0 && (await p.getByText("bottiglia", { exact: true }).count()) > 0);
check("menù: in fondo «Filtra per allergene»", (await p.getByRole("link", { name: "Filtra per allergene" }).count()) === 1);

// Gestione: tracce nella scheda della voce
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await p.getByRole("button", { name: /^Taglieri/ }).first().click();
await p.getByRole("button", { name: "Modifica Tagliere Classico" }).first().click();
const d = p.getByRole("dialog");
await d.getByRole("button", { name: /Può contenere tracce di/ }).click();
check("scheda: le tracce non propongono ciò che il piatto contiene già", (await d.getByRole("button", { name: "Latte", exact: true }).count()) === 0);
await d.getByRole("button", { name: "Uova", exact: true }).click();
await d.getByRole("button", { name: "Frutta a guscio", exact: true }).click();
if (SHOTS) await p.screenshot({ path: `${SHOTS}/tracce-scheda.png` });
await d.getByRole("button", { name: /^Salva/ }).first().click();
await d.waitFor({ state: "detached" });
await p.waitForTimeout(1500);
check("DB: tracce salvate nell'ordine di legge", DB(`select "allergenTraces"::text from "MenuItem" where id='${id}'`) === "{UOVA,FRUTTA_A_GUSCIO}");

await menu();
await menu();
const txt2 = await p.locator(`#v-${id}`).innerText();
check("menù: «Può contenere tracce di uova, frutta a guscio.»", /Può contenere tracce di uova, frutta a guscio\./.test(txt2), txt2.replace(/\n/g, " | "));
if (SHOTS) {
  await p.locator(`#v-${id}`).scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SHOTS}/tracce-menu.png` });
}

// Ricerca
await p.getByRole("button", { name: /Cerca/ }).first().click();
await p.getByRole("dialog").getByRole("searchbox").fill("senza glutine");
const link = p.getByRole("link", { name: /Piatti senza glutine/ });
check("ricerca: «glutine» propone i piatti senza glutine", (await link.count()) === 1);
await p.getByRole("dialog").getByRole("searchbox").fill("nocciole");
check("ricerca: «nocciole» → frutta a guscio", (await p.getByRole("link", { name: /Piatti senza frutta a guscio/ }).count()) === 1);
await p.getByRole("dialog").getByRole("searchbox").fill("brunello");
check("ricerca: un vino non fa comparire gli allergeni", (await p.getByRole("link", { name: /Piatti senza/ }).count()) === 0);
await p.getByRole("dialog").getByRole("searchbox").fill("glutine");
await p.getByRole("link", { name: /Piatti senza glutine/ }).click();
await p.waitForURL(/evita=GLUTINE/);
await p.waitForLoadState("networkidle");
check("allergeni: arriva con «Glutine» già scelto", (await p.getByRole("button", { name: "Glutine", pressed: true }).count()) === 1);
check("allergeni: «Mostra solo i piatti adatti» acceso", await p.getByLabel(/Mostra solo i piatti adatti/).isChecked());

// Filtro con le tracce
await menu("/menu/allergeni?evita=UOVA");
const items = p.locator("main");
check("allergeni: con tracce di uova il tagliere non è «adatto»", !(await items.innerText()).includes("Tagliere Classico"));
await p.getByLabel(/Mostra solo i piatti adatti/).uncheck();
const t3 = await items.innerText();
check("allergeni: togliendo la spunta compare, con «tracce di: uova»", t3.includes("Tagliere Classico") && /Può contenere tracce di: uova/.test(t3));
await p.getByRole("button", { name: "Azzera la selezione" }).click();
check("allergeni: senza filtri, la riga delle tracce si legge sotto il piatto", /Può contenere tracce di uova, frutta a guscio\./.test(await items.innerText()));
if (SHOTS) await p.screenshot({ path: `${SHOTS}/tracce-allergeni.png`, fullPage: false });

DB(`update "MenuItem" set "allergenTraces"='{}' where id='${id}'`);
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
