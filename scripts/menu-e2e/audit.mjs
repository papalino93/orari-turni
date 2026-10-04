// Controllo sistematico di tutte le finestre della gestione del menù: per ognuna, su
// computer e telefono, senza aver cambiato niente:
//  - si chiude con la X, con Esc e con un clic fuori, senza chiedere «modifiche non salvate»;
//  - sta dentro lo schermo (niente scorrimento orizzontale, nessun pulsante tagliato);
//  - ogni pulsante e campo ha un nome leggibile (per chi usa lo screen reader);
//  - dove si può creare qualcosa c'è anche il modo di eliminarla.
import { launch, login, check, BASE, results, ADMIN_PW, goTab, tool, expandPanels, newPromo, DB } from "./lib.mjs";

// «Testi della sezione» mostra «Elimina» solo se c'è una nota o un avviso: se ne mette uno di prova.
const tartare = DB(`select id from "MenuSection" where slug='tartare'`);
const prima = DB(`select coalesce(note,'') || '~' || coalesce("addonTitle",'') || '~' || coalesce(addon,'') from "MenuSection" where id='${tartare}'`);
DB(`update "MenuSection" set note='Nota di prova', "addonTitle"='Avviso di prova', addon='Testo di prova' where id='${tartare}'`);
const b = await launch();

