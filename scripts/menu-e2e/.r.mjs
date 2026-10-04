import { launch, login, BASE, ADMIN_PW, goTab } from "./lib.mjs";
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage(); p.setDefaultTimeout(20000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await goTab(p, "Orari e contatti");
const dlg = p.locator('[role="dialog"]');
await p.locator('section[aria-label="Informazioni del menù"]').getByRole("button", { name: "+ Aggiungi" }).click();
await dlg.waitFor();
await dlg.getByRole("radio", { name: /Voce con prezzo/ }).click().catch(async () => { await dlg.getByText("Voce con prezzo").click(); });
await dlg.getByRole("button", { name: "Chiudi" }).click();
await p.waitForTimeout(500);
const bar = p.getByRole("alertdialog", { name: "Modifiche non salvate" });
console.log("barra dopo la X:", await bar.count());
if (await bar.count()) {
  await bar.getByRole("button", { name: "Esci senza salvare" }).click();
  await p.waitForTimeout(500);
  console.log("scheda ancora aperta dopo «Esci senza salvare»:", await dlg.count());
}
await b.close();
