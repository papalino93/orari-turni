// Fotografa ogni widget in ogni grandezza con il simulatore (sim.js) e segnala testi
// tagliati, cose che escono dai bordi e spazi vuoti troppo grandi.
// Uso: node scripts/widget-sim/run.mjs <cartella> [widget…]
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3100";
const OUT = process.argv[2] || "/tmp/widget-sim";
const ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } }).toString().trim();

// Una chiave per il titolare e una per un dipendente (con tutti i widget permessi).
function key(owner) {
  const k = "adv_" + randomBytes(32).toString("base64url");
  const h = createHash("sha256").update(k).digest("hex");
  DB(`insert into "WidgetDevice" (id, ${owner.col}, name, "keyHash") values ('sim_${randomBytes(6).toString("hex")}', '${owner.id}', 'Simulatore', '${h}')`);
  return k;
}
DB(`delete from "WidgetDevice" where name = 'Simulatore'`);
const userId = DB(`select id from "User" where username='andrea'`);
const emp = DB(`select id from "Employee" where username='marta'`);
DB(`update "Employee" set widgets='{menu,fuorimenu,qr,turni,pannello,apri,stasera,clienti}' where id='${emp}'`);
// Una chiave per widget: il freno contro le richieste a raffica vale per chiave.
const ADMIN = () => key({ col: '"userId"', id: userId });
const DIP = () => key({ col: '"employeeId"', id: emp });
// Turni di prova per oggi (mattina e sera), tolti alla fine.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
DB(`delete from "ShiftBlock" where id like 'simw_%'`);
const staff = DB(`select id from "Employee" where active and username is not null order by "sortOrder" limit 5`).split("\n");
const turni = [["10:00", "15:00"], ["10:00", "15:00"], ["17:00", "23:30"], ["17:00", "24:00"], ["18:00", "23:30"]];
// Con ANTEPRIME=<cartella>: dati realistici per le immagini della guida (aperture di oggi,
// un turno domani per il dipendente) e foto senza cornice, una per widget e grandezza.
const ANTEPRIME = process.env.ANTEPRIME;
// Con TEMA=crema|bordeaux|nero|notte: il widget con quei colori (come scriverlo nel campo «Parameter»).
const TEMA = process.env.TEMA || "";
if (ANTEPRIME) {
  mkdirSync(ANTEPRIME, { recursive: true });
  // I confronti si fanno «alla stessa ora»: tutte le aperture finte stanno entro l'ora di adesso,
  // così l'anteprima è uguale a qualunque ora la si rigeneri (ieri 46, stesso giorno della settimana ~43).
  const ora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const giorno = (n) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const quanti = [[0, 31], [1, 46], [7, 46], [14, 41], [21, 44], [28, 39], [35, 45], [42, 43], [49, 42], [56, 44]];
  const values = quanti
    .flatMap(([n, k]) => Array.from({ length: k }, (_, i) => `('simw_e_${n}_${i}', '${giorno(n)}', ${i % (ora + 1)}, ${(((new Date(`${giorno(n)}T12:00:00Z`).getUTCDay() + 6) % 7) + 1)}, 'open')`))
    .join(",");
  DB(`insert into "MenuEvent" (id, day, hour, weekday, kind) values ${values}`);
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  DB(`insert into "ShiftBlock" (id, "employeeId", date, "startTime", "endTime", "updatedAt") values ('simw_m', '${emp}', '${tomorrow.toISOString().slice(0, 10)}', '18:00', '23:30', now())`);
}
staff.forEach((id, i) => DB(`insert into "ShiftBlock" (id, "employeeId", date, "startTime", "endTime", "updatedAt") values ('simw_${i}', '${id}', '${today}', '${turni[i][0]}', '${turni[i][1] === "24:00" ? "00:00" : turni[i][1]}', now())`));

