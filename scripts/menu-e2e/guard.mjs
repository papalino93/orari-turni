// Modifiche non salvate: un clic fuori o Esc non chiudono più la finestra in
// silenzio (orari e schede della gestione del menù). Senza modifiche si chiude.
import { launch, login, check, BASE, results, ADMIN_PW, DB, tool, goTab } from "./lib.mjs";

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
await p.waitForTimeout(1800);

// Solo la scelta del tipo (Testo / Voce con prezzo / Avviso): niente da perdere, la X chiude subito
await dlg.getByRole("button", { name: "Chiudi" }).click();
await dlg.waitFor({ state: "detached" });
await goTab(p, "Orari e contatti");
await p.locator('section[aria-label="Informazioni del menù"]').getByRole("button", { name: "+ Aggiungi" }).click();
await dlg.waitFor();
await dlg.getByRole("radio", { name: /Voce con prezzo/ }).click();
await dlg.getByRole("button", { name: "Chiudi" }).click();
await p.waitForTimeout(400);
check("nuova informazione: scelto solo il tipo, la X chiude subito", (await bar().count()) === 0 && (await dlg.count()) === 0);
// Scritto qualcosa: chiede; rimesso com'era: non chiede più
await p.locator('section[aria-label="Informazioni del menù"]').getByRole("button", { name: "+ Aggiungi" }).click();
await dlg.waitFor();
await dlg.getByRole("radio", { name: /Voce con prezzo/ }).click();
await dlg.getByLabel("Nome", { exact: true }).fill("Prova");
await dlg.getByRole("button", { name: "Chiudi" }).click();
await p.waitForTimeout(300);
check("nuova informazione: con un nome scritto la X chiede", (await bar().count()) === 1);
await bar().getByRole("button", { name: "Continua a modificare" }).click();
await dlg.getByLabel("Nome", { exact: true }).fill("");
await dlg.getByRole("button", { name: "Chiudi" }).click();
await p.waitForTimeout(400);
check("nuova informazione: nome cancellato, la X chiude senza chiedere", (await bar().count()) === 0 && (await dlg.count()) === 0);

// «Testi della sezione»: «Elimina l'avviso» toglie solo l'avviso (con conferma) e si può annullare
const tart = DB(`select id from "MenuSection" where slug='tartare'`);
DB(`update "MenuSection" set note='Nota di prova', "addonTitle"='Novità di prova', addon='Testo di prova dell''avviso' where id='${tart}'`);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await goTab(p, "Menù");
await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Tartare" }).click();
await p.getByRole("button", { name: /Modifica la nota sotto il titolo|Modifica i testi/ }).first().click();
await dlg.waitFor();
await dlg.getByRole("button", { name: "Elimina l'avviso" }).click();
check("avviso: chiede conferma", (await dlg.getByText("Eliminare l'avviso a fondo sezione?").count()) === 1);
await dlg.getByRole("button", { name: "No, tienila" }).click();
check("avviso: «No, tienila» non toglie niente", DB(`select addon from "MenuSection" where id='${tart}'`) === "Testo di prova dell'avviso");
await dlg.getByRole("button", { name: "Elimina l'avviso" }).click();
await dlg.getByRole("button", { name: "Sì, elimina" }).click();
await p.getByText("Avviso eliminato").first().waitFor();
check("avviso: eliminato, la nota resta", DB(`select coalesce("addon",'-') || '|' || coalesce("addonTitle",'-') || '|' || coalesce(note,'-') from "MenuSection" where id='${tart}'`) === "-|-|Nota di prova");
await p.locator('[role="status"] button:has-text("Annulla")').last().click();
await p.waitForTimeout(1500);
check("avviso: «Annulla» lo rimette", DB(`select addon from "MenuSection" where id='${tart}'`) === "Testo di prova dell'avviso");
DB(`update "MenuSection" set note=null, "addonTitle"=null, addon=null where id='${tart}'`);
DB(`delete from "MenuChange" where entity='section' and "at" > now() - interval '10 minutes'`);

await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
