// Scrive .tmp-guida/video/video.html: la guida animata, verticale 1080×1920 (9:16).
// Ogni capitolo sta su un dispositivo (p = telefono, t = tablet, l = finestra del browser sul
// computer) e racconta una cosa con schermate vere (da video-shots.mjs): camera che si
// avvicina, dito o puntatore che tocca, riquadro evidenziato, etichetta e didascalia grande.
// Il motore delle animazioni è video-engine.js (window.render(t), deterministico).
//
// Come si modifica:
//  - testi e tempi: SCENES qui sotto (steps = schermata e didascalia a tempo; taps = tocchi;
//    notes = riquadri da evidenziare senza toccare; cam = [secondo, riquadro o [x, y], ingrandimento]);
//  - aspetto: gli stili CSS più sotto; animazioni: video-engine.js.
import { readFileSync, writeFileSync } from "node:fs";
import { WORK } from "./work.mjs";

const dir = `${WORK}/video`;
const data = JSON.parse(readFileSync(`${dir}/video-data.json`, "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const engine = readFileSync(new URL("./video-engine.js", import.meta.url), "utf8");

const INTRO = 7.5, OUTRO = 8.5;

// Dove sta la schermata nel video (px del video) e come si incornicia
const G = {
  p: { ox: 260, oy: 300, w: 560, h: 1120 },
  t: { ox: 140, oy: 290, w: 800, h: 1066 },
  l: { ox: 48, oy: 356, w: 984, h: 1056 },
};
const NAME = { p: "Da telefono", t: "Da tablet", l: "Da computer" };

// Camera «larga» di ogni dispositivo e movimenti tipici
const WIDE = { p: [195, 390, 1], t: [384, 512, 1], l: [550, 560, 1.2] };

const SCENES = [
  {
    dev: "l", kicker: "Le schede", title: "Tutto in quattro schede", dur: 15.2,
    steps: [
      { t: 0, shot: "l-tab-menu", cap: ["Menù", "Sezioni, voci, esauriti e «Oggi fuori menù»."] },
      { t: 4.55, shot: "l-tab-eventi", cap: ["Eventi e annunci", "Locandine, date, orari e il menù della serata."] },
      { t: 8.25, shot: "l-tab-orari", cap: ["Orari e contatti", "Copertina, orari, contatti, coperto e avvisi."] },
      { t: 11.95, shot: "l-tab-strumenti", cap: ["Strumenti", "Prezzi, ordine, storico, stampa, QR e guida."] },
    ],
    taps: [
      { t: 4.2, box: "l-tab-eventi", label: "Clicca «Eventi e annunci»" },
      { t: 7.9, box: "l-tab-orari", label: "Clicca «Orari e contatti»" },
      { t: 11.6, box: "l-tab-strumenti", label: "Clicca «Strumenti»" },
    ],
    notes: [{ t0: 1.9, t1: 3.6, box: "l-tab-menu", label: "Qui sei nella scheda «Menù»" }],
    cam: [
      [0, WIDE.l, 1.2], [1.1, WIDE.l, 1.2], [2, "l-tab-menu", 1.9], [3, "l-tab-menu", 1.9], [3.7, "l-tab-eventi", 1.9], [4.9, "l-tab-eventi", 1.9],
      [5.9, WIDE.l, 1.2], [6.3, WIDE.l, 1.2], [7.2, "l-tab-orari", 1.9], [8.5, "l-tab-orari", 1.9], [9.5, WIDE.l, 1.2], [9.9, WIDE.l, 1.2],
      [10.9, "l-tab-strumenti", 1.9], [12.2, "l-tab-strumenti", 1.9], [13.2, WIDE.l, 1.2], [15.2, WIDE.l, 1.2],
    ],
  },
  {
    dev: "p", kicker: "Aggiungere", title: "Aggiungi un vino", dur: 22,
    steps: [
      { t: 0, shot: "p-tab-menu", cap: ["Un solo pulsante", "«+ Aggiungi»: vino, piatto, evento o annuncio."] },
      { t: 3.95, shot: "p-add-choice", cap: ["Che cosa vuoi aggiungere?", "Scegli «Un vino»: la finestra ti guida passo passo."] },
      { t: 7.55, shot: "p-add-form", cap: ["In quale sezione?", "Per esempio «Rossi»."] },
      { t: 10.75, shot: "p-add-group", cap: ["E in quale gruppo?", "Per esempio «Italia»: così il vino va al suo posto in carta."] },
      { t: 13.55, shot: "p-add-fields", cap: ["Compila la scheda", "Azienda, annata, uvaggio, regione e prezzi di calice e bottiglia."] },
      { t: 16.6, shot: "p-add-filled", cap: ["Compila la scheda", "Azienda, annata, uvaggio, regione e prezzi di calice e bottiglia."] },
      { t: 19.1, shot: "p-add-save", cap: ["Poi «Aggiungi»", "Il vino compare subito sul menù dei clienti."] },
    ],
    taps: [
      { t: 3.6, box: "p-add-top", label: "Tocca «+ Aggiungi»" },
      { t: 7.2, box: "p-add-wine", label: "Tocca «Un vino»" },
      { t: 10.4, box: "p-add-section", label: "Tocca «Rossi»" },
      { t: 13.2, box: "p-add-group", label: "Tocca «Italia»" },
    ],
    notes: [{ t0: 19.5, t1: 21.6, box: "p-add-save", label: "Tocca «Aggiungi»" }],
    cam: [
      [0, WIDE.p, 1], [1.0, WIDE.p, 1], [2.2, [150, 192], 1.5], [4.3, [150, 192], 1.5],
      [5.2, "p-add-wine", 1.12], [8.2, "p-add-wine", 1.12], [8.9, "p-add-section", 1.12], [11.3, "p-add-section", 1.12],
      [11.9, "p-add-group", 1.12], [14.0, "p-add-group", 1.12],
      [15.2, [195, 330], 1.35], [18.0, [195, 520], 1.2], [19.2, "p-add-save", 1.5], [22, "p-add-save", 1.5],
    ],
  },
  {
    dev: "p", kicker: "Esauriti", title: "Esaurito in un tocco", dur: 10.5,
    steps: [
      { t: 0, shot: "p-list-rossi", cap: ["Il vino è finito?", "Tocca «Esaurito»: sul menù dei clienti il vino sparisce."] },
      { t: 4.65, shot: "p-list-rossi-esaurito", cap: ["Fatto, e si può annullare", "Toccato per sbaglio? Premi «Annulla» nell'avviso."] },
    ],
    taps: [{ t: 4.3, box: "p-sold", label: "Tocca «Esaurito»" }],
    cam: [[0, WIDE.p, 1], [1.0, WIDE.p, 1], [2.3, [195, 252], 1.15], [4.9, [195, 252], 1.15], [6, [195, 560], 1.25], [10.5, [195, 560], 1.25]],
  },
  {
    dev: "t", kicker: "Eventi", title: "Eventi e annunci", dur: 12,
    steps: [
      { t: 0, shot: "t-events-list", cap: ["Crea una serata", "Locandina, date, orario e il menù dell'evento."] },
      { t: 6.4, shot: "t-pub-evidenza", cap: ["I clienti la vedono subito", "In «In evidenza», sotto la copertina del menù."] },
    ],
    taps: [],
    notes: [
      { t0: 1.4, t1: 3.7, box: "t-new-event", label: "Qui crei una serata" },
      { t0: 3.9, t1: 6.0, box: "t-special-menu", label: "E qui il suo menù" },
    ],
    cam: [[0, WIDE.t, 1], [0.9, WIDE.t, 1], [1.5, "t-new-event", 1.5], [3.7, "t-new-event", 1.5], [4.4, "t-special-menu", 1.4], [6.0, "t-special-menu", 1.4], [7, [384, 260], 1.25], [12, [384, 330], 1.1]],
  },
  {
    dev: "l", kicker: "Ordine", title: "Decidi l'ordine", dur: 10.5,
    steps: [
      { t: 0, shot: "l-reorder-1", cap: ["Il primo viene prima", "Sul menù il primo evento sta più a sinistra."] },
      { t: 4.95, shot: "l-reorder-2", cap: ["Sposta con le frecce", "Poi «Salva ordine»: sul menù cambia subito."] },
    ],
    taps: [{ t: 4.6, box: "l-reorder-down", label: "Clicca la freccia giù" }],
    cam: [[0, [550, 590], 1.0], [1.0, [550, 590], 1.0], [2.0, [550, 580], 1.8], [3.6, "l-reorder-down", 2.0], [6.5, "l-reorder-down", 2.0], [7.6, [550, 580], 1.7], [10.5, [550, 580], 1.7]],
  },
  {
    dev: "t", kicker: "Storico", title: "Se sbagli, torni indietro", dur: 10.5,
    steps: [
      { t: 0, shot: "t-history", cap: ["Lo Storico ricorda tutto", "Ogni modifica, con chi l'ha fatta e quando."] },
      { t: 4.65, shot: "t-history-restored", cap: ["Un tocco e torna com'era", "«Ripristina»: la voce è di nuovo come prima."] },
    ],
    taps: [{ t: 4.3, box: "t-history-restore", label: "Tocca «Ripristina»" }],
    cam: [[0, WIDE.t, 1], [0.9, WIDE.t, 1], [1.8, [384, 500], 1.5], [3.4, "t-history-restore", 1.7], [5.2, "t-history-restore", 1.7], [6.2, [384, 500], 1.45], [10.5, [384, 500], 1.45]],
  },
  {
    dev: "l", kicker: "Strumenti", title: "Gli strumenti", dur: 16.5,
    steps: [
      { t: 0, shot: "l-strumenti", cap: ["Tutto quello che serve", "Prezzi, anteprima, QR da stampare."] },
      { t: 3.55, shot: "l-prices", cap: ["Tabella prezzi", "Cambi tanti prezzi insieme e salvi una volta sola."] },
      { t: 6.8, shot: "l-strumenti", cap: ["Tabella prezzi", "Cambi tanti prezzi insieme e salvi una volta sola."] },
      { t: 7.95, shot: "l-preview", cap: ["Anteprima", "Il menù come lo vede il cliente, anche in un giorno scelto."] },
      { t: 11.2, shot: "l-strumenti", cap: ["Anteprima", "Il menù come lo vede il cliente, anche in un giorno scelto."] },
      { t: 12.35, shot: "l-qr", cap: ["Codice QR", "Da stampare, in nero o bordeaux."] },
    ],
    taps: [
      { t: 3.2, box: "l-tool-prices", label: "Clicca «Tabella prezzi»" },
      { t: 7.6, box: "l-tool-preview", label: "Clicca «Anteprima»" },
      { t: 12.0, box: "l-tool-qr", label: "Clicca «Codice QR»" },
    ],
    cam: [
      [0, [550, 330], 1.5], [1.0, [550, 330], 1.5], [2.0, "l-tool-prices", 2.0], [3.7, "l-tool-prices", 2.0], [4.2, [550, 480], 1.4], [6.1, [550, 480], 1.4],
      [6.5, "l-tool-preview", 2.0], [8.1, "l-tool-preview", 2.0], [8.7, [550, 560], 1.5], [10.4, [550, 560], 1.5],
      [10.9, "l-tool-qr", 2.0], [12.5, "l-tool-qr", 2.0], [13.1, [550, 540], 1.7], [16.5, [550, 540], 1.7],
    ],
  },
];

// ---------- markup ----------
const shotsOf = (s) => [...new Set(s.steps.map((x) => x.shot))];
const img = (n) => `<img data-n="${n}" src="${data.shots[n]}">`;
const camHTML = (s) => `<div class="cam" style="width:${data.size[s.dev][0]}px;height:${data.size[s.dev][1]}px">${shotsOf(s).map(img).join("")}<div class="dim"></div><div class="ring"></div><div class="rip"></div><div class="rip"></div><div class="finger"></div><svg class="arrow" viewBox="0 0 22 32"><path d="M2 2 L2 25 L8 20 L12 30 L16.5 28 L12.5 18.5 L20 18.5 Z" fill="#161214" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`;
const devHTML = (s) => {
  const g = G[s.dev];
  const win = (extra) => `<div class="win" ${extra}>${camHTML(s)}</div>`;
  if (s.dev === "p") return `<div class="dev bz" style="left:242px;top:282px;width:596px;height:1156px;border-radius:92px"><i class="sb" style="left:-5px;top:230px;height:84px"></i><i class="sb" style="left:-5px;top:340px;height:84px"></i><i class="sb" style="right:-5px;top:300px;height:130px"></i>${win(`style="left:18px;top:18px;width:560px;height:1120px;border-radius:74px"`)}</div>`;
  if (s.dev === "t") return `<div class="dev bz" style="left:118px;top:268px;width:844px;height:1110px;border-radius:66px">${win(`style="left:22px;top:22px;width:800px;height:1066px;border-radius:46px"`)}</div>`;
  return `<div class="dev br" style="left:48px;top:300px;width:984px;height:1112px"><div class="bar"><u></u><u></u><u></u><span>orari-turni.vercel.app/gestione-menu</span></div>${win(`style="left:0;top:56px;width:984px;height:1056px"`)}</div>`;
};
const num = (i) => String(i + 1).padStart(2, "0");
const sceneHTML = (s, i) => {
  const caps = new Set(s.steps.map((x) => x.cap.join("|")));
  return `<div class="scene" id="s${i}">
  <div class="wm">${num(i)}</div>
  <div class="hd"><div class="kick">Capitolo ${i + 1} · ${s.kicker}</div><div class="badge">${NAME[s.dev]}</div><div class="ttl"><span>${s.title}</span></div></div>
  ${devHTML(s)}
  <div class="call"><span></span><i></i></div>
  <div class="cap"><div class="st"><b></b><span class="dots">${[...caps].map(() => "<i></i>").join("")}</span></div><div class="ct"></div><div class="cx"></div></div>
  <div class="foot"><img src="../jpg/logo.png"></div>
</div>`;
};

const css = `
@font-face{font-family:'Cormorant Garamond';font-weight:500;font-style:normal;src:url(../jpg/fonts/cormorant-garamond-latin-500-normal.woff2) format('woff2')}
@font-face{font-family:'Cormorant Garamond';font-weight:600;font-style:normal;src:url(../jpg/fonts/cormorant-garamond-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:'Cormorant Garamond';font-weight:500;font-style:italic;src:url(../jpg/fonts/cormorant-garamond-latin-500-italic.woff2) format('woff2')}
@font-face{font-family:'Cormorant Garamond';font-weight:400;font-style:italic;src:url(../jpg/fonts/cormorant-garamond-latin-400-italic.woff2) format('woff2')}
@font-face{font-family:'Jost';font-weight:400;src:url(../jpg/fonts/jost-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:'Jost';font-weight:500;src:url(../jpg/fonts/jost-latin-500-normal.woff2) format('woff2')}
@font-face{font-family:'Jost';font-weight:600;src:url(../jpg/fonts/jost-latin-600-normal.woff2) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:#240407}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden;color:#F4EEE3;font-family:'Jost',sans-serif;background:linear-gradient(180deg,#4d0b16 0%,#310710 50%,#1a0306 100%)}
#glow{position:absolute;left:-220px;top:180px;width:1520px;height:1200px;background:radial-gradient(ellipse at 50% 45%,rgba(170,36,58,.46),transparent 62%)}
#glow2{position:absolute;left:-100px;top:1250px;width:1280px;height:800px;background:radial-gradient(ellipse at 50% 60%,rgba(201,169,110,.13),transparent 65%)}
#grain{display:none}
#vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 48%,transparent 55%,rgba(8,1,3,.5) 100%);z-index:55;pointer-events:none}
.frame{position:absolute;inset:26px;border:1px solid rgba(201,169,110,.34);pointer-events:none;z-index:58}
.frame i{position:absolute;width:12px;height:12px;background:#C9A96E;transform:rotate(45deg)}
.frame i:nth-child(1){left:-7px;top:-7px}.frame i:nth-child(2){right:-7px;top:-7px}.frame i:nth-child(3){left:-7px;bottom:-7px}.frame i:nth-child(4){right:-7px;bottom:-7px}
.scene{position:absolute;inset:0;display:none}
#prog{position:absolute;left:72px;right:72px;top:62px;height:6px;display:flex;gap:8px;z-index:40}
#prog i{flex:1;background:rgba(244,238,227,.16);border-radius:3px;overflow:hidden}
#prog b{display:block;height:100%;width:0;background:linear-gradient(90deg,#B8955A,#E6C98A);border-radius:3px}
.wm{position:absolute;right:56px;top:40px;font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:400;font-size:420px;line-height:1;color:#C9A96E;opacity:0}
.hd{position:absolute;left:72px;right:72px;top:98px;z-index:5}
.kick{font-size:28px;letter-spacing:.3em;text-transform:uppercase;color:#C9A96E;font-weight:500}
.badge{position:absolute;right:0;top:-4px;font-size:23px;letter-spacing:.2em;text-transform:uppercase;color:rgba(244,238,227,.88);border:1.5px solid rgba(201,169,110,.6);border-radius:999px;padding:7px 22px 6px;background:rgba(0,0,0,.18)}
.ttl{margin-top:12px;overflow:hidden;height:122px;padding-top:4px}
.ttl span{display:inline-block;white-space:nowrap;font-family:'Cormorant Garamond',serif;font-weight:500;font-size:96px;line-height:1.1;color:#F7EFE0}
.dev{position:absolute;z-index:3}
.bz{background:linear-gradient(145deg,#4b4b50,#0c0c0d 45%,#2b2b30);box-shadow:0 50px 110px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.07) inset,0 0 0 1px #000}
.bz .sb{position:absolute;width:6px;border-radius:3px;background:#2c2c30}
.br{border-radius:30px;overflow:hidden;background:#EAE5DB;box-shadow:0 50px 110px rgba(0,0,0,.6),0 0 0 1.5px rgba(255,255,255,.14)}
.bar{position:absolute;left:0;right:0;top:0;height:56px;background:linear-gradient(180deg,#F1ECE2,#E3DDD1);border-bottom:1px solid rgba(0,0,0,.12);display:flex;align-items:center;padding:0 22px}
.bar u{width:16px;height:16px;border-radius:50%;margin-right:10px;background:#ED6A5E}.bar u:nth-child(2){background:#F4BF4F}.bar u:nth-child(3){background:#61C554}
.bar span{position:absolute;left:50%;transform:translateX(-50%);font-size:22px;color:#6c655a;background:rgba(255,255,255,.7);padding:5px 30px 4px;border-radius:999px;letter-spacing:.01em}
.win{position:absolute;overflow:hidden;background:#fff}
.cam{position:absolute;left:0;top:0;transform-origin:0 0}
.cam img{position:absolute;left:0;top:0;display:block;width:100%;height:100%;opacity:0}
.dim{position:absolute;opacity:0;z-index:3}
.ring{position:absolute;border-style:solid;border-color:#E2C48A;opacity:0;z-index:5}
.rip{position:absolute;border-radius:50%;border-style:solid;border-color:rgba(226,196,138,.95);opacity:0;z-index:6}
.finger{position:absolute;border-radius:50%;border-style:solid;border-color:rgba(255,255,255,.95);background:rgba(40,28,32,.42);box-shadow:0 0 0 3px rgba(0,0,0,.12);opacity:0;z-index:7}
.arrow{position:absolute;opacity:0;z-index:7;filter:drop-shadow(0 3px 5px rgba(0,0,0,.4))}
.call{position:absolute;display:none;z-index:30;font-weight:600;font-size:36px;letter-spacing:.01em;color:#3a0710;background:linear-gradient(180deg,#EBD197,#C9A96E);padding:17px 36px 16px;border-radius:999px;white-space:nowrap;box-shadow:0 16px 44px rgba(0,0,0,.5),0 0 0 3px rgba(255,255,255,.2)}
.call i{position:absolute;width:26px;height:26px;background:#C9A96E;transform:translateX(-50%) rotate(45deg);margin-left:0}
.call.up i{bottom:-11px;background:#C9A96E}.call.down i{top:-11px;background:#EBD197}
.cap{position:absolute;left:72px;right:72px;top:1470px;z-index:20}
.st{display:flex;align-items:center;gap:22px;font-size:24px;letter-spacing:.28em;text-transform:uppercase;color:#C9A96E;font-weight:500}
.dots i{display:inline-block;width:34px;height:5px;border-radius:3px;background:rgba(244,238,227,.22);margin-right:8px;vertical-align:middle}
.dots i.on{width:62px;background:#C9A96E}.dots i.done{background:rgba(201,169,110,.6)}
.ct{margin-top:16px;font-family:'Cormorant Garamond',serif;font-weight:600;font-size:82px;line-height:1.04;color:#F7EFE0}
.cx{margin-top:14px;font-size:42px;line-height:1.3;color:rgba(244,238,227,.9);max-width:936px}
.foot{position:absolute;left:0;right:0;top:1846px;text-align:center;z-index:5}
.foot img{width:150px;opacity:.5;filter:brightness(0) invert(.94) sepia(.18)}
.logo{position:absolute;filter:brightness(0) invert(.94) sepia(.18);opacity:0}
.rule{position:absolute;left:0;right:0;height:14px;display:flex;align-items:center;justify-content:center;gap:20px}
.rule i{display:block;height:1.5px;width:0;background:linear-gradient(90deg,transparent,#C9A96E)}
.rule i:last-child{background:linear-gradient(270deg,transparent,#C9A96E)}
.rule b{width:12px;height:12px;background:#C9A96E;transform:rotate(45deg);opacity:0}
.mask{position:absolute;left:0;right:0;text-align:center;overflow:hidden;height:134px;font-family:'Cormorant Garamond',serif;font-weight:500;color:#F7EFE0;line-height:1.1}
.mask span{display:inline-block;transform:translateY(118%)}
.ver{position:absolute;left:0;right:0;text-align:center;font-size:26px;letter-spacing:.34em;text-transform:uppercase;color:rgba(244,238,227,.62);opacity:0}
#intro .logo{left:280px;top:170px;width:520px}
#intro .mask{font-size:122px}
#intro .sub{position:absolute;left:0;right:0;top:748px;text-align:center;font-size:35px;letter-spacing:.05em;color:#C9A96E;opacity:0}
.idv{position:absolute;opacity:0}
.idv .scr{overflow:hidden;background:#fff;box-shadow:0 36px 80px rgba(0,0,0,.55)}
.idv .scr img{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}
#i-lap{left:84px;top:960px;width:912px}
#i-lap .scr{width:912px;height:580px;border:15px solid #19191b;border-radius:26px}
#i-lap .base{position:absolute;left:-46px;top:576px;width:1004px;height:22px;border-radius:0 0 22px 22px;background:linear-gradient(180deg,#a3a3a8,#5a5a5f);box-shadow:0 22px 40px rgba(0,0,0,.45)}
#i-tab{left:30px;top:1290px;width:372px}
#i-tab .scr{width:372px;height:490px;border:13px solid #161618;border-radius:38px}
#i-pho{left:802px;top:1240px;width:240px}
#i-pho .scr{width:240px;height:470px;border:11px solid #121214;border-radius:40px}
#intro .ver{top:1800px}
#outro .logo{left:300px;top:190px;width:480px}
#outro .mask{font-size:138px;top:440px}
.tip{position:absolute;left:96px;right:96px;display:flex;gap:34px;align-items:flex-start;opacity:0}
.tip .n{flex:none;width:92px;height:92px;border-radius:50%;border:2px solid #C9A96E;color:#C9A96E;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:56px;font-weight:500;background:rgba(0,0,0,.16)}
.tip .tt{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:66px;line-height:1.05;color:#F7EFE0}
.tip .tx{margin-top:10px;font-size:40px;line-height:1.3;color:rgba(244,238,227,.88)}
.tip b{color:#E2C48A;font-weight:500}
#outro .ver{top:1690px}
#outro .where{position:absolute;left:0;right:0;top:1770px;text-align:center;font-size:24px;letter-spacing:.3em;text-transform:uppercase;color:rgba(244,238,227,.4)}
`;

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="stage">
<div id="glow"></div><div id="glow2"></div>
<div class="frame"><i></i><i></i><i></i><i></i></div>
<div id="prog">${SCENES.map(() => "<i><b></b></i>").join("")}</div>
<div class="scene" id="intro">
  <img class="logo" src="../jpg/logo.png">
  <div class="rule" style="top:392px"><i></i><b></b><i></i></div>
  <div class="mask" style="top:450px"><span>Guida alla</span></div>
  <div class="mask" style="top:580px"><span>gestione del menù</span></div>
  <div class="sub">Funziona uguale da computer, tablet e telefono</div>
  <div class="idv" id="i-lap"><div class="scr"><img src="${data.shots["lw-tab-menu"]}"></div><div class="base"></div></div>
  <div class="idv" id="i-tab"><div class="scr"><img src="${data.shots["t-tab-menu"]}"></div></div>
  <div class="idv" id="i-pho"><div class="scr"><img src="${data.shots["p-tab-menu"]}"></div></div>
  <div class="ver">Versione ${pkg.version}</div>
</div>
${SCENES.map(sceneHTML).join("\n")}
<div class="scene" id="outro">
  <img class="logo" src="../jpg/logo.png">
  <div class="rule" style="top:402px"><i></i><b style="opacity:1"></b><i></i></div>
  <div class="mask" style="top:440px"><span>Ora tocca a te</span></div>
  <div class="tip" style="top:710px"><div class="n">1</div><div><div class="tt">Ti blocchi?</div><div class="tx">In <b>Strumenti</b> trovi <b>Guida (PDF)</b> e <b>Guida (video)</b>.</div></div></div>
  <div class="tip" style="top:1010px"><div class="n">2</div><div><div class="tt">Hai sbagliato?</div><div class="tx"><b>Storico</b> e poi <b>Ripristina</b>: la voce torna com'era.</div></div></div>
  <div class="tip" style="top:1310px"><div class="n">3</div><div><div class="tt">Vuoi controllare?</div><div class="tx">«<b>Vedi menù</b>» mostra subito quello che vedono i clienti.</div></div></div>
  <div class="ver">Versione ${pkg.version}</div>
  <div class="where">L'Angolo del Vino · Scandicci</div>
</div>
<div id="vig"></div><div id="grain"></div>
</div>
<script>
const CFG = ${JSON.stringify({ SCENES, G, SIZE: data.size, BOX: data.boxes, INTRO, OUTRO })};
${engine}
</script></body></html>`;
writeFileSync(`${dir}/video.html`, html);
const total = INTRO + SCENES.reduce((n, s) => n + s.dur, 0) + OUTRO;
console.log(`video.html pronto: ${total.toFixed(1)} secondi`);
