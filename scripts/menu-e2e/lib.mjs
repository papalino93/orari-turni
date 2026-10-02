import { chromium } from "playwright-core";
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
