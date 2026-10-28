// Voci a tempo: «Solo in un periodo» (dal… al…) nella scheda di una voce del menù fisso.
// Nel periodo la voce si vede con «Fino al …»; prima e dopo sparisce da menù, ricerca,
// stampa e allergeni; nella gestione resta, con lo stato. Finita non chiede gli allergeni.
import { launch, login, check, BASE, results, ADMIN_PW, DB, SHOTS } from "./lib.mjs";

const day = (n) => {
  // Giorno commerciale (inizia alle 5:00, ora italiana) spostato di n giorni.
  const d = new Date(Date.now() - 5 * 3600 * 1000 + n * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);
};
const group = DB(`select g.id from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" where s.slug='taglieri' and g."deletedAt" is null order by g."sortOrder" limit 1`);
DB(`delete from "MenuItem" where name like 'Olio nuovo E2E%'`);
const add = (id, name, from, to, reviewed = false) =>
  DB(`insert into "MenuItem"(id,"groupId",name,"priceCents","allergensReviewed","availableFrom","availableTo","sortOrder","updatedAt") values('${id}','${group}','${name}',600,${reviewed},${from ? `'${from}'` : "null"},${to ? `'${to}'` : "null"},99,now())`);
add("e2e_olio_ora", "Olio nuovo E2E ora", day(-1), day(20), true);
add("e2e_olio_poi", "Olio nuovo E2E poi", day(3), day(20));
add("e2e_olio_finito", "Olio nuovo E2E finito", day(-20), day(-2));

const b = await launch();
const phone = await b.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(`${BASE}/menu?festa=0`, { waitUntil: "networkidle", timeout: 180000 });
const body = await phone.locator("main").innerText();
check("menù: la voce nel periodo si vede, con «Fino al …»", /Olio nuovo E2E ora\s*FINO AL/i.test(body), body.match(/Olio nuovo E2E ora[^\n]*\n?[^\n]*/)?.[0]);
check("menù: la voce che non è ancora iniziata non si vede", !/Olio nuovo E2E poi/.test(body));
check("menù: la voce finita non si vede", !/Olio nuovo E2E finito/.test(body));
if (SHOTS) {
  await phone.locator("#v-e2e_olio_ora").scrollIntoViewIfNeeded();
  await phone.screenshot({ path: `${SHOTS}/voce-a-tempo-menu.png` });
}
await phone.goto(`${BASE}/menu/allergeni`, { waitUntil: "networkidle" });
const allerg = await phone.locator("body").innerText();
check("allergeni: le voci fuori periodo non ci sono", /Olio nuovo E2E ora/.test(allerg) && !/E2E poi|E2E finito/.test(allerg));

const page = await b.newPage({ viewport: { width: 1280, height: 860 } });
await login(page, "andrea", ADMIN_PW);
await page.goto(`${BASE}/gestione-menu/stampa`, { waitUntil: "networkidle" });
const print = await page.locator("main").innerText();
check("stampa: solo la voce nel periodo", /Olio nuovo E2E ora/.test(print) && !/E2E poi|E2E finito/.test(print));

await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.getByRole("navigation", { name: "Categorie" }).getByRole("button", { name: /^Taglieri/ }).click();
const list = await page.locator("main").innerText();
check("gestione: tutte e tre restano, con lo stato", /Olio nuovo E2E ora[\s\S]*?Sul menù dal/.test(list) && /Olio nuovo E2E poi[\s\S]*?ora i clienti non la vedono/.test(list) && /Olio nuovo E2E finito[\s\S]*?Finita il[^\n]*i clienti non la vedono più/.test(list));
const t = await page.locator("body").innerText();
const m = t.match(/(\d+) piatt[oi] ha(?:nno)? gli allergeni da compilare/) ?? (/1 piatto ha gli allergeni/.test(t) ? [0, "1"] : null);
const count = m ? Number(m[1]) : 0;
DB(`update "MenuItem" set "allergensReviewed"=true where id='e2e_olio_finito'`);
await page.reload({ waitUntil: "networkidle" });
const t2 = await page.locator("body").innerText();
const m2 = t2.match(/(\d+) piatt[oi] ha(?:nno)? gli allergeni da compilare/) ?? (/1 piatto ha gli allergeni/.test(t2) ? [0, "1"] : null);
check("allergeni da compilare: la voce finita non conta", (m2 ? Number(m2[1]) : 0) === count, `${count}`);
DB(`update "MenuItem" set "allergensReviewed"=false where id='e2e_olio_finito'`);

// Scheda: le date si scrivono e si salvano
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.getByRole("navigation", { name: "Categorie" }).getByRole("button", { name: /^Taglieri/ }).click();
await page.getByRole("button", { name: "Modifica Olio nuovo E2E poi" }).click();
const sheet = page.getByRole("dialog");
await sheet.waitFor();
check("scheda: «Solo in un periodo» con Dal e Al già compilati", /Solo in un periodo/.test(await sheet.innerText()) && (await sheet.getByLabel("Dal", { exact: true }).inputValue()) === day(3));
await sheet.getByLabel("Dal", { exact: true }).fill(day(0));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/voce-a-tempo-scheda.png` });
await sheet.getByRole("button", { name: /^Salva/ }).first().click();
await sheet.waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
check("scheda: salvata la nuova data «dal»", DB(`select "availableFrom" from "MenuItem" where id='e2e_olio_poi'`) === day(0));
await phone.goto(`${BASE}/menu?festa=0`, { waitUntil: "networkidle" });
check("menù: con il periodo iniziato oggi la voce compare", /Olio nuovo E2E poi/.test(await phone.locator("main").innerText()));

DB(`delete from "MenuItem" where name like 'Olio nuovo E2E%'`);
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
