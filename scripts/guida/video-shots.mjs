// Schermate per il video della guida (video-build.mjs le anima): telefono (p-), tablet (t-) e computer (l-).
// Come i test: database di prova + `next dev -p 3100` accesi, dati di esempio da setup.mjs.
// Scrive in .tmp-guida/video: le immagini e video-data.json (riquadri da toccare, in px dello schermo).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { discardIfAsked, launch, login, BASE, ADMIN_PW, goTab, tool } from "../menu-e2e/lib.mjs";
import { WORK } from "./work.mjs";

const OUT = `${WORK}/video`;
mkdirSync(OUT, { recursive: true });
// l = finestra del browser sul computer (alta, così nel video si legge); lw = portatile in orizzontale (solo per l'introduzione)
const SIZE = { p: [390, 780], t: [768, 1024], l: [1100, 1180], lw: [1280, 800] };
const DSF = { p: 3, t: 2.5, l: 2, lw: 2 };
const browser = await launch();
// ONLY=p,t,l,lw rifotografa solo quei dispositivi (tiene il resto di video-data.json)
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const run = (k) => !ONLY || ONLY.includes(k);
const prev = ONLY && existsSync(`${OUT}/video-data.json`) ? JSON.parse(readFileSync(`${OUT}/video-data.json`, "utf8")) : null;
const data = { size: SIZE, shots: { ...(prev?.shots ?? {}) }, boxes: { ...(prev?.boxes ?? {}) } };

// Una «sessione» è un dispositivo: contesto, pagina e le funzioni per fotografare.
async function session(kind, { admin = true } = {}) {
  const [w, h] = SIZE[kind];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: DSF[kind], locale: "it-IT", timezoneId: "Europe/Rome", hasTouch: kind === "p" || kind === "t", isMobile: kind === "p" });
  await ctx.clock.setFixedTime(new Date("2026-10-04T19:30:00+02:00"));
  await ctx.addInitScript(() => {
    try { localStorage.setItem("install-banner-dismissed", "1"); localStorage.setItem("theme", "light"); localStorage.setItem("menu-staff-device", "1"); } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important} a[href=\"/gestione-menu/servizio\"]{display:none!important} html{scroll-behavior:auto!important}";
      document.head.appendChild(st);
    });
  });
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
      data.boxes[`${kind}-${name}`] = { x: b.x, y: b.y, w: b.width, h: b.height };
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
}

writeFileSync(`${OUT}/video-data.json`, JSON.stringify(data, null, 1));
await browser.close();
console.log("schermate del video:", Object.keys(data.shots).length);
