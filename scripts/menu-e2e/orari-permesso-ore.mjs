// Orari: permesso a ore nello stesso giorno del turno (es. un'ora per il corso).
// Titolare: pulsante ben visibile «Aggiungi ore di permesso al turno», ore con «−»/«+», avviso se sceglie «Permesso» (tutta la giornata).
// Dipendente: nella revisione del mese lo segna da solo, lo cambia o lo toglie; quello del titolare resta com'è;
// senza turno non si può; il titolare vede il permesso segnato dal dipendente.
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, DB } from "./lib.mjs";

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
// Due giorni passati dello stesso mese (la revisione del dipendente vale per il mese in corso, ancora in bozza).
const back = (n) => iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), Math.max(1, today.getUTCDate() - n))));
const dayOwner = back(3);
const dayEmp = back(2);
const emp = DB(`select id from "Employee" where name like 'Francesco%' limit 1`);
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const clean = () => {
  for (const d of [dayOwner, dayEmp]) {
    DB(`delete from "ShiftBlock" where "employeeId"='${emp}' and date='${d}'`);
    DB(`delete from "LeaveEntry" where "employeeId"='${emp}' and date='${d}'`);
  }
  DB(`delete from "ClosureDay" where date in ('${dayOwner}','${dayEmp}')`);
  DB(`update "MonthlySubmission" set status='DRAFT' where "employeeId"='${emp}' and year=${Number(dayEmp.slice(0, 4))} and month=${Number(dayEmp.slice(5, 7))}`);
};
const leave = (d) => DB(`select type||' '||quantity||' '||"addedByEmployee" from "LeaveEntry" where "employeeId"='${emp}' and date='${d}'`);
const blocks = (d) => DB(`select "startTime"||'-'||"endTime" from "ShiftBlock" where "employeeId"='${emp}' and date='${d}' order by "startTime"`);
clean();

const b = await launch();
const mk = async (user, pw) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await login(p, user, pw);
  return p;
};
const noBanner = async (p) => {
  await p.getByRole("button", { name: "Ricordamelo più tardi" }).click({ timeout: 1500 }).catch(() => {});
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
};
const pomeriggio = async (p, start, end) => {
  const box = p.getByRole("checkbox", { name: "Pomeriggio" });
  if (!(await box.isChecked())) await box.check();
  await p.getByLabel("Pomeriggio — inizio").first().fill(start);
  await p.getByLabel("Pomeriggio — fine").first().fill(end);
};

// ---- Titolare
const own = await mk("andrea", ADMIN_PW);
const openOwner = async () => {
  await own.goto(`${BASE}/orari?view=day&date=${dayOwner}`, { waitUntil: "networkidle", timeout: 180000 });
  await noBanner(own);
  await own.getByRole("button", { name: /Francesco/ }).first().click();
  await own.getByRole("button", { name: "Salva" }).waitFor();
};
await openOwner();
const add = own.getByRole("button", { name: /Aggiungi ore di permesso al turno/ });
check("titolare: pulsante «Aggiungi ore di permesso al turno» ben visibile", await add.isVisible());
check("titolare: il pulsante spiega cosa scrivere sopra e cosa qui", /Sopra le ore lavorate davvero, qui quelle di permesso/.test(await add.innerText()));
await pomeriggio(own, "16:30", "21:30");
await add.click();
const grp = own.getByRole("group", { name: "Ore di permesso nel turno" });
check("titolare: si parte da 1 ora", /1 h/.test(await grp.innerText()));
check("titolare: conto «Lavorate 5 h + permesso 1 h = turno di 6 h»", /Lavorate 5 h \+ permesso 1 h = turno di 6 h/.test(await grp.innerText()));
check("titolare: esempio chiaro di cosa scrivere sopra", /turno 8:00–12:00 ma esci alle 11:00 → sopra scrivi 8:00–11:00, qui 1 h/.test(await grp.innerText()));
await grp.getByRole("button", { name: "Mezz'ora in più" }).click();
check("titolare: «+» porta a 1,5 h", /1,5 h/.test(await grp.innerText()));
await grp.getByRole("button", { name: "Mezz'ora in meno" }).click();
check("titolare: «−» torna a 1 h", /1 h/.test(await grp.innerText()));
await own.getByRole("button", { name: "Salva" }).click();
await own.waitForTimeout(2500);
check("titolare: salvati turno 16:30–21:30 e permesso di 1 ora", blocks(dayOwner) === "16:30-21:30" && leave(dayOwner) === "PERMESSO 1 false", `${blocks(dayOwner)} | ${leave(dayOwner)}`);
check("titolare: nella giornata si vedono turno e «+ Permesso 1 h»", /16:30–\s*21:30[\s\S]*Permesso 1 h/.test(await own.locator("main").innerText()));

