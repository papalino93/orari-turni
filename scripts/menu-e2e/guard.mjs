// Modifiche non salvate: un clic fuori o Esc non chiudono più la finestra in
// silenzio (orari e schede della gestione del menù). Senza modifiche si chiude.
import { launch, login, check, BASE, results, ADMIN_PW, DB, tool } from "./lib.mjs";

const EMP = DB(`select id from "Employee" where username='marta'`);
const d = DB(`select to_char(date_trunc('week', (now() at time zone 'Europe/Rome')::date + 7)::date, 'YYYY-MM-DD')`);
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.setDefaultTimeout(20000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/orari?view=week&date=${d}&mode=employees&employee=${EMP}`, { waitUntil: "networkidle", timeout: 180000 });
const salva = () => p.getByRole("button", { name: "Salva", exact: true }).first();
const bar = () => p.getByRole("alertdialog", { name: "Modifiche non salvate" });
const outside = async () => { const box = await salva().boundingBox(); await p.mouse.click(box.x + box.width + 80, box.y); };

// Orari: senza modifiche si chiude
await p.locator("button", { hasText: /^mar.+/i }).first().click();
await salva().waitFor();
await outside();
await p.waitForTimeout(500);
check("orari: senza modifiche il clic fuori chiude", (await salva().count()) === 0);
// Con una modifica: chiede
await p.locator("button", { hasText: /^mar.+/i }).first().click();
await salva().waitFor();
await p.locator('input[type="checkbox"]').first().check();
await outside();
await p.waitForTimeout(400);
check("orari: con una modifica il clic fuori chiede", (await bar().count()) === 1 && (await salva().count()) >= 1);
await bar().getByRole("button", { name: "Continua a modificare" }).click();
check("orari: «Continua a modificare» lascia la finestra aperta", (await bar().count()) === 0 && (await salva().count()) === 1);
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("orari: anche Esc chiede", (await bar().count()) === 1);
await bar().getByRole("button", { name: "Esci senza salvare" }).click();
await p.waitForTimeout(400);
check("orari: «Esci senza salvare» chiude", (await salva().count()) === 0);
// «Annulla» con una modifica: chiede anche lui
await p.locator("button", { hasText: /^mar.+/i }).first().click();
await salva().waitFor();
await p.locator('input[type="checkbox"]').first().check();
await p.getByRole("button", { name: "Annulla", exact: true }).last().click();
await p.waitForTimeout(300);
check("orari: anche «Annulla» chiede", (await bar().count()) === 1);
await bar().getByRole("button", { name: "Esci senza salvare" }).click();
await p.waitForTimeout(300);

// Gestione menù: scheda di una voce
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await p.locator("section ul li button[aria-label^=\"Modifica \"]:visible").first().click();
const dlg = p.locator('[role="dialog"]');
await dlg.waitFor();
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("menù: senza modifiche Esc chiude la scheda", (await dlg.count()) === 0);
await p.locator("section ul li button[aria-label^=\"Modifica \"]:visible").first().click();
await dlg.waitFor();
await dlg.getByLabel(/Nome|Azienda/).first().fill("Prova modifica non salvata");
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("menù: con una modifica Esc chiede", (await bar().count()) === 1 && (await dlg.count()) === 1);
check("menù: c'è anche «Salva»", (await bar().getByRole("button", { name: "Salva", exact: true }).count()) === 1);
await bar().getByRole("button", { name: "Esci senza salvare" }).click();
await p.waitForTimeout(400);
check("menù: «Esci senza salvare» chiude senza salvare", (await dlg.count()) === 0 && DB(`select count(*) from "MenuItem" where name='Prova modifica non salvata'`) === "0");
// La X con una modifica: chiede
await p.locator("section ul li button[aria-label^=\"Modifica \"]:visible").first().click();
await dlg.waitFor();
await dlg.getByLabel(/Nome|Azienda/).first().fill("Prova X");
await dlg.getByRole("button", { name: "Chiudi" }).click();
await p.waitForTimeout(300);
check("menù: anche la X chiede", (await bar().count()) === 1);
await bar().getByRole("button", { name: "Esci senza salvare" }).click();
await p.waitForTimeout(300);

// «Tabella prezzi»: «Salva» nel riquadro salva davvero (la scheda non ha un modulo)
await tool(p, "Tabella prezzi");
await dlg.waitFor();
const cell = dlg.locator("input").first();
const before = await cell.inputValue();
const after = before === "13" ? "14" : "13";
await cell.fill(after);
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
check("prezzi: con un prezzo cambiato Esc chiede, con «Salva»", (await bar().count()) === 1 && (await bar().getByRole("button", { name: "Salva", exact: true }).count()) === 1);
await bar().getByRole("button", { name: "Salva", exact: true }).click();
await p.getByText(/Prezzi salvati/).first().waitFor();
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
check("prezzi: «Salva» dal riquadro salva e poi Esc chiude", (await bar().count()) === 0 && (await dlg.count()) === 0);
await tool(p, "Tabella prezzi");
await dlg.waitFor();
check("prezzi: il prezzo nuovo è rimasto", (await dlg.locator("input").first().inputValue()) === after);
await dlg.locator("input").first().fill(before);
await dlg.getByRole("button", { name: "Salva tutto" }).click();
await p.getByText(/Prezzi salvati/).first().waitFor();

await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
