// Statistiche, parte grafica: grafico giorno per giorno (valore al passaggio, tabella),
// mappa giorni × orari con valore al tocco, classifiche, e la scheda «Gli eventi funzionano?»
// con i numeri di ogni evento. I dati sono inseriti qui e tolti alla fine.
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";

const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const wdOf = (d) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const saved = DB(`select value from "MenuSetting" where id='stats'`);
DB(`delete from "MenuEvent"`);
DB(`delete from "MenuPromo" where id='graf-evento'`);
// Gli altri eventi del sito si mettono da parte (deletedAt) per contare solo quello di prova.
const others = DB(`select id from "MenuPromo" where kind='EVENT' and "deletedAt" is null`).split("\n").filter(Boolean);
if (others.length) DB(`update "MenuPromo" set "deletedAt"=now() where id in (${others.map((i) => `'${i}'`).join(",")})`);
DB(`delete from "MenuSetting" where id='stats'`);
DB(`insert into "MenuSetting" (id, value) values ('stats', '{"enabled":true,"since":"${day(13)}"}')`);
// 14 giorni di aperture (più nei giorni 3 e 4 fa: l'evento), alle ore 19 e 20.
for (let i = 0; i < 14; i++) {
  const d = day(i);
  const count = i === 3 || i === 4 ? 12 : 4;
  for (let k = 0; k < count; k++) DB(`insert into "MenuEvent" (id, day, hour, weekday, kind) values ('g${i}_${k}', '${d}', ${k % 2 ? 19 : 20}, ${wdOf(d)}, 'open')`);
}
DB(`insert into "MenuPromo" (id, kind, slug, title, "showFrom", "startDate", "endDate", "updatedAt") values ('graf-evento', 'EVENT', 'graf-evento', 'Serata di prova', '${day(13)}', '${day(4)}', '${day(3)}', now())`);
for (let k = 0; k < 7; k++) DB(`insert into "MenuEvent" (id, day, hour, weekday, kind, label) values ('ge${k}', '${day(3)}', 19, ${wdOf(day(3))}, 'event', 'Serata di prova')`);
for (let k = 0; k < 2; k++) DB(`insert into "MenuEvent" (id, day, hour, weekday, kind, label) values ('gc${k}', '${day(3)}', 19, ${wdOf(day(3))}, 'contact', 'Prenota · Serata di prova')`);
DB(`insert into "MenuEvent" (id, day, hour, weekday, kind, label) values ('gc9', '${day(3)}', 19, ${wdOf(day(3))}, 'contact', 'Calendario · Serata di prova')`);

const b = await launch();
for (const [label, w, h, theme] of [["computer", 1280, 900, "light"], ["telefono", 390, 844, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("install-banner-dismissed", "1"); } catch {} }, theme);
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/statistiche`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });

  const chart = p.locator('svg[role="img"][aria-label^="Aperture del menù giorno per giorno"]');
  await chart.waitFor();
  check(`${label}: grafico giorno per giorno presente`, (await chart.count()) === 1);
  check(`${label}: il grafico dice il giorno più forte`, /Il giorno più forte è .* con 12 aperture/.test((await chart.getAttribute("aria-label")) ?? ""));
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  await p.mouse.move(box.x + box.width - 40, box.y + 80);
  const tip = p.locator('[role="status"]');
  await tip.first().waitFor();
  check(`${label}: passando sul grafico compare il valore del giorno`, /apertur/.test(await tip.first().innerText()));
  await p.mouse.move(box.x + 5, box.y - 40);
  check(`${label}: uscendo dal grafico il valore sparisce`, (await tip.count()) === 0);
  await p.getByRole("button", { name: "Vedi come tabella" }).click();
  check(`${label}: «Vedi come tabella» mostra le righe`, (await p.locator("table tbody tr").count()) >= 10);
  check(`${label}: la tabella indica il giorno dell'evento`, /Serata di prova/.test(await p.locator("table").first().innerText()));
  await p.getByRole("button", { name: "Vedi il grafico" }).click();
  check(`${label}: si torna al grafico`, (await chart.count()) === 1);

  // Mappa orari: tocco su una casella
  const cell = p.locator("table td").filter({ has: p.locator(".sr-only", { hasText: /^[1-9]/ }) }).first();
  await cell.scrollIntoViewIfNeeded();
  await cell.hover();
  await tip.first().waitFor();
  check(`${label}: mappa orari, la casella dice giorno, ora e aperture`, /\d+:00–\d+:00/.test(await tip.first().innerText()));
  check(`${label}: mappa orari, il momento più forte è indicato`, /momento più forte/.test(await p.locator("body").innerText()));

  // Giorno per giorno: gli ultimi 10, con «Mostra altri» e «Comprimi»
  const dd = p.locator("section", { has: p.getByRole("heading", { name: "Giorno per giorno", exact: true }) }).first();
  const rowsN = () => dd.locator("ol li a").count();
  check(`${label}: giorno per giorno parte dagli ultimi 10`, (await rowsN()) === 10, String(await rowsN()));
  await dd.getByRole("button", { name: /Mostra altri giorni \(4\)/ }).click();
  check(`${label}: «Mostra altri giorni» li apre tutti`, (await rowsN()) === 14, String(await rowsN()));
  await dd.getByRole("button", { name: /Comprimi/ }).click();
  check(`${label}: «Comprimi» torna agli ultimi 10`, (await rowsN()) === 10 && (await dd.getByRole("button", { name: /Comprimi/ }).count()) === 0);

  // Classifica dei giorni: in ordine di media
  const rk = await p.getByRole("heading", { name: "Classifica dei giorni della settimana", exact: true }).locator("xpath=ancestor::section[1]").locator("ol li").allInnerTexts();
  const avgs = rk.map((t) => Number((t.match(/([\d]+(?:,\d)?)\s*al giorno/) ?? [])[1]?.replace(",", ".")));
  check(`${label}: classifica dei giorni in ordine di media`, avgs.length >= 2 && avgs.every((v, i) => i === 0 || avgs[i - 1] >= v), avgs.join(" "));

  // Eventi
  const body = await p.locator("body").innerText();
  check(`${label}: scheda «Gli eventi funzionano?»`, /Gli eventi funzionano\?/.test(body));
  check(`${label}: eventi, aperture medie al giorno a confronto`, /Giorni con un evento \(2\)/.test(body) && /Altri giorni \(12\)/.test(body));
  const card = p.getByRole("region", { name: "Evento: Serata di prova" });
  const t = await card.innerText();
  check(`${label}: scheda dell'evento con la pagina aperta (7)`, /Hanno aperto la pagina\s*7/.test(t.replace(/\n/g, " ")), t);
  check(`${label}: scheda dell'evento con Prenota (2) e Calendario (1)`, /Prenota\s*2/.test(t.replace(/\n/g, " ")) && /Calendario\s*1/.test(t.replace(/\n/g, " ")));
  // Nessun elemento esce dal bordo
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: niente scorrimento laterale della pagina`, over <= 1, String(over));
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/grafici-${label}.png`, fullPage: true });
  await ctx.close();
}
await b.close();

DB(`delete from "MenuEvent"`);
DB(`delete from "MenuPromo" where id='graf-evento'`);
if (others.length) DB(`update "MenuPromo" set "deletedAt"=null where id in (${others.map((i) => `'${i}'`).join(",")})`);
DB(`delete from "MenuSetting" where id='stats'`);
if (saved) DB(`insert into "MenuSetting" (id, value) values ('stats', '${saved.replace(/'/g, "''")}')`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
