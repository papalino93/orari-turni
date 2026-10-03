// Il consulente (secondo login da amministratore) ha sul menù gli stessi permessi del titolare.
import bcrypt from "bcryptjs";
import { launch, login, check, BASE, results, DB } from "./lib.mjs";

const hash = await bcrypt.hash("consulente-locale", 4);
DB(`delete from "User" where username='consulente_e2e'`);
DB(`insert into "User" (id, username, name, "passwordHash") values ('e2e_consulente','consulente_e2e','Consulente Prova','${hash}')`);
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p.setDefaultTimeout(60000);
await login(p, "consulente_e2e", "consulente-locale");
for (const [path, what] of [["/gestione-menu", /Menù/], ["/statistiche", /Statistiche del menù/], ["/gestione-menu/stampa", /Bollicine|Stampa/i]]) {
  const r = await p.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 180000 });
  check(`consulente: entra in ${path}`, r?.status() === 200 && new URL(p.url()).pathname === path && what.test(await p.locator("body").innerText()), p.url());
}
const guida = await p.request.get(`${BASE}/gestione-menu/guida`);
check("consulente: scarica la guida", guida.ok() && (guida.headers()["content-type"] ?? "").includes("pdf"));
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle" });
check("consulente: voce «Statistiche» nel menù di navigazione", (await p.getByRole("link", { name: "Statistiche" }).count()) > 0);
// Una modifica vera: «Esaurito» su un vino e poi di nuovo disponibile
const first = p.getByRole("button", { name: "Esaurito", exact: true }).first();
await first.click();
await p.waitForTimeout(1500);
check("consulente: può segnare un esaurito", Number(DB(`select count(*) from "MenuChange" where "actorName"='Consulente Prova'`)) >= 1);
await p.locator('[role="status"] button:has-text("Annulla")').last().click().catch(() => {});
await p.waitForTimeout(1200);
DB(`delete from "User" where username='consulente_e2e'`);
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
