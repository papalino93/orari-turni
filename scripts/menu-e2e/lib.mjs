import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Imposta la variabile d'ambiente ${name} (vedi docs/menu-handoff.md).`);
  return value;
};
export const ADMIN_PW = need("E2E_ADMIN_PASSWORD");
export const EMP_PW = need("E2E_EMPLOYEE_PASSWORD");
export const BASE = "http://localhost:3100";
export const SHOTS = process.env.SHOTS;
export async function launch() {
  return chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
}
export async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000, waitUntil: "commit" });
}
export const results = [];
export function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
}

// Accesso diretto al database di prova (psql, utente orari/orari).
export const DB = (sql) =>
  execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" } })
    .toString()
    .trim();

// Riporta i blocchi informativi allo stato della migrazione: solo «Chiusura cucina»
// (testo) e «Coperto € 1,00» (voce con prezzo), sotto Taglieri & Pinse e Tartare.
export function resetBlocks() {
  DB(`delete from "MenuBlock" where id not in ('blk_kitchen_note','blk_cover')`);
  DB(`update "MenuBlock" set "deletedAt"=null, hidden=false, "startDate"=null, "endDate"=null, placement='SECTIONS', "sectionIds"='{menu_sec_taglieri,menu_sec_tartare}' where id in ('blk_kitchen_note','blk_cover')`);
  DB(`update "MenuBlock" set label='Coperto', "priceCents"=100, kind='PRICE', "sortOrder"=1 where id='blk_cover'`);
  DB(`update "MenuBlock" set kind='TEXT', "sortOrder"=0 where id='blk_kitchen_note'`);
}
