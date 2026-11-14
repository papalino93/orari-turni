// «Vista larga»: il pulsante accanto al tondino dell'account (in alto a destra), solo da computer; allarga le pagine e si ricorda.
import { launch, login, check, BASE, results, ADMIN_PW } from "./lib.mjs";

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem("install-banner-dismissed", "1"));
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
await login(p, "andrea", ADMIN_PW);
const width = () => p.locator("main").evaluate((m) => m.getBoundingClientRect().width);

for (const path of ["statistiche", "orari", "gestione-menu", "dipendenti"]) {
  await p.goto(`${BASE}/${path}`, { waitUntil: "networkidle", timeout: 180000 });
  const before = await width();
  if (path === "statistiche") {
    const sw = p.getByRole("button", { name: "Vista larga", exact: true });
    check("computer: il pulsante «Vista larga» accanto al tondino dell'account", (await sw.count()) === 1);
    await sw.click();
  }
  const content = p.locator("main .app-wide").first();
  const cw = (await content.count()) ? await content.evaluate((e) => e.getBoundingClientRect().width) : await width();
  check(`${path}: in vista larga il contenuto usa quasi tutto lo schermo`, cw > 1450, `${Math.round(before)} → ${Math.round(cw)}`);
}
await p.reload({ waitUntil: "networkidle" });
const kept = await p.locator('button[aria-label="Vista larga"][aria-pressed="true"]').waitFor({ timeout: 5000 }).then(() => true, () => false);
check("la vista larga resta dopo aver ricaricato", kept && (await p.locator("html").getAttribute("data-wide")) === "1");
await p.getByRole("button", { name: "Vista larga", exact: true }).click();
check("un tocco torna alla vista normale", (await width()) < 1300, String(Math.round(await width())));

const tel = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const t = await tel.newPage();
await login(t, "andrea", ADMIN_PW);
await t.goto(`${BASE}/orari`, { waitUntil: "networkidle" });
check("telefono: «Vista larga» non c'è", !(await t.getByRole("button", { name: "Vista larga", exact: true }).isVisible()));

await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
