// Giro fotografico per i controlli di bug e UX: tutte le pagine, titolare e dipendente,
// telefono e computer, tema chiaro e scuro. Segnala errori JS e pagine più larghe dello
// schermo. Uso: node scripts/menu-e2e/giro.mjs <cartella-foto>
import { discardIfAsked, launch, login, BASE, ADMIN_PW, EMP_PW, tool, newPromo, goTab } from "./lib.mjs";
import { DB } from "./lib.mjs";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
const OUT = process.argv[2];
const b = await launch();
const pagesAdmin = ["/", "/orari", "/dipendenti", "/ferie", "/mie-ore", "/account", "/installa", "/widget", "/gestione-menu", "/statistiche", "/gestione-menu/stampa"];
const pagesPub = ["/menu", "/menu/allergeni", "/menu/p/oktoberfest", "/login"];
const problems = [];
async function tour(name, w, h, theme, user, list) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("install-banner-dismissed", "1"); sessionStorage.setItem("employee-install-prompt-dismissed", "1"); } catch {} }, theme);
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
// Schede della gestione aperte (scheda vino, piatto, tabella prezzi, riordina), per vedere come si impaginano.
async function sheets(name, w, h, theme) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("install-banner-dismissed", "1"); sessionStorage.setItem("employee-install-prompt-dismissed", "1"); } catch {} }, theme);
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  p.on("pageerror", (e) => problems.push(`${name} JS: ${e.message}`));
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
  const dlg = p.locator('[role="dialog"]');
  const snap = async (what) => {
    await p.waitForTimeout(600);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 0) problems.push(`${name} scheda ${what}: scorrimento orizzontale ${ov}px`);
    await p.screenshot({ path: `${OUT}/${name}_scheda-${what}.png` });
  };
  await goTab(p, "Menù");
  await p.locator('nav[aria-label="Categorie"] button', { hasText: "Rossi" }).click();
  await p.getByRole("button", { name: /^Modifica Avignonesi/ }).first().click();
  await snap("vino");
  await p.keyboard.press("Escape"); await discardIfAsked(p);
  await goTab(p, "Menù");
  await p.locator('nav[aria-label="Categorie"] button', { hasText: "Taglieri" }).click();
  await p.getByRole("button", { name: /^Modifica Tagliere Classico/ }).first().click();
  await snap("piatto");
  await p.keyboard.press("Escape"); await discardIfAsked(p);
  await tool(p, "Tabella prezzi");
  await snap("prezzi");
  await p.keyboard.press("Escape"); await discardIfAsked(p);
  await tool(p, "Riordina");
  await snap("riordina");
  await p.keyboard.press("Escape"); await discardIfAsked(p);
  await newPromo(p);
  await snap("evento");
  await p.keyboard.press("Escape"); await discardIfAsked(p);
  await ctx.close();
}

