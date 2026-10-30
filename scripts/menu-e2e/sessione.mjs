// Accesso chiuso mentre si scrive (es. password cambiata da un altro dispositivo): il messaggio
// spiega cosa fare, la finestra resta aperta con quello che si è scritto, e dopo aver rifatto
// l'accesso in un'altra scheda basta premere di nuovo.
import { launch, login, check, BASE, results, ADMIN_PW, DB, newPromo } from "./lib.mjs";

const titolo = `Prova sessione ${Date.now()}`;
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem("install-banner-dismissed", "1"));
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await newPromo(p);
const dialog = p.locator('[role="dialog"]');
await dialog.getByLabel(/Titolo/).first().fill(titolo);

// Un altro dispositivo cambia la password: questo accesso non vale più.
DB(`update "User" set "tokenVersion" = "tokenVersion" + 1 where username='andrea'`);
await dialog.getByRole("button", { name: /^Crea evento/ }).click();
const toast = p.getByText(/Il sito non ti riconosce più/);
await toast.waitFor({ timeout: 15000 }).catch(() => {});
check("accesso chiuso: il messaggio dice cosa fare (non «non hai il permesso»)", (await toast.count()) > 0 && (await p.getByText(/Non hai il permesso/).count()) === 0);
check("la finestra resta aperta con il titolo scritto", (await dialog.count()) === 1 && (await dialog.getByLabel(/Titolo/).first().inputValue()) === titolo);
check("niente evento creato", DB(`select count(*) from "MenuPromo" where title='${titolo}'`) === "0");

// Si rientra in un'altra scheda, poi si torna e si preme di nuovo.
const altra = await ctx.newPage();
await login(altra, "andrea", ADMIN_PW);
await altra.close();
await dialog.getByRole("button", { name: /^Crea evento/ }).click();
await p.waitForTimeout(3000);
check("dopo l'accesso in un'altra scheda, «Crea» funziona", DB(`select count(*) from "MenuPromo" where title='${titolo}'`) === "1");

DB(`update "MenuPromo" set "deletedAt"=now() where title='${titolo}'`);
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
