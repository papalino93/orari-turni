// Schermate per il video della guida (video-build.mjs le anima): telefono (p-), tablet (t-) e computer (l-).
// Come i test: database di prova + `next dev -p 3100` accesi, dati di esempio da setup.mjs.
// Scrive in .tmp-guida/video: le immagini e video-data.json (riquadri da toccare, in px dello schermo).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { discardIfAsked, launch, login, BASE, ADMIN_PW, goTab, tool, DB } from "../menu-e2e/lib.mjs";
import { WORK } from "./work.mjs";

const OUT = `${WORK}/video`;
mkdirSync(OUT, { recursive: true });
// l = finestra del browser sul computer (alta, così nel video si legge); lw = portatile in orizzontale (solo per l'introduzione)
const SIZE = { p: [390, 780], t: [768, 1024], l: [1100, 1180], lw: [1280, 800], c: [390, 780], m: [800, 500] };
// tema di ogni dispositivo: computer e tablet scuri (come si usano davvero), telefoni chiari
const THEME = { p: "light", t: "dark", l: "dark", lw: "dark", c: "light", m: "dark" };
const DSF = { p: 3, t: 2.5, l: 2, lw: 2, c: 3, m: 3.2 };
const browser = await launch();
// ONLY=p,t,l,lw rifotografa solo quei dispositivi (tiene il resto di video-data.json)
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const run = (k) => !ONLY || ONLY.includes(k);
const prev = ONLY && existsSync(`${OUT}/video-data.json`) ? JSON.parse(readFileSync(`${OUT}/video-data.json`, "utf8")) : null;
const data = { size: SIZE, shots: { ...(prev?.shots ?? {}) }, boxes: { ...(prev?.boxes ?? {}) } };

// Una «sessione» è un dispositivo: contesto, pagina e le funzioni per fotografare.
async function session(kind, { admin = true, theme = THEME[kind] } = {}) {
  const [w, h] = SIZE[kind];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: DSF[kind], locale: "it-IT", timezoneId: "Europe/Rome", hasTouch: kind === "p" || kind === "t" || kind === "c", isMobile: kind === "p" || kind === "c" });
  await ctx.clock.setFixedTime(new Date("2026-10-04T19:30:00+02:00"));
  await ctx.addInitScript((th) => {
    try { localStorage.setItem("install-banner-dismissed", "1"); localStorage.setItem("theme", th); localStorage.setItem("menu-staff-device", "1"); } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important} a[href=\"/gestione-menu/servizio\"]{display:none!important} html{scroll-behavior:auto!important}";
      document.head.appendChild(st);
    });
  }, theme);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const settle = (ms = 700) => page.waitForTimeout(ms);
  const dlg = () => page.locator('[role="dialog"]');
  const api = {
    page, dlg, settle,
    top: () => page.evaluate(() => window.scrollTo(0, 0)),
    closeSheet: async () => { await page.keyboard.press("Escape"); await discardIfAsked(page); await settle(500); },
    shot: async (name) => {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await page.mouse.move(1, 1);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
      await settle();
      await page.screenshot({ path: `${OUT}/${kind}-${name}.png` });
      data.shots[`${kind}-${name}`] = `${kind}-${name}.png`;
    },
    box: async (name, locator) => {
      const b = await locator.first().boundingBox();
      const f = kind === "m" ? 1.6 : 1; // il Mac è fotografato a 800×500 e mostrato su uno schermo 1280×800
      data.boxes[`${kind}-${name}`] = { x: b.x * f, y: b.y * f, w: b.width * f, h: b.height * f };
    },
    tabs: () => page.getByRole("tablist", { name: "Parti della gestione" }).getByRole("tab"),
  };
  if (admin) {
    await login(page, "andrea", ADMIN_PW);
    await page.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
    await goTab(page, "Menù");
    await settle(900);
  }
  return api;
}

// ---- Portatile in orizzontale: solo la schermata dell'introduzione
if (run("lw")) {
  const s = await session("lw");
  await s.top();
  await s.shot("tab-menu");
  await s.page.context().close();
}

