// Orario ridotto: un turno con qualche ora di permesso nello stesso giorno
// (es. Francesco, ogni lunedì 2 ore di permesso «fino a nuova comunicazione»).
// «Ripeti settimana» lo ripete; il dipendente in revisione corregge i turni ma
// non tocca il permesso.
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, DB } from "./lib.mjs";

const EMP = DB(`select id from "Employee" where username='francesco'`);
const nextMonday = DB(`select to_char(date_trunc('week', (now() at time zone 'Europe/Rome')::date + 7)::date, 'YYYY-MM-DD')`);
const monday2 = DB(`select to_char('${nextMonday}'::date + 7, 'YYYY-MM-DD')`);
const lastMonday = DB(`select to_char(date_trunc('week', (now() at time zone 'Europe/Rome')::date - 7)::date, 'YYYY-MM-DD')`);
const days = `('${nextMonday}','${monday2}','${lastMonday}')`;
const reset = () => {
  DB(`delete from "ShiftBlock" where "employeeId"='${EMP}' and date in ${days}`);
  DB(`delete from "LeaveEntry" where "employeeId"='${EMP}' and date in ${days}`);
};
reset();
DB(`delete from "ClosureDay" where date in ${days}`);
// Le due settimane di prova senza altri turni di Francesco: ore della settimana
// facili da controllare e la copia che riempie la seconda.
DB(`delete from "ShiftBlock" where "employeeId"='${EMP}' and date between '${nextMonday}'::date and '${monday2}'::date + 6`);
DB(`delete from "LeaveEntry" where "employeeId"='${EMP}' and date between '${nextMonday}'::date and '${monday2}'::date + 6`);
DB(`insert into "ShiftBlock" (id, "employeeId", date, "startTime", "endTime", "updatedAt") values ('e2e_perm_b1','${EMP}','${nextMonday}','16:30','20:00', now())`);

const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);
const openMonday = async (dateKey) => {
  await p.goto(`${BASE}/orari?view=week&date=${dateKey}&mode=employees&employee=${EMP}`, { waitUntil: "networkidle", timeout: 180000 });
  await p.locator("button", { hasText: /^lun.+/i }).first().click();
  await p.getByRole("button", { name: "Salva", exact: true }).waitFor();
};

await openMonday(nextMonday);
check("editor: «+ Permesso a ore» nel turno", (await p.getByRole("button", { name: "+ Permesso a ore (orario ridotto)" }).count()) === 1);
await p.getByRole("button", { name: "+ Permesso a ore (orario ridotto)" }).click();
check("editor: 2 ore proposte", (await p.getByLabel("Ore di permesso").inputValue()) === "2");
await p.getByRole("button", { name: "Salva", exact: true }).click();
await p.waitForTimeout(1500);
check("DB: turno e permesso nello stesso giorno", DB(`select (select string_agg("startTime"||'-'||"endTime", ',') from "ShiftBlock" where "employeeId"='${EMP}' and date='${nextMonday}')||'|'||(select type||':'||quantity from "LeaveEntry" where "employeeId"='${EMP}' and date='${nextMonday}')`) === "16:30-20:00|PERMESSO:2");
const card = await p.locator("main").innerText();
check("griglia: si vedono turno e permesso", /16:30–\s*20:00/.test(card) && /\+ Permesso 2 h/.test(card), card.slice(0, 300));
await p.screenshot({ path: process.env.SHOTDIR ? `${process.env.SHOTDIR}/permesso-griglia.png` : "/dev/null" });
check("griglia: ore della settimana = ore lavorate (3,5)", /\b3,5\b/.test(card), card.match(/[0-9,]+\s*ORE/i)?.[0] ?? "");

// Riaprendo, il permesso c'è già
await openMonday(nextMonday);
check("riaperto: permesso già compilato", (await p.getByLabel("Ore di permesso").inputValue()) === "2");
await p.keyboard.press("Escape");

