// Scrive .tmp-guida/video/video.html: la guida animata (720×1280, come il video di esempio).
// Ogni scena sta su un dispositivo (p = telefono, t = tablet, l = computer) e ha un elenco di
// schermate (da video-shots.mjs) con tocchi, zoom e didascalie a tempo. Sul computer, sotto lo
// schermo c'è una «lente» che ingrandisce la parte che si sta usando.
// Il tempo è deterministico: window.render(t) disegna il fotogramma al secondo t (video-render.mjs).
import { readFileSync, writeFileSync } from "node:fs";
import { WORK } from "./work.mjs";

const dir = `${WORK}/video`;
const data = JSON.parse(readFileSync(`${dir}/video-data.json`, "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

// steps: [{t, shot, cap:[titolo, testo]}] = cambio schermata e didascalia
// taps:  [{t, box}] = dito che tocca il riquadro `box` (video-data.json) al secondo t
// cam:   [{t, cx, cy, s}] o [{t, box, s}] = punto al centro e ingrandimento (sul computer: della lente)
const SCENES = [
  {
    dev: "l", kicker: "Le schede", title: "Tutto in quattro schede", dur: 13.6,
    steps: [
      { t: 0, shot: "l-tab-menu", cap: ["Menù", "Sezioni, voci, esauriti e «Oggi fuori menù»."] },
      { t: 3.7, shot: "l-tab-eventi", cap: ["Eventi e annunci", "Locandine, date, orari e il menù della serata."] },
      { t: 7.1, shot: "l-tab-orari", cap: ["Orari e contatti", "Copertina, orari, contatti, coperto e avvisi."] },
      { t: 10.5, shot: "l-tab-strumenti", cap: ["Strumenti", "Prezzi, ordine, storico, stampa, QR e guida."] },
    ],
    taps: [{ t: 3.55, box: "l-tab-eventi" }, { t: 6.95, box: "l-tab-orari" }, { t: 10.35, box: "l-tab-strumenti" }],
    cam: [{ t: 0, box: "l-tab-menu", s: 1.9 }, { t: 2.6, box: "l-tab-menu", s: 1.9 }, { t: 3.5, box: "l-tab-eventi", s: 1.9 }, { t: 6, box: "l-tab-eventi", s: 1.9 }, { t: 6.9, box: "l-tab-orari", s: 1.9 }, { t: 9.4, box: "l-tab-orari", s: 1.9 }, { t: 10.3, box: "l-tab-strumenti", s: 1.9 }],
  },
  {
    dev: "p", kicker: "Aggiungere", title: "Aggiungi un vino", dur: 11.6,
    steps: [
      { t: 0, shot: "p-tab-menu", cap: ["Un solo pulsante", "«+ Aggiungi»: vino, piatto, evento o annuncio."] },
      { t: 3.9, shot: "p-add-choice", cap: ["Che cosa vuoi aggiungere?", "Scegli il tipo: la finestra ti guida."] },
      { t: 7.5, shot: "p-add-form", cap: ["Scegli la sezione", "Poi compili la scheda del vino e salvi."] },
    ],
    taps: [{ t: 3.75, box: "p-add-top" }, { t: 7.35, box: "p-add-wine" }],
    cam: [{ t: 0, cx: 195, cy: 390, s: 1 }, { t: 1, cx: 190, cy: 192, s: 1.4 }, { t: 3.3, cx: 190, cy: 192, s: 1.4 }, { t: 4.3, cx: 195, cy: 390, s: 1 }],
  },
  {
    dev: "p", kicker: "Esauriti", title: "Esaurito in un tocco", dur: 10.4,
    steps: [
      { t: 0, shot: "p-list-rossi", cap: ["Il vino è finito?", "Tocca «Esaurito»: sul menù dei clienti il vino sparisce."] },
      { t: 4.4, shot: "p-list-rossi-esaurito", cap: ["Fatto, e si può annullare", "Toccato per sbaglio? Premi «Annulla» nell'avviso."] },
    ],
    taps: [{ t: 4.25, box: "p-sold" }],
    cam: [{ t: 0, cx: 195, cy: 390, s: 1 }, { t: 1, cx: 240, cy: 352, s: 1.25 }, { t: 3.7, cx: 240, cy: 352, s: 1.25 }, { t: 5.2, cx: 195, cy: 470, s: 1.12 }],
  },
  {
    dev: "t", kicker: "Eventi", title: "Eventi e annunci", dur: 11.4,
    steps: [
      { t: 0, shot: "t-events-list", cap: ["Crea una serata", "Locandina, date, orario e il menù dell'evento."] },
      { t: 5.6, shot: "t-pub-evidenza", cap: ["I clienti la vedono subito", "In «In evidenza», sotto la copertina del menù."] },
    ],
    taps: [],
    cam: [{ t: 0, cx: 384, cy: 512, s: 1 }],
  },
  {
    dev: "l", kicker: "Ordine", title: "Decidi l'ordine", dur: 10.8,
    steps: [
      { t: 0, shot: "l-reorder-1", cap: ["Il primo viene prima", "Sul menù il primo evento sta più a sinistra."] },
      { t: 4.8, shot: "l-reorder-2", cap: ["Sposta con le frecce", "Poi «Salva ordine»: sul menù cambia subito."] },
    ],
    taps: [{ t: 4.65, box: "l-reorder-down" }],
    cam: [{ t: 0, cx: 640, cy: 410, s: 2 }, { t: 1.2, cx: 640, cy: 410, s: 2 }, { t: 3.4, box: "l-reorder-down", s: 2.4 }, { t: 4.5, box: "l-reorder-down", s: 2.4 }, { t: 5.6, cx: 640, cy: 410, s: 2 }],
  },
  {
    dev: "t", kicker: "Storico", title: "Se sbagli, torni indietro", dur: 9.4,
    steps: [
      { t: 0, shot: "t-history", cap: ["Lo Storico ricorda tutto", "Ogni modifica, con chi l'ha fatta e quando."] },
      { t: 5.3, shot: "t-history", cap: ["Un tocco su «Ripristina»", "e la voce torna come prima."] },
    ],
    taps: [{ t: 5.15, box: "t-history-restore" }],
    cam: [{ t: 0, cx: 384, cy: 512, s: 1 }, { t: 1, cx: 384, cy: 520, s: 1.45 }, { t: 4.2, cx: 384, cy: 520, s: 1.45 }],
  },
  {
    dev: "l", kicker: "Strumenti", title: "Gli strumenti", dur: 15,
    steps: [
      { t: 0, shot: "l-strumenti", cap: ["Tutto quello che serve", "Prezzi, anteprima, QR da stampare."] },
      { t: 3.3, shot: "l-prices", cap: ["Tabella prezzi", "Cambi tanti prezzi insieme e salvi una volta sola."] },
      { t: 6.6, shot: "l-strumenti", cap: ["Tabella prezzi", "Cambi tanti prezzi insieme e salvi una volta sola."] },
      { t: 7.9, shot: "l-preview", cap: ["Anteprima", "Il menù come lo vede il cliente, anche in un giorno scelto."] },
      { t: 11, shot: "l-strumenti", cap: ["Anteprima", "Il menù come lo vede il cliente, anche in un giorno scelto."] },
      { t: 12.2, shot: "l-qr", cap: ["Codice QR", "Da stampare, in nero o bordeaux."] },
    ],
    taps: [{ t: 3.15, box: "l-tool-prices" }, { t: 7.75, box: "l-tool-preview" }, { t: 12.05, box: "l-tool-qr" }],
    cam: [
      { t: 0, cx: 640, cy: 300, s: 1.5 }, { t: 1.6, cx: 640, cy: 300, s: 1.5 }, { t: 2.5, box: "l-tool-prices", s: 2 }, { t: 3.2, box: "l-tool-prices", s: 2 },
      { t: 4.1, cx: 640, cy: 400, s: 1.5 }, { t: 6.2, cx: 640, cy: 400, s: 1.5 },
      { t: 7.1, box: "l-tool-preview", s: 2 }, { t: 7.8, box: "l-tool-preview", s: 2 },
      { t: 8.7, cx: 640, cy: 400, s: 1.5 }, { t: 10.8, cx: 640, cy: 400, s: 1.5 },
      { t: 11.5, box: "l-tool-qr", s: 2 }, { t: 12.1, box: "l-tool-qr", s: 2 },
      { t: 13, cx: 640, cy: 400, s: 1.5 },
    ],
  },
];
const INTRO = 5.4, OUTRO = 5.6;

// Dispositivi: dimensione della schermata fotografata, finestra nel video e cornice.
const DEV = {
  p: { name: "Da telefono", shot: [390, 780], views: [{ win: [400, 800], x: 160, y: 215, zoom: true }], frame: { x: 150, y: 205, pad: 10, r: 56, rin: 46 } },
  t: { name: "Da tablet", shot: [768, 1024], views: [{ win: [564, 752], x: 78, y: 236, zoom: true }], frame: { x: 64, y: 222, pad: 14, r: 40, rin: 28 } },
  l: { name: "Da computer", shot: [1280, 800], views: [{ win: [640, 400], x: 40, y: 236, zoom: false }, { win: [640, 330], x: 40, y: 745, zoom: true, lens: true }], frame: { x: 28, y: 224, pad: 12, r: 22, rin: 10, base: true } },
};

const imgs = (s) => [...new Set(s.steps.map((x) => x.shot))];
const view = (s, v) => `<div class="win${v.lens ? " lenswin" : ""}" style="left:${v.x}px;top:${v.y}px;width:${v.win[0]}px;height:${v.win[1]}px;border-radius:${v.lens ? 18 : DEV[s.dev].frame.rin}px"><div class="cam">${imgs(s).map((n) => `<img data-n="${n}" src="${data.shots[n]}">`).join("")}<div class="lensbox"></div><div class="ring"></div><div class="dot"></div><div class="pulse"></div></div></div>`;
const deviceHTML = (s) => {
  const d = DEV[s.dev], f = d.frame, main = d.views[0];
  const frame = `<div class="bezel" style="left:${f.x}px;top:${f.y}px;width:${main.win[0] + 2 * f.pad}px;height:${main.win[1] + 2 * f.pad}px;border-radius:${f.r}px"></div>${f.base ? `<div class="base" style="left:${f.x - 22}px;top:${f.y + main.win[1] + 2 * f.pad - 2}px;width:${main.win[0] + 2 * f.pad + 44}px"></div>` : ""}`;
  return frame + d.views.map((v) => view(s, v)).join("") + (d.views.length > 1 ? `<div class="lenslabel" style="left:40px;top:${d.views[0].y + d.views[0].win[1] + 44}px">Ingrandimento</div>` : "");
};

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:720px;height:1280px;overflow:hidden;background:#2a0509}
#stage{position:relative;width:720px;height:1280px;overflow:hidden;color:#F4EEE3;font-family:'Jost',sans-serif;
 background:radial-gradient(ellipse 90% 45% at 50% 38%,rgba(150,30,50,.38),transparent 70%),radial-gradient(ellipse 80% 30% at 50% 100%,rgba(201,169,110,.10),transparent 70%),linear-gradient(180deg,#4a0a14 0%,#2e060b 55%,#1b0306 100%)}
.frame{position:absolute;inset:14px;border:1px solid rgba(201,169,110,.38);pointer-events:none;z-index:50}
.frame i{position:absolute;width:9px;height:9px;background:#C9A96E;transform:rotate(45deg)}
.frame i:nth-child(1){left:-5px;top:-5px}.frame i:nth-child(2){right:-5px;top:-5px}.frame i:nth-child(3){left:-5px;bottom:-5px}.frame i:nth-child(4){right:-5px;bottom:-5px}
.scene{position:absolute;inset:0;display:none}
#bar{position:absolute;left:46px;right:46px;top:46px;height:4px;background:rgba(244,238,227,.16);border-radius:2px;z-index:40}
#bar b{display:block;height:100%;width:0;background:#C9A96E;border-radius:2px}
.kick{position:absolute;left:46px;right:46px;top:68px;display:flex;justify-content:space-between;font-size:19px;letter-spacing:.3em;text-transform:uppercase;color:#C9A96E;font-weight:500}
.ttl{position:absolute;left:46px;right:46px;top:98px;font-family:'Cormorant Garamond',serif;font-weight:500;font-size:56px;line-height:1.05;color:#F7EFE0;white-space:nowrap}
.chip{position:absolute;left:46px;top:166px;font-size:16px;letter-spacing:.22em;text-transform:uppercase;color:rgba(244,238,227,.82);border:1px solid rgba(201,169,110,.55);border-radius:999px;padding:4px 14px 3px}
.bezel{position:absolute;background:linear-gradient(145deg,#3a3a3d,#0d0d0e 55%,#232326);box-shadow:0 24px 60px rgba(0,0,0,.5),inset 0 0 0 1.5px rgba(255,255,255,.16)}
.base{position:absolute;height:14px;border-radius:0 0 18px 18px;background:linear-gradient(180deg,#9b9ba0,#5d5d62);box-shadow:0 14px 30px rgba(0,0,0,.45)}
.win{position:absolute;overflow:hidden;background:#fff}
.lenswin{border:2px solid #C9A96E;box-shadow:0 0 0 4px rgba(201,169,110,.18),0 18px 40px rgba(0,0,0,.45)}
.lenslabel{position:absolute;font-size:15px;letter-spacing:.26em;text-transform:uppercase;color:#C9A96E}
.cam{position:absolute;left:0;top:0;transform-origin:0 0}
.cam img{position:absolute;left:0;top:0;display:block}
.ring{position:absolute;border-style:solid;border-color:#C9A96E;opacity:0;z-index:5}
.dot{position:absolute;border-radius:50%;background:rgba(40,40,44,.38);border-style:solid;border-color:rgba(255,255,255,.92);opacity:0;z-index:6}
.pulse{position:absolute;border-radius:50%;border-style:solid;border-color:rgba(201,169,110,.95);opacity:0;z-index:6}
.lensbox{position:absolute;border-style:solid;border-color:#C9A96E;background:rgba(201,169,110,.12);z-index:4;display:none}
.capw{position:absolute;left:40px;right:40px;top:1086px}
.ct{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:46px;line-height:1.05;color:#F7EFE0}
.cx{margin-top:10px;font-size:27px;line-height:1.34;color:rgba(244,238,227,.78);font-weight:400;max-width:640px}
.mid{position:absolute;left:0;right:0;text-align:center}
#intro .logo{position:absolute;left:190px;top:120px;width:340px;filter:brightness(0) invert(.94) sepia(.18)}
#intro .t1{top:290px;font-family:'Cormorant Garamond',serif;font-weight:500;font-size:58px;color:#F7EFE0}
#intro .t2{top:372px;font-size:25px;color:#C9A96E;letter-spacing:.05em}
#intro .t3{top:1180px;font-size:19px;letter-spacing:.3em;text-transform:uppercase;color:rgba(244,238,227,.6)}
.idev{position:absolute;overflow:hidden;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.5);outline:8px solid #1a1a1c}
.idev img{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}
#intro .lap{left:80px;top:500px;width:560px;height:350px;border-radius:10px}
#intro .tab{left:34px;top:790px;width:250px;height:333px;border-radius:18px;outline-width:9px}
#intro .pho{left:470px;top:760px;width:170px;height:340px;border-radius:24px;outline-width:7px}
#outro .logo{position:absolute;left:170px;top:300px;width:380px;filter:brightness(0) invert(.94) sepia(.18)}
#outro .t1{top:560px;font-family:'Cormorant Garamond',serif;font-weight:500;font-size:72px;color:#F7EFE0}
#outro .t2{top:690px;font-size:29px;line-height:1.45;color:rgba(244,238,227,.85)}
#outro .t2 b{color:#C9A96E;font-weight:500}
#outro .t3{top:1130px;font-size:19px;letter-spacing:.3em;text-transform:uppercase;color:rgba(244,238,227,.6)}
</style></head><body><div id="stage">
<div class="frame"><i></i><i></i><i></i><i></i></div>
<div id="bar"><b></b></div>
<div class="scene" id="intro">
  <img class="logo" src="../jpg/logo.png">
  <div class="mid t1">Guida alla gestione del menù</div>
  <div class="mid t2">Funziona uguale da computer, tablet e telefono</div>
  <div class="idev lap" id="i-lap"><img src="${data.shots["l-tab-menu"]}"></div>
  <div class="idev tab" id="i-tab"><img src="${data.shots["t-tab-menu"]}"></div>
  <div class="idev pho" id="i-pho"><img src="${data.shots["p-tab-menu"]}"></div>
  <div class="mid t3">Versione ${pkg.version}</div>
</div>
${SCENES.map((s, i) => `<div class="scene" id="s${i}">
  <div class="kick"><span>${s.kicker}</span><span>${i + 1}/${SCENES.length}</span></div>
  <div class="ttl">${s.title}</div>
  <div class="chip">${DEV[s.dev].name}</div>
  ${deviceHTML(s)}
  <div class="capw"><div class="ct"></div><div class="cx"></div></div>
</div>`).join("\n")}
<div class="scene" id="outro">
  <img class="logo" src="../jpg/logo.png">
  <div class="mid t1">Ora tocca a te</div>
  <div class="mid t2">Se ti blocchi, apri <b>Strumenti</b><br>e tocca <b>Guida (PDF)</b>:<br>c'è tutto, passo per passo.</div>
  <div class="mid t3">Versione ${pkg.version}</div>
</div>
</div>
<script>
const SCENES = ${JSON.stringify(SCENES)};
const DEV = ${JSON.stringify(DEV)};
const SIZE = ${JSON.stringify(data.size)};
const BOX = ${JSON.stringify(data.boxes)};
const INTRO = ${INTRO}, OUTRO = ${OUTRO};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const starts = []; let acc = INTRO;
for (const s of SCENES) { starts.push(acc); acc += s.dur; }
window.TOTAL = acc + OUTRO;
const $ = (id) => document.getElementById(id);
const bar = document.querySelector("#bar b");
// i keyframe «box» diventano il centro del riquadro
for (const s of SCENES) for (const k of s.cam) if (k.box) { const b = BOX[k.box]; k.cx = b.x + b.w / 2; k.cy = b.y + b.h / 2; }
function camAt(kf, t) {
  let a = kf[0], b = kf[0];
  for (let i = 0; i < kf.length; i++) { if (kf[i].t <= t) { a = kf[i]; b = kf[Math.min(i + 1, kf.length - 1)]; } }
  const u = a === b ? 1 : ease((t - a.t) / (b.t - a.t));
  return { cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, s: a.s + (b.s - a.s) * u };
}
function show(el, op, dy = 0) { el.style.display = op > 0 ? "block" : "none"; el.style.opacity = op; el.style.transform = dy ? "translateY(" + dy + "px)" : ""; }
const px = (n) => n + "px";
window.render = (t) => {
  let prog = 0;
  // introduzione: i tre dispositivi arrivano uno dopo l'altro
  const intro = $("intro");
  show(intro, t < INTRO ? ease(t / 0.8) * (1 - ease((t - (INTRO - 0.5)) / 0.5)) : 0);
  intro.querySelector(".logo").style.transform = "scale(" + (0.94 + 0.06 * ease(t / 1.6)) + ")";
  [["i-lap", 0.7], ["i-tab", 1.5], ["i-pho", 2.2]].forEach(([id, at]) => {
    const e = ease((t - at) / 0.8);
    const el = $(id); el.style.opacity = e; el.style.transform = "translateY(" + (1 - e) * 40 + "px)";
  });
  SCENES.forEach((s, i) => {
    const el = $("s" + i), lt = t - starts[i];
    if (lt < 0 || lt > s.dur) { el.style.display = "none"; return; }
    const op = ease(lt / 0.5) * (1 - ease((lt - (s.dur - 0.4)) / 0.4));
    show(el, op, (1 - ease(lt / 0.6)) * 22);
    prog = (i + clamp(lt / s.dur)) / SCENES.length;
    // schermata corrente e precedente
    let idx = 0;
    s.steps.forEach((st, k) => { if (st.t <= lt) idx = k; });
    const cur = s.steps[idx], prev = s.steps[idx - 1], next = s.steps[idx + 1];
    const p = ease((lt - cur.t) / 0.4);
    const dev = DEV[s.dev], sh = SIZE[s.dev];
    const c = camAt(s.cam, lt);
    // tocco in corso
    let on = null;
    for (const tp of s.taps) if (lt > tp.t - 1.25 && lt < tp.t + 0.5) on = tp;
    el.querySelectorAll(".win").forEach((win, vi) => {
      const v = dev.views[vi];
      win.querySelectorAll("img").forEach((img) => {
        const n = img.dataset.n;
        let o = 0, z = 0;
        if (n === cur.shot) { o = prev && prev.shot !== cur.shot ? p : 1; z = 2; }
        else if (prev && n === prev.shot) { o = 1; z = 1; }
        img.style.opacity = o; img.style.zIndex = z;
        img.style.width = px(sh[0]); img.style.height = px(sh[1]);
      });
      const cam = win.querySelector(".cam");
      // vista fissa (schermo intero del computer) o vista che segue la camera
      const view = v.zoom ? c : { cx: sh[0] / 2, cy: sh[1] / 2, s: 1 };
      const K = v.win[0] / sh[0];
      let sc = K * view.s;
      const visW = v.win[0] / sc, visH = v.win[1] / sc;
      const cx = clamp(view.cx, visW / 2, sh[0] - visW / 2), cy = clamp(view.cy, visH / 2, sh[1] - visH / 2);
      const tx = v.zoom ? v.win[0] / 2 - cx * sc : (v.win[0] - sh[0] * sc) / 2, ty = v.zoom ? v.win[1] / 2 - cy * sc : (v.win[1] - sh[1] * sc) / 2;
      cam.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + sc + ")";
      cam.style.width = px(sh[0]); cam.style.height = px(sh[1]);
      const u = 1 / sc;  // 1 px del video, in px della schermata
      const ring = cam.querySelector(".ring"), dot = cam.querySelector(".dot"), pulse = cam.querySelector(".pulse"), lens = cam.querySelector(".lensbox");
      // riquadro della lente sullo schermo intero
      if (!v.zoom && dev.views.length > 1) {
        const lk = dev.views[1].win[0] / sh[0] * c.s;
        const lw = dev.views[1].win[0] / lk, lh = dev.views[1].win[1] / lk;
        const lx = clamp(c.cx, lw / 2, sh[0] - lw / 2) - lw / 2, ly = clamp(c.cy, lh / 2, sh[1] - lh / 2) - lh / 2;
        Object.assign(lens.style, { display: "block", left: px(lx), top: px(ly), width: px(lw), height: px(lh), borderWidth: px(2.5 * u), borderRadius: px(10 * u) });
      }
      if (on) {
        const b = BOX[on.box], d = lt - on.t;
        const a = ease((d + 1.25) / 0.45) * (1 - ease((d - 0.1) / 0.35));
        Object.assign(ring.style, { left: px(b.x - 5 * u), top: px(b.y - 5 * u), width: px(b.w + 10 * u), height: px(b.h + 10 * u), borderWidth: px(3 * u), borderRadius: px(14 * u), boxShadow: "0 0 0 " + px(3 * u) + " rgba(201,169,110,.28),0 0 " + px(22 * u) + " rgba(201,169,110,.7)", opacity: a });
        // il dito arriva dal basso a destra, preme, e lascia un'onda
        const arrive = ease((d + 1.0) / 0.9), press = d > -0.18 && d < 0.05 ? 0.82 : 1;
        const ds = 46 * u, dx = b.x + b.w / 2 + (1 - arrive) * 60 * u, dy = b.y + b.h / 2 + (1 - arrive) * 90 * u;
        Object.assign(dot.style, { left: px(dx), top: px(dy), width: px(ds), height: px(ds), borderWidth: px(2 * u), opacity: ease((d + 1.0) / 0.4) * (1 - ease((d - 0.15) / 0.3)), transform: "translate(-50%,-50%) scale(" + press + ")" });
        const w = clamp(d / 0.5);
        Object.assign(pulse.style, { left: px(b.x + b.w / 2), top: px(b.y + b.h / 2), width: px(ds), height: px(ds), borderWidth: px(3 * u), opacity: d > 0 ? 1 - w : 0, transform: "translate(-50%,-50%) scale(" + (1 + w * 2.4) + ")" });
      } else { ring.style.opacity = 0; dot.style.opacity = 0; pulse.style.opacity = 0; }
    });
    // didascalia
    const capEl = el.querySelector(".capw");
    const fin = ease((lt - cur.t) / 0.45), fout = next ? 1 - ease((lt - (next.t - 0.3)) / 0.3) : 1;
    const changed = !prev || prev.cap[0] !== cur.cap[0] || prev.cap[1] !== cur.cap[1];
    capEl.querySelector(".ct").textContent = cur.cap[0];
    capEl.querySelector(".cx").textContent = cur.cap[1];
    const sameNext = next && next.cap[0] === cur.cap[0] && next.cap[1] === cur.cap[1];
    capEl.style.opacity = (changed ? fin : 1) * (sameNext ? 1 : fout);
    capEl.style.transform = "translateY(" + ((changed ? 1 - fin : 0) * 14) + "px)";
  });
  // chiusura
  const outro = $("outro"), ot = t - acc;
  show(outro, ot > -0.4 ? ease((ot + 0.4) / 0.7) : 0);
  if (t > acc - 0.4) prog = 1;
  bar.style.width = (prog * 100) + "%";
  document.querySelector("#bar").style.opacity = t < INTRO - 0.3 ? 0 : 1;
};
window.render(0);
</script></body></html>`;
writeFileSync(`${dir}/video.html`, html);
const total = INTRO + SCENES.reduce((n, s) => n + s.dur, 0) + OUTRO;
console.log(`video.html pronto: ${total.toFixed(1)} secondi`);