await openOwner();
check("titolare: riaprendo, il permesso c'è ancora (1 h)", /1 h/.test(await own.getByRole("group", { name: "Ore di permesso nel turno" }).innerText()));
await own.getByRole("button", { name: "Permesso", exact: true }).click();
check("titolare: con «Permesso» (tutta la giornata) spiega di usare «Turno» se lavora qualche ora", /Permesso per tutta la giornata[\s\S]*Aggiungi ore di permesso al turno/.test(await own.locator("body").innerText()));
await own.getByRole("button", { name: "Annulla" }).click();
await own.getByRole("button", { name: /Esci senza salvare|Scarta/ }).click({ timeout: 2000 }).catch(() => {});

// ---- Dipendente
const dip = await mk("francesco", EMP_PW);
const openDip = async (d) => {
  await dip.goto(`${BASE}/mie-ore/revisione?year=${d.slice(0, 4)}&month=${Number(d.slice(5, 7))}`, { waitUntil: "networkidle", timeout: 180000 });
  await noBanner(dip);
  await dip.getByText(ddmm(d)).first().click();
  await dip.getByRole("button", { name: "Salva" }).waitFor();
};
// Il permesso del titolare resta com'è
await openDip(dayOwner);
check("dipendente: il permesso del titolare si vede ma non si cambia", /registrato dal titolare: resta com/.test(await dip.locator("body").innerText()) && (await dip.getByRole("button", { name: /Aggiungi ore di permesso al turno/ }).count()) === 0);
await dip.getByRole("button", { name: "Annulla" }).click();

// Lo segna da solo
await openDip(dayEmp);
await pomeriggio(dip, "18:00", "22:00");
await dip.getByRole("button", { name: /Aggiungi ore di permesso al turno/ }).click();
check("dipendente: il riquadro dice che il titolare lo vede", /Il titolare lo vede quando gli mandi il mese/.test(await dip.locator("body").innerText()));
await dip.getByRole("button", { name: "Salva" }).click();
await dip.waitForTimeout(2500);
check("dipendente: salvati turno 18:00–22:00 e permesso di 1 ora segnato da lui", blocks(dayEmp) === "18:00-22:00" && leave(dayEmp) === "PERMESSO 1 true", `${blocks(dayEmp)} | ${leave(dayEmp)}`);

// Lo cambia
await openDip(dayEmp);
await dip.getByRole("group", { name: "Ore di permesso nel turno" }).getByRole("button", { name: "Mezz'ora in più" }).click();
await dip.getByRole("button", { name: "Salva" }).click();
await dip.waitForTimeout(2500);
check("dipendente: può cambiarlo (1,5 h)", leave(dayEmp) === "PERMESSO 1.5 true", leave(dayEmp));

// Il titolare lo vede segnalato
await own.goto(`${BASE}/orari?view=day&date=${dayEmp}`, { waitUntil: "networkidle", timeout: 180000 });
await noBanner(own);
check("titolare: vede il permesso segnato dal dipendente", (await own.locator('[title="Permesso segnato dal dipendente durante la revisione mensile"]').count()) > 0);

// Senza turno non si può
await openDip(dayEmp);
await dip.getByRole("checkbox", { name: "Pomeriggio" }).uncheck();
await dip.getByRole("button", { name: "Salva" }).click();
await dip.getByText(/Il permesso a ore va insieme al turno/).first().waitFor();
check("dipendente: senza turno il permesso non si salva (avviso chiaro)", leave(dayEmp) === "PERMESSO 1.5 true");
await dip.getByRole("checkbox", { name: "Pomeriggio" }).check();

// Lo toglie
await dip.getByRole("group", { name: "Ore di permesso nel turno" }).getByRole("button", { name: "Togli" }).click();
await dip.getByRole("button", { name: "Salva" }).click();
await dip.waitForTimeout(2500);
check("dipendente: può toglierlo, il turno resta", leave(dayEmp) === "" && blocks(dayEmp) === "18:00-22:00", `${blocks(dayEmp)} | ${leave(dayEmp)}`);

clean();
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