// «Ripeti settimana» sulla settimana dopo
await p.goto(`${BASE}/orari?view=week&date=${monday2}`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Ripeti settimana" }).click();
await p.locator("select").last().selectOption(EMP);
await p.getByRole("button", { name: "Sì, ripeti" }).click();
await p.waitForTimeout(2000);
check("ripeti settimana: turno e permesso ripetuti", DB(`select (select count(*) from "ShiftBlock" where "employeeId"='${EMP}' and date='${monday2}')||'|'||coalesce((select type||':'||quantity from "LeaveEntry" where "employeeId"='${EMP}' and date='${monday2}'),'-')`) === "1|PERMESSO:2");

// «Togli» quando finisce
await openMonday(monday2);
await p.getByRole("button", { name: "Togli", exact: true }).click();
await p.getByRole("button", { name: "Salva", exact: true }).click();
await p.waitForTimeout(1500);
check("togli: resta il turno, sparisce il permesso", DB(`select (select count(*) from "ShiftBlock" where "employeeId"='${EMP}' and date='${monday2}')||'|'||(select count(*) from "LeaveEntry" where "employeeId"='${EMP}' and date='${monday2}')`) === "1|0");

// Permesso di un giorno intero: niente turni
await openMonday(monday2);
await p.getByRole("button", { name: "Permesso", exact: true }).click();
await p.getByRole("button", { name: "Salva", exact: true }).click();
await p.waitForTimeout(1500);
check("permesso intero: il turno si toglie", DB(`select (select count(*) from "ShiftBlock" where "employeeId"='${EMP}' and date='${monday2}')||'|'||(select type from "LeaveEntry" where "employeeId"='${EMP}' and date='${monday2}')`) === "0|PERMESSO");

// Revisione del dipendente: corregge l'orario, il permesso resta
DB(`insert into "ShiftBlock" (id, "employeeId", date, "startTime", "endTime", "updatedAt") values ('e2e_perm_b2','${EMP}','${lastMonday}','16:30','20:00', now())`);
DB(`insert into "LeaveEntry" (id, "employeeId", date, type, quantity) values ('e2e_perm_l2','${EMP}','${lastMonday}','PERMESSO',2)`);
const [y, m] = lastMonday.split("-").map(Number);
DB(`delete from "MonthlySubmission" where "employeeId"='${EMP}' and year=${y} and month=${m}`);
const epCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
// Senza l'invito «installa l'app» del primo accesso.
await epCtx.addInitScript(() => {
  try {
    sessionStorage.setItem("employee-install-prompt-dismissed", "1");
    localStorage.setItem("install-banner-dismissed", "1");
  } catch {}
});
const ep = await epCtx.newPage();
ep.setDefaultTimeout(30000);
await login(ep, "francesco", EMP_PW);
await ep.goto(`${BASE}/mie-ore/revisione?year=${y}&month=${m}`, { waitUntil: "networkidle", timeout: 180000 });
const dayNum = Number(lastMonday.slice(8));
await ep.locator("button", { hasText: new RegExp(`\\b${dayNum}\\b[\\s\\S]*16:30`) }).first().click();
await ep.getByRole("button", { name: "Salva", exact: true }).waitFor();
check("revisione: niente pulsanti Ferie/Permesso/Malattia", (await ep.getByRole("button", { name: "Ferie", exact: true }).count()) === 0);
check("revisione: il permesso del titolare si vede, non si cambia", /Permesso di 2 h registrato dal titolare/.test(await ep.locator("form").innerText()));
const end = ep.locator('input[type="time"]').last();
await end.fill("20:30");
await ep.getByRole("button", { name: "Salva", exact: true }).click();
await ep.waitForTimeout(1500);
check("revisione: orario corretto e permesso intatto", DB(`select (select "endTime" from "ShiftBlock" where "employeeId"='${EMP}' and date='${lastMonday}' and "startTime">='13:00')||'|'||(select type||':'||quantity from "LeaveEntry" where "employeeId"='${EMP}' and date='${lastMonday}')`) === "20:30|PERMESSO:2");

reset();
DB(`delete from "MonthlySubmission" where "employeeId"='${EMP}' and year=${y} and month=${m}`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
