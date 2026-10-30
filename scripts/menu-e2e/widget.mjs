// Widget sulla Home: sicurezza delle chiavi, permessi per persona, pagine di gestione e guida.
import { createHash, randomBytes } from "node:crypto";
import { launch, login, check, BASE, SHOTS, results, ADMIN_PW, EMP_PW, DB } from "./lib.mjs";

const marta = DB(`select id from "Employee" where username='marta'`);
const andrea = DB(`select id from "User" where username='andrea'`);
DB(`delete from "WidgetDevice" where name like 'Prova%'`);
DB(`update "Employee" set widgets='{}', "widgetTheme"=null where id='${marta}'`);
DB(`update "User" set "widgetTheme"=null where id=(select id from "User" where username='andrea')`);

function addKey(col, id, extra = "") {
  const k = "adv_" + randomBytes(32).toString("base64url");
  const h = createHash("sha256").update(k).digest("hex");
  const dev = "w_" + randomBytes(5).toString("hex");
  DB(`insert into "WidgetDevice" (id, ${col}, name, "keyHash"${extra ? ", " + extra.split("=")[0] : ""}) values ('${dev}', '${id}', 'Prova', '${h}'${extra ? ", " + extra.split("=")[1] : ""})`);
  return { k, dev };
}
const ip = () => `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
async function get(nome, key, headers = {}) {
  const r = await fetch(`${BASE}/api/widget/${nome}`, { headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "X-Forwarded-For": ip(), ...headers } });
  let body = null;
  try {
    body = await r.json();
  } catch {}
  return { status: r.status, body, cache: r.headers.get("cache-control") };
}

// ---------- Sicurezza delle chiavi
check("senza chiave: 401", (await get("aperture")).status === 401);
check("chiave inventata: 401", (await get("aperture", "adv_" + randomBytes(32).toString("base64url"))).status === 401);
check("widget sconosciuto: 404", (await get("pippo", "x")).status === 404);
const admin = addKey('"userId"', andrea);
const ap = await get("aperture", admin.k, { "X-Device-Name": "iPhone di Andrea" });
check("titolare: «aperture» con i numeri", ap.status === 200 && typeof ap.body.oggi === "number" && typeof ap.body.ieri === "number" && ap.body.link.startsWith("/statistiche"), JSON.stringify(ap.body).slice(0, 120));
check("risposta mai in cache condivisa", ap.cache === "no-store");
check("colori di partenza: crema", ap.body.tema === "crema");
for (const n of ["riepilogo", "settimana", "oggi", "dafare", "menu", "fuorimenu", "qr"]) {
  const r = await get(n, admin.k, { "X-Device-Name": "iPhone di Andrea" });
  check(`titolare: «${n}» risponde`, r.status === 200 && r.body.widget === n, `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}
check("titolare: «turni» non è suo (solo dipendenti)", (await get("turni", admin.k)).status === 403);
check("ultimo uso e nome del telefono salvati", DB(`select "deviceName" from "WidgetDevice" where id='${admin.dev}'`) === "iPhone di Andrea" && DB(`select "lastUsedAt" is not null from "WidgetDevice" where id='${admin.dev}'`) === "t");
await get("aperture", admin.k, { "X-Device-Name": "iPhone di qualcun altro" });
check("stessa chiave da un altro telefono: segnalata", DB(`select "otherDeviceAt" is not null from "WidgetDevice" where id='${admin.dev}'`) === "t");
check("nel database c'è solo l'impronta, mai la chiave", DB(`select count(*) from "WidgetDevice" where "keyHash" like 'adv_%'`) === "0");

const dip = addKey('"employeeId"', marta);
check("dipendente non autorizzato: «turni» → accesso tolto", (await get("turni", dip.k)).body?.errore === "tolto");
DB(`update "Employee" set widgets='{turni,qr}' where id='${marta}'`);
const t = await get("turni", dip.k);
check("dipendente autorizzato: «turni» risponde", t.status === 200 && Array.isArray(t.body.settimana) && t.body.settimana.length === 7);
check("dipendente: «qr» col link stampato sui tavoli", (await get("qr", dip.k)).body?.url === "https://qrco.de/bes4Ad");
check("dipendente: «menu» non dato → 403", (await get("menu", dip.k)).body?.errore === "permesso");
check("dipendente: statistiche mai (aperture) → 403", (await get("aperture", dip.k)).body?.errore === "permesso");
check("dipendente: «dafare» mai → 403", (await get("dafare", dip.k)).status === 403);