// Le quattro schede della gestione (e il «+ Aggiungi»), in ogni formato e tema.
async function schede(name, w, h, theme) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("install-banner-dismissed", "1"); sessionStorage.setItem("employee-install-prompt-dismissed", "1"); } catch {} }, theme);
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  p.on("pageerror", (e) => problems.push(`${name} JS: ${e.message}`));
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const tab of ["Menù", "Eventi e annunci", "Orari e contatti", "Strumenti"]) {
    await goTab(p, tab);
    await p.waitForTimeout(600);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 0) problems.push(`${name} scheda «${tab}»: scorrimento orizzontale ${ov}px`);
    await p.screenshot({ path: `${OUT}/${name}_tab-${tab.split(" ")[0].toLowerCase()}.png`, fullPage: true });
  }
  await goTab(p, "Menù");
  await p.getByRole("button", { name: "+ Aggiungi", exact: true }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${name}_aggiungi.png` });
  await ctx.close();
}

await tour("tab-v-chiaro", 820, 1180, "light", ["andrea", ADMIN_PW], pagesAdmin);
await tour("tab-o-scuro", 1180, 820, "dark", ["andrea", ADMIN_PW], pagesAdmin);
await tour("tab768-chiaro", 768, 1024, "light", ["andrea", ADMIN_PW], ["/gestione-menu", "/statistiche", "/orari"]);
await tour("pubtab-v", 820, 1180, "light", null, pagesPub);
await tour("pubtab-o", 1180, 820, "light", null, ["/menu", "/menu/allergeni"]);
await schede("sc-tel-chiaro", 390, 844, "light");
await schede("sc-tel-scuro", 390, 844, "dark");
await schede("sc-tabv-chiaro", 820, 1180, "light");
await schede("sc-tabo-scuro", 1180, 820, "dark");
await schede("sc-pc-chiaro", 1440, 900, "light");
await schede("sc-pc-scuro", 1440, 900, "dark");
await sheets("tab-v", 820, 1180, "light");
await sheets("tab-o", 1180, 820, "dark");
await sheets("tel", 390, 844, "light");
await sheets("mac", 1440, 900, "light");
await tour("adm-tel-scuro", 390, 844, "dark", ["andrea", ADMIN_PW], pagesAdmin);
await tour("adm-mac-chiaro", 1440, 900, "light", ["andrea", ADMIN_PW], pagesAdmin);
await tour("dip-tel", 390, 844, "light", ["marta", EMP_PW], ["/", "/mie-ore", "/widget", "/gestione-menu", "/orari", "/statistiche"]);
await tour("pub-tel", 390, 844, "light", null, pagesPub);
await tour("pub-360", 360, 740, "light", null, ["/menu"]);

// Prenotazioni online: modulo, informativa e pagine di stato del cliente (telefono, tablet,
// computer), /prenotazioni del titolare con tutte le schede e il dettaglio aperto (chiaro e scuro)
// e di un dipendente col permesso. Si accendono solo per il giro, con richieste di esempio
// «Prova C Giro …»; alla fine impostazione, permesso di Marta e richieste tornano come erano.
{
  const secret = process.env.NEXTAUTH_SECRET || readFileSync(new URL("../../.env.local", import.meta.url), "utf8").match(/^NEXTAUTH_SECRET=["']?([^"'\n]+)/m)?.[1];
  const savedBookings = DB(`select value from "MenuSetting" where id='bookings'`);
  const savedMarta = DB(`select "canManageBookings" from "Employee" where username='marta'`);
  const on = JSON.stringify({ ...JSON.parse(savedBookings || "{}"), enabled: true });
  DB(`insert into "MenuSetting" (id, value) values ('bookings', '${on.replace(/'/g, "''")}') on conflict (id) do update set value=excluded.value`);
  DB(`update "Employee" set "canManageBookings"=true where username='marta'`);
  DB(`delete from "BookingRequest" where id like 'giro_prova_c_%'`);
  const tokens = {};
  const today = `((now() at time zone 'Europe/Rome') - interval '5 hours')::date`;
  const add = (key, status, dayExpr, time, people, extra = {}) => {
    const id = `giro_prova_c_${key}`;
    const token = createHmac("sha256", secret).update(`booking:v1:${id}`).digest("base64url");
    tokens[key] = token;
    const day = DB(`select to_char(${dayExpr}, 'YYYY-MM-DD')`);
    const cols = { id, code: `GIRO${String(Object.keys(tokens).length).padStart(2, "0")}`, tokenHash: createHash("sha256").update(token).digest("hex"), status, day, time, people, name: `Prova C Giro ${key}`, phone: "393331234567", contact: "whatsapp", source: "google", ...extra };
    const names = Object.keys(cols).map((c) => `"${c}"`).join(", ");
    const values = Object.values(cols).map((v) => (typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`)).join(", ");
    DB(`insert into "BookingRequest" (${names}, "startsAt", "updatedAt") values (${values}, ('${day} ${time}'::timestamp + case when '${time}' < '05:00' then interval '1 day' else interval '0' end) at time zone 'Europe/Rome', now())`);
  };
  const giroPrenotazioni = async (name, w, h, theme, user) => {
    // Il permesso di Marta si rimette subito prima (un'altra prova potrebbe averlo cambiato nel frattempo).
    if (user[0] === "marta") DB(`update "Employee" set "canManageBookings"=true where username='marta'`);
    try {
      await giroPrenotazioniFoto(name, w, h, theme, user);
    } catch (e) {
      problems.push(`${name} prenotazioni: ${String(e.message ?? e).split("\n")[0]}`);
    }
  };
  const giroPrenotazioniFoto = async (name, w, h, theme, user) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("install-banner-dismissed", "1"); localStorage.setItem("prenotazioni-avvisi-suggerito", "1"); sessionStorage.setItem("employee-install-prompt-dismissed", "1"); } catch {} }, theme);
    const p = await ctx.newPage();
    p.setDefaultTimeout(60000);
    p.on("pageerror", (e) => problems.push(`${name} JS: ${e.message}`));
    await login(p, user[0], user[1]);
    await p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    const snap = async (what, full = true) => {
      await p.waitForTimeout(600);
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov > 0) problems.push(`${name} prenotazioni ${what}: scorrimento orizzontale ${ov}px`);
      await p.screenshot({ path: `${OUT}/${name}_prenotazioni-${what}.png`, fullPage: full });
    };
    // La pagina è l'agenda: le tre viste, il pannello «Richieste», il menù «⋯» e quello che c'è dentro.
    for (const [v, file] of [["Giorno", "giorno"], ["Settimana", "settimana"], ["Mese", "mese"]]) {
      await p.getByRole("radio", { name: v }).click();
      await p.waitForTimeout(1200);
      await snap(file);
    }
    const menu = async (item) => {
      await p.getByRole("button", { name: "Altre azioni" }).click();
      await p.getByRole("menuitem", { name: new RegExp(`^${item}`) }).click();
    };
    await p.getByRole("button", { name: "Altre azioni" }).click();
    await snap("menu-altre", false);
    await p.keyboard.press("Escape");
    await menu("Cerca");
    await snap("cerca", false);
    await p.keyboard.press("Escape");
    await menu("Numeri");
    await snap("numeri", false);
    await p.keyboard.press("Escape");
    await p.getByTestId("pulsante-richieste").click();
    await snap("richieste", false);
    await p.getByRole("dialog", { name: "Richieste" }).getByRole("button", { name: /Prova C Giro attesa/ }).first().click();
    await snap("dettaglio", false);
    await p.getByRole("dialog", { name: /Prova C Giro attesa/ }).getByRole("button", { name: "Proponi un altro orario" }).click();
    await snap("proponi", false);
    await p.keyboard.press("Escape"); await discardIfAsked(p);
    await p.keyboard.press("Escape");
    if (user[0] === "andrea") {
      await menu("Impostazioni");
      await snap("impostazioni", false);
      await p.keyboard.press("Escape"); await discardIfAsked(p);
    }
    await menu("Avvisi su questo telefono");
    await snap("questo-telefono", false);
    await p.keyboard.press("Escape");
    await ctx.close();
  };
  try {
    add("attesa", "PENDING", `${today} + 1`, "20:00", 4, { note: "Un seggiolone, se possibile: festeggiamo il compleanno della nonna", allergies: true });
    add("proposta", "PROPOSED", `${today} + 1`, "20:30", 2, { proposedTime: "21:30", handledBy: "Andrea", staffMessage: "Alle 20:30 siamo pieni" });
    DB(`update "BookingRequest" set "proposedStartsAt"="startsAt" + interval '1 hour', "handledAt"=now() where id='giro_prova_c_proposta'`);
    add("stasera", "CONFIRMED", today, DB(`select to_char(now() at time zone 'Europe/Rome' + interval '1 hour', 'HH24:MI')`), 6, { handledBy: "Marta", allergies: true });
    add("confermata", "CONFIRMED", `${today} + 2`, "21:00", 3, { handledBy: "Andrea" });
    add("completo", "DECLINED", `${today} + 1`, "21:00", 8, { handledBy: "Giulia" });
    const pagesBook = ["/menu/prenota", "/menu/prenota?evento=oktoberfest", "/menu/prenota/privacy", ...["attesa", "proposta", "confermata", "completo"].map((k) => `/menu/prenota/r/${tokens[k]}`)];
    await tour("pre-tel", 390, 844, "light", null, pagesBook);
    await tour("pre-360", 360, 740, "light", null, pagesBook.slice(0, 4));
    await tour("pre-tab-v", 820, 1180, "light", null, pagesBook.slice(0, 4));
    await tour("pre-mac", 1440, 900, "light", null, pagesBook.slice(0, 4));
    await tour("pre-adm-tel-scuro", 390, 844, "dark", ["andrea", ADMIN_PW], ["/prenotazioni", "/account"]);
    await giroPrenotazioni("pre-tel-chiaro", 390, 844, "light", ["andrea", ADMIN_PW]);
    await giroPrenotazioni("pre-tel-scuro", 390, 844, "dark", ["andrea", ADMIN_PW]);
    await giroPrenotazioni("pre-tabv-chiaro", 820, 1180, "light", ["andrea", ADMIN_PW]);
    await giroPrenotazioni("pre-tabo-scuro", 1180, 820, "dark", ["andrea", ADMIN_PW]);
    await giroPrenotazioni("pre-mac-chiaro", 1440, 900, "light", ["andrea", ADMIN_PW]);
    await giroPrenotazioni("pre-mac-scuro", 1440, 900, "dark", ["andrea", ADMIN_PW]);
    await giroPrenotazioni("pre-dip-tel", 390, 844, "light", ["marta", EMP_PW]);
  } finally {
    DB(`delete from "BookingRequest" where id like 'giro_prova_c_%'`);
    DB(`update "Employee" set "canManageBookings"=${savedMarta === "t"} where username='marta'`);
    if (savedBookings === "") DB(`delete from "MenuSetting" where id='bookings'`);
    else DB(`update "MenuSetting" set value='${savedBookings.replace(/'/g, "''")}' where id='bookings'`);
  }
}
await b.close();
console.log([...new Set(problems.map((x) => x.split("\n")[0].slice(0, 200)))].join("\n") || "nessun problema automatico");
