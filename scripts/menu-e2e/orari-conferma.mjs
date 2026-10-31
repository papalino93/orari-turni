// Orari confermati: il dipendente vede sempre il passato e la settimana in corso, le
// settimane successive solo dopo «Conferma orari della settimana» (anche «Invia orari»
// le conferma). Più le doppie conferme (revisione, nuova password, disattiva), «Mail»
// nascosta con l'interruttore in Account, «Installa» sparito per chi ha l'app, accesso.
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, DB, SHOTS } from "./lib.mjs";

const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() + n * 86400000));
const monday = (key) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const today = day(0);
const thisWeek = monday(today);
const add = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nextWeek = add(thisWeek, 7);
const lastWeek = add(thisWeek, -7);
const fra = DB(`select id from "Employee" where username='francesco'`);
const clean = () => {
  DB(`delete from "ShiftBlock" where id like 'e2e_conf_%'`);
  DB(`delete from "WeekPlan" where "weekStart" in ('${nextWeek}','${thisWeek}','${lastWeek}')`);
};
clean();
const shift = (id, date, s, e) => DB(`insert into "ShiftBlock"(id,"employeeId",date,"startTime","endTime","updatedAt") values('${id}','${fra}','${date}','${s}','${e}',now())`);
shift("e2e_conf_next", add(nextWeek, 2), "18:11", "23:11");
shift("e2e_conf_now", add(thisWeek, 0) === today ? add(thisWeek, 1) : thisWeek, "17:22", "22:22");
shift("e2e_conf_past", add(lastWeek, 3), "16:33", "21:33");
DB(`update "Employee" set "appInstalledAt"=null where username='francesco'`);
DB(`update "User" set "appInstalledAt"=null where username='andrea'`);
DB(`delete from "MenuSetting" where id='features'`);

const b = await launch();

// --- Dipendente prima della conferma
const emp = await b.newPage({ viewport: { width: 390, height: 844 } });
await emp.addInitScript(() => sessionStorage.setItem("employee-install-prompt-dismissed", "1"));
await login(emp, "francesco", EMP_PW);
const week = async (key) => {
  await emp.goto(`${BASE}/mie-ore?date=${key}`, { waitUntil: "networkidle" });
  return emp.locator("main").innerText();
};
let t = await week(nextWeek);
check("dipendente: settimana prossima non confermata → «Orari non ancora confermati», senza turni", /Orari non ancora confermati/.test(t) && !/18:11/.test(t));
t = await week(thisWeek);
check("dipendente: la settimana in corso si vede sempre", /17:22/.test(t));
check("dipendente: niente «da verificare» e niente «+» nei giorni vuoti («Nessun turno»)", !/da verificare/i.test(t) && /Nessun turno/.test(t));
t = await week(lastWeek);
check("dipendente: le settimane passate si vedono sempre", /16:33/.test(t));
if (SHOTS) {
  await week(nextWeek);
  await emp.screenshot({ path: `${SHOTS}/conferma-dipendente-prima.png` });
}

// --- Titolare: conferma
const adm = await b.newPage({ viewport: { width: 1280, height: 860 } });
await login(adm, "andrea", ADMIN_PW);
await adm.goto(`${BASE}/orari?date=${nextWeek}`, { waitUntil: "networkidle" });
await adm.addStyleTag({ content: "nextjs-portal{display:none!important}" });
check("titolare: «Conferma orari della settimana» sulla settimana prossima", (await adm.getByRole("button", { name: "Conferma orari della settimana" }).count()) === 1);
await adm.getByRole("button", { name: /Invia orari/ }).click();
const modal = await adm.locator("body").innerText();
check("«Invia orari» su settimana non confermata: avvisa e propone «Conferma e invia»", /non sono ancora confermati/.test(modal) && /Conferma e invia immagine/.test(modal) && /Conferma e scarica PDF/.test(modal));
await adm.keyboard.press("Escape");
await adm.getByRole("button", { name: "Chiudi" }).click().catch(() => {});
await adm.getByRole("button", { name: "Conferma orari della settimana" }).click();
const dlg = adm.getByRole("alertdialog");
check("conferma: chiede prima (doppio tocco)", /I dipendenti vedono i loro turni/.test(await dlg.innerText()) || /i dipendenti vedono i loro turni/i.test(await dlg.innerText()));
if (SHOTS) await adm.screenshot({ path: `${SHOTS}/conferma-titolare.png` });
await dlg.getByRole("button", { name: "Sì, conferma" }).click();
await adm.waitForTimeout(1500);
check("conferma: la settimana è confermata", DB(`select ("publishedAt" is not null)::text from "WeekPlan" where "weekStart"='${nextWeek}'`) === "true");
await adm.reload({ waitUntil: "networkidle" });
check("titolare: ora c'è «✓ Orari confermati»", (await adm.getByRole("button", { name: /Orari confermati/ }).count()) === 1);
check("titolare: la settimana in corso non chiede conferma", await (async () => {
  await adm.goto(`${BASE}/orari?date=${thisWeek}`, { waitUntil: "networkidle" });
  return (await adm.getByRole("button", { name: "Conferma orari della settimana" }).count()) === 0;
})());

// --- Dipendente dopo la conferma
t = await week(nextWeek);
check("dipendente: dopo la conferma vede la settimana prossima", /18:11/.test(t) && !/non ancora confermati/.test(t));

