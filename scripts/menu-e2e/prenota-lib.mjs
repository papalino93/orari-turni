// Aiuti comuni alle prove delle prenotazioni online (prenota-*.mjs). Come lib.mjs, ma il browser
// arriva da `playwright` (require) e non da `playwright-core` (che qui non sempre si trova).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BASE = process.env.BASE || "http://localhost:3100";
export const ADMIN_PW = process.env.E2E_ADMIN_PASSWORD || "admin-locale";
export const EMP_PW = process.env.E2E_EMPLOYEE_PASSWORD || "dip-locale";
export const SHOTS = process.env.SHOTS;

// Variabili di .env.local (NEXTAUTH_SECRET, DATABASE_URL), senza sovrascrivere quelle già impostate.
export function loadEnvLocal() {
  try {
    for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

export const results = [];
export function check(name, ok, extra = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra !== "" && extra !== undefined ? " — " + extra : ""}`);
}
export function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} ok`);
  return failed.length ? 1 : 0;
}

// Database di prova (psql, utente orari/orari): MAI quello di produzione. E2E_DB ne sceglie un altro
// (es. orari_rubrica per una seconda copia di lavoro), sempre locale.
export const TEST_DB = process.env.E2E_DB || "orari_test";
export const DB = (sql) =>
  execFileSync("psql", ["-h", "localhost", "-U", "orari", TEST_DB, "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } })
    .toString()
    .trim();
export const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- Impostazioni «bookings» e permessi: si rimettono sempre come erano.
export function snapshotBookingSetting() {
  const row = DB(`select value from "MenuSetting" where id='bookings'`);
  return row === "" ? null : row;
}
export function restoreBookingSetting(saved) {
  if (saved === null) DB(`delete from "MenuSetting" where id='bookings'`);
  else DB(`insert into "MenuSetting" (id, value) values ('bookings', ${q(saved)}) on conflict (id) do update set value=excluded.value`);
}
export const DEFAULTS = { agendaEnabled: false, enabled: false, firstTime: "12:00", lastBeforeClose: 60, step: 30, maxPeople: 10, leadMinutes: 60, daysAhead: 30, notifyEmail: "", capacityHint: 0 };
export function setBookingSetting(over) {
  const value = JSON.stringify({ ...DEFAULTS, ...over });
  DB(`insert into "MenuSetting" (id, value) values ('bookings', ${q(value)}) on conflict (id) do update set value=excluded.value`);
}
export function snapshotPermissions() {
  return DB(`select id||':'||"canManageBookings" from "Employee" order by id`).split("\n").filter(Boolean).map((l) => l.split(":"));
}
export function restorePermissions(saved) {
  for (const [id, v] of saved) DB(`update "Employee" set "canManageBookings"=${v === "t"} where id=${q(id)}`);
}
// Se la prova viene interrotta (Ctrl+C, timeout, uscita chiusa come con «| head»), rimette lo stesso
// le cose come erano: altrimenti l'impostazione di prova resterebbe e la prova dopo la prenderebbe
// per quella «di prima».
export function onInterrupt(restore) {
  process.stdout.on("error", () => {});
  const h = () => {
    try {
      restore();
    } finally {
      process.exit(130);
    }
  };
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(s, h);
}
// Tutto quello che le prove creano: richieste «Prova C…», serate chiuse e giornate chiuse di prova.
export function cleanBookings() {
  DB(`delete from "BookingRequest" where name like 'Prova C%'`);
  DB(`delete from "BookingClosedDay" where "createdBy" like 'Prova C%' or reason like 'Prova C%'`);
  DB(`delete from "ClosureDay" where reason like 'Prova C%'`);
}

// Giorni e orari prenotabili adesso, calcolati dal servizio vero (vedi prenota-giorni.mjs).
export function bookableDays() {
  const out = execFileSync("npx", ["tsx", path.join(ROOT, "scripts/menu-e2e/prenota-giorni.mjs")], { cwd: ROOT, env: process.env }).toString();
  return JSON.parse(out.trim().split("\n").pop());
}

// Timbro del modulo (come formStamp in /menu/prenota/server-utils.ts): serve per le chiamate
// dirette a /menu/prenota/invia. `ago` = da quanti millisecondi il modulo è aperto.
export async function formStamp(ago = 5000) {
  loadEnvLocal();
  const { createHmac } = await import("node:crypto");
  const ts = Date.now() - ago;
  const mac = createHmac("sha256", process.env.NEXTAUTH_SECRET).update(`prenota-form:${ts}`).digest("base64url").slice(0, 32);
  return `${ts}.${mac}`;
}
// Freno anti-spam complessivo (15 richieste online in 10 minuti → pausa da sola): le prove ne mandano
// tante. Prima di ogni invio le richieste degli ultimi 10 minuti si spostano a 11 minuti fa (il limite
// per IP, un'ora, conta ancora) e si toglie un'eventuale pausa. Il freno ha la sua prova (prenota-regole).
export function coolDown() {
  DB(`update "BookingRequest" set "createdAt" = now() - interval '11 minutes' where "createdAt" > now() - interval '11 minutes' and manual = false`);
  const row = DB(`select value from "MenuSetting" where id='bookings'`);
  if (row && /"pausedUntil":"[^"]/.test(row)) {
    const v = JSON.parse(row);
    v.pausedUntil = "";
    DB(`update "MenuSetting" set value=${q(JSON.stringify(v))} where id='bookings'`);
  }
}

// Invio diretto del modulo, come farebbe la pagina (Origin del sito, IP a scelta).
export async function postRequest(body, { ip = randomIp(), headers = {} } = {}) {
  if (!headers["x-no-cooldown"]) coolDown();
  const r = await fetch(`${BASE}/menu/prenota/invia`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip, ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {}
  return { status: r.status, json, headers: r.headers };
}

// ---------- Browser
export async function launch() {
  let pw;
  try {
    pw = require("playwright");
  } catch {
    pw = require("playwright-core");
  }
  return pw.chromium.launch();
}
// Contesto «telefono» (iPhone) o «computer», in italiano e senza inviti a installare l'app.
export async function newContext(browser, kind = "phone", extra = {}) {
  const opts =
    kind === "phone"
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" }
      : { viewport: { width: 1440, height: 900 } };
  const ctx = await browser.newContext({ locale: "it-IT", timezoneId: "Europe/Rome", ...opts, ...extra });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem("festa-8-anni-vista", "1");
      sessionStorage.setItem("employee-install-prompt-dismissed", "1");
      localStorage.setItem("install-banner-dismissed", "1");
    } catch {}
  });
  return ctx;
}
export async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000, waitUntil: "commit" });
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Un indirizzo IP diverso per ogni «cliente» (il servizio conta le richieste per IP).
export const randomIp = () => `10.${77}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
// Un cellulare di prova diverso ogni volta (333 9xx xxxx).
export const randomPhone = () => `333 9${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;

// ---------- Agenda (prenota-agenda.mjs): nomi «Prova Agenda …» e telefoni 300 005 xxxx (39300005… nel database).
export const agendaPhone = (n) => `300 005 ${String(n % 10000).padStart(4, "0")}`;
export function cleanAgenda() {
  DB(`delete from "BookingRequest" where name like 'Prova Agenda%' or phone like '39300005%' or phone like '+39300005%'`);
  DB(`delete from "ClosureDay" where reason like 'Prova Agenda%'`);
  DB(`delete from "BookingClosedDay" where reason like 'Prova Agenda%' or "createdBy" like 'Prova Agenda%'`);
}
// Le altre prove (prenota-staff, prenota-cliente, giro…) accendono/spengono le prenotazioni e rimettono
// i permessi sullo stesso database: lanciate insieme si disturbano. Si aspetta che finiscano (fino a `ms`).
export async function waitOtherTests(ms = 15 * 60000) {
  const others = () => {
    try {
      return execFileSync("ps", ["-eo", "pid,ppid,args"])
        .toString()
        .split("\n")
        .filter((l) => /^\s*\d+\s+\d+\s+node (\S*\/)?scripts\/menu-e2e\/[\w-]+\.mjs/.test(l) && Number(l.trim().split(/\s+/)[0]) !== process.pid && !/prenota-giorni\.mjs/.test(l))
        .map((l) => l.trim().split(/\s+/).slice(2).join(" ").replace(/^.*scripts\/menu-e2e\//, ""));
    } catch {
      return [];
    }
  };
  const end = Date.now() + ms;
  let said = false;
  while (Date.now() < end) {
    const o = others();
    if (!o.length) return true;
    if (!said) console.log(`(aspetto che finiscano le altre prove sullo stesso database: ${[...new Set(o)].join(", ")})`);
    said = true;
    await wait(5000);
  }
  console.log("(le altre prove sono ancora in corso: parto lo stesso, qualche controllo può risentirne)");
  return false;
}
// Il server di prova può essere riavviato (dopo una migrazione): si aspetta che risponda, fino a `ms`.
export async function waitServer(ms = 600000) {
  const end = Date.now() + ms;
  let said = false;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(20000) });
      if (r.status < 500) return true;
    } catch {}
    if (!said) console.log(`(il server ${BASE} non risponde: aspetto)`);
    said = true;
    await wait(5000);
  }
  throw new Error(`il server ${BASE} non risponde`);
}
