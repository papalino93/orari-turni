// Schermate delle novità di fine ottobre: «In vetrina» (consigli e riquadri speciali), categorie,
// voci a tempo. Una voce di prova diventa «a tempo» solo per la foto, poi torna com'era.
import { execFileSync } from "node:child_process";
import { launch, login, BASE, ADMIN_PW } from "../menu-e2e/lib.mjs";
import { WORK } from "./work.mjs";

const OUT = `${WORK}/img`;
const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
const until = new Date(`${today}T12:00:00Z`);
until.setUTCDate(until.getUTCDate() + 30);
const tempo = DB(`select i.id from "MenuItem" i join "MenuGroup" g on g.id=i."groupId" join "MenuSection" s on s.id=g."sectionId" where s.slug='taglieri' and i."deletedAt" is null and not i."textOnly" order by i."sortOrder" desc limit 1`);
const before = DB(`select coalesce("availableTo",'') from "MenuItem" where id='${tempo}'`);
DB(`update "MenuItem" set "availableTo"='${until.toISOString().slice(0, 10)}' where id='${tempo}'`);

const browser = await launch();
const mk = async (w, h, dsf = 2) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: "it-IT", timezoneId: "Europe/Rome" });
  await ctx.addInitScript(() => {
    localStorage.setItem("install-banner-dismissed", "1");
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important} svg:has(+ img.brand-logo-invert){display:none!important}";
      document.head.appendChild(st);
    });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  return { ctx, page };
};
const toEl = async (page, loc, offset = 70) => {
  await page.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  await loc.first().evaluate((el, o) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - o), offset);
  await page.waitForTimeout(600);
};

try {
  // Menù dei clienti, da telefono: il riquadro in vetrina e una voce «Fino al…».
  {
    const { ctx, page } = await mk(390, 797);
    for (let i = 0; i < 2; i++) await page.goto(`${BASE}/menu?festa=0`, { waitUntil: "networkidle", timeout: 180000 });
    await toEl(page, page.getByText("I consigli della casa", { exact: true }), 40);
    await page.screenshot({ path: `${OUT}/pub-vetrina.png` });
    await toEl(page, page.locator(`#v-${tempo}`), 260);
    await page.screenshot({ path: `${OUT}/pub-tempo.png` });
    await ctx.close();
  }
  // Gestione da computer: «In vetrina» e l'elenco delle categorie.
  {
    const { ctx, page } = await mk(1680, 1050);
    await login(page, "andrea", ADMIN_PW);
    await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
    await toEl(page, page.getByRole("region", { name: "In vetrina" }), 24);
    await page.screenshot({ path: `${OUT}/mac-vetrina.png` });
    await ctx.close();
  }
} finally {
  DB(`update "MenuItem" set "availableTo"=${before ? `'${before}'` : "null"} where id='${tempo}'`);
  await browser.close();
}
console.log("schermate vetrina pronte");
