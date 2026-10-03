// Genera pdf2.html: presentazione del menù digitale, impaginata con cura.
import { writeFileSync } from "node:fs";

const noise = `url(jpg/grain.png)`;

const css = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'EB Garamond', Georgia, serif; color: #1F2621; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; page-break-after: always; position: relative; overflow: hidden; padding: 23mm 20mm 20mm; display: flex; flex-direction: column; isolation: isolate; }
.page:last-child { page-break-after: auto; }
.sans { font-family: 'Jost', sans-serif; }

/* sfondi (già cotti in JPEG da bake.mjs) */
.paper { background: #F4EEE3 url(jpg/paper-bg.jpg) center/100% 100% no-repeat; color: #1F2621; }
.wine { background: #5A0E18 url(jpg/wine-bg.jpg) center/100% 100% no-repeat; color: #F1E8DA; }
.frame { position: absolute; inset: 8mm; border: .35mm solid rgba(156,122,69,.55); z-index: 5; pointer-events: none; }
.wine .frame { border-color: rgba(201,169,110,.5); }
.frame i { position: absolute; width: 3mm; height: 3mm; background: #9C7A45; transform: rotate(45deg); }
.wine .frame i { background: #C9A96E; }
.frame i:nth-child(1) { left: -1.5mm; top: -1.5mm; } .frame i:nth-child(2) { right: -1.5mm; top: -1.5mm; }
.frame i:nth-child(3) { left: -1.5mm; bottom: -1.5mm; } .frame i:nth-child(4) { right: -1.5mm; bottom: -1.5mm; }

/* testi */
.kicker { font-family: 'Jost'; font-size: 8.5pt; letter-spacing: .34em; text-transform: uppercase; color: #8A6A2E; margin: 0 0 3mm; display: flex; align-items: center; gap: 4mm; }
.kicker .kn { font-family: 'Cormorant Garamond'; font-style: italic; font-size: 15pt; letter-spacing: 0; color: #9C7A45; margin-right: -1mm; }
.wine .kicker .kn { color: #D9BC82; }
.kicker::after { content: ''; height: .3mm; width: 16mm; background: #9C7A45; }
.wine .kicker { color: #C9A96E; } .wine .kicker::after { background: #C9A96E; }
h2 { font-family: 'Cormorant Garamond', serif; font-weight: 500; font-size: 36pt; line-height: 1.02; margin: 0 0 5mm; color: #6B1020; letter-spacing: .003em; }
.wine h2 { color: #F7EFE0; }
h2 em { font-style: italic; color: #9C7A45; font-weight: 500; } .wine h2 em { color: #D9BC82; }
.lead { font-size: 13pt; line-height: 1.45; max-width: 118mm; margin: 0; color: #3F4540; }
.wine .lead { color: #E9DCC4; }
.bignum { position: absolute; top: 14mm; right: 17mm; font-family: 'Cormorant Garamond'; font-style: italic; font-size: 92pt; line-height: 1; color: rgba(156,122,69,.17); z-index: 0; }
.wine .bignum { color: rgba(201,169,110,.2); }
.top { display: flex; justify-content: space-between; font-family: 'Jost'; font-size: 7.5pt; letter-spacing: .26em; text-transform: uppercase; color: #8A8F88; position: absolute; left: 20mm; right: 20mm; top: 12.5mm; z-index: 6; }
.wine .top { color: rgba(233,220,196,.75); }
.foot { position: absolute; left: 20mm; right: 20mm; bottom: 12mm; display: flex; justify-content: space-between; align-items: center; font-family: 'Jost'; font-size: 7.5pt; letter-spacing: .2em; text-transform: uppercase; color: #8A8F88; z-index: 6; }
.wine .foot { color: rgba(233,220,196,.75); }
.foot b { font-weight: 500; font-family: 'Cormorant Garamond'; font-style: italic; font-size: 12pt; letter-spacing: 0; color: #9C7A45; } .wine .foot b { color: #C9A96E; }

/* telefoni */
.ph { position: relative; flex: none; border-radius: 8.5mm; padding: 1.7mm; background: linear-gradient(145deg, #2c2c2e, #0d0d0e 55%, #1b1b1d); box-shadow: 0 2mm 5mm rgba(30,5,10,.38), 0 8mm 16mm rgba(30,5,10,.22), inset 0 0 0 .25mm rgba(255,255,255,.14); }
.ph .scr { position: relative; border-radius: 6.9mm; overflow: hidden; background: #000; }
.ph .scr img { display: block; width: 100%; height: auto; }
.ph .vp { aspect-ratio: 390 / 797; overflow: hidden; }
.ph .sb { aspect-ratio: 390 / 47; display: flex; justify-content: space-between; align-items: center; padding: 0 9% 0 11%; font-family: Jost; font-weight: 600; font-size: 4.3cqw; letter-spacing: .01em; }
.ph .scr { container-type: inline-size; }
.ph .sb .ic { display: flex; gap: 1.4cqw; align-items: center; } .ph .sb svg { height: 3cqw; width: auto; }
.ph .scr::after { content: ''; position: absolute; top: 2.4cqw; left: 50%; transform: translateX(-50%); width: 30%; height: 8.6cqw; border-radius: 5cqw; background: #050505; box-shadow: 0 0 0 .2mm rgba(255,255,255,.06); }
.ph::before { content: ''; position: absolute; right: -.5mm; top: 24mm; width: .6mm; height: 11mm; border-radius: .3mm; background: #1c1c1e; }
.glass::after { content: ''; position: absolute; inset: 1.7mm; border-radius: 6.9mm; background: linear-gradient(115deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 30%); pointer-events: none; }
.cap { font-family: 'Jost'; font-size: 8.8pt; line-height: 1.38; color: #3F4540; margin-top: 5mm; }
.wine .cap { color: #E9DCC4; }
.cap b { color: #6B1020; font-weight: 600; letter-spacing: .02em; } .wine .cap b { color: #E3C98E; }
.nb { display: inline-flex; align-items: center; justify-content: center; width: 5.2mm; height: 5.2mm; border-radius: 50%; background: #9C7A45; color: #fff; font-family: 'Jost'; font-weight: 600; font-size: 7.5pt; margin-right: 2mm; vertical-align: 1px; }
.wine .nb { background: #C9A96E; color: #3a0a12; }

/* MacBook */
.mac { position: relative; flex: none; }
.mac .lid { position: relative; background: #0f0f10; border-radius: 3.4mm 3.4mm 0 0; padding: 2.4mm 2.4mm 3.2mm; box-shadow: inset 0 0 0 .35mm #4a4a4d, 0 2.5mm 6mm rgba(30,10,10,.22); }
.mac .lid::before { content: ''; position: absolute; top: .9mm; left: 50%; width: .9mm; height: .9mm; margin-left: -.45mm; border-radius: 50%; background: #2c2c2e; }
.mac .lid img { display: block; width: 100%; height: auto; border-radius: .5mm; }
.mac .base { position: relative; height: 3.3mm; margin: 0 -7%; border-radius: .6mm .6mm 3.4mm 3.4mm; background: linear-gradient(#e6e7e9, #c7c8cb 55%, #a9aaad); box-shadow: 0 2mm 4mm rgba(30,10,10,.18); }
.mac .base::before { content: ''; position: absolute; top: 0; left: 50%; width: 18%; height: 1.3mm; margin-left: -9%; border-radius: 0 0 1.6mm 1.6mm; background: #b4b5b8; }
.mac .pin { position: absolute; width: 6.6mm; height: 6.6mm; margin: -3.3mm 0 0 -3.3mm; border-radius: 50%; background: #9C7A45; color: #fff; font: 600 8pt/6.6mm 'Jost'; text-align: center; box-shadow: 0 0 0 .7mm #fff, 0 .8mm 2mm rgba(0,0,0,.3); z-index: 3; }

/* browser */
.win { border-radius: 3mm; overflow: hidden; background: #1b1b1d; box-shadow: 0 2mm 5mm rgba(0,0,0,.4), 0 9mm 18mm rgba(0,0,0,.25); }
.win .bar { height: 7mm; background: #2a2a2d; display: flex; align-items: center; gap: 1.6mm; padding: 0 3mm; }
.win .bar span { width: 2.2mm; height: 2.2mm; border-radius: 50%; background: #5a5a5e; }
.win .bar span:nth-child(1) { background: #ff5f57; } .win .bar span:nth-child(2) { background: #febc2e; } .win .bar span:nth-child(3) { background: #28c840; }
.win .bar em { margin-left: 4mm; flex: 1; text-align: center; height: 4.2mm; border-radius: 2mm; background: #1b1b1d; color: #9a9a9e; font: 6.5pt/4.2mm 'Jost'; font-style: normal; letter-spacing: .06em; }
.win img { display: block; width: 100%; height: auto; }

/* elementi */
.card { background: #FAF6EC; border: .3mm solid #E3D7C2; border-radius: 3.5mm; padding: 5.5mm 6mm; }
.wine .card { background: rgba(255,255,255,.07); border-color: rgba(201,169,110,.35); box-shadow: none; }
.card h3 { font-family: 'Cormorant Garamond'; font-size: 17pt; font-weight: 600; color: #6B1020; margin: 0 0 1.5mm; line-height: 1.1; }
.wine .card h3 { color: #F3E3BF; }
.card p { font-size: 10.6pt; line-height: 1.4; margin: 0; color: #3F4540; }
.wine .card p { color: #E9DCC4; }
.tick { list-style: none; padding: 0; margin: 0; }
.tick li { font-size: 11.4pt; line-height: 1.38; padding-left: 6.5mm; position: relative; margin-bottom: 2.4mm; color: #3F4540; }
.wine .tick li { color: #E9DCC4; }
.tick li::before { content: ''; position: absolute; left: .8mm; top: 2mm; width: 2mm; height: 2mm; transform: rotate(45deg); background: #9C7A45; }
.wine .tick li::before { background: #C9A96E; }
.orn { display: flex; align-items: center; gap: 3mm; margin: 0 0 5mm; }
.orn i { display: block; height: .3mm; width: 18mm; background: #9C7A45; } .orn b { width: 1.8mm; height: 1.8mm; transform: rotate(45deg); border: .3mm solid #9C7A45; display: block; }
.wine .orn i { background: #C9A96E; } .wine .orn b { border-color: #C9A96E; }
.quote { font-family: 'Cormorant Garamond'; font-style: italic; font-size: 17pt; line-height: 1.25; color: #6B1020; border-left: .5mm solid #9C7A45; padding-left: 5mm; margin: 0; }
.wine .quote { color: #F3E3BF; border-color: #C9A96E; }

/* guida */
.steps { list-style: none; counter-reset: st; padding: 0; margin: 2.5mm 0 0; }
.steps li { counter-increment: st; position: relative; padding-left: 7.5mm; font-size: 10.4pt; line-height: 1.38; margin-bottom: 1.8mm; color: #3F4540; }
.wine .steps li { color: #E9DCC4; }
.steps li::before { content: counter(st); position: absolute; left: 0; top: .4mm; width: 4.8mm; height: 4.8mm; border-radius: 50%; background: #9C7A45; color: #fff; font: 600 7.2pt/4.8mm 'Jost'; text-align: center; }
.wine .steps li::before { background: #C9A96E; color: #3a0a12; }
.steps b, .card p b, .legend b { color: #6B1020; font-weight: 600; } .wine .steps b, .wine .card p b, .wine .legend b { color: #F3E3BF; }
.res { margin-top: 2mm; font-size: 9.8pt; line-height: 1.38; font-style: italic; color: #5B605A; } .wine .res { color: #D9C9AA; }
.howto { display: grid; grid-template-columns: 1fr 1fr; gap: 4.5mm 5mm; margin-top: 7mm; }
.howto .card { padding: 4.5mm 5mm; }
.howto .card h3 { font-size: 15pt; }
.ui { font-family: 'Jost'; font-size: .86em; font-weight: 500; letter-spacing: .01em; white-space: nowrap; color: #6B1020; background: rgba(201,169,110,.18); border-radius: 1mm; padding: 0 1mm; }
.wine .ui { color: #F7EFE0; background: rgba(201,169,110,.22); }
.legend { list-style: none; counter-reset: lg; padding: 0; margin: 0; }
.legend li { counter-increment: lg; position: relative; padding-left: 9mm; font-size: 10.6pt; line-height: 1.38; margin-bottom: 3.4mm; color: #3F4540; }
.legend li::before { content: counter(lg); position: absolute; left: 0; top: 0; width: 6mm; height: 6mm; border-radius: 50%; border: .3mm solid #9C7A45; color: #8A6A2E; font: italic 500 11pt/6mm 'Cormorant Garamond'; text-align: center; }
.wine .legend li { color: #E9DCC4; } .wine .legend li::before { border-color: #C9A96E; color: #E3C98E; }
.longshot { position: relative; width: 47mm; border-radius: 5mm; background: #111; padding: 1.4mm; box-shadow: 0 3mm 9mm rgba(30,5,10,.35); flex: none; }
.longshot div { width: 100%; border-radius: 3.8mm; overflow: hidden; }
.longshot .pin { position: absolute; left: -3.2mm; width: 6.2mm; height: 6.2mm; border-radius: 50%; background: #9C7A45; color: #fff; font: 600 7.6pt/6.2mm 'Jost'; text-align: center; box-shadow: 0 .6mm 1.6mm rgba(0,0,0,.35); transform: translateY(-50%); }
.longshot img { display: block; width: 100%; height: auto; }
.faq { columns: 2; column-gap: 8mm; margin-top: 6mm; }
.faq div { break-inside: avoid; margin-bottom: 4.2mm; }
.faq h4 { font-family: 'Cormorant Garamond'; font-size: 13.5pt; font-weight: 600; color: #6B1020; margin: 0 0 1mm; line-height: 1.15; }
.faq p { font-size: 9.9pt; line-height: 1.38; margin: 0; color: #3F4540; }
.stat { font-family: 'Cormorant Garamond'; font-size: 40pt; font-weight: 500; line-height: 1; color: #6B1020; }
.wine .stat { color: #F3E3BF; }
.statl { font-family: 'Jost'; font-size: 7.8pt; letter-spacing: .16em; text-transform: uppercase; color: #5B605A; margin-top: 1.5mm; }
.wine .statl { color: #D8C9AE; }
`;

import sharpLib from "sharp";
import { WORK } from "./work.mjs";
const topColor = {};
for (const f of (await import("node:fs")).readdirSync("jpg").filter((f) => /^(pub|ges)-/.test(f))) {
  const { data } = await sharpLib("jpg/" + f).extract({ left: 0, top: 2, width: 780, height: 4 }).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
  topColor[f.replace(".jpg", "")] = [data[0], data[1], data[2]];
}
const sbar = (src) => {
  const [r, g, b] = topColor[src] || [244, 238, 227];
  const ink = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1a1a1a" : "#ffffff";
  return `<div class="sb" style="background:rgb(${r},${g},${b});color:${ink}"><span>19:30</span><span class="ic"><svg viewBox="0 0 18 12" fill="${ink}"><rect x="0" y="8" width="3" height="4" rx=".6"/><rect x="5" y="5.5" width="3" height="6.5" rx=".6"/><rect x="10" y="3" width="3" height="9" rx=".6"/><rect x="15" y="0" width="3" height="12" rx=".6"/></svg><svg viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="${ink}" stroke-opacity=".45"/><rect x="2.2" y="2.2" width="15" height="7.6" rx="1.6" fill="${ink}"/><rect x="23.6" y="4" width="1.6" height="4" rx=".8" fill="${ink}" fill-opacity=".45"/></svg></span></div>`;
};
const phone = (src, w, extra = "") => `<div class="ph glass" style="width:${w}mm;${extra}"><div class="scr">${sbar(src)}<div class="vp"><img src="jpg/${src}.jpg"></div></div></div>`;
const mac = (src, w, extra = "", pins = "") => `<div class="mac" style="width:${w}mm;${extra}"><div class="lid"><div style="position:relative"><img src="jpg/${src}.jpg">${pins}</div></div><div class="base"></div></div>`;
const frame = `<div class="frame"><i></i><i></i><i></i><i></i></div>`;
const chrome = (n, label, tone = "") => `${frame}<div class="top"><span>L'Angolo del Vino</span><span>${label}</span></div><div class="foot"><span>Il menù digitale</span><b>${n}</b></div>`;

let _pg = 1, _kn = 0;
const pg = () => ++_pg;
const kn = () => String(++_kn).padStart(2, "0");
// Numeri sulla schermata della gestione: posizioni misurate da shots-mac.mjs.
const pos = JSON.parse((await import("node:fs")).readFileSync(`${WORK}/img/mac-gestione.json`, "utf8"));
const gestionePins = [["top", 1], ["tools", 2], ["search", 3], ["oggi", 4], ["info", 5], ["sezioni", 6], ["voci", 7]]
  .filter(([k]) => pos[k])
  .map(([k, n]) => `<span class="pin" style="left:${Math.max(2.5, pos[k].x - 1.8).toFixed(1)}%;top:${pos[k].y.toFixed(1)}%">${n}</span>`)
  .join("");
// Versione e data prese dal progetto: non restano mai indietro.
const VERSIONE = JSON.parse((await import("node:fs")).readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const OGGI = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
const pages = [];

// 1 · Copertina
pages.push(`<section class="page wine" style="padding:0;align-items:center;justify-content:center;text-align:center;background:#33060D url(jpg/cover-bg.jpg) center/cover no-repeat">
  ${frame}
  <img src="jpg/logo.png" style="width:112mm;filter:invert(1) sepia(.25) brightness(.97);margin-top:-18mm">
  <div style="display:flex;align-items:center;gap:4mm;margin:14mm 0 9mm"><i style="display:block;height:.3mm;width:30mm;background:#C9A96E"></i><b style="display:block;width:2.4mm;height:2.4mm;transform:rotate(45deg);border:.3mm solid #C9A96E"></b><i style="display:block;height:.3mm;width:30mm;background:#C9A96E"></i></div>
  <div class="serif" style="font-family:'Cormorant Garamond';font-style:italic;font-weight:500;font-size:60pt;line-height:1;color:#F7EFE0;">Il menù digitale</div>
  <div class="sans" style="font-family:Jost;letter-spacing:.36em;text-transform:uppercase;font-size:9.5pt;color:#E3D4BC;margin-top:7mm">Carta dei vini · piatti · allergeni · eventi</div>
  <div style="position:absolute;left:0;right:0;bottom:22mm;font-family:Jost;font-size:8.5pt;letter-spacing:.26em;text-transform:uppercase;color:#C9A96E">Guida alla gestione · ${OGGI} · versione ${VERSIONE}</div>
</section>`);

// 2 · In breve
pages.push(`<section class="page paper">${chrome(pg(), "In breve")}
  <div style="display:flex;gap:9mm;flex:1;margin-top:6mm">
    <div style="width:76mm;padding-top:8mm">
      <div class="kicker"><span class="kn">${kn()}</span>In breve</div>
      <h2>Un menù che<br><em>vive</em> ogni giorno</h2>
      <div class="orn"><i></i><b></b><i></i></div>
      <p class="lead">Chi inquadra il QR trova sempre la carta aggiornata: vini, piatti, allergeni, eventi, orari. Il personale cambia tutto dal computer o dal telefono: niente stampe, niente telefonate.</p>
    </div>
    <div style="position:relative;flex:1;height:150mm">
      <div style="position:absolute;left:0;top:30mm;transform:rotate(-4deg)">${phone("pub-bollicine", 56)}</div>
      <div style="position:absolute;left:21mm;top:0;transform:rotate(3deg)">${phone("pub-hero", 63)}</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);margin:4mm 0 9mm;border-top:.3mm solid #C9B48A;border-bottom:.3mm solid #C9B48A">
    ${[["1", "pagina da aggiornare"], ["14", "allergeni di legge"], ["5:00", "«oggi» si azzera da solo"], ["0", "stampe da rifare"]].map(([n, l], i) => `<div style="padding:6mm 4mm;text-align:center;${i ? "border-left:.3mm solid #D9CEBC" : ""}"><div class="stat">${n}</div><div class="statl">${l}</div></div>`).join("")}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5mm">
    <div class="card"><h3>Per i clienti</h3><p>Una pagina elegante e veloce: si sfoglia, si cerca, si controllano gli allergeni, si scoprono gli eventi.</p></div>
    <div class="card"><h3>Per chi lavora</h3><p>«Esaurito» con un tocco, un piatto del giorno, prezzi e orari: tutto da una sola area riservata.</p></div>
    <div class="card"><h3>Sotto controllo</h3><p>Il cliente vede solo il menù. Chi modifica lo decide il titolare. Ogni cambio si può annullare.</p></div>
  </div>
</section>`);

// 3 · Clienti
pages.push(`<section class="page wine">${chrome(pg(), "Per i clienti")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Quello che vedono i clienti</div>
  <h2>Elegante, chiaro,<br><em>a misura di telefono</em></h2>
  <p class="lead">Dalla copertina alle sezioni: azienda e nome del vino, denominazione, uvaggio, regione, prezzi al calice e alla bottiglia. Ogni voce si legge bene anche con poca luce.</p></div>
  <div style="position:relative;height:150mm;margin-top:6mm">
    <div style="position:absolute;left:4mm;top:16mm;transform:rotate(-5deg)">${phone("pub-rossi", 54)}</div>
    <div style="position:absolute;right:4mm;top:16mm;transform:rotate(5deg)">${phone("pub-bollicine", 54)}</div>
    <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);z-index:2">${phone("pub-hero", 64)}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7mm;margin-top:8mm;text-align:center">
    <div class="cap"><b>I vini</b><br>azienda, nome, denominazione, calice e bottiglia</div>
    <div class="cap"><b>La copertina</b><br>con «Aperto ora» in automatico</div>
    <div class="cap"><b>Rossi divisi</b><br>Italia ed Estero, con la regione e il paese se estero</div>
  </div>
</section>`);

// 4 · Cercare
pages.push(`<section class="page paper">${chrome(pg(), "Trovare e leggere")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Trovare subito</div>
  <h2>Ricerca, testo grande,<br><em>«Torna su»</em></h2>
  <p class="lead">Tre strumenti discreti nella barra delle sezioni: non disturbano chi sfoglia, aiutano chi ha fretta o vede poco.</p></div>
  <div style="display:flex;gap:7mm;justify-content:center;margin-top:9mm">
    <div style="width:56mm">${phone("pub-ricerca", 56)}<div class="cap"><span class="nb">1</span><b>Cerca</b> per nome, zona, vitigno o ingrediente; filtri «Al calice», «Enomatic», «Bio», «Vegano».</div></div>
    <div style="width:56mm;margin-top:10mm">${phone("pub-testo-grande", 56)}<div class="cap"><span class="nb">2</span><b>Testo più grande</b> con un tocco su «Aa»: il telefono se lo ricorda.</div></div>
    <div style="width:56mm">${phone("pub-taglieri", 56)}<div class="cap"><span class="nb">3</span><b>Cucina</b> con chiusura della cucina, coperto e allergeni numerati.</div></div>
  </div>
  <div style="margin-top:auto"><p class="quote">«Gewürz», «sangiovese», «burrata»: bastano poche lettere, anche senza accenti. Toccando un risultato il menù scorre alla voce e la illumina.</p></div>
</section>`);

// 5 · Oggi fuori menù
pages.push(`<section class="page wine" style="justify-content:center;gap:14mm">${chrome(pg(), "Oggi fuori menù")}
  <div style="display:flex;gap:8mm;flex:none;height:150mm">
    <div style="width:78mm;padding-top:6mm">
      <div class="kicker"><span class="kn">${kn()}</span>Del giorno</div>
      <h2>«Oggi<br><em>fuori menù</em>»</h2>
      <div class="orn"><i></i><b></b><i></i></div>
      <p class="lead" style="max-width:78mm">Il piatto speciale o il vino aperto per l'occasione compaiono in cima al menù e spariscono da soli alle cinque del mattino.</p>
      <div style="margin-top:10mm;display:flex;flex-direction:column;gap:3mm">
        <div class="cap" style="margin:0"><b>A sinistra</b> il telefono del personale</div>
        <div class="cap" style="margin:0"><b>A destra</b> ciò che vedono i clienti</div>
      </div>
    </div>
    <div style="position:relative;flex:1;height:150mm">
      <div style="position:absolute;left:0;top:30mm;transform:rotate(-3deg)">${phone("ges-top", 54)}</div>
      <div style="position:absolute;left:24mm;top:0;transform:rotate(3deg)">${phone("pub-oggi", 60)}</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5mm">
    <div class="card" style="padding:4.5mm 5mm"><h3><span class="nb">1</span>Si aggiunge</h3><p>Con «+ Piatto» o «+ Vino»: stesso editor di sempre, con prezzo e allergeni.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3><span class="nb">2</span>È già sul menù</h3><p>Il cliente lo vede subito, con prezzi e allergeni.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3><span class="nb">3</span>Il giorno dopo</h3><p>«Riproponi» lo rimette tra le voci di oggi con un tocco.</p></div>
  </div>
</section>`);

// 6 · Eventi
pages.push(`<section class="page paper">${chrome(pg(), "Eventi e annunci")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Eventi e annunci</div>
  <h2>Ogni serata<br><em>ha la sua pagina</em></h2>
  <p class="lead">Una locandina, un testo, le date. Per le serate con un menù dedicato si compone anche il menù speciale, con più formati e prezzi.</p></div>
  <div style="display:flex;gap:9mm;margin-top:8mm;justify-content:center;align-items:flex-start">
    <div style="width:52mm">${phone("pub-evento", 52)}<div class="cap"><span class="nb">1</span><b>Nei giorni dell'evento</b> si apre subito dopo la copertina.</div></div>
    <div style="width:52mm;margin-top:12mm">${phone("pub-evento-pagina", 52)}<div class="cap"><span class="nb">2</span><b>Prima dell'evento</b> la locandina è in evidenza da una settimana.</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:auto;margin-bottom:4mm">
    <div class="card"><h3>Date intelligenti</h3><p>La locandina si vede da sette giorni prima; il menù speciale solo nei giorni dell'evento. Finito, tutto sparisce da solo e resta nell'archivio.</p></div>
    <div class="card"><h3>Si ripete facilmente</h3><p>«Duplica» copia testo, foto, gruppi, voci e prezzi: la prossima edizione è questione di cambiare le date.</p></div>
  </div>
  <div style="position:absolute;left:0;right:0;text-align:center;bottom:17mm;font:7.5pt Jost;color:#8A8F88;letter-spacing:.04em">Locandine e date sono quelle reali; il menù speciale mostrato è un esempio di prova.</div>
</section>`);

// · Il menù dell'evento
pages.push(`<section class="page wine">${chrome(pg(), "Il menù dell'evento")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Il menù dell'evento</div>
  <h2>Voce per voce<br><em>o un PDF già pronto</em></h2>
  <p class="lead">Per una serata sola si può caricare il menù in PDF o in foto: i clienti lo leggono dentro la pagina dell'evento. Oppure lo si compone voce per voce, con le birre in colonne.</p></div>
  <div style="position:relative;margin-top:7mm;height:120mm">
    <div style="position:absolute;left:0;top:0">${mac("mac-evento-menu", 146)}</div>
    <div style="position:absolute;right:0;top:24mm">${phone("pub-evento-birre", 44)}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:auto">
    <div class="card" style="padding:4.5mm 5mm"><h3 style="font-size:15pt">PDF o foto</h3><p>«PDF o foto», poi <b>Carica PDF o foto</b>: fino a 6 pagine, si riordinano e si tolgono. L'avviso allergeni resta sempre acceso.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3 style="font-size:15pt">Birre in più formati</h3><p>Nella prima birra scegli <b>Più formati</b> e tocca 0,2 l · 0,4 l · 1 l: valgono per tutto il gruppo, nelle altre scrivi solo i prezzi.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3 style="font-size:15pt">Note e righe di testo</h3><p><b>Note del menù</b> in cima; <b>+ Aggiungi testo</b> per una riga senza prezzo tra le voci.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3 style="font-size:15pt">Allergeni in una riga</h3><p>Con l'<b>avviso allergeni unico</b> acceso, i piatti dell'evento non chiedono gli allergeni uno per uno.</p></div>
  </div>
</section>`);

// 7 · Allergeni
const allergens = ["Glutine","Crostacei","Uova","Pesce","Arachidi","Soia","Latte","Frutta a guscio","Sedano","Senape","Sesamo","Solfiti","Lupini","Molluschi"];
pages.push(`<section class="page paper">${chrome(pg(), "Allergeni")}
  <div style="display:flex;gap:9mm;flex:1;margin-top:6mm">
    <div style="width:84mm;padding-top:6mm">
      <div class="kicker"><span class="kn">${kn()}</span>Allergeni</div>
      <h2>In regola,<br><em>facile da consultare</em></h2>
      <p class="lead" style="max-width:84mm">Accanto a ogni piatto i numeri degli allergeni, con la legenda in fondo al menù. Una pagina dedicata permette di scegliere cosa evitare.</p>
      <div style="margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;gap:2.4mm 5mm;border-top:.3mm solid #D9CEBC;border-bottom:.3mm solid #D9CEBC;padding:5mm 1mm">
        ${allergens.map((a, i) => `<div style="display:flex;align-items:baseline;gap:2.6mm"><span style="font:italic 500 13pt 'Cormorant Garamond';color:#9C7A45;width:6mm;text-align:right">${i + 1}</span><span style="font:500 7.6pt Jost;letter-spacing:.1em;text-transform:uppercase">${a}</span></div>`).join("")}
      </div>
      <p class="quote" style="margin-top:7mm;font-size:14pt">Se un piatto non è ancora compilato, i clienti leggono «da verificare con il personale»: nel dubbio, meglio in più che in meno.</p>
    </div>
    <div style="position:relative;flex:1;height:150mm">
      <div style="position:absolute;left:0;top:34mm;transform:rotate(-3deg)">${phone("pub-allergeni-filtro", 50)}</div>
      <div style="position:absolute;left:19mm;top:0;transform:rotate(3deg)">${phone("pub-taglieri", 57)}</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-bottom:11mm">
    <div class="card"><h3>Per chi ha un'allergia</h3><p>Sceglie cosa evitare e vede solo i piatti adatti. I vini sono segnalati una volta sola: contengono solfiti.</p></div>
    <div class="card"><h3>Per il personale</h3><p>«Compila allergeni» guida piatto per piatto: un tocco per «Nessuno» o per spuntare i 14 allergeni.</p></div>
  </div>
</section>`);

// 8 · Gestione
pages.push(`<section class="page wine">${chrome(pg(), "Per chi gestisce il menù")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>La gestione</div>
  <h2>Dal computer in ufficio,<br><em>dal telefono in sala</em></h2>
  <p class="lead">La gestione si fa comodamente dal computer: le sezioni restano a fianco, le schede si aprono a destra. In sala, dal telefono, si segna un «Esaurito» al volo.</p></div>
  <div style="position:relative;margin-top:9mm;height:128mm">
    <div style="position:absolute;left:4mm;top:0">${mac("mac-gestione", 150)}</div>
    <div style="position:absolute;right:0;top:44mm">${phone("ges-cerca", 38)}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-top:auto">
    <div class="card" style="padding:4.5mm 5mm"><h3>Trova e cambia</h3><p>Cerca una voce per nome e segnala «Esaurito» con un tocco.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3>Annulla sempre</h3><p>Lo storico rimette tutto com'era, anche giorni dopo.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3>Chi può farlo</h3><p>Il titolare sceglie, dipendente per dipendente.</p></div>
  </div>
</section>`);

// 9 · Configurabile
pages.push(`<section class="page paper">${chrome(pg(), "Tutto configurabile")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Tutto configurabile</div>
  <h2>Orari, contatti,<br><em>coperto e avvisi</em></h2>
  <p class="lead">Ogni informazione si cambia da un solo posto e compare dove serve: niente da aggiornare due volte.</p></div>
  <div style="display:flex;gap:6mm;justify-content:center;margin-top:8mm">
    <div style="width:50mm">${phone("ges-info", 50)}<div class="cap"><span class="nb">1</span><b>Un solo posto</b> per informazioni, orari, contatti e copertina.</div></div>
    <div style="width:50mm;margin-top:9mm">${phone("pub-footer", 50)}<div class="cap"><span class="nb">2</span><b>Contatti a un tocco:</b> chiama, WhatsApp, indicazioni, recensione, Instagram.</div></div>
    <div style="width:50mm">${phone("ges-qr", 50)}<div class="cap"><span class="nb">3</span><b>Codice QR</b> pronto per la stampa (SVG e PNG).</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:auto">
    <div class="card"><h3>Informazioni del menù</h3><p>Coperto, chiusura della cucina, avvisi («Domenica cucina chiusa»): scegli il testo, dove compare e per quali giorni.</p></div>
    <div class="card"><h3>«Aperto ora»</h3><p>La copertina dice «Aperto ora · chiude alle 22:00» o «Chiuso · riapre domani alle 16:30», calcolato dagli orari. Una chiusura straordinaria si segna in un passaggio.</p></div>
  </div>
</section>`);

// 10 · Abbinamento consigliato
pages.push(`<section class="page paper">${chrome(pg(), "Abbinamento consigliato")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Abbinamento consigliato</div>
  <h2>Il vino giusto<br><em>per ogni piatto</em></h2>
  <p class="lead">Sotto un piatto, il vino scelto da voi: nome, zona e prezzi al calice e a bottiglia. Un tocco porta al vino, un altro riporta al piatto.</p></div>
  <div style="display:flex;gap:6mm;justify-content:center;margin-top:8mm">
    <div style="width:50mm">${phone("pub-abbinamento", 50)}<div class="cap"><span class="nb">1</span><b>Sotto il piatto</b> il vino consigliato, con calice e bottiglia.</div></div>
    <div style="width:50mm;margin-top:9mm">${phone("pub-abbinamento-vino", 50)}<div class="cap"><span class="nb">2</span><b>Un tocco</b> porta al vino e lo illumina; «Torna a…» riporta al piatto.</div></div>
    <div style="width:50mm">${phone("ges-abbinamento", 50)}<div class="cap"><span class="nb">3</span><b>In gestione</b> si cerca il vino per nome e si sceglie.</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:auto">
    <div class="card"><h3>Un vino per piatto</h3><p>Facoltativo: lo mettete solo dove volete. Nessun abbinamento automatico, e ogni modifica si annulla dallo storico.</p></div>
    <div class="card"><h3>Sempre giusto</h3><p>Se il vino è esaurito o tolto dalla carta, il riquadro sparisce da solo e torna quando il vino torna.</p></div>
  </div>
</section>`);

// · La carta dei vini
pages.push(`<section class="page wine">${chrome(pg(), "La carta dei vini")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>La carta dei vini</div>
  <h2>Ogni vino al suo posto,<br><em>con le sue qualità</em></h2>
  <p class="lead">Una scheda ordinata in blocchi, con l'anteprima di come si legge sul menù. Biologico, biodinamico, vegano e senza solfiti aggiunti compaiono con un piccolo disegno, e i clienti li possono filtrare nella ricerca.</p></div>
  <div style="position:relative;margin-top:8mm;height:122mm">
    <div style="position:absolute;left:0;top:0">${mac("mac-vino", 146)}</div>
    <div style="position:absolute;right:0;top:30mm">${phone("pub-bollicine", 42)}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:auto">
    <div class="card"><h3>In ordine da soli</h3><p>Prima la Toscana, poi le altre regioni in ordine alfabetico, poi l'estero. Un vino nuovo va da solo al posto della sua regione; l'ordine scelto a mano resta com'è.</p></div>
    <div class="card"><h3>Regione obbligatoria</h3><p>Per i vini italiani la regione va sempre scritta (decide il posto in carta); per gli esteri basta la nazione. La denominazione resta facoltativa.</p></div>
  </div>
</section>`);

// · Strumenti
pages.push(`<section class="page paper">${chrome(pg(), "Strumenti")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Strumenti</div>
  <h2>Prezzi, ordine<br><em>e menù di carta</em></h2>
  <p class="lead">Tre strumenti per le modifiche grandi, pensati per il computer: tutti i prezzi in una tabella, l'ordine delle voci trascinando, il menù pronto da stampare.</p></div>
  <div style="display:flex;justify-content:center;margin-top:7mm">${mac("mac-prezzi", 138)}</div>
  <div class="cap" style="text-align:center;margin-top:3.5mm"><span class="nb">1</span><b>Tabella prezzi</b>: si cambiano tanti prezzi, anche in sezioni diverse, e si salva tutto insieme.</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:6mm">
    <div>${mac("mac-riordina", 76, "margin:0 auto")}<div class="cap" style="text-align:center;margin-top:3.5mm"><span class="nb">2</span><b>Riordina</b>: si trascina dalla maniglia ≡ o si usano le frecce.</div></div>
    <div>${mac("mac-stampa", 76, "margin:0 auto")}<div class="cap" style="text-align:center;margin-top:3.5mm"><span class="nb">3</span><b>Menù da stampare</b>: foglio A4, poi «Salva come PDF».</div></div>
  </div>
</section>`);

// · Statistiche
pages.push(`<section class="page wine">${chrome(pg(), "Statistiche")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Statistiche</div>
  <h2>Quanti aprono il menù,<br><em>quando e per cosa</em></h2>
  <p class="lead">Solo per il titolare. Giorni e orari più forti, classifica dei giorni della settimana e dei mesi, le parole più cercate e quelle cercate ma non trovate.</p></div>
  <div style="position:relative;margin-top:8mm;height:126mm">
    <div style="position:absolute;left:0;top:0">${mac("mac-statistiche", 148)}</div>
    <div style="position:absolute;right:0;top:34mm">${phone("ges-stat-giorni", 40)}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:auto">
    <div class="card" style="padding:4.5mm 5mm"><h3 style="font-size:15pt">Anonime</h3><p>Niente nomi, niente cookie: solo cosa, che giorno e che ora.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3 style="font-size:15pt">Solo i clienti</h3><p>Ogni telefono conta una volta al giorno. Personale e Anteprima non contano.</p></div>
    <div class="card" style="padding:4.5mm 5mm"><h3 style="font-size:15pt">Quando volete</h3><p>Si accende con «Inizia a contare»: meglio dal giorno del QR nuovo.</p></div>
  </div>
  <div style="text-align:center;margin:3mm 0 4mm;font:7.5pt Jost;color:rgba(233,220,196,.7);letter-spacing:.04em">I numeri delle schermate sono di esempio: in produzione si parte da zero.</div>
</section>`);

// 11 · Guida: entrare
pages.push(`<section class="page wine">${chrome(pg(), "Guida · entrare")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Guida · Entrare</div>
  <h2>Dove si entra<br><em>e chi può farlo</em></h2>
  <p class="lead">La gestione del menù sta nello stesso sito degli orari. Dal computer (il modo più comodo) o dal telefono, con il proprio nome utente e la password.</p></div>
  <div style="display:flex;justify-content:center;margin-top:8mm">${mac("mac-login", 140)}</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:7mm">
    <div class="cap" style="margin:0"><span class="nb">1</span>Apri <b>orari-turni.vercel.app</b> nel browser (Safari o Chrome). Conviene salvarlo tra i preferiti.</div>
    <div class="cap" style="margin:0"><span class="nb">2</span>Scrivi <b>Username</b> e <b>Password</b>, poi <b>Accedi</b>.</div>
    <div class="cap" style="margin:0"><span class="nb">3</span>In alto tocca <b>Menù</b>. Le <b>Statistiche</b> sono accanto.</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:auto">
    <div class="card"><h3>Anche dal telefono</h3><p>Stesso indirizzo e stesse credenziali; sul telefono la barra è in basso. Si può aggiungere alla schermata Home con <span class="ui">Scopri come</span>.</p></div>
    <div class="card"><h3>Chi può modificare</h3><p>Il titolare sempre. Un dipendente solo se in Dipendenti è acceso <span class="ui">Può modificare il menù</span>. Ogni modifica resta nello storico con il nome di chi l'ha fatta.</p></div>
  </div>
</section>`);

// 12 · Guida: la schermata
pages.push(`<section class="page paper">${chrome(pg(), "Guida · la schermata")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Guida · La schermata</div>
  <h2>Tutto in una pagina,<br><em>dall'alto in basso</em></h2></div>
  <div style="display:flex;justify-content:center;margin-top:5mm">${mac("mac-gestione", 156, "", gestionePins)}</div>
  <ol class="legend" style="margin-top:8mm;columns:2;column-gap:9mm">
    <li><b>In alto</b>: <span class="ui">Vedi menù ↗</span> e <span class="ui">+ Evento o annuncio</span>.</li>
    <li><b>Gli strumenti</b>: <span class="ui">Tabella prezzi</span>, <span class="ui">Riordina</span>, <span class="ui">Storico</span>, <span class="ui">Anteprima</span>, <span class="ui">Menù da stampare</span>, <span class="ui">Codice QR</span>, <span class="ui">Guida</span>.</li>
    <li><b>La ricerca</b>: bastano due lettere; accanto a ogni risultato c'è <span class="ui">Esaurito</span>.</li>
    <li><b>Oggi fuori menù</b>: piatti e vini solo di oggi, con <span class="ui">+ Piatto</span> e <span class="ui">+ Vino</span>.</li>
    <li><b>Informazioni del menù</b> (coperto, cucina, avvisi) e <b>Il locale</b> (copertina, orari, contatti).</li>
    <li><b>Le sezioni</b> a sinistra; sotto, <b>Eventi e annunci</b>.</li>
    <li><b>Le voci</b>: clic sul nome per modificarla. Un clic sul titolo del gruppo (▾ Champagne) lo chiude o lo apre.</li>
  </ol>
</section>`);

// 13 · Guida: ogni giorno
pages.push(`<section class="page wine">${chrome(pg(), "Guida · ogni giorno")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Guida · Ogni giorno</div>
  <h2>Le cose di tutti i giorni,<br><em>passo per passo</em></h2></div>
  <div class="howto">
    <div class="card"><h3>Un vino o un piatto è finito</h3><ol class="steps"><li>In alto, in <span class="ui">Cerca una voce del menù…</span>, scrivi il nome.</li><li>Tocca <span class="ui">Esaurito</span>.</li></ol><p class="res">Il vino sparisce dal menù, il piatto resta sbiadito. Alle 5 del mattino torna da solo. Per rimettere tutto subito: <span class="ui">Riattiva tutto</span>.</p></div>
    <div class="card"><h3>Il piatto o il vino del giorno</h3><ol class="steps"><li>In «Oggi fuori menù» tocca <span class="ui">+ Piatto</span> o <span class="ui">+ Vino</span>.</li><li>Nome, prezzo e allergeni, poi <span class="ui">Aggiungi</span>.</li></ol><p class="res">Compare in cima al menù e sparisce alle 5. Per rimetterlo un altro giorno: <span class="ui">Riproponi</span>.</p></div>
    <div class="card"><h3>Cambiare un prezzo o un testo</h3><ol class="steps"><li>Cerca la voce e tocca il suo nome.</li><li>Cambia il campo e tocca <span class="ui">Salva</span>.</li></ol><p class="res">Tanti prezzi insieme: <span class="ui">Tabella prezzi</span>, poi <span class="ui">Salva tutto</span>.</p></div>
    <div class="card"><h3>Aggiungere un vino o un piatto</h3><ol class="steps"><li>Tocca la sezione (es. Rossi).</li><li>In fondo al gruppo tocca <span class="ui">+ Aggiungi vino</span> o <span class="ui">+ Aggiungi voce</span>.</li><li>Compila (per un vino italiano anche la <b>regione</b>) e tocca <span class="ui">Aggiungi</span>.</li></ol><p class="res">Il vino va da solo al posto della sua regione. Tante voci insieme: <span class="ui">Incolla più voci</span>.</p></div>
    <div class="card"><h3>Abbinare un vino a un piatto</h3><ol class="steps"><li>Apri il piatto.</li><li>In <span class="ui">Abbinamento consigliato</span> scrivi il nome del vino e toccalo.</li><li>Tocca <span class="ui">Salva</span>.</li></ol><p class="res">Per toglierlo: ✕ accanto al vino, poi Salva.</p></div>
    <div class="card"><h3>Ho sbagliato qualcosa</h3><ol class="steps"><li>Subito: <span class="ui">Annulla</span> nel messaggio che compare in basso.</li><li>Più tardi: <span class="ui">Storico</span>, poi <span class="ui">Ripristina</span> sulla riga giusta.</li></ol><p class="res">Funziona anche per una voce eliminata per errore.</p></div>
  </div>
</section>`);

// 14 · Guida: ogni tanto
pages.push(`<section class="page paper">${chrome(pg(), "Guida · ogni tanto")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Guida · Ogni tanto</div>
  <h2>Eventi, orari, allergeni<br><em>e tutto il resto</em></h2></div>
  <div class="howto">
    <div class="card"><h3>Un evento o un annuncio</h3><ol class="steps"><li><span class="ui">+ Evento o annuncio</span>: scegli «Evento con menù speciale» o «Annuncio».</li><li>Titolo, testo, la locandina con <span class="ui">Scegli foto o PDF</span> e le date, poi <span class="ui">Crea evento e componi il menù</span>.</li><li>Si apre il menù speciale: <span class="ui">+ Da bere</span>, <span class="ui">+ Da mangiare</span> o <span class="ui">+ Aggiungi gruppo</span>, poi <span class="ui">+ Aggiungi voce</span>.</li></ol><p class="res">Un clic sulla locandina la ingrandisce. La volta dopo: <span class="ui">Duplica</span> e cambia solo le date.</p></div>
    <div class="card"><h3>Allergeni dei piatti</h3><ol class="steps"><li>Tocca <span class="ui">Compila allergeni</span>.</li><li>Per ogni piatto: «Nessuno» oppure «Contiene…» e spunta.</li><li><span class="ui">Salva e passa al successivo</span>.</li></ol><p class="res">Finché un piatto non è compilato, il cliente legge «da verificare con il personale».</p></div>
    <div class="card"><h3>Orari, ferie e chiusure</h3><ol class="steps"><li>«Il locale», poi Orari <span class="ui">Modifica</span>.</li><li>Ferie o chiusura: <span class="ui">+ Aggiungi chiusura o apertura straordinaria</span>, date, «Chiuso», motivo.</li><li><span class="ui">Salva</span>.</li></ol><p class="res">«Aperto ora · chiude alle…» in copertina si calcola da solo.</p></div>
    <div class="card"><h3>Coperto, cucina, avvisi</h3><ol class="steps"><li>«Informazioni del menù», poi <span class="ui">+ Aggiungi</span>.</li><li>Scegli: testo, voce con prezzo o avviso; dove compare e, se serve, dal giorno al giorno.</li></ol><p class="res">Finita la data, l'avviso sparisce da solo.</p></div>
    <div class="card"><h3>Cambiare l'ordine</h3><ol class="steps"><li><span class="ui">Riordina</span>, scegli sezioni, gruppi o le voci di un gruppo (<span class="ui">Apri ›</span>).</li><li>Trascina dalla maniglia ≡ o usa le frecce, poi <span class="ui">Salva ordine</span>.</li></ol><p class="res">Per i vini c'è anche <span class="ui">Ordina per regione</span>.</p></div>
    <div class="card"><h3>Menù di carta e statistiche</h3><ol class="steps"><li><span class="ui">Menù da stampare</span>, poi <span class="ui">Stampa o salva in PDF</span>.</li><li>Nella barra: <span class="ui">Statistiche</span>, poi <span class="ui">Inizia a contare</span> e il periodo.</li></ol><p class="res">Copertina e contatti si cambiano in «Il locale»; il QR in <span class="ui">Codice QR</span>.</p></div>
  </div>
</section>`);

// 11 · Concludere
pages.push(`<section class="page wine">${chrome(pg(), "Per concludere")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Per concludere</div>
  <h2>Cosa serve per <em>partire</em></h2></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:7mm">
    <div class="card"><h3>Da fare insieme</h3><ul class="tick" style="margin-top:3mm">
      <li>Ripuntare il QR stampato a <span style="white-space:nowrap">orari-turni.vercel.app/menu</span>, poi accendere «Inizia a contare».</li><li>Provare il messaggio WhatsApp per prenotare.</li><li>Allergeni dei due kombucha e testo della pagina allergeni.</li><li>Abbinamenti dei piatti e caratteristiche dei vini ancora da confermare.</li><li>Inserire l'Oktoberfest con la sua locandina.</li></ul></div>
    <div class="card"><h3>Idee per il futuro</h3><ul class="tick" style="margin-top:3mm">
      <li>Versione in inglese per i turisti.</li><li>Foto dei piatti e dei vini.</li><li>Un QR dedicato a ogni evento.</li></ul></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5mm;margin-top:6mm">
    <div style="background:#fff;padding:4.5mm;border-radius:4mm;box-shadow:0 6mm 14mm rgba(0,0,0,.4)"><img src="jpg/qr-prod.png" style="width:52mm;display:block"></div>
    <div class="sans" style="font-family:Jost;letter-spacing:.3em;text-transform:uppercase;font-size:9pt;color:#E3D4BC">Inquadra e sfoglia il menù</div>
    <div style="font-style:italic;font-size:11pt;color:#C9B995">orari-turni.vercel.app/menu · il QR stampato in enoteca non è stato modificato</div>
  </div>
</section>`);

// 16 · Domande frequenti
pages.push(`<section class="page paper">${chrome(pg(), "Domande frequenti")}
  <div style="margin-top:6mm"><div class="kicker"><span class="kn">${kn()}</span>Domande frequenti</div>
  <h2>Le domande<br><em>di tutti i giorni</em></h2></div>
  <div class="faq">
    <div><h4>Le modifiche si vedono subito?</h4><p>Sì, in pochi secondi. Chi ha già il menù aperto lo vede aggiornato ricaricando la pagina.</p></div>
    <div><h4>Se sbaglio, posso tornare indietro?</h4><p>Sì: «Annulla» subito dopo la modifica, oppure «Storico» e «Ripristina», anche giorni dopo.</p></div>
    <div><h4>Un vino è finito: lo elimino?</h4><p>No, tocca «Esaurito»: sparisce solo per oggi e torna da solo alle 5 del mattino. Elimina solo ciò che non avrete più.</p></div>

    <div><h4>Il QR stampato va rifatto quando cambio i prezzi?</h4><p>No: porta sempre alla stessa pagina, che si aggiorna da sola. Va solo ripuntato una volta alla nuova pagina.</p></div>
    <div><h4>Posso caricare il menù di un evento in PDF?</h4><p>Sì: nell'evento scegli «PDF o foto» e «Carica PDF o foto». I clienti vedono le pagine dentro il menù, con l'avviso allergeni.</p></div>
    <div><h4>Un dipendente può segnare gli esauriti?</h4><p>Sì, se in «Dipendenti» gli accendi «Può modificare il menù». Potrà cambiare anche voci e prezzi; ogni modifica resta nello storico con il suo nome.</p></div>
    <div><h4>Se non compilo gli allergeni di un piatto?</h4><p>Il cliente legge «Allergeni da verificare con il personale»: mai un'informazione che sembri sicura quando non lo è.</p></div>
    <div><h4>Come metto le birre in più formati?</h4><p>Nella prima birra, in «Prezzo», scegli «Più formati» e tocca i formati (es. 0,2 l · 0,4 l · 1 l): diventano le colonne del gruppo e nelle altre birre scrivi solo i prezzi.</p></div>
    <div><h4>Quando compare un evento?</h4><p>La locandina dal giorno scelto (di solito una settimana prima), nella striscia «In evidenza»; nei giorni dell'evento si apre a pagina piena con il menù speciale. Finito, sparisce da solo.</p></div>
    <div><h4>Meglio dal computer o dal telefono?</h4><p>Per le modifiche (vini nuovi, prezzi, ordine, eventi) il computer è più comodo; in sala il telefono basta per «Esaurito» e il piatto del giorno.</p></div>
    <div><h4>Perché non mi salva un vino?</h4><p>Per un vino italiano serve la regione (es. Toscana). Per un vino estero scrivi la nazione e la regione diventa facoltativa.</p></div>
    <div><h4>Devo cambiare tanti prezzi: c'è un modo veloce?</h4><p>Sì: «Tabella prezzi». Si cambiano tutti quelli che servono, anche in sezioni diverse, e si salva una volta sola.</p></div>
    <div><h4>Le statistiche registrano i clienti?</h4><p>No: niente nomi, telefoni o cookie. Si conta solo cosa succede (un'apertura, una ricerca), il giorno e l'ora.</p></div>
    <div><h4>Mi serve il menù su carta: come faccio?</h4><p>«Menù da stampare», poi «Stampa o salva in PDF». È sempre aggiornato a quel momento.</p></div>

    <div><h4>Dove trovo il numero di versione?</h4><p>In fondo a ogni pagina, ad esempio «v${VERSIONE}». Se segnali un problema, indicalo.</p></div>
  </div>
</section>`);

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Il menù digitale · L'Angolo del Vino</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style></head><body>${pages.join("\n")}</body></html>`;
writeFileSync(`${WORK}/pdf2.html`, html);
console.log("pdf2.html", pages.length, "pagine");