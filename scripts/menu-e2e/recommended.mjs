// «Consigliato» (scritta sulla voce + riga «I consigli della casa» sotto la copertina, al
// massimo 4) e abbinamenti per il vino («Sta bene con…»: da soli dai piatti, più a mano).
import { launch, login, check, BASE, results, ADMIN_PW, DB, SHOTS } from "./lib.mjs";

const q = (sql) => DB(sql);
const wine = q(`select i.id from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s.kind='WINE' and s."promoId" is null and not s."dailyOnly" and i."deletedAt" is null and g."deletedAt" is null and not i."textOnly" and i."soldOutDay" is null order by s."sortOrder", g."sortOrder", i."sortOrder" limit 1`);
const wineName = q(`select name from "MenuItem" where id='${wine}'`);
const dishes = q(`select string_agg(id, ',') from (select i.id from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s.kind='FOOD' and s."promoId" is null and not s."dailyOnly" and i."deletedAt" is null and g."deletedAt" is null and not i."textOnly" order by s."sortOrder", g."sortOrder", i."sortOrder" limit 3) x`).split(",");
const dishName = (id) => q(`select name from "MenuItem" where id='${id}'`);
const [d1, d2, d3] = dishes;
// Partenza pulita
q(`update "MenuItem" set recommended=false, "pairDishIds"='{}', "pairHideIds"='{}' where recommended or cardinality("pairDishIds")>0 or cardinality("pairHideIds")>0`);
const savedPairs = q(`select coalesce(string_agg(id || '=' || coalesce("pairWineId", ''), ','), '') from "MenuItem" where id in ('${d1}','${d2}','${d3}')`);
q(`update "MenuItem" set "pairWineId"=null where "pairWineId"='${wine}'`);
q(`update "MenuItem" set "pairWineId"='${wine}' where id='${d1}'`);

const b = await launch();
const pub = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
pub.setDefaultTimeout(60000);
await pub.addInitScript(() => localStorage.setItem("menu-staff-device", "1"));
const open = async () => {
  await pub.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 180000 });
  return pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
};
const wineRow = () => pub.locator(`#v-${wine}`);

// Vino → piatti: da solo dall'abbinamento del piatto
await open();
let t = await wineRow().innerText();
check("vino: «Sta bene con» il piatto che lo consiglia", /Sta bene con/i.test(t) && t.includes(dishName(d1)), t);

const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
const dlg = p.locator('[role="dialog"]');
const openItem = async (id) => {
  await p.getByRole("button", { name: "Cerca una voce del menù…" }).or(p.getByPlaceholder(/Cerca una voce/)).first().fill(q(`select name from "MenuItem" where id='${id}'`)).catch(() => {});
  await p.locator(`button[aria-label="Modifica ${q(`select name from "MenuItem" where id='${id}'`)}"]`).first().click();
  await dlg.waitFor();
};

// Scheda del vino: il piatto automatico c'è, se ne aggiunge uno a mano e si toglie quello automatico
await openItem(wine);
const pairBox = dlg.getByRole("group", { name: "Sta bene con" });
check("scheda vino: «Sta bene con» mostra il piatto che lo consiglia", (await pairBox.innerText()).includes(dishName(d1)));
await pairBox.getByRole("combobox").selectOption(d2);
await pairBox.getByRole("button", { name: `Togli ${dishName(d1)}` }).click();
await dlg.getByRole("button", { name: /^Salva/ }).click();
await dlg.waitFor({ state: "detached" });
check("DB: piatto aggiunto a mano e automatico nascosto", q(`select "pairDishIds"::text || ' ' || "pairHideIds"::text from "MenuItem" where id='${wine}'`) === `{${d2}} {${d1}}`);
await open();
t = await wineRow().innerText();
check("menù: ora «Sta bene con» il piatto scelto a mano, non quello tolto", t.includes(dishName(d2)) && !t.includes(dishName(d1)), t);
// Tocco: porta al piatto
await wineRow().getByRole("link", { name: dishName(d2) }).click();
await pub.waitForTimeout(900);
check("tocco su «Sta bene con»: si arriva al piatto", await pub.evaluate((id) => {
  const r = document.getElementById(`v-${id}`).getBoundingClientRect();
  return r.top > 0 && r.bottom < innerHeight;
}, d2));

// Consigliato
await openItem(d3);
await dlg.getByRole("checkbox", { name: /Consigliato/ }).check();
await dlg.getByRole("button", { name: /^Salva/ }).click();
await dlg.waitFor({ state: "detached" });
check("DB: piatto consigliato", q(`select recommended from "MenuItem" where id='${d3}'`) === "t");
const ov = await open();
const box = pub.locator('section[aria-label="I consigli della casa"]');
check("menù: riga «I consigli della casa» con il piatto", (await box.count()) === 1 && (await box.innerText()).includes(dishName(d3)));
check("menù: scritta «Consigliato» sulla voce", (await pub.locator(`#v-${d3}`).innerText()).includes("Consigliato"));
check("menù: niente scorrimento orizzontale", ov === 0);
if (SHOTS) await box.screenshot({ path: `${SHOTS}/consigli.png` });
await box.getByRole("link").first().click();
await pub.waitForTimeout(900);
check("tocco sul consiglio: si arriva alla voce", await pub.evaluate((id) => {
  const r = document.getElementById(`v-${id}`).getBoundingClientRect();
  return r.top > 0 && r.bottom < innerHeight;
}, d3));

// Al massimo 4
const four = q(`select string_agg(id, ',') from (select i.id from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s."promoId" is null and not s."dailyOnly" and i."deletedAt" is null and not i."textOnly" and i.id <> '${d3}' and i.id <> '${wine}' order by i.id limit 3) x`).split(",");
q(`update "MenuItem" set recommended=true where id in ('${four.join("','")}')`);
await p.reload({ waitUntil: "networkidle" });
await openItem(wine);
await dlg.getByRole("checkbox", { name: /Consigliato/ }).check();
await dlg.getByRole("button", { name: /^Salva/ }).click();
await p.waitForTimeout(1200);
check("al massimo 4 consigliati: il quinto chiede di toglierne uno", (await p.getByText(/già 4 voci consigliate/).count()) > 0 && q(`select recommended from "MenuItem" where id='${wine}'`) === "f");

// Pulizia
q(`update "MenuItem" set recommended=false, "pairDishIds"='{}', "pairHideIds"='{}'`);
for (const pair of savedPairs.split(",").filter(Boolean)) {
  const [id, w] = pair.split("=");
  q(`update "MenuItem" set "pairWineId"=${w ? `'${w}'` : "null"} where id='${id}'`);
}
q(`delete from "MenuChange" where "createdAt" > now() - interval '10 minutes' and entity='item'`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
