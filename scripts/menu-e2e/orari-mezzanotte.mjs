// Orari: un turno può finire dopo mezzanotte (es. 18:00–01:00). Prima l'uscita dopo le 00:00 veniva
// riportata alle 13:00 (telefono) o rifiutata (salvataggio). Ora si salva, le ore sono giuste e
// le uscite sbagliate (es. 18:00–11:00) restano rifiutate.
import { launch, login, check, BASE, results, EMP_PW, DB } from "./lib.mjs";

const day = new Date(Date.now() - 12 * 86_400_000).toISOString().slice(0, 10);
const [, mm, dd] = day.split("-");
const emp = DB(`select id from "Employee" where name like 'Francesco%' limit 1`);
const clean = () => DB(`delete from "ShiftBlock" where "employeeId"='${emp}' and date='${day}'`);
const rows = () => DB(`select "startTime"||'-'||"endTime" from "ShiftBlock" where "employeeId"='${emp}' and date='${day}' order by "startTime"`);
clean();

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
await login(p, "francesco", EMP_PW);
const open = async () => {
  await p.goto(`${BASE}/mie-ore/revisione?year=${day.slice(0, 4)}&month=${Number(mm)}`, { waitUntil: "networkidle", timeout: 180000 });
  await p.getByRole("button", { name: "Ricordamelo più tardi" }).click().catch(() => {});
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await p.getByText(`${dd}/${mm}`, { exact: false }).first().click();
  await p.getByRole("button", { name: "Salva" }).waitFor();
};

await open();
await p.getByLabel("Pomeriggio — inizio").first().fill("18:00");
await p.getByLabel("Pomeriggio — fine").first().fill("01:00");
check("telefono: l'uscita 01:00 resta 01:00 (non torna alle 13:00)", (await p.getByLabel("Pomeriggio — fine").first().inputValue()) === "01:00");
check("telefono: compare l'avviso «Esci dopo mezzanotte… resta in questa giornata»", /Esci dopo mezzanotte[\s\S]*questa giornata/.test(await p.locator("body").innerText()));
await p.getByRole("button", { name: "Salva" }).click();
await p.waitForTimeout(2500);
check("l'orario 18:00–01:00 viene salvato", rows() === "18:00-01:00", rows());
check("l'elenco mostra 18:00–01:00", /18:00–01:00/.test(await p.locator("body").innerText()));

// Uscita sbagliata: 18:00–11:00 non è dopo mezzanotte
await open();
await p.getByLabel("Pomeriggio — fine").first().fill("11:00");
check("uscita 11:00 con entrata 18:00: avviso «deve essere dopo l'entrata»", /deve essere dopo l.entrata/.test(await p.locator("body").innerText()));
await p.getByRole("button", { name: "Salva" }).click();
await p.waitForTimeout(2000);
check("uscita sbagliata: non salvata, resta 18:00-01:00", rows() === "18:00-01:00", rows());

// Il solito turno serale senza mezzanotte continua a funzionare
await open();
await p.getByLabel("Pomeriggio — fine").first().fill("22:30");
await p.getByRole("button", { name: "Salva" }).click();
await p.waitForTimeout(2500);
check("turno normale 18:00–22:30 salvato", rows() === "18:00-22:30", rows());

clean();
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
