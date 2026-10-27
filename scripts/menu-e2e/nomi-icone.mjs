// Menù dei clienti: fuori dal suo gruppo un piatto porta il nome del gruppo al singolare
// («Sta bene con» e consigli della casa: «Pinsa Crudo & Rucola», non «Crudo & Rucola»), e nei
// consigli della casa i prezzi dei vini hanno le icone del calice e della bottiglia, non «Bott.».
import { launch, check, BASE, results, DB } from "./lib.mjs";

const pinsa = DB(`select i.id from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" where g.title='Pinse' and i.name='Crudo & Rucola' and i."deletedAt" is null limit 1`);
const vino = DB(`select id from "MenuItem" where name='Revì' and "deletedAt" is null limit 1`);
const before = DB(`select coalesce("pairWineId",'') || '|' || recommended::text from "MenuItem" where id='${pinsa}'`);
const [oldPair, oldRec] = before.split("|");
DB(`update "MenuItem" set "pairWineId"='${vino}', recommended=true, "soldOutDay"=null where id='${pinsa}'`);
const revalidate = () => fetch(`${BASE}/menu`).catch(() => {});
await revalidate();

const b = await launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.setDefaultTimeout(30000);
await p.goto(`${BASE}/menu?festa=0`, { waitUntil: "networkidle", timeout: 180000 });

const wine = p.locator(`#v-${vino}`);
const chips = await wine.locator('a[data-pair-from]').allInnerTexts();
check("«Sta bene con» sotto il vino: «Pinsa Crudo & Rucola»", chips.some((t) => t.trim() === "Pinsa Crudo & Rucola"), chips.join(" | "));
check("«Sta bene con»: «Tagliere Premium» resta com'è (il nome dice già cos'è)", chips.some((t) => t.trim() === "Tagliere Premium"), chips.join(" | "));
check("nella carta il piatto resta «Crudo & Rucola» sotto «Pinse»", /Crudo & Rucola/.test(await p.locator(`#v-${pinsa}`).innerText()) && !/Pinsa Crudo/.test(await p.locator(`#v-${pinsa}`).innerText()));

const consigli = p.locator("#v-consigli");
const t = await consigli.innerText();
check("consigli della casa: il piatto è «Pinsa Crudo & Rucola»", /Pinsa Crudo & Rucola/.test(t), t.replace(/\n/g, " | "));
check("consigli della casa: niente «Bott.» né «Calice» scritti per esteso nei vini", !/Bott\./.test(t), t.replace(/\n/g, " | "));
const card = consigli.locator(`a[href="#v-${vino}"]`);
check("consigli della casa: il vino ha le icone di calice e bottiglia", (await card.locator("svg").count()) >= 1 && /Bottiglia/.test(await card.locator(".sr-only").allInnerTexts().then((a) => a.join(" "))));

await b.close();
DB(`update "MenuItem" set "pairWineId"=${oldPair ? `'${oldPair}'` : "null"}, recommended=${oldRec} where id='${pinsa}'`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