// ---- Tablet: eventi e annunci (e come li vede il cliente), storico con qualche modifica
if (run("t")) {
  const s = await session("t");
  await s.top();
  await s.shot("tab-menu");
  await goTab(s.page, "Eventi e annunci");
  await s.top();
  await s.box("new-event", s.page.getByRole("button", { name: "+ Nuovo evento", exact: true }));
  await s.box("special-menu", s.page.getByText("Menù speciale", { exact: true }).first());
  await s.shot("events-list");
  await goTab(s.page, "Menù");
  // qualche modifica vera, così lo Storico ha più righe
  for (let i = 0; i < 3; i++) {
    await s.page.getByRole("button", { name: /^Esaurito$/ }).nth(i).click();
    await s.settle(500);
  }
  await s.page.locator('[role="status"]').first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await s.top();
  await tool(s.page, "Storico");
  await s.dlg().waitFor();
  await s.settle(900);
  await s.box("history-restore", s.dlg().getByRole("button", { name: "Ripristina" }));
  await s.shot("history");
  await s.dlg().getByRole("button", { name: "Ripristina" }).first().click();
  await s.settle(900);
  await s.shot("history-restored");
  await s.closeSheet();
  await s.page.getByRole("button", { name: /^Riattiva tutto/ }).first().click().catch(() => {});
  await s.settle(600);
  const pub = await session("t", { admin: false });
  await pub.page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 180000 });
  await pub.settle(1200);
  await pub.page.evaluate(() => { const el = document.querySelector('section[aria-label="In evidenza"]'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 12); });
  await pub.settle(800);
  await pub.shot("pub-evidenza");
  await pub.page.context().close();
  await s.page.context().close();
}

// ---- Computer: le quattro schede, riordina, strumenti
if (run("l")) {
  const s = await session("l");
  const tabs = s.tabs();
  await s.top();
  await s.shot("tab-menu");
  for (const [i, n] of ["menu", "eventi", "orari", "strumenti"].entries()) await s.box(`tab-${n}`, tabs.nth(i));
  await tabs.nth(1).click(); await s.top(); await s.shot("tab-eventi");
  await tabs.nth(2).click(); await s.top(); await s.shot("tab-orari");
  await tabs.nth(3).click(); await s.top(); await s.shot("tab-strumenti");

  await tool(s.page, "Riordina");
  await s.dlg().waitFor();
  await s.dlg().getByRole("tab", { name: "Eventi e annunci" }).click();
  await s.settle(600);
  await s.shot("reorder-1");
  const down = s.dlg().getByRole("button", { name: /^Sposta giù/ });
  await s.box("reorder-down", down.first());
  await down.first().click();
  await s.settle(500);
  await s.shot("reorder-2");
  await s.closeSheet();

  await goTab(s.page, "Strumenti");
  await s.top();
  await s.shot("strumenti");
  for (const [k, label] of [["prices", "Tabella prezzi"], ["preview", "Anteprima"], ["qr", "Codice QR"]]) {
    await goTab(s.page, "Strumenti");
    await s.top();
    const btn = s.page.getByRole("list", { name: "Strumenti del menù" }).getByRole("button", { name: new RegExp(`^${label}`) });
    await s.box(`tool-${k}`, btn);
    await tool(s.page, label);
    await s.dlg().waitFor();
    await s.settle(900);
    if (k === "qr") {
      // nel video il codice è quello del sito vero, non di localhost
      const qr = readFileSync(new URL("./assets/qr-prod.png", import.meta.url)).toString("base64");
      await s.dlg().evaluate((d, b64) => {
        const img = d.querySelector("img"); if (img) img.src = "data:image/png;base64," + b64;
        const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes("localhost")) n.nodeValue = "https://orari-turni.vercel.app/menu";
      }, qr);
      await s.settle(500);
    }
    if (k === "prices") { await s.dlg().getByRole("button", { name: "Bollicine" }).click(); await s.settle(500); }
    await s.shot(k);
    await s.closeSheet();
  }
  await s.page.context().close();
}

