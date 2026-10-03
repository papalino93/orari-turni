// Giro fotografico per i controlli di bug e UX: tutte le pagine, titolare e dipendente,
// telefono e computer, tema chiaro e scuro. Segnala errori JS e pagine più larghe dello
// schermo. Uso: node scripts/menu-e2e/giro.mjs <cartella-foto>
import { launch, login, BASE, ADMIN_PW, EMP_PW } from "./lib.mjs";
const OUT = process.argv[2];
const b = await launch();
const pagesAdmin = ["/", "/orari", "/dipendenti", "/ferie", "/mie-ore", "/account", "/installa", "/gestione-menu", "/statistiche", "/gestione-menu/stampa"];
const pagesPub = ["/menu", "/menu/allergeni", "/menu/p/oktoberfest", "/login"];
const problems = [];
async function tour(name, w, h, theme, user, list) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  p.on("pageerror", (e) => problems.push(`${name} JS: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && problems.push(`${name} console: ${m.text().slice(0, 160)}`));
  if (user) await login(p, user[0], user[1]);
  for (const path of list) {
    const r = await p.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 180000 });
    await p.waitForTimeout(600);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 0) problems.push(`${name} ${path}: scorrimento orizzontale ${ov}px`);
    if (r && r.status() >= 400) problems.push(`${name} ${path}: HTTP ${r.status()}`);
    const file = `${OUT}/${name}${path.replace(/\//g, "_") || "_home"}.png`;
    await p.screenshot({ path: file, fullPage: true });
  }
  await ctx.close();
}
await tour("adm-tel-scuro", 390, 844, "dark", ["andrea", ADMIN_PW], pagesAdmin);
await tour("adm-mac-chiaro", 1440, 900, "light", ["andrea", ADMIN_PW], pagesAdmin);
await tour("dip-tel", 390, 844, "light", ["marta", EMP_PW], ["/", "/mie-ore", "/gestione-menu", "/orari", "/statistiche"]);
await tour("pub-tel", 390, 844, "light", null, pagesPub);
await tour("pub-360", 360, 740, "light", null, ["/menu"]);
await b.close();
console.log([...new Set(problems.map((x) => x.split("\n")[0].slice(0, 200)))].join("\n") || "nessun problema automatico");