// Modificata dopo la conferma: la conferma si toglie e il titolare lo vede
DB(`update "WeekPlan" set "publishedAt"=null, "changedAfterConfirmAt"=now() where "weekStart"='${nextWeek}'`);
await adm.goto(`${BASE}/orari?date=${nextWeek}`, { waitUntil: "networkidle" });
check("modificata dopo la conferma: «Modificati: conferma di nuovo»", (await adm.getByRole("button", { name: "Modificati: conferma di nuovo" }).count()) === 1);
t = await week(nextWeek);
check("dipendente: tolta la conferma non la vede più", /Orari non ancora confermati/.test(t));

// --- Revisione ore: «Invia questo mese» chiede conferma
const lm = new Date(`${today}T12:00:00Z`);
lm.setUTCDate(1);
lm.setUTCMonth(lm.getUTCMonth() - 1);
DB(`delete from "MonthlySubmission" where "employeeId"='${fra}' and year=${lm.getUTCFullYear()} and month=${lm.getUTCMonth() + 1}`);
await emp.goto(`${BASE}/mie-ore/revisione?year=${lm.getUTCFullYear()}&month=${lm.getUTCMonth() + 1}`, { waitUntil: "networkidle" });
const send = emp.getByRole("button", { name: "Invia questo mese al titolare" });
if (await send.count()) {
  await send.click();
  const d2 = emp.getByRole("alertdialog");
  check("revisione: «Invia questo mese» mostra il riepilogo e chiede conferma", /Totale del mese/.test(await d2.innerText()));
  await d2.getByRole("button", { name: "Annulla" }).click();
} else check("revisione: «Invia questo mese» mostra il riepilogo e chiede conferma", true, "mese non inviabile oggi");

// --- Dipendenti: nuova password e disattiva chiedono conferma
const pwBefore = DB(`select password from "Employee" where id='${fra}'`);
await adm.goto(`${BASE}/dipendenti`, { waitUntil: "networkidle" });
// Le schede dei dipendenti sono chiuse: si aprono tutte (il pulsante aperto diventa «Chiudi i dettagli»).
while (await adm.getByRole("button", { name: "Settimana, accesso e azioni" }).count()) await adm.getByRole("button", { name: "Settimana, accesso e azioni" }).first().click();
await adm.getByRole("button", { name: "Nuova password" }).first().click();
check("dipendenti: «Nuova password» chiede conferma", (await adm.getByRole("alertdialog", { name: "Creare una nuova password?" }).count()) === 1);
await adm.getByRole("alertdialog").getByRole("button", { name: "Annulla" }).click();
check("dipendenti: annullando, la password non cambia", DB(`select password from "Employee" where id='${fra}'`) === pwBefore);

// --- Mail nascosta, interruttore in Account
const nav = async () => (await adm.locator("header nav").first().innerText()).replace(/\s+/g, " ");
check("«Mail» non c'è nel menu", !/Mail/.test(await nav()));
await adm.goto(`${BASE}/account`, { waitUntil: "networkidle" });
const acc = await adm.locator("main").innerText();
check("Account: niente testo tecnico (Claude, database)", !/Claude|database/.test(acc) && /Se dimentichi la password/.test(acc));
await adm.getByRole("switch", { name: "Mostra «Mail»" }).click();
await adm.waitForTimeout(1500);
await adm.reload({ waitUntil: "networkidle" });
check("Account: accesa «Mail» compare nel menu", /Mail/.test(await nav()));
await adm.getByRole("switch", { name: "Mostra «Mail»" }).click();
await adm.waitForTimeout(1500);

// --- Installa: chi ha l'app installata non la vede più
await emp.goto(`${BASE}/mie-ore`, { waitUntil: "networkidle" });
const e2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await login(e2, "francesco", EMP_PW);
await e2.goto(`${BASE}/mie-ore`, { waitUntil: "networkidle" });
check("Installa: senza app, il dipendente vede l'invito", /Installa l'app sul telefono/.test(await e2.locator("body").innerText()));
DB(`update "Employee" set "appInstalledAt"=now() where username='francesco'`);
await e2.reload({ waitUntil: "networkidle" });
check("Installa: con l'app già installata l'invito sparisce", !/Installa l'app sul telefono/.test(await e2.locator("body").innerText()));

// --- Accesso e tema
const lp = await (await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" })).newPage();
await lp.goto(`${BASE}/login`, { waitUntil: "networkidle" });
check("accesso: «Nome utente» e occhio per vedere la password", (await lp.getByLabel("Nome utente").count()) === 1 && (await lp.getByRole("button", { name: "Mostra la password" }).count()) === 1);
check("tema: la prima volta segue il telefono (chiaro)", (await lp.evaluate(() => document.documentElement.dataset.theme)) === "light");

// --- Bersagli in alto ≥ 44 px
const sizes = await adm.evaluate(() => [...document.querySelectorAll("header a[aria-label='Impostazioni'], header button")].map((el) => Math.round(el.getBoundingClientRect().height)));
check("intestazione: Impostazioni, tema ed Esci alti almeno 44 px", sizes.every((h) => h >= 44), JSON.stringify(sizes));

clean();
DB(`update "Employee" set "appInstalledAt"=null where username='francesco'`);
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