// ---- Telefono: aggiungere un vino, segnare un vino esaurito (per ultimo: lascia un vino esaurito)
if (run("p")) {
  const s = await session("p");
  await s.top();
  await s.shot("tab-menu");
  await s.box("add-top", s.page.getByRole("button", { name: "+ Aggiungi", exact: true }));
  await s.page.getByRole("button", { name: "+ Aggiungi", exact: true }).click();
  await s.dlg().waitFor();
  await s.shot("add-choice");
  await s.box("add-wine", s.dlg().getByRole("button", { name: /^Un vino/ }));
  await s.dlg().getByRole("button", { name: /^Un vino/ }).click();
  await s.settle(900);
  await s.shot("add-form");
  await s.box("add-section", s.dlg().getByRole("button", { name: /^Rossi/ }));
  await s.dlg().getByRole("button", { name: /^Rossi/ }).click();
  await s.settle(900);
  await s.shot("add-group");
  await s.box("add-group", s.dlg().getByRole("button", { name: /^Italia/ }));
  await s.dlg().getByRole("button", { name: /^Italia/ }).click();
  await s.settle(1100);
  await s.shot("add-fields");
  // la scheda compilata (dati inventati) e il pulsante per salvare
  const f = (ph, v) => s.dlg().getByPlaceholder(ph, { exact: true }).fill(v);
  await f("es. Avignonesi", "Cantina del Borgo");
  await f("es. Toscana Igt", "Chianti Classico Docg");
  await f("es. 2022", "2021");
  await f("es. 100% Friulano", "100% Sangiovese");
  await f("es. 6", "7");
  await f("es. 30", "35");
  await s.settle(400);
  await s.shot("add-filled");
  const save = s.dlg().getByRole("button", { name: "Aggiungi", exact: true });
  await save.scrollIntoViewIfNeeded();
  await s.settle(500);
  await s.shot("add-save");
  await s.box("add-save", save);
  await s.closeSheet();

  await s.page.locator('nav[aria-label="Sezioni"] button', { hasText: "Rossi" }).click();
  await s.settle(600);
  const esaurito = s.page.getByRole("button", { name: /^Esaurito$/ });
  // il titolo del gruppo «Italia» subito sotto la barra di ricerca
  await s.page.locator("text=/^Italia/").first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 170));
  await s.settle(500);
  await s.shot("list-rossi");
  await s.box("sold", esaurito.first());
  await esaurito.first().click();
  await s.shot("list-rossi-esaurito");
  await s.page.locator('[role="status"]').first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await s.page.context().close();
  // Il vino segnato esaurito per la foto torna disponibile: le sessioni dopo (menù dei clienti) lo cercano.
  DB(`update "MenuItem" set "soldOutDay"=null`);
}

// ---- Menù dei clienti da telefono: com'è prima e dopo che un vino è esaurito, copertina, «In evidenza»
if (run("c")) {
  const s = await session("c", { admin: false });
  await s.page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 180000 });
  await s.settle(1400);
  await s.shot("top");
  const rowTop = () => s.page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === "Avignonesi");
    return el.parentElement.parentElement.getBoundingClientRect().top + scrollY;
  });
  const y = Math.round((await rowTop()) - 240);
  await s.page.evaluate((v) => window.scrollTo(0, v), y);
  await s.settle(900);
  const row = await s.page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === "Avignonesi");
    const r = el.parentElement.parentElement.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  data.boxes["c-row"] = row;
  await s.shot("before");
  DB(`update "MenuItem" set "soldOutDay"='2026-10-04' where name='Avignonesi'`);
  await s.page.reload({ waitUntil: "networkidle" });
  await s.settle(1400);
  await s.page.evaluate((v) => window.scrollTo(0, v), y);
  await s.settle(900);
  await s.shot("after");
  DB(`update "MenuItem" set "soldOutDay"=null where name='Avignonesi'`);
  await s.page.reload({ waitUntil: "networkidle" });
  await s.settle(1200);
  await s.page.evaluate(() => { const el = document.querySelector('section[aria-label="In evidenza"]'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 12); });
  await s.settle(900);
  await s.shot("evidenza");
  await s.page.context().close();
}