// Ogni voce: come si apre la finestra, e (facoltativo) cosa deve poter fare chi la usa.
const SHEETS = [
  { name: "Nuova voce (vino)", open: async (p) => { await goTab(p, "Menù"); await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click(); await p.getByRole("button", { name: /^\+ Aggiungi vino/ }).first().click(); } },
  { name: "Modifica voce", open: async (p) => { await goTab(p, "Menù"); await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click(); await p.getByRole("button", { name: /^Modifica Avignonesi/ }).first().click(); }, remove: /Elimina/ },
  { name: "Nuovo piatto", open: async (p) => { await goTab(p, "Menù"); await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Taglieri" }).click(); await p.getByRole("button", { name: /^\+ Aggiungi voce/ }).first().click(); } },
  { name: "Testi della sezione", open: async (p) => { await goTab(p, "Menù"); await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Tartare" }).click(); await p.getByRole("button", { name: /Modifica la nota sotto il titolo|Modifica i testi/ }).first().click(); }, removeAny: true },
  { name: "Aggiungi (scelta)", open: async (p) => { await p.getByRole("button", { name: "+ Aggiungi", exact: true }).click(); } },
  { name: "Aggiungi più voci", open: async (p) => { await goTab(p, "Menù"); await p.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click(); await p.getByRole("button", { name: "Incolla più voci" }).first().click(); } },
  { name: "Tabella prezzi", open: (p) => tool(p, "Tabella prezzi") },
  { name: "Riordina", open: (p) => tool(p, "Riordina") },
  { name: "Storico", open: (p) => tool(p, "Storico") },
  { name: "Anteprima", open: (p) => tool(p, "Anteprima") },
  { name: "Codice QR", open: (p) => tool(p, "Codice QR") },
  { name: "Copertina", open: async (p) => { await expandPanels(p); await p.getByRole("button", { name: "Modifica la copertina" }).click(); } },
  { name: "Orari", open: async (p) => { await expandPanels(p); await p.getByRole("button", { name: "Modifica gli orari" }).click(); } },
  { name: "Contatti", open: async (p) => { await expandPanels(p); await p.getByRole("button", { name: "Modifica i contatti" }).click(); } },
  { name: "Nuova informazione", open: async (p) => { await expandPanels(p); await p.locator('section[aria-label="Informazioni del menù"]').getByRole("button", { name: "+ Aggiungi" }).click(); } },
  { name: "Modifica informazione", open: async (p) => { await expandPanels(p); await p.locator('section[aria-label="Informazioni del menù"]').getByRole("button", { name: /^Modifica:/ }).first().click(); }, remove: /Elimina/ },
  { name: "Nuovo evento", open: (p) => newPromo(p, "evento") },
  { name: "Nuovo annuncio", open: (p) => newPromo(p, "annuncio") },
  { name: "Modifica evento", open: async (p) => { await goTab(p, "Eventi e annunci"); await p.locator('nav[aria-label="Eventi e annunci"] button').first().click(); await p.getByRole("button", { name: "Modifica", exact: true }).first().click(); } },
];

for (const [label, w, h] of [["computer", 1440, 900], ["telefono", 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem("install-dismissed", String(Date.now())); } catch {} });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  await login(p, "andrea", ADMIN_PW);
  const dlg = p.locator('[role="dialog"]');
  const bar = p.getByRole("alertdialog", { name: "Modifiche non salvate" });
  const fresh = async () => {
    await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  };

  for (const sh of SHEETS) {
    const tag = `${label} · ${sh.name}`;
    await fresh();
    try {
      await sh.open(p);
      await dlg.first().waitFor({ timeout: 8000 });
    } catch (e) {
      check(`${tag}: si apre`, false, String(e.message).split("\n")[0]);
      continue;
    }
    await p.waitForTimeout(500);
    const info = await p.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const box = d.getBoundingClientRect();
      const bad = [...d.querySelectorAll("button, a, input, textarea, select")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > innerWidth + 1 || r.left < -1);
      }).length;
      const unnamed = [...d.querySelectorAll("button, a[href], input:not([type=hidden]), textarea, select")].filter((el) => {
        const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.getAttribute("title") || "").trim();
        const labelled = el.id && document.querySelector(`label[for="${el.id}"]`);
        const wrapped = el.closest("label");
        return !name && !labelled && !wrapped && !el.getAttribute("aria-labelledby") && el.type !== "file";
      }).length;
      return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: box.right, bad, unnamed, text: d.innerText };
    });
    check(`${tag}: dentro lo schermo`, info.over <= 0 && info.bad === 0, JSON.stringify({ over: info.over, bad: info.bad }));
    check(`${tag}: ogni pulsante e campo ha un nome`, info.unnamed === 0, String(info.unnamed));
    if (sh.remove) check(`${tag}: si può eliminare`, sh.remove.test(info.text), info.text.slice(0, 80));
    if (sh.removeAny) check(`${tag}: si può eliminare`, /Elimina/.test(info.text), info.text.slice(0, 80));

    // X
    await dlg.first().getByRole("button", { name: "Chiudi" }).click();
    await p.waitForTimeout(400);
    check(`${tag}: la X chiude senza chiedere`, (await bar.count()) === 0 && (await dlg.count()) === 0);
    // Esc
    await fresh();
    await sh.open(p); await dlg.first().waitFor(); await p.waitForTimeout(400);
    await p.keyboard.press("Escape"); await p.waitForTimeout(400);
    check(`${tag}: Esc chiude senza chiedere`, (await bar.count()) === 0 && (await dlg.count()) === 0);
    // clic fuori
    await fresh();
    await sh.open(p); await dlg.first().waitFor(); await p.waitForTimeout(400);
    // Sul telefono la finestra può coprire tutto lo schermo: allora fuori non c'è niente da toccare.
    const outside = await p.evaluate(() => !document.elementFromPoint(4, 4)?.closest('[role="dialog"]'));
    if (outside) {
      await p.mouse.click(4, 4); await p.waitForTimeout(400);
      check(`${tag}: il clic fuori chiude senza chiedere`, (await bar.count()) === 0 && (await dlg.count()) === 0);
    }
  }
  await ctx.close();
}
await b.close();
const [n0, t0, a0] = prima.split("~");
const q = (v) => (v ? `'${v.replace(/'/g, "''")}'` : "null");
DB(`update "MenuSection" set note=${q(n0)}, "addonTitle"=${q(t0)}, addon=${q(a0)} where id='${tartare}'`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
