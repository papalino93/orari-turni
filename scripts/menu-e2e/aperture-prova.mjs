// «Togli aperture di prova» in Statistiche: si vedono le aperture di oggi e di ieri con l'ora,
// se ne spuntano alcune e si tolgono; le altre (e gli altri tipi di evento) restano.
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";

const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
const d = new Date(`${oggi}T12:00:00Z`);
d.setUTCDate(d.getUTCDate() - 1);
const ieri = d.toISOString().slice(0, 10);
DB(`delete from "MenuEvent" where id like 'prv_%'`);
// 3 aperture oggi (alle 9:05, 9:10, 9:15 ora italiana), 2 ieri, una ricerca di oggi da non toccare.
const at = (day, hm) => `('${day} ${hm}:00'::timestamp at time zone 'Europe/Rome')`;
DB(`insert into "MenuEvent"(id, at, day, hour, weekday, kind) values
  ('prv_1', ${at(oggi, "09:05")}, '${oggi}', 9, 1, 'open'),
  ('prv_2', ${at(oggi, "09:10")}, '${oggi}', 9, 1, 'open'),
  ('prv_3', ${at(oggi, "09:15")}, '${oggi}', 9, 1, 'open'),
  ('prv_4', ${at(ieri, "10:01")}, '${ieri}', 10, 1, 'open'),
  ('prv_5', ${at(ieri, "10:02")}, '${ieri}', 10, 1, 'open'),
  ('prv_6', ${at(oggi, "09:06")}, '${oggi}', 9, 1, 'search')`);
const conta = () => Number(DB(`select count(*) from "MenuEvent" where id like 'prv_%'`));

const b = await launch();
for (const [nome, vp] of [["computer", { width: 1280, height: 900 }], ["telefono", { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/statistiche`, { waitUntil: "networkidle", timeout: 180000 });
  if (nome === "telefono") {
    DB(`delete from "MenuEvent" where id like 'prv_%'`);
    DB(`insert into "MenuEvent"(id, at, day, hour, weekday, kind) values ('prv_7', ${at(oggi, "09:20")}, '${oggi}', 9, 1, 'open')`);
  }
  await p.getByRole("button", { name: "Togli aperture di prova" }).click();
  const dlg = p.getByRole("alertdialog", { name: "Togli aperture di prova" });
  await dlg.getByText("09:15").waitFor({ timeout: 15000 }).catch(() => {});
  if (nome === "computer") {
    check(`${nome}: si vedono le aperture di oggi e di ieri con l'ora`, (await dlg.getByText("09:05").count()) === 1 && (await dlg.getByText("10:02").count()) === 1 && (await dlg.getByText(/^Oggi · \d+$/).count()) === 1 && (await dlg.getByText(/^Ieri · \d+$/).count()) === 1);
    const togli = dlg.getByRole("button", { name: "Scegli quali togliere" });
    check(`${nome}: senza scelte il pulsante è spento`, await togli.isDisabled());
    await dlg.getByText("09:05").click();
    await dlg.getByText("09:10").click();
    check(`${nome}: il pulsante dice quante`, (await dlg.getByRole("button", { name: "Togli 2 aperture" }).count()) === 1);
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/aperture-prova-${nome}.png` });
    await dlg.getByRole("button", { name: "Togli 2 aperture" }).click();
    await p.getByText("Tolte 2 aperture di prova").waitFor({ timeout: 15000 }).catch(() => {});
    check(`${nome}: tolte solo le due scelte (la ricerca e le altre restano)`, conta() === 4 && DB(`select string_agg(id, ',' order by id) from "MenuEvent" where id like 'prv_%'`) === "prv_3,prv_4,prv_5,prv_6");
  } else {
    await dlg.getByText("09:20").waitFor({ timeout: 15000 }).catch(() => {});
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/aperture-prova-${nome}.png` });
    await dlg.getByText("09:20").click().catch(() => {});
    await dlg.getByRole("button", { name: "Togli 1 apertura" }).click();
    await p.getByText("Tolta 1 apertura di prova").waitFor({ timeout: 15000 }).catch(() => {});
    check(`${nome}: tolta (finestra dal basso, si usa col pollice)`, conta() === 0);
    await dlg.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  }
  await p.context().close();
}
await b.close();
DB(`delete from "MenuEvent" where id like 'prv_%'`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