// ---- Menù dei clienti: cose che si possono fare (ricerca con filtri, abbinamento, scorrere, pagina evento, contatti)
if (run("c2")) {
  const s = await session("c", { admin: false });
  const P = s.page;
  const hide = () => P.addStyleTag({ content: 'button[aria-label="Torna su"]{display:none!important}' });
  await P.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 180000 });
  await hide(); await s.settle(1400);
  // scorrere: una lunga immagine della sezione Bollicine (+ l'inizio dei Bianchi) e le barre con la sezione attiva
  const ys = await P.evaluate(() => Object.fromEntries(["bollicine", "bianchi", "rossi"].map((id) => [id, Math.round(document.getElementById(id).getBoundingClientRect().top + scrollY)])));
  data.boxes["c-sec-y"] = ys;
  for (const id of ["bollicine", "bianchi"]) {
    await P.evaluate((y) => window.scrollTo(0, y - 49), ys[id]);
    await s.settle(900);
    await s.shot(`nav-${id}`);
  }
  await P.evaluate((v) => window.scrollTo(0, v), 0); await s.settle(500);
  const H = 3300;
  await P.screenshot({ path: `${OUT}/c-tall.png`, fullPage: true, clip: { x: 0, y: ys.bollicine - 24, width: 390, height: H } });
  data.shots["c-tall"] = "c-tall.png"; data.boxes["c-tall"] = { y0: ys.bollicine - 24, h: H };
  // ricerca
  await P.evaluate(() => window.scrollTo(0, 0)); await s.settle(400);
  await P.evaluate((v) => window.scrollTo(0, v), ys.bollicine - 49); await s.settle(600);
  await P.getByRole("button", { name: "Cerca nel menù" }).click(); await s.settle(900);
  await s.shot("search-0");
  const inp = P.getByRole("searchbox", { name: "Cerca nel menù" });
  await s.box("search-input", inp);
  await inp.fill("sangiovese"); await s.settle(900);
  await s.shot("search-1");
  data.boxes["c-search-rows"] = await P.evaluate(() => [...document.querySelectorAll('[role="dialog"] li button')].slice(0, 6).map((b) => [...b.querySelectorAll("span span")].map((x) => x.textContent.trim()).filter(Boolean)));
  data.boxes["c-search-chips"] = await P.evaluate(() => [...document.querySelectorAll('[role="dialog"] button[aria-pressed]')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }));
  await P.getByRole("button", { name: "Al calice" }).click(); await s.settle(800);
  await s.shot("search-2");
  data.boxes["c-search-rows2"] = await P.evaluate(() => [...document.querySelectorAll('[role="dialog"] li button')].slice(0, 6).map((b) => [...b.querySelectorAll("span span")].map((x) => x.textContent.trim()).filter(Boolean)));
  await P.keyboard.press("Escape").catch(() => {});
  // abbinamento: dal piatto al vino
  await P.goto(`${BASE}/menu`, { waitUntil: "networkidle" }); await hide(); await s.settle(1200);
  const pair = P.locator("a[data-pair-from]").first();
  await pair.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 520));
  await s.settle(800);
  await s.shot("pair-before");
  await s.box("pair-tile", pair);
  data.boxes["c-pair-text"] = await pair.innerText();
  await pair.click(); await P.waitForTimeout(250);
  await s.shot("pair-after");
  // pagina di un evento: «Prenota», calendario, condividi
  await P.goto(`${BASE}/menu/p/oktoberfest`, { waitUntil: "networkidle" }); await hide(); await s.settle(1300);
  await s.shot("ev-top");
  const book = P.getByRole("link", { name: "Prenota", exact: true });
  data.boxes["c-wa-text"] = decodeURIComponent((await book.getAttribute("href")) || "");
  await book.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 420));
  await s.settle(900);
  await s.shot("ev-actions");
  await s.box("ev-book", book);
  await s.box("ev-cal", P.getByRole("link", { name: "Aggiungi al calendario" }));
  await s.box("ev-share", P.getByRole("button", { name: "Condividi", exact: true }));
  // piè di pagina: orari e contatti
  await P.goto(`${BASE}/menu`, { waitUntil: "networkidle" }); await hide(); await s.settle(1200);
  await P.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await s.settle(1000);
  await s.shot("footer");
  data.boxes["c-footer"] = await P.evaluate(() => [...document.querySelectorAll('section[aria-label="Orari e contatti"] a')].map((a) => { const r = a.getBoundingClientRect(); return { t: a.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }));
  await P.context().close();
}

