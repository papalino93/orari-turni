// Ordine di eventi e annunci: di base per data, poi a mano da «Riordina» → «Eventi e
// annunci». Il primo è il più a sinistra in «In evidenza»; si annulla e si torna all'ordine
// per data.
import { launch, login, check, BASE, results, ADMIN_PW, DB, tool, goTab } from "./lib.mjs";

// giorno commerciale (cambia alle 5:00 ora italiana)
const biz = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() - 5 * 3600e3 + offset * 86400e3),
  );

// Tre eventi di prova, tutti già visibili e non ancora iniziati: per data C, B, A.
const PROVE = [
  { id: "ordine-prova-a", title: "Ordine Prova A", start: biz(9) },
  { id: "ordine-prova-b", title: "Ordine Prova B", start: biz(6) },
  { id: "ordine-prova-c", title: "Ordine Prova C", start: biz(3) },
];
DB(`delete from "MenuPromo" where id like 'ordine-prova-%'`);
DB(`update "MenuPromo" set "sortOrder" = null`);
for (const p of PROVE) {
  DB(
    `insert into "MenuPromo" (id, kind, slug, title, "showFrom", "startDate", "endDate", "updatedAt") values ('${p.id}', 'EVENT', '${p.id}', '${p.title}', '${biz(-1)}', '${p.start}', '${p.start}', now())`,
  );
}

const b = await launch();
const pub = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
await pub.addInitScript(() => localStorage.setItem("menu-staff-device", "1"));
// Titoli nella striscia «In evidenza», da sinistra a destra.
const strip = async () => {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 180000 });
  const titles = await pub.locator('section[aria-label="In evidenza"] a').allInnerTexts();
  return titles.map((t) => PROVE.find((p) => t.includes(p.title))?.title.slice(-1)).filter(Boolean).join("");
};

check("di base: in ordine di data (C, B, A)", (await strip()) === "CBA", await strip());

const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dlg = p.locator('[role="dialog"]');
const bar = () => p.getByRole("alertdialog", { name: "Modifiche non salvate" });
const rowTitles = async () =>
  (await dlg.locator("li[data-id] p.truncate.font-medium").allInnerTexts()).map((t) => PROVE.find((x) => x.title === t)?.title.slice(-1)).filter(Boolean).join("");

await tool(p, "Riordina");
await dlg.waitFor();
const tab = dlg.getByRole("tab", { name: "Eventi e annunci" });
check("Riordina: c'è la scheda «Eventi e annunci»", (await tab.count()) === 1);
await tab.click();
check("Riordina: gli eventi nello stesso ordine del menù", (await rowTitles()) === "CBA", await rowTitles());
check("Riordina: niente «Torna all'ordine per data» se l'ordine è già per data", (await dlg.getByRole("button", { name: "Torna all'ordine per data" }).count()) === 0);
// In mezzo ci possono essere altri eventi (es. Oktoberfest): si sale finché A non è in cima.
for (let i = 0; i < 10 && !(await rowTitles()).startsWith("A"); i++) await dlg.getByRole("button", { name: "Sposta su Ordine Prova A" }).click();
check("Riordina: A spostato in cima", (await rowTitles()) === "ACB", await rowTitles());
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("Riordina: Esc con l'ordine cambiato chiede", (await bar().count()) === 1);
await bar().getByRole("button", { name: "Continua a modificare" }).click();
await dlg.getByRole("button", { name: "Salva ordine" }).click();
await p.getByText("Nuovo ordine salvato: eventi e annunci").first().waitFor();
check(
  "DB: posti salvati, A prima di C",
  DB(`select string_agg(id, ',' order by "sortOrder") from "MenuPromo" where id like 'ordine-prova-%'`) === "ordine-prova-a,ordine-prova-c,ordine-prova-b",
);
check("menù: A è il primo a sinistra", (await strip()) === "ACB", await strip());

// L'elenco a sinistra della gestione segue lo stesso ordine
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
await p.reload({ waitUntil: "networkidle" });
await goTab(p, "Eventi e annunci");
const side = (await p.locator("button", { hasText: /^Ordine Prova/ }).allInnerTexts()).map((t) => t.match(/Prova ([ABC])/)?.[1]).join("");
check("gestione: l'elenco degli eventi segue l'ordine", side === "ACB", side);

// Storico: «Annulla» rimette l'ordine per data
await tool(p, "Storico");
await dlg.waitFor();
const hist = await dlg.innerText();
check("storico: «Ordine di eventi e annunci»", /Ordine di eventi e annunci/.test(hist));
await dlg.locator("li", { hasText: "Ordine di eventi e annunci" }).first().getByRole("button", { name: /Ripristina|Annulla/ }).first().click();
await p.waitForTimeout(1500);
check("storico: ripristinato, di nuovo per data", DB(`select count(*) from "MenuPromo" where "sortOrder" is not null`) === "0");
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
check("menù: dopo il ripristino di nuovo C, B, A", (await strip()) === "CBA", await strip());

// «Torna all'ordine per data»
await p.reload({ waitUntil: "networkidle" });
await tool(p, "Riordina");
await dlg.getByRole("tab", { name: "Eventi e annunci" }).click();
// Anche qui in mezzo ci possono essere altri eventi: si scende finché C non è dopo B.
for (let i = 0; i < 10 && !(await rowTitles()).startsWith("B"); i++) await dlg.getByRole("button", { name: "Sposta giù Ordine Prova C" }).click();
await dlg.getByRole("button", { name: "Salva ordine" }).click();
await p.getByText("Nuovo ordine salvato: eventi e annunci").first().waitFor();
check("menù: B prima di C", (await strip()) === "BCA", await strip());
const byDate = dlg.getByRole("button", { name: "Torna all'ordine per data" });
await byDate.waitFor();
await byDate.click();
await p.getByText("Eventi e annunci di nuovo in ordine per data").first().waitFor();
check("«Torna all'ordine per data»: tutti di nuovo per data", DB(`select count(*) from "MenuPromo" where "sortOrder" is not null`) === "0");
check("menù: di nuovo C, B, A", (await strip()) === "CBA", await strip());

DB(`delete from "MenuChange" where label like '%eventi e annunci%' or label like 'Ordine di eventi%'`);
DB(`delete from "MenuPromo" where id like 'ordine-prova-%'`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