DB(`update "WidgetDevice" set "revokedAt"=now() where id='${dip.dev}'`);
check("telefono scollegato: «Accesso tolto»", (await get("turni", dip.k)).body?.errore === "tolto");
const old = addKey('"userId"', andrea);
DB(`update "WidgetDevice" set "createdAt"=now() - interval '100 days' where id='${old.dev}'`);
check("chiave mai usata da 100 giorni: scaduta", (await get("aperture", old.k)).body?.errore === "scaduta");

// Chi prova chiavi a caso dallo stesso indirizzo viene fermato.
let blocked = false;
for (let i = 0; i < 24; i++) {
  const r = await get("aperture", "adv_" + randomBytes(32).toString("base64url"), { "X-Forwarded-For": "10.9.9.9" });
  if (r.status === 429) blocked = true;
}
check("20 chiavi sbagliate dallo stesso indirizzo: bloccato (429)", blocked);

const js = await fetch(`${BASE}/widget/angolo.js`);
check("disegno dei widget servito, con il marchio che lo script controlla", js.status === 200 && (await js.text()).startsWith("// ANGOLO_WIDGET"));
check("il disegno non passa dall'accesso (file statico)", js.url.endsWith("/widget/angolo.js"));

// ---------- Pagine
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem("install-banner-dismissed", "1"));
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/account`, { waitUntil: "networkidle", timeout: 180000 });
await p.getByRole("link", { name: /Widget sul telefono/ }).click();
await p.waitForURL(/\/widget$/);
await p.waitForLoadState("networkidle");
check("Account → «Widget sul telefono»", (await p.getByRole("heading", { name: "Widget sul telefono", level: 1 }).count()) === 1);
check("titolare: «Chi può usare i widget», «I widget», guida, telefoni", (await p.getByRole("heading", { name: "Chi può usare i widget" }).count()) === 1 && (await p.getByRole("heading", { name: "I widget", exact: true }).count()) === 1 && (await p.getByRole("heading", { name: "Mettere i widget sul telefono" }).count()) === 1 && (await p.getByRole("heading", { name: "Telefoni collegati" }).count()) === 1);
check("titolare: 8 widget con anteprima (i suoi e quelli che può dare)", (await p.locator('img[alt^="Anteprima del widget"]').count()) === 8);
const srcs = await p.locator('img[alt^="Anteprima del widget"]').evaluateAll((els) => els.map((e) => e.getAttribute("src")));
const imgsOk = (await Promise.all(srcs.map(async (u) => (await fetch(BASE + u)).headers.get("content-type") === "image/png"))).every(Boolean);
check("le anteprime si caricano", imgsOk);
check("link a Scriptable sull'App Store", (await p.getByRole("link", { name: /Scarica dall.App Store/ }).getAttribute("href")) === "https://apps.apple.com/it/app/scriptable/id1405459188");

// Autorizzare Marta: interruttore e widget uno per uno
DB(`update "Employee" set widgets='{}' where id='${marta}'`);
await p.reload({ waitUntil: "networkidle" });
const sw = p.getByRole("switch", { name: "Può usare i widget: Marta Neri" });
check("Marta: non autorizzata all'inizio", (await sw.getAttribute("aria-checked")) === "false");
await sw.click();
await p.waitForTimeout(1500);
check("accendendo: Marta ha i 4 widget dei dipendenti", DB(`select widgets::text from "Employee" where id='${marta}'`) === "{menu,fuorimenu,qr,turni}");
await p.getByRole("button", { name: "✓ Anteprima menù" }).click();
await p.waitForTimeout(1500);
check("togliendo un widget: solo quello sparisce", DB(`select widgets::text from "Employee" where id='${marta}'`) === "{fuorimenu,qr,turni}");
if (SHOTS) await p.screenshot({ path: `${SHOTS}/widget-titolare.png`, fullPage: true });

// Colori dei widget
check("colori: 4 temi, «Crema» in uso", (await p.getByRole("button", { name: /Crema.*In uso/ }).count()) === 1 && (await p.locator('section:has(h2:text-is("Colori dei widget")) button').count()) === 4);
await p.getByRole("button", { name: /^Nero/ }).click();
await p.waitForTimeout(1500);
check("scegliendo «Nero»: salvato per la persona", DB(`select "widgetTheme" from "User" where username='andrea'`) === "nero");
check("il telefono riceve i nuovi colori senza toccarlo", (await get("aperture", admin.k)).body?.tema === "nero");
check("le anteprime della galleria seguono i colori scelti", (await p.locator('img[alt^="Anteprima del widget"]').first().getAttribute("src")).includes("/anteprime/nero/"));
DB(`update "User" set "widgetTheme"=null where username='andrea'`);

// Collegare questo telefono
await p.getByLabel("Nome del telefono").fill("Prova iPhone di Andrea");
await p.getByRole("button", { name: "Crea il collegamento" }).click();
const area = p.getByLabel("Script da incollare in Scriptable");
await area.waitFor();
const script = await area.inputValue();
check("script pronto, con sito e chiave", /const SITO = "http:\/\/localhost:3100";/.test(script) && /const CHIAVE = "adv_[A-Za-z0-9_-]{43}";/.test(script));
const key = script.match(/const CHIAVE = "(adv_[^"]+)"/)[1];
check("la chiave dello script funziona", (await get("riepilogo", key)).status === 200);
await p.getByRole("button", { name: "Copia lo script" }).click();
await p.getByRole("button", { name: "Copiato ✓" }).waitFor({ timeout: 5000 }).catch(() => {});
check("«Copia lo script» → «Copiato ✓»", (await p.getByRole("button", { name: "Copiato ✓" }).count()) === 1);
check("negli appunti c'è proprio lo script", (await p.evaluate(() => navigator.clipboard.readText())) === script);
await p.reload({ waitUntil: "networkidle" });
const row = p.locator("li", { hasText: "Prova iPhone di Andrea" });
check("il telefono compare in «Telefoni collegati»", (await row.count()) === 1);
await row.getByRole("button", { name: "Scollega" }).click();
await p.getByRole("button", { name: "Sì, scollega" }).click();
await p.waitForTimeout(1500);
check("«Scollega» con conferma: la chiave smette subito di funzionare", (await get("riepilogo", key)).body?.errore === "tolto");

// Dipendente
const e = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
await e.context().addInitScript(() => localStorage.setItem("install-banner-dismissed", "1"));
await login(e, "marta", EMP_PW);
await e.goto(`${BASE}/mie-ore`, { waitUntil: "networkidle", timeout: 180000 });
check("dipendente autorizzata: in «Le mie ore» c'è «Widget sul telefono»", (await e.getByRole("link", { name: /Widget sul telefono/ }).count()) === 1);
await e.goto(`${BASE}/widget`, { waitUntil: "networkidle" });
check("dipendente: la pagina si apre (niente rimando)", new URL(e.url()).pathname === "/widget");
check("dipendente: sceglie i suoi colori", (await e.getByRole("heading", { name: "Colori dei widget" }).count()) === 1);
check("dipendente: vede solo i suoi 3 widget", (await e.locator('img[alt^="Anteprima del widget"]').count()) === 3);
check("dipendente: niente autorizzazioni né telefoni degli altri", (await e.getByRole("heading", { name: "Chi può usare i widget" }).count()) === 0 && (await e.getByRole("heading", { name: "I tuoi telefoni collegati" }).count()) === 1);
if (SHOTS) await e.screenshot({ path: `${SHOTS}/widget-dipendente.png`, fullPage: true });
DB(`update "Employee" set widgets='{}' where id='${marta}'`);
await e.goto(`${BASE}/mie-ore`, { waitUntil: "networkidle" });
check("dipendente non autorizzata: niente collegamento", (await e.getByRole("link", { name: /Widget sul telefono/ }).count()) === 0);
await e.goto(`${BASE}/widget`, { waitUntil: "networkidle" });
check("dipendente non autorizzata: «il titolare non ti ha ancora dato…»", (await e.getByText(/non ti ha ancora dato nessun widget/).count()) === 1);

await b.close();
DB(`delete from "WidgetDevice" where name like 'Prova%'`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
