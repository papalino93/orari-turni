// Giro automatico: apre ogni pagina come titolare, dipendente e cliente a tre
// larghezze, salva le schermate e segnala overflow orizzontale, errori in console,
// richieste fallite, immagini rotte e bersagli da toccare troppo piccoli.
import fs from "node:fs";
import { launch, login, BASE } from "../menu-e2e/lib.mjs";
const OUT = process.env.SHOTS ?? "/tmp/claude-0/shots/crawl";
fs.mkdirSync(OUT, { recursive: true });
const ADMIN_PW = process.env.E2E_ADMIN_PASSWORD, EMP_PW = process.env.E2E_EMPLOYEE_PASSWORD;
const VIEWPORTS = [["m", 390, 844], ["t", 820, 1180], ["d", 1366, 850]];
const issues = [];
const note = (where, msg) => { issues.push(`${where}: ${msg}`); console.log("!!", where, msg); };

const ADMIN_PAGES = [
  ["orari-settimana", "/orari?view=week&date=2026-10-02"],
  ["orari-settimana-dip", "/orari?view=week&date=2026-10-02&mode=employees"],
  ["orari-giorno", "/orari?view=day&date=2026-10-02"],
  ["orari-mese", "/orari?view=month&date=2026-09-15"],
  ["orari-anno", "/orari?view=year&date=2026-10-02"],
  ["dipendenti", "/dipendenti"],
  ["ferie", "/ferie"],
  ["account", "/account"],
  ["gestione-menu", "/gestione-menu"],
  ["installa", "/installa"],
];
const EMP_PAGES = [
  ["mie-ore", "/mie-ore"],
  ["mie-ore-revisione-set", "/mie-ore/revisione?year=2026&month=9"],
  ["installa", "/installa"],
];
const PUBLIC_PAGES = [["menu", "/menu"], ["allergeni", "/menu/allergeni"], ["login", "/login"]];

async function audit(page, tag, vpName, w) {
  const m = await page.evaluate((w) => {
    const de = document.documentElement;
    const over = de.scrollWidth - de.clientWidth;
    const wide = [...document.querySelectorAll("body *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > w + 1) && getComputedStyle(e).position !== "fixed" && !e.closest("[data-scroll],.overflow-x-auto,.overflow-auto,.overflow-hidden");
    }).slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 50));
    const small = [...document.querySelectorAll("a,button,input,select,textarea,[role=button]")].filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.height < 32 || r.width < 32) && !(e.tagName === "INPUT" && /checkbox|radio/.test(e.type));
    }).slice(0, 6).map((e) => `${e.tagName}:${(e.innerText || e.getAttribute("aria-label") || e.className || "").toString().trim().slice(0, 25)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src);
    const clipped = [...document.querySelectorAll("h1,h2,h3,p,span,button,a,label")].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow === "hidden" && getComputedStyle(e).textOverflow !== "ellipsis" && e.clientWidth > 0).slice(0, 3).map((e) => (e.innerText || "").slice(0, 30));
    return { over, wide, small, broken, clipped };
  }, w);
  const where = `${tag}@${vpName}`;
  if (m.over > 0) note(where, `overflow orizzontale ${m.over}px (${m.wide.join(", ")})`);
  if (m.broken.length) note(where, `immagini rotte ${m.broken.join(",")}`);
  if (m.clipped.length) note(where, `testo tagliato: ${m.clipped.join(" | ")}`);
  if (m.small.length && vpName === "m") note(where, `bersagli piccoli (<32px): ${m.small.join(" | ")}`);
}

async function run(role, pages, user, pw) {
  const browser = globalThis.browser;
  for (const [vpName, w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: vpName !== "d" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 160)));
    page.on("response", (r) => { if (r.status() >= 400 && !/_next\/image|favicon/.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
    if (user) await login(page, user, pw);
    for (const [name, path] of pages) {
      errs.length = 0;
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120000 }).catch((e) => note(`${role}/${name}@${vpName}`, "goto: " + e.message.slice(0, 80)));
      // chiude eventuale modale "Installa l'app"
      const later = page.getByRole("button", { name: /Ricordamelo più tardi/i });
      if (await later.count()) await later.first().click().catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${role}-${name}-${vpName}.png`, fullPage: true });
      await audit(page, `${role}/${name}`, vpName, w);
      for (const e of errs) note(`${role}/${name}@${vpName}`, "console/rete: " + e);
    }
    await ctx.close();
  }
}
globalThis.browser = await launch();
await run("admin", ADMIN_PAGES, "andrea", ADMIN_PW);
await run("dip", EMP_PAGES, "giulia", EMP_PW);
await run("pub", PUBLIC_PAGES, null);
await globalThis.browser.close();
fs.writeFileSync(`${OUT}/issues.txt`, issues.join("\n"));
console.log(`\n${issues.length} segnalazioni`);