// ---- Dal Mac (1280×800): strumenti, tabella prezzi, anteprima, stampa, statistiche, orari e contatti
if (run("m")) {
  const s = await session("m");
  const P = s.page;
  const tabs = s.tabs();
  await s.top();
  await tabs.nth(2).click(); await s.top(); await s.settle(800);
  await s.shot("orari");
  data.boxes["m-orari-h"] = await P.evaluate(() => document.documentElement.scrollHeight);
  const mods = P.getByRole("button", { name: /^Modifica/ });
  data.boxes["m-orari-nmod"] = await mods.count();
  for (const [k, i] of [["orari-dlg", 1], ["contatti", 2]]) {
    await s.box(`mod-${k}`, mods.nth(i));
    await mods.nth(i).click(); await s.dlg().waitFor(); await s.settle(900);
    await s.shot(k);
    await s.closeSheet();
  }
  await P.evaluate(() => window.scrollTo(0, 460)); await s.settle(600); await s.shot("orari-2");
  await P.evaluate(() => window.scrollTo(0, 1000)); await s.settle(600); await s.shot("orari-3");
  await goTab(P, "Strumenti"); await s.top(); await s.settle(600);
  await s.shot("strumenti");
  for (const t of ["prices", "preview", "qr", "storico", "stampa"]) {
    const label = { prices: "Tabella prezzi", preview: "Anteprima", qr: "Codice QR", storico: "Storico", stampa: "Menù da stampare" }[t];
    try { await s.box(`tool-${t}`, P.getByRole("list", { name: "Strumenti del menù" }).getByRole("button", { name: new RegExp(`^${label}`) })); } catch {}
  }
  await tool(P, "Riordina"); await s.dlg().waitFor();
  await s.dlg().getByRole("tab", { name: "Eventi e annunci" }).click(); await s.settle(700);
  await s.box("reorder-dlg", s.dlg());
  await s.shot("reorder-1");
  const down = s.dlg().getByRole("button", { name: /^Sposta giù/ });
  await s.box("reorder-down", down.first());
  await down.first().click(); await s.settle(600);
  await s.shot("reorder-2");
  await s.box("reorder-save", s.dlg().getByRole("button", { name: "Salva ordine" }));
  await s.closeSheet();
  await goTab(P, "Strumenti"); await s.top();
  await tool(P, "Tabella prezzi"); await s.dlg().waitFor(); await s.settle(900);
  await s.dlg().getByRole("button", { name: "Bollicine" }).click(); await s.settle(600);
  await s.shot("prices-0");
  const cells = s.dlg().locator("input");
  const n = await cells.count(); data.boxes["m-prices-cells"] = n;
  await s.box("prices-cell", cells.nth(0));
  await cells.nth(0).fill("11"); await cells.nth(1).fill("55"); await s.settle(500);
  await s.shot("prices-1");
  await s.box("prices-save", s.dlg().getByRole("button", { name: "Salva tutto" }));
  await s.closeSheet();
  await goTab(P, "Strumenti"); await s.top();
  await tool(P, "Anteprima"); await s.dlg().waitFor(); await s.settle(2500);
  await s.shot("preview");
  await s.closeSheet();
  // pagine intere
  await P.goto(`${BASE}/gestione-menu/stampa`, { waitUntil: "networkidle", timeout: 120000 }); await s.settle(1500);
  await s.shot("stampa");
  await s.box("stampa-btn", P.getByRole("button", { name: /Stampa o salva/ }).or(P.getByRole("link", { name: /Stampa o salva/ })));
  await P.context().close();
}

