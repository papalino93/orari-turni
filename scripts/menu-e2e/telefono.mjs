// Velocità dal telefono: «In vetrina» chiusa in una riga, giorni degli orari a fisarmonica
// (aperto solo oggi, lucchetto per chiudere il locale), «Salva» sempre in vista nella voce.
import { launch, login, check, BASE, results, ADMIN_PW, SHOTS } from "./lib.mjs";

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem("install-banner-dismissed", "1"));
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);

// Gestione menù
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
const vet = p.getByRole("region", { name: "In vetrina" });
check("telefono: «In vetrina» chiusa, con il riassunto", (await vet.getByRole("button", { name: /In vetrina/ }).getAttribute("aria-expanded")) === "false" && /consigl/.test(await vet.innerText()) && !(await vet.getByRole("button", { name: "+ Nuovo riquadro" }).isVisible()));
const firstSold = await p.getByRole("button", { name: /Esaurito/ }).first().boundingBox();
const top = firstSold ? firstSold.y + (await p.evaluate(() => scrollY)) : 99999;
check("telefono: la prima voce da segnare esaurita è entro ~1,8 schermate", top < 1550, String(Math.round(top)));
await vet.getByRole("button", { name: /In vetrina/ }).click();
check("telefono: un tocco apre «In vetrina»", await vet.getByRole("button", { name: "+ Nuovo riquadro" }).isVisible());
if (SHOTS) await p.screenshot({ path: `${SHOTS}/tel-gestione.png` });

// Scheda della voce: «Salva» in vista
await p.getByRole("button", { name: /^Modifica / }).first().click();
const save = p.getByRole("dialog").getByRole("button", { name: /^Salva/ }).first();
await p.waitForTimeout(500);
const box = await save.boundingBox();
check("scheda della voce: «Salva» visibile senza scorrere", box !== null && box.y + box.height <= 844 && box.y >= 0, JSON.stringify(box));
if (SHOTS) await p.screenshot({ path: `${SHOTS}/tel-scheda.png` });
await p.keyboard.press("Escape");

// Orari: fisarmonica
await p.goto(`${BASE}/orari`, { waitUntil: "networkidle" });
const heads = p.locator("button[data-giorno]");
const states = await heads.evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("aria-expanded")));
check("orari: sul telefono è aperto un solo giorno (oggi)", states.length === 7 && states.filter((s) => s === "true").length === 1, JSON.stringify(states));
const closedOne = heads.filter({ hasNotText: "Oggi" }).first();
await closedOne.click();
check("orari: un tocco apre un altro giorno", (await closedOne.getAttribute("aria-expanded")) === "true");
check("orari: «Chiudi» il locale su ogni giorno", (await p.getByRole("button", { name: /^(Chiudi|Riapri) il locale:/ }).count()) === 7);
const pageH = await p.evaluate(() => document.documentElement.scrollHeight);
check("orari: la settimana sul telefono è molto più corta (< 3.500 px)", pageH < 3500, String(pageH));
if (SHOTS) await p.screenshot({ path: `${SHOTS}/tel-orari.png`, fullPage: true });

await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
