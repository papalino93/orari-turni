// Strumenti per i clienti: ricerca con filtri, testo più grande, «Torna su».
import { launch, check, BASE, SHOTS, results } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
DB(`delete from "MenuPromo"`);
DB(`delete from "MenuItem" where "groupId" in ('menu_grp_oggi_piatti','menu_grp_oggi_vini')`);
DB(`update "MenuItem" set "soldOutDay"=null, "deletedAt"=null`);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
const dialog = () => page.locator('[role="dialog"][aria-label="Cerca nel menù"]');
const searchBtn = page.getByRole("button", { name: "Cerca nel menù", exact: true });

const boxes = await Promise.all([searchBtn.boundingBox(), page.getByRole("button", { name: "Testo più grande" }).boundingBox()]);
check("barra: cerca e testo grande a portata di pollice (≥ 44 px)", boxes.every((b) => b && b.height >= 44 && b.width >= 44), JSON.stringify(boxes.map((b) => b && [Math.round(b.width), Math.round(b.height)])));
const navOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("barra @390: nessun overflow orizzontale", navOverflow <= 0, String(navOverflow));
if (SHOTS) await page.evaluate(() => window.scrollTo(0, 900)).then(() => page.waitForTimeout(500)).then(() => page.screenshot({ path: `${SHOTS}/strumenti-barra-390.png` }));
await page.evaluate(() => window.scrollTo(0, 0));

// Ricerca per nome (anche senza accenti)
await searchBtn.click();
await dialog().waitFor();
check("ricerca: si apre a pieno schermo con il campo attivo", await dialog().locator("input[type=search]").evaluate((el) => el === document.activeElement));
await dialog().locator("input[type=search]").fill("gewurz");
await page.waitForTimeout(400);
const r1 = (await dialog().innerText()).toLowerCase();
const expectedGewurz = Number(DB(`select count(*) from "MenuItem" where "deletedAt" is null and (unaccent_ci(name) like '%gewurz%')`.replace("unaccent_ci(name)", "translate(lower(name||' '||coalesce(sub,'')||' '||coalesce(grapes,'')),'üéèàòì','ueeaoi')")));
check("ricerca: «gewurz» trova il vino a base di Gewürztraminer (anche senza accenti)", /schloss englar/.test(r1) && !/nessun risultato/.test(r1), r1.replace(/\n/g, " | ").slice(0, 140));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/strumenti-ricerca-390.png` });
void expectedGewurz;

// Ricerca per ingrediente (piatti)
await dialog().locator("input[type=search]").fill("burrata");
await page.waitForTimeout(400);
const r2 = (await dialog().innerText()).toLowerCase();
check("ricerca: «burrata» trova i piatti che la contengono (dagli ingredienti)", /crudo & rucola/.test(r2) && /taglieri/.test(r2));
await dialog().locator("input[type=search]").fill("zzzzqq");
await page.waitForTimeout(400);
check("ricerca: nessun risultato lo dice", /nessun risultato/i.test(await dialog().innerText()));

// Filtri
await dialog().locator("input[type=search]").fill("");
await dialog().getByRole("button", { name: "Al calice" }).click();
const glassShown = await dialog().locator("li").count();
const glassDb = Number(DB(`select count(*) from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where i."deletedAt" is null and i."priceGlassCents" is not null and s."promoId" is null and s."dailyOnly"=false`));
check("filtro «Al calice»: mostra i vini al calice", glassShown === Math.min(40, glassDb) && glassShown > 0, `${glassShown}/${glassDb}`);
await dialog().getByRole("button", { name: "Al calice" }).click();
await dialog().getByRole("button", { name: "Enomatic" }).click();
const enoShown = await dialog().locator("li").count();
const enoDb = Number(DB(`select count(*) from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where i."deletedAt" is null and i.enomatic and s."promoId" is null and s."dailyOnly"=false`));
check("filtro «Enomatic»: mostra i vini Enomatic", enoShown === Math.min(40, enoDb) && enoShown > 0, `${enoShown}/${enoDb}`);

// Scegliere un risultato porta alla voce
await dialog().getByRole("button", { name: "Enomatic" }).click();
await dialog().locator("input[type=search]").fill("aquila");
await page.waitForTimeout(400);
const target = dialog().locator("li button").first();
const targetName = (await target.locator("span span").first().innerText()).trim();
await target.click();
await page.waitForTimeout(1500);
check("risultato: la ricerca si chiude", (await dialog().count()) === 0);
const found = await page.locator(".menu-found").first().innerText().catch(() => "");
check("risultato: la voce è evidenziata e in vista", found.includes(targetName), `${targetName} → ${found.slice(0, 40)}`);
const inView = await page.locator(".menu-found").first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
check("risultato: la voce è dentro lo schermo", inView);
check("risultato: la pagina torna a scorrere", await page.evaluate(() => document.body.style.overflow !== "hidden"));

// Esc chiude
await searchBtn.click();
await dialog().waitFor();
await page.keyboard.press("Escape");
check("ricerca: Esc la chiude", (await dialog().count()) === 0);

// Testo più grande, ricordato
const mainFont = () => page.locator("main.menu-main").evaluate((el) => getComputedStyle(el).zoom);
const before = await mainFont();
await page.getByRole("button", { name: "Testo più grande" }).click();
const after = await mainFont();
check("testo grande: ingrandisce il menù", Number(after) > Number(before), `${before} → ${after}`);
check("testo grande: il pulsante risulta attivo", (await page.getByRole("button", { name: "Testo più grande" }).getAttribute("aria-pressed")) === "true");
const ovLarge = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("testo grande: nessun overflow orizzontale", ovLarge <= 0, String(ovLarge));
if (SHOTS) await page.locator("#bianchi").scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${SHOTS}/strumenti-testo-grande-390.png` }));
await page.reload({ waitUntil: "networkidle" });
check("testo grande: ricordato dopo il ricaricamento", Number(await mainFont()) > Number(before));
await page.getByRole("button", { name: "Testo più grande" }).click();
check("testo grande: si può tornare normale", Number(await mainFont()) === Number(before));

// Torna su
await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 0); });
await page.waitForFunction(() => window.scrollY === 0);
await page.waitForTimeout(500);
check("torna su: non c'è in cima alla pagina", (await page.getByRole("button", { name: "Torna su" }).count()) === 0);
await page.evaluate(() => window.scrollTo(0, 4000));
await page.waitForTimeout(500);
const top = page.getByRole("button", { name: "Torna su" });
check("torna su: scendendo non copre il menù", (await top.count()) === 0);
await page.evaluate(() => window.scrollTo(0, 3600));
await page.waitForTimeout(500);
check("torna su: compare risalendo", (await top.count()) === 1);
const tb = await top.boundingBox();
check("torna su: bersaglio ≥ 44 px", tb && tb.width >= 44 && tb.height >= 44);
await top.click();
await page.waitForFunction(() => window.scrollY < 5, null, { timeout: 8000 }).catch(() => {});
check("torna su: riporta in cima", (await page.evaluate(() => window.scrollY)) < 5);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
