import { launch, login, BASE } from "../menu-e2e/lib.mjs";
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 850 }, locale: "it-IT" })).newPage();
await login(p, "andrea", process.env.E2E_ADMIN_PASSWORD);
await p.goto(`${BASE}/orari?view=day&date=2026-10-02`, { waitUntil: "networkidle" });
console.log((await p.locator("main").innerText()).split("\n").filter(Boolean).slice(5, 14).join(" / "));
await p.goto(`${BASE}/orari?view=day&date=2026-10-10`, { waitUntil: "networkidle" });
console.log((await p.locator("main").innerText()).split("\n").filter(Boolean).slice(5, 14).join(" / "));
await b.close();
