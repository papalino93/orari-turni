// Pagina di un evento (e menù) da telefono: si deve poter tornare in cima senza fatica.
//  - niente «scroll-behavior: smooth» globale (su iPhone rovina il tocco sulla barra di stato e lo
//    scorrimento di pagine lunghe); i salti morbidi li fa JavaScript, uno alla volta;
//  - «Torna su» compare mentre si risale in una pagina lunga e porta in cima;
//  - la pagina dell'evento non si ingrandisce col «testo più grande» del menù (non ha il pulsante «Aa»);
//  - i chip delle sezioni del menù scorrono ancora alla sezione giusta.
import { launch, check, BASE, results, DB } from "./lib.mjs";

const biz = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() - 5 * 3600e3 + offset * 86400e3),
  );
const body = Array.from({ length: 45 }, (_, i) => `Riga ${i + 1} del racconto della serata: musica, vino e buona compagnia.`).join("\n\n");
DB(`delete from "MenuPromo" where id = 'scroll-prova'`);
DB(
  `insert into "MenuPromo" (id, kind, slug, title, body, "showFrom", "startDate", "endDate", "updatedAt") values ('scroll-prova', 'EVENT', 'scroll-prova', 'Serata lunga di prova', '${body.replace(/'/g, "''")}', '${biz(-1)}', '${biz(5)}', '${biz(5)}', now())`,
);

const b = await launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
});
await ctx.addInitScript(() => localStorage.setItem("menu-staff-device", "1"));
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
const y = () => p.evaluate(() => Math.round(scrollY));

await p.goto(`${BASE}/menu/p/scroll-prova`, { waitUntil: "networkidle", timeout: 180000 });
const smooth = await p.evaluate(() => [getComputedStyle(document.documentElement).scrollBehavior, getComputedStyle(document.body).scrollBehavior]);
check("evento: nessuno scorrimento «morbido» impostato su tutta la pagina", smooth.every((v) => v !== "smooth"), smooth.join(","));
const h = await p.evaluate(() => document.documentElement.scrollHeight);
check("evento: la pagina di prova è lunga (più di 3 schermi)", h > 664 * 3, String(h));
check("evento: in cima niente «Torna su»", (await p.getByRole("button", { name: "Torna su" }).count()) === 0);

// Si scende (niente pulsante mentre si scende), poi si risale un po': compare
await p.evaluate(() => window.scrollTo(0, 2200));
await p.waitForTimeout(500);
await p.mouse.wheel(0, 300);
await p.waitForTimeout(400);
check("evento: scendendo il «Torna su» non copre il testo", (await p.getByRole("button", { name: "Torna su" }).count()) === 0);
await p.mouse.wheel(0, -200);
await p.waitForTimeout(500);
const up = p.getByRole("button", { name: "Torna su" });
check("evento: risalendo compare «Torna su»", (await up.count()) === 1);
const box = await up.boundingBox();
check("evento: «Torna su» comodo da toccare (almeno 44 px) e dentro lo schermo", box && box.width >= 44 && box.height >= 44 && box.x + box.width <= 390 && box.y + box.height <= 664, JSON.stringify(box));
await up.click();
await p.waitForFunction(() => scrollY === 0, null, { timeout: 8000 }).catch(() => {});
check("evento: «Torna su» porta davvero in cima", (await y()) === 0, String(await y()));
check("evento: in cima il pulsante sparisce", (await p.getByRole("button", { name: "Torna su" }).count()) === 0);
// L'intestazione in alto è raggiungibile
const headerTop = await p.evaluate(() => document.querySelector("header").getBoundingClientRect().top);
check("evento: l'intestazione in alto si vede", headerTop >= 0 && headerTop < 10, String(headerTop));

// Un dito che risale: dall'ultima riga fino in cima a passi piccoli
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p.waitForTimeout(400);
let reached = false;
for (let i = 0; i < 40 && !reached; i++) {
  await p.mouse.wheel(0, -300);
  await p.waitForTimeout(120);
  reached = (await y()) === 0;
}
check("evento: dal fondo si risale in cima con scorrimenti normali", reached);

// «Testo più grande» del menù: la pagina dell'evento non si ingrandisce
await p.evaluate(() => document.documentElement.setAttribute("data-menu-large", ""));
const zoom = await p.evaluate(() => getComputedStyle(document.querySelector("main")).zoom);
check("evento: niente ingrandimento «zoom» sulla pagina dell'evento", zoom === "1", zoom);

// Menù: i chip delle sezioni scorrono ancora alla sezione giusta (ora da JavaScript)
await p.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 180000 });
const chip = p.locator('nav[aria-label="Sezioni del menù"] a[data-chip="rossi"]');
await chip.click();
await p.waitForFunction(() => { const r = document.getElementById("rossi")?.getBoundingClientRect(); return r && r.top < 140 && r.top > -40; }, null, { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(1200); // fine dello scorrimento morbido
const rossi = await p.evaluate(() => document.getElementById("rossi").getBoundingClientRect().top);
check("menù: il chip «Rossi» porta alla sezione, subito sotto la barra", rossi > 30 && rossi < 70, String(rossi));
check("menù: l'indirizzo segna la sezione (#rossi)", (await p.evaluate(() => location.hash)) === "#rossi");
// Torna su del menù ancora al suo posto
await p.evaluate(() => window.scrollTo(0, 3000));
await p.waitForTimeout(300);
await p.mouse.wheel(0, -150);
await p.waitForTimeout(500);
check("menù: risalendo compare «Torna su»", (await p.getByRole("button", { name: "Torna su" }).count()) === 1);
// Con «riduci animazioni» il salto è immediato
await p.emulateMedia({ reducedMotion: "reduce" });
await p.evaluate(() => window.scrollTo(0, 0));
await chip.evaluate((el) => el.scrollIntoView({ inline: "center" }));
await p.locator('nav[aria-label="Sezioni del menù"] a[data-chip="bianchi"]').click();
await p.waitForTimeout(150);
const bianchi = await p.evaluate(() => document.getElementById("bianchi").getBoundingClientRect().top);
check("menù: con «riduci animazioni» il salto alla sezione è immediato", bianchi < 140 && bianchi > -40, String(bianchi));

DB(`delete from "MenuPromo" where id = 'scroll-prova'`);
DB(`delete from "MenuChange" where label like 'Serata lunga di prova%'`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
