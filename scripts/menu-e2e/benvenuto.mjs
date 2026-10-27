// Gli 8 anni: pagina di benvenuto sul menù dal 29/10/2026 16:30 al 2/11/2026 10:00, e ∞ dietro il
// logo del gestionale dal 29/10/2026 16:30 al 29/10/2027 16:30. Le ore si simulano con l'orologio
// del browser (clock di Playwright); ?festa=1 mostra l'anteprima.
import { launch, login, check, BASE, results, ADMIN_PW } from "./lib.mjs";

const b = await launch();
const at = async (iso, { w = 390, h = 844 } = {}) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.clock.setFixedTime(new Date(iso));
  return { ctx, p };
};
const dialog = (p) => p.getByRole("dialog", { name: "Otto anni insieme" });
const openMenu = async (p, q = "") => {
  await p.goto(`${BASE}/menu${q}`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await p.waitForTimeout(400);
};

// --- Menù: quando compare
for (const [iso, want, label] of [
  ["2026-10-29T16:29:00+01:00", false, "giovedì 16:29: non ancora"],
  ["2026-10-29T16:30:00+01:00", true, "giovedì 16:30: compare"],
  ["2026-10-31T21:00:00+01:00", true, "sabato sera: c'è"],
  ["2026-11-02T09:59:00+01:00", true, "lunedì 9:59: c'è ancora"],
  ["2026-11-02T10:00:00+01:00", false, "lunedì 10:00: sparita"],
]) {
  const { ctx, p } = await at(iso);
  await openMenu(p);
  check(`menù, ${label}`, (await dialog(p).count()) === (want ? 1 : 0));
  await ctx.close();
}

// --- Menù: contenuto, chiusura, anteprima
{
  const { ctx, p } = await at("2026-10-30T19:00:00+01:00");
  await openMenu(p);
  const t = await dialog(p).innerText();
  check("lettera: «Cari amici», «Otto anni fa» e «29 Ottobre 2018» senza a capo (spazi fissi)", /Cari amici/.test(t) && /Otto anni fa/.test(t) && /29\u00a0Ottobre\u00a02018/.test(t) && /Il\u00a029\u00a0Ottobre, per me/.test(t));
  check("lettera: «Il meglio deve ancora venire» e la firma di Andrea e del team", /Il meglio deve ancora venire/.test(t) && /ndrea/.test(t) && /ngolo del Vino/.test(t));
  check("in fondo: «L'Angolo del Vino» e «8 anni di noi» su due righe", /L'Angolo del Vino\s*\n\s*8 anni di noi/i.test(t), t.slice(-80));
  check("il menù sotto non scorre", (await p.evaluate(() => document.body.style.overflow)) === "hidden");
  check("il pulsante «Entra nel menù» ha il fuoco", (await p.evaluate(() => document.activeElement?.textContent?.trim())) === "Entra nel menù");
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("niente scorrimento laterale", over <= 1, String(over));
  await p.getByRole("button", { name: "Entra nel menù" }).click();
  check("«Entra nel menù» la chiude e mostra il menù", (await dialog(p).count()) === 0 && (await p.locator("main").count()) > 0);
  check("il menù torna a scorrere", (await p.evaluate(() => document.body.style.overflow)) !== "hidden");
  await openMenu(p);
  check("nella stessa scheda non ricompare", (await dialog(p).count()) === 0);
  await ctx.close();
}
{
  const { ctx, p } = await at("2026-10-30T19:00:00+01:00");
  await openMenu(p);
  await p.keyboard.press("Escape");
  check("Esc la chiude", (await dialog(p).count()) === 0);
  await ctx.close();
}
{
  const { ctx, p } = await at("2026-10-27T12:00:00+01:00");
  await openMenu(p, "?festa=1");
  check("anteprima: con ?festa=1 si vede anche prima di giovedì", (await dialog(p).count()) === 1);
  await ctx.close();
}
// L'8: nasce grande e spesso al centro, poi va sotto il logo; il resto compare dopo.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/menu?festa=1`, { waitUntil: "networkidle", timeout: 180000 });
  await p.reload({ waitUntil: "load" });
  const stato = () =>
    p.evaluate(() => {
      const svg = document.querySelector(".festa-8-otto");
      const r = svg.getBoundingClientRect();
      const tratto = parseFloat(getComputedStyle(svg.querySelector("path")).strokeWidth);
      const logo = parseFloat(getComputedStyle(document.querySelector('.festa-8 img[alt="L\'Angolo del Vino"]')).opacity);
      return { alto: r.height, largo: r.width, tratto, logo, cy: r.top + r.height / 2 };
    });
  await p.waitForTimeout(1800);
  const prima = await stato();
  check("l'8 nasce grande e in piedi al centro", prima.alto > 400 && prima.alto > prima.largo && Math.abs(prima.cy - 844 * 0.47) < 40, JSON.stringify(prima));
  check("l'8 nasce spesso, e logo e lettera aspettano", prima.tratto > 8 && prima.logo < 0.1, JSON.stringify(prima));
  await p.waitForTimeout(3600);
  const dopo = await stato();
  check("poi diventa ∞ sotto il logo, col tratto di sempre", dopo.alto < 100 && dopo.largo > dopo.alto && dopo.cy < 140 && dopo.tratto === 4 && dopo.logo === 1, JSON.stringify(dopo));
  check("lettera: «rendete questo posto così speciale!»", /rendete questo posto così speciale!/.test(await dialog(p).innerText()));
  await ctx.close();
}
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/menu?festa=1`, { waitUntil: "networkidle", timeout: 180000 });
  const r = await p.evaluate(() => document.querySelector(".festa-8-otto").getBoundingClientRect().height);
  check("con «riduci movimento» niente animazione: ∞ subito al suo posto", r < 100, String(r));
  await ctx.close();
}
{
  const { ctx, p } = await at("2026-10-27T12:00:00+01:00", { w: 1280, h: 900 });
  await openMenu(p, "?festa=1");
  check("computer: la lettera si vede al centro", (await dialog(p).count()) === 1);
  await ctx.close();
}

// --- Gestionale: ∞ dietro il logo
const inf = (p) => p.locator('header svg path[d^="M300 100"]');
for (const [iso, want, label] of [
  ["2026-10-29T16:00:00+01:00", false, "giovedì 16:00: logo senza ∞"],
  ["2026-10-29T16:31:00+01:00", true, "giovedì 16:31: logo con ∞"],
  ["2027-06-01T12:00:00+02:00", true, "giugno 2027: ∞ ancora"],
  ["2027-10-29T16:31:00+02:00", false, "29 ottobre 2027 dopo le 16:30: ∞ tolto"],
]) {
  const { ctx, p } = await at(iso, { w: 1280, h: 900 });
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/orari`, { waitUntil: "networkidle", timeout: 180000 });
  check(`gestionale, ${label}`, (await inf(p).count()) === (want ? 1 : 0));
  const cls = (await p.locator('header img[alt="L\'Angolo del Vino"]').getAttribute("class")) ?? "";
  check(`gestionale, ${label}: misura del logo ${want ? "più grande" : "di sempre"}`, want ? /\bh-11\b/.test(cls) : /\bh-10\b/.test(cls), cls);
  await ctx.close();
}
{
  const { ctx, p } = await at("2026-10-30T10:00:00+01:00");
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 180000 });
  check("accesso: logo con ∞ dopo giovedì", (await p.locator('svg path[d^="M300 100"]').count()) === 1);
  await ctx.close();
}

await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
