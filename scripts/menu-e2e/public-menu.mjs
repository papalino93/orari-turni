import { launch, login, check, BASE, SHOTS, results, EMP_PW } from "./lib.mjs";
const browser = await launch();

// 1) Pubblico, senza sessione
for (const [label, width, height] of [["390", 390, 844], ["768", 768, 1024], ["1280", 1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const resp = await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  check(`/menu @${label} risponde 200 senza login`, resp?.status() === 200 && new URL(page.url()).pathname === "/menu", page.url());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`/menu @${label} nessun overflow orizzontale`, overflow <= 0, `delta ${overflow}`);
  const info = await page.evaluate(() => ({
    sections: [...document.querySelectorAll("main section[id]")].map((s) => s.id),
    forms: document.querySelectorAll("form, input, textarea, select").length,
    buttons: document.querySelectorAll("main button").length,
    links: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    robots: document.querySelector('meta[name="robots"]')?.content,
    bg: getComputedStyle(document.querySelector(".menu-root")).backgroundColor,
    items: document.querySelectorAll("main section > div .border-b").length,
  }));
  if (label === "390") {
    check("7 sezioni nel menù", info.sections.length === 7, info.sections.join(","));
    check("nessun form/campo nella pagina pubblica", info.forms === 0, String(info.forms));
    check("nessun link verso aree interne", info.links.every((h) => h?.startsWith("#") || h === "/menu/allergeni"), JSON.stringify(info.links.filter((h) => !h?.startsWith("#") && h !== "/menu/allergeni")));
    check("meta robots noindex", /noindex/.test(info.robots ?? ""), info.robots);
    check("sfondo chiaro del menù (non tema scuro)", info.bg === "rgb(244, 238, 227)", info.bg);
    const text = await page.locator("main").innerText();
    check("voci importate presenti (Champagne Henriot, Tartare, Spoma?)", ["Champagne Henriot", "Classica", "Spoma?", "Cantonaux"].every((t) => text.includes(t)));
    check("prezzo bottiglia — mostrato per Chapoutier", await page.locator("text=Rouge Clair, Francia").count() > 0);
  }
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/public-${label}-top.png` });
    await page.evaluate(() => document.getElementById("bianchi")?.scrollIntoView());
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/public-${label}-bianchi.png` });
    await page.evaluate(() => document.getElementById("tartare")?.scrollIntoView());
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/public-${label}-tartare.png` });
  }
  await ctx.close();
}

// 2) Aree interne senza sessione
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const path of ["/gestione-menu", "/orari", "/dipendenti", "/menu-qualcosa"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    check(`${path} senza login → /login`, new URL(page.url()).pathname === "/login", page.url());
  }
  await ctx.close();
}

// 3) Dipendente senza permesso
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, "francesco", EMP_PW);
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "domcontentloaded", timeout: 120000 });
  check("dipendente senza permesso: /gestione-menu → /mie-ore", new URL(page.url()).pathname === "/mie-ore", page.url());
  const nav = await page.locator("nav a").allInnerTexts();
  check("dipendente senza permesso: nessuna voce Menù in navigazione", !nav.some((t) => t.includes("Menù")), nav.join("|"));
  await ctx.close();
}

// 4) Dipendente con permesso
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, "marta", EMP_PW);
  await page.goto(`${BASE}/gestione-menu`, { waitUntil: "domcontentloaded", timeout: 120000 });
  check("dipendente con permesso: accede a /gestione-menu", new URL(page.url()).pathname === "/gestione-menu", page.url());
  const nav = await page.locator("nav a").allInnerTexts();
  check("dipendente con permesso: voce Menù in navigazione", nav.some((t) => t.includes("Menù")), nav.join("|"));
  await page.goto(`${BASE}/orari`, { waitUntil: "domcontentloaded", timeout: 120000 });
  check("dipendente con permesso: /orari resta vietata", new URL(page.url()).pathname === "/mie-ore", page.url());
  await ctx.close();
}

// 5) Barra sezioni in fondo alla pagina e nomi molto lunghi
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(600);
  const active = (await page.locator("nav[aria-label='Sezioni del menù'] a[aria-current]").innerText()).trim();
  check("barra sezioni: in fondo alla pagina è attiva l'ultima sezione", /bevande/i.test(active), active);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