// ---- Statistiche dal Mac (scuro): oggi, scorciatoie, giorno per giorno, poi i quattro gruppi
if (run("ms")) {
  const s = await session("m");
  const P = s.page;
  const nav = (name) => P.getByRole("navigation", { name });
  const pill = (name) => nav("Tipi di statistiche").getByRole("link", { name: new RegExp(name) });
  const card = (t) => P.getByRole("heading", { name: t, exact: true }).first().locator("xpath=ancestor::section[1]");
  const open = async (url) => { await P.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 120000 }); await s.settle(2200); };
  await open("/statistiche");
  await s.shot("stats");
  await s.box("stats-today", P.getByRole("region", { name: "Aperture di oggi" }));
  for (const [i, g] of ["Panoramica", "Quando", "Cosa cercano", "Cosa guardano", "Eventi e contatti"].entries()) await s.box(`stats-pill-${i}`, pill(g));
  // un po' più giù: scorciatoie in vista
  await P.evaluate(() => window.scrollTo(0, 190)); await s.settle(700);
  await s.shot("stats-s");
  await s.box("stats-shortcuts", nav("Scorciatoie"));
  await s.box("stats-sc-week", nav("Scorciatoie").getByRole("link", { name: "Settimana scorsa" }));
  await s.box("stats-today-s", P.getByRole("region", { name: "Aperture di oggi" }));
  await P.evaluate(() => window.scrollTo(0, 0)); await s.settle(500);
  const kpi = P.getByText("Aperture del menù", { exact: true }).locator("xpath=..");
  await s.box("stats-kpi1", kpi);
  await s.box("stats-kpis", kpi.locator("xpath=.."));
  await s.box("stats-card-andamento", card("Andamento settimana per settimana"));
  for (const [i, g] of ["Quando", "Cosa cercano", "Cosa guardano", "Eventi e contatti"].entries()) {
    await pill(g).first().click(); await s.settle(1300);
    await s.shot(`stats-g${i + 1}`);
    if (i === 0) for (const [j, g2] of ["Panoramica", "Quando", "Cosa cercano", "Cosa guardano", "Eventi e contatti"].entries()) await s.box(`stats-pillS-${j}`, pill(g2));
    for (const t of [["Giorni e orari"], ["Cercate ma non trovate", "Le parole più cercate"], ["Sezioni più aperte"], ["Contatti toccati", "Pagine degli eventi aperte"]][i]) {
      try { await s.box(`stats-card-${t.toLowerCase().replace(/[^a-z]+/g, "-")}`, card(t)); } catch {}
    }
  }
  // una settimana scelta con la scorciatoia
  await open("/statistiche");
  await nav("Scorciatoie").getByRole("link", { name: "Settimana scorsa" }).click();
  await P.waitForURL(/dal=/); await s.settle(2200);
  await P.evaluate(() => window.scrollTo(0, 480)); await s.settle(700);
  await s.shot("stats-week");
  await s.box("stats-note", P.getByText(/^Periodo: dal/));
  await s.box("stats-kpi1w", P.getByText("Aperture del menù", { exact: true }).locator("xpath=.."));
  // giorno per giorno
  const dd = card("Giorno per giorno");
  await dd.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 130)); await s.settle(900);
  await s.shot("stats-days");
  await s.box("stats-dd", dd);
  await s.box("stats-dd-sum", dd.locator("p").nth(1));
  await s.box("stats-excel", dd.getByRole("link", { name: "Scarica per Excel" }));
  const rows = dd.locator("ol li a");
  await s.box("stats-dd-row", rows.nth(2));
  data.boxes["m-stats-dd-label"] = (await rows.nth(2).innerText()).replace(/\s+/g, " ");
  await rows.nth(2).click(); await P.waitForURL(/dal=.*al=/); await s.settle(2200);
  await P.evaluate(() => window.scrollTo(0, 480)); await s.settle(700);
  await s.shot("stats-day");
  await s.box("stats-note2", P.getByText(/^Giorno:/));
  await s.box("stats-kpi1d", P.getByText("Aperture del menù", { exact: true }).locator("xpath=.."));
  await P.context().close();
}

writeFileSync(`${OUT}/video-data.json`, JSON.stringify(data, null, 1));
await browser.close();
console.log("schermate del video:", Object.keys(data.shots).length);