const PLAN = [
  ["aperture", ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"], ADMIN],
  ["riepilogo", ["medium", "large", "extraLarge"], ADMIN],
  ["settimana", ["medium", "large"], ADMIN],
  ["oggi", ["small", "medium", "large"], ADMIN],
  ["dafare", ["small", "medium"], ADMIN],
  ["menu", ["medium", "large"], ADMIN],
  ["fuorimenu", ["medium", "large"], DIP],
  ["qr", ["small", "large"], DIP],
  ["turni", ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"], DIP],
  ["riepilogo", ["small"], ADMIN],
  // Widget dei momenti della giornata.
  ["pannello", ["large"], ADMIN],
  ["pannello", ["large"], DIP, "dip"],
  ["apri", ["small"], ADMIN],
  ["sala", ["medium"], ADMIN],
  ["mattina", ["medium"], ADMIN],
  ["stasera", ["medium"], ADMIN],
  ["andamento", ["large"], ADMIN],
  ["clienti", ["medium"], DIP],
];
// Con FINTI=1 le anteprime della pagina «Widget sul telefono»: solo i widget proposti, nelle grandezze mostrate.
if (process.env.FINTI) {
  PLAN.length = 0;
  PLAN.push(["pannello", ["large"], ADMIN], ["pannello", ["large"], DIP, "dip"], ["sala", ["medium"], ADMIN], ["mattina", ["medium"], ADMIN], ["stasera", ["medium"], ADMIN], ["clienti", ["medium"], DIP], ["andamento", ["large"], ADMIN], ["apri", ["small"], ADMIN], ["qr", ["small"], DIP], ["aperture", ["small", "accessoryRectangular", "accessoryCircular"], ADMIN], ["turni", ["small", "medium", "accessoryRectangular"], DIP]);
}
// Tre telefoni: mini (più stretto), Pro, Pro Max (più largo).
// Misure vere dei widget (punti) per tre larghezze di schermo, come in misure() di angolo.js.
const PHONES = {
  mini: { small: [148, 148], medium: [321, 148], large: [321, 324], extraLarge: [715, 342] },
  pro: { small: [158, 158], medium: [338, 158], large: [338, 354], extraLarge: [715, 342] },
  max: { small: [170, 170], medium: [364, 170], large: [364, 382], extraLarge: [715, 342] },
};
const SCREEN = { mini: 375, pro: 393, max: 430 };

const sim = readFileSync(new URL("./sim.js", import.meta.url), "utf8");
const script = readFileSync(new URL("../../public/widget/angolo.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 600 } });
// Una pagina statica dello stesso sito (niente React che riscrive la pagina): così le richieste ai dati sono «stesso sito».
await page.goto(`${BASE}/widget/angolo.js`, { waitUntil: "load" });
// Con FINTI=1: dati di esempio di una serata (finti.mjs) al posto di quelli del database di prova.
const FINTI = process.env.FINTI ? (await import("./finti.mjs")).FINTI : null;
let finto = null;
if (FINTI) {
  await page.route(`${BASE}/api/widget/**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...finto, tema: TEMA || "crema" }) }));
  await page.route(`${BASE}/sim/*.png`, (route) => route.fulfill({ path: new URL(`../guida/assets/${route.request().url().split("/").pop()}`, import.meta.url).pathname }));
}
const problems = [];

for (const [nome, families, chiaveDi, chi] of PLAN) {
  if (ONLY.length && !ONLY.includes(nome)) continue;
  const chiave = chiaveDi();
  if (FINTI) finto = FINTI[chi ? `${nome}-${chi}` : nome] ?? null;
  if (FINTI && !finto) continue;
  for (const fam of families) {
    for (const [phone, scale] of Object.entries(PHONES)) {
      if (fam.startsWith("accessory") && phone !== "pro") continue;
      await page.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Baskervville:ital,wght@0,400;0,600;1,400&display=swap"><style>body{margin:0;background:${process.env.ANTEPRIME ? "transparent" : "#3a2a30"};padding:24px;display:inline-block}#w{border-radius:22px;overflow:hidden;position:relative}#w.acc{background:#3b2730;border-radius:0}</style></head><body><div id="w"></div></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(
        async ({ sim, script, nome, fam, chiave, base, scale, screen, tema }) => {
          window.__screenWidth = screen;
          window.__isPad = fam === "extraLarge";
          window.config = { widgetFamily: fam, runsInWidget: true };
          eval(sim);
          const [W, H] = scale[fam] || window.__sim.SIZES[fam];
          let widget = null;
          window.args = { widgetParameter: tema ? `${nome} ${tema}` : nome };
          window.config = { widgetFamily: fam, runsInWidget: true };
          window.Script = { setWidget: (w) => (widget = w), complete: () => {} };
          const AF = Object.getPrototypeOf(async function () {}).constructor;
          try {
            await new AF("SITO", "CHIAVE", script)(base, chiave);
          } catch (e) {
            return { error: String(e && e.stack ? e.stack : e) };
          }
          const box = document.getElementById("w");
          if (fam.startsWith("accessory")) box.className = "acc";
          box.style.width = W + "px";
          box.style.height = H + "px";
          const root = window.__sim.render(widget, "column");
          root.style.width = "100%";
          root.style.height = "100%";
          if (fam.startsWith("accessory")) root.style.background = "transparent";
          box.appendChild(root);
          await new Promise((r) => setTimeout(r, 50));
          await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
          // Controlli: testi tagliati, cose fuori dal riquadro utile, contenuto più alto del widget.
          const out = [];
          const rb = root.getBoundingClientRect();
          const pad = widget.padding;
          const inner = { l: rb.left + pad[1] - 0.5, r: rb.right - pad[3] + 0.5, t: rb.top + pad[0] - 0.5, b: rb.bottom - pad[2] + 0.5 };
          for (const el of root.querySelectorAll(".tx")) {
            const multi = el.style.webkitLineClamp;
            if (el.scrollWidth > el.clientWidth + 1 || (multi && el.scrollHeight > el.clientHeight + 2)) out.push(`testo tagliato: «${el.textContent}»`);
          }
          for (const el of root.querySelectorAll(".tx, .im")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if (r.left < inner.l || r.right > inner.r || r.top < inner.t || r.bottom > inner.b) out.push(`fuori dal bordo: «${el.textContent || "immagine"}» (${Math.round(r.left - rb.left)},${Math.round(r.top - rb.top)} ${Math.round(r.width)}×${Math.round(r.height)})`);
          }
          if (root.scrollHeight > H + 1) out.push(`contenuto più alto del widget (${root.scrollHeight} > ${H})`);
          // Spazio vuoto verticale più grande del 40% dell'altezza: di solito è un difetto.
          const ys = [...root.querySelectorAll(".tx, .im")].map((e) => e.getBoundingClientRect()).filter((r) => r.height).sort((a, b) => a.top - b.top);
          let covered = inner.t, gap = 0;
          for (const r of ys) {
            if (r.top > covered) gap = Math.max(gap, r.top - covered);
            covered = Math.max(covered, r.bottom);
          }
          gap = Math.max(gap, inner.b - covered);
          if (!fam.startsWith("accessory") && gap > H * 0.4) out.push(`spazio vuoto di ${Math.round(gap)} px`);
          return { problems: out, W, H };
        },
        { sim, script, nome, fam, chiave, base: BASE, scale, screen: SCREEN[phone], tema: TEMA },
      );
      const tag = `${nome}${chi ? "-" + chi : ""}-${fam}${TEMA ? "-" + TEMA : ""}-${phone}`;
      if (result.error) {
        problems.push(`${tag}: ERRORE ${result.error}`);
        continue;
      }
      await page.locator("#w").screenshot({ path: `${OUT}/${tag}.png` });
      if (ANTEPRIME && phone === "pro") await page.locator("#w").screenshot({ path: `${ANTEPRIME}/${nome}${chi ? "-" + chi : ""}-${fam}${TEMA ? "-" + TEMA : ""}.png`, omitBackground: true });
      for (const p of result.problems) problems.push(`${tag}: ${p}`);
    }
  }
}
await browser.close();
DB(`delete from "WidgetDevice" where name = 'Simulatore'`);
DB(`delete from "ShiftBlock" where id like 'simw_%'`);
DB(`delete from "MenuEvent" where id like 'simw_e_%'`);
console.log(problems.length ? problems.join("\n") : "nessun problema");
console.log(`\nfoto in ${OUT}`);
