// ANGOLO_WIDGET · L'Angolo del Vino · widget per Scriptable.
// Questo file lo scaricano gli script «Angolo medio · In sala»… sul telefono (quelli con la chiave, creati
// dall'installatore), così i miglioramenti arrivano senza reinstallare nulla. Riceve SITO, CHIAVE e WIDGET.
// Quattro temi (notte, bordeaux, crema, nero); margini 14, spazi multipli di 4, un solo numero protagonista.

const VERSIONE = 1;

// ---------- Temi: la seconda parola del campo «Parameter» (es. «aperture crema»).
// testo = scritte principali, accento = titoletti, grafici e prezzi.
const TEMI = {
  notte: { fondo: ["#2E0B15", "#1A060B"], testo: "#F4EEE3", accento: "#D8B97A", verde: "#8FB59A", ambra: "#E2B04A", rosso: "#D46A55", rossoTesto: "#EE9A86", avatar: "#E2C48C", avatarTesto: "#2A0A12", qr: "#F4EEE3" },
  bordeaux: { fondo: ["#7A1428", "#4E0B19"], testo: "#F7EFE2", accento: "#EBCF95", verde: "#B5D6BD", ambra: "#F2C462", rosso: "#FF9C85", rossoTesto: "#FFC2B3", avatar: "#F4E2BC", avatarTesto: "#5A0F1F", qr: "#F7EFE2" },
  crema: { fondo: ["#FAF5EC", "#EFE5D3"], testo: "#4A0C18", accento: "#8B2440", verde: "#4E7C5C", ambra: "#B0790F", rosso: "#B53A2C", rossoTesto: "#A3322A", avatar: "#8B2440", avatarTesto: "#FAF5EC", qr: "#FFFFFF", chiaro: true },
  nero: { fondo: ["#1B1416", "#0B0809"], testo: "#F4EEE3", accento: "#D0607A", verde: "#8FB59A", ambra: "#E2B04A", rosso: "#E0705C", rossoTesto: "#F09A88", avatar: "#D0607A", avatarTesto: "#1B1416", qr: "#F4EEE3" },
  oliva: { fondo: ["#46512F", "#283019"], testo: "#F4EFE0", accento: "#E0C77E", verde: "#BFD8A0", ambra: "#EBC260", rosso: "#E8907A", rossoTesto: "#F4B6A2", avatar: "#E0C77E", avatarTesto: "#283019", qr: "#F4EFE0" },
  oro: { fondo: ["#EEDCAE", "#D9BC7C"], testo: "#3B1A0E", accento: "#7C1D30", verde: "#3D6A44", ambra: "#6B2E08", rosso: "#A0301F", rossoTesto: "#8E2A1D", avatar: "#7C1D30", avatarTesto: "#F3E4BE", qr: "#FFFFFF", chiaro: true },
  blu: { fondo: ["#17264A", "#0A1328"], testo: "#EEF1F8", accento: "#E6C47E", verde: "#93C6A4", ambra: "#EBBB5E", rosso: "#EC8170", rossoTesto: "#F5AA9A", avatar: "#E6C47E", avatarTesto: "#0A1328", qr: "#EEF1F8" },
  carta: { fondo: ["#FFFFFF", "#F1EFEA"], testo: "#17191E", accento: "#8B2440", verde: "#2E6B47", ambra: "#94650A", rosso: "#B23A2E", rossoTesto: "#A3322A", avatar: "#17191E", avatarTesto: "#FFFFFF", qr: "#FFFFFF", chiaro: true },
};
const PAROLE = String(args.widgetParameter || "").trim().toLowerCase().split(/[\s,]+/).filter(Boolean);

// I nomi restano quelli del primo disegno: «crema» = scritte principali, «oro» = accento.
// Il tema si sceglie dopo aver letto i dati: quello del campo «Parameter» vince, poi quello
// scelto nel sito («Colori dei widget»), poi «crema».
let C = null;
function colori(nome) {
  const T = TEMI[nome] || TEMI.crema;
  return {
    fondo1: new Color(T.fondo[0]),
    fondo2: new Color(T.fondo[1]),
    riquadro: new Color(T.testo, T.chiaro ? 0.05 : 0.06),
    crema: new Color(T.testo),
    crema2: new Color(T.testo, T.chiaro ? 0.72 : 0.66),
    crema3: new Color(T.testo, T.chiaro ? 0.52 : 0.44),
    linea: new Color(T.testo, T.chiaro ? 0.12 : 0.1),
    oro: new Color(T.accento),
    oroFondo: new Color(T.accento, T.chiaro ? 0.1 : 0.17),
    oroArea: new Color(T.accento, T.chiaro ? 0.14 : 0.2),
    oroBordo: new Color(T.accento, 0.65),
    verde: new Color(T.verde),
    ambra: new Color(T.ambra),
    rosso: new Color(T.rosso),
    rossoTesto: new Color(T.rossoTesto),
    rossoFondo: new Color(T.rosso, T.chiaro ? 0.12 : 0.18),
    neutroFondo: new Color(T.testo, T.chiaro ? 0.07 : 0.09),
    avatar: new Color(T.avatar),
    avatarTesto: new Color(T.avatarTesto),
    qr: new Color(T.qr),
  };
}
const F = {
  numero: (s) => Font.boldRoundedSystemFont(s),
  titoletto: () => Font.semiboldSystemFont(10),
  testo: (s) => Font.regularSystemFont(s),
  medio: (s) => Font.mediumSystemFont(s),
  forte: (s) => Font.semiboldSystemFont(s),
  // Nomi di vini e piatti: con le grazie, come sul menù.
  serif: (s) => new Font("Baskerville", s),
  serifCorsivo: (s) => new Font("Baskerville-Italic", s),
  serifForte: (s) => new Font("Baskerville-SemiBold", s),
};
const PAD = 14;

// Misure dei widget (punti) secondo la larghezza dello schermo: Apple le fissa per modello.
function misure(fam) {
  const sw = Device.screenSize().width;
  const t =
    Device.isPad() ? { small: [155, 155], medium: [342, 155], large: [342, 342], extraLarge: [715, 342] }
    : sw >= 428 ? { small: [170, 170], medium: [364, 170], large: [364, 382] }
    : sw >= 414 ? { small: [169, 169], medium: [360, 169], large: [360, 379] }
    : sw >= 390 ? { small: [158, 158], medium: [338, 158], large: [338, 354] }
    : sw >= 375 ? { small: [148, 148], medium: [321, 148], large: [321, 324] }
    : { small: [141, 141], medium: [292, 141], large: [292, 311] };
  const [W, H] = t[fam] || t.large || [338, 354];
  const pad = fam === "large" || fam === "extraLarge" ? PAD + 2 : PAD;
  return { W, H, pad, CW: W - pad * 2, CH: H - pad * 2 };
}

// ---------- Dati: dal sito, oppure l'ultima copia salvata se manca la rete
async function caricaDati(nome) {
  const fm = FileManager.local();
  const file = fm.joinPath(fm.documentsDirectory(), `angolo-${nome}.json`);
  try {
    const r = new Request(`${SITO}/api/widget/${nome}`);
    r.headers = { Authorization: `Bearer ${CHIAVE}`, "X-Device-Name": Device.name() };
    r.timeoutInterval = 12;
    const json = await r.loadJSON();
    const stato = r.response ? r.response.statusCode : 200;
    if (stato === 200 && json && !json.errore) {
      fm.writeString(file, JSON.stringify(json));
      return { dati: json, vecchi: false };
    }
    if (json && json.errore) return { errore: json.messaggio || "Errore", codice: json.errore };
  } catch (e) {}
  if (fm.fileExists(file)) return { dati: JSON.parse(fm.readString(file)), vecchi: true };
  return { errore: "Nessuna connessione. Riprova tra poco.", codice: "rete" };
}

// Immagini del sito (QR): scaricate una volta e tenute sul telefono.
async function caricaImmagine(nome) {
  const fm = FileManager.local();
  const file = fm.joinPath(fm.documentsDirectory(), `angolo-${nome.replace(/\//g, "-")}`);
  if (fm.fileExists(file)) return fm.readImage(file);
  const img = await new Request(`${SITO}/widget/${nome}`).loadImage();
  fm.writeImage(file, img);
  return img;
}

async function scegliAnteprima() {
  const a = new Alert();
  a.title = "Anteprima del widget";
  a.message = `Widget «${param}»: scegli la grandezza da vedere.`;
  const scelte = [["Piccolo", "small"], ["Medio", "medium"], ["Grande", "large"]];
  for (const [t] of scelte) a.addAction(t);
  a.addCancelAction("Chiudi");
  const i = await a.presentSheet();
  return i < 0 ? "medium" : scelte[i][1];
}

async function mostra(w, fam) {
  if (fam === "small") await w.presentSmall();
  else if (fam === "large") await w.presentLarge();
  else await w.presentMedium();
}

// ---------- Mattoni comuni
// La grandezza del widget che si sta disegnando: serve a intestazione() per sapere quanto spazio c'è.
let FAMIGLIA = null;
function nuovoWidget(fam) {
  FAMIGLIA = fam;
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.fondo1, C.fondo2];
  g.locations = [0, 1];
  g.startPoint = new Point(0.15, 0);
  g.endPoint = new Point(0.85, 1);
  w.backgroundGradient = g;
  const p = fam === "large" || fam === "extraLarge" ? PAD + 2 : PAD;
  w.setPadding(p, p, p, p);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60_000);
  return w;
}

function testo(stack, t, font, colore, righe = 1) {
  const x = stack.addText(String(t));
  x.font = font;
  x.textColor = colore;
  x.lineLimit = righe;
  return x;
}

function riga(stack) {
  const s = stack.addStack();
  s.layoutHorizontally();
  s.centerAlignContent();
  return s;
}

function colonna(stack) {
  const s = stack.addStack();
  s.layoutVertically();
  return s;
}

// Titoletto in oro a sinistra, ora dell'aggiornamento a destra.
function intestazione(stack, titolo, d, vecchi) {
  const r = riga(stack);
  r.centerAlignContent();
  if (titolo === "L'Angolo del Vino" && LOGO) logo(r, 18);
  else {
    // Su tutti i widget il logo piccolo accanto al nome del widget, alto come la scritta.
    // Nei piccoli il logo prende il posto del nome (che lì si capisce dal contenuto).
    if (LOGO && FAMIGLIA === "small") logo(r, 13);
    else {
      if (LOGO) {
        logo(r, 13);
        r.addSpacer(7);
      }
      testo(r, titolo.toUpperCase(), F.titoletto(), C.oro).minimumScaleFactor = 0.8;
    }
  }
  r.addSpacer();
  r.addSpacer(6);
  scrittaAggiornato(r, d, vecchi, FAMIGLIA === "medium" || FAMIGLIA === "large" || FAMIGLIA === "extraLarge");
  return r;
}

// Il logo alto `h` punti (largo in proporzione), allineato a sinistra.
function logo(stack, h) {
  const img = stack.addImage(LOGO);
  img.imageSize = new Size(Math.round((h * LOGO.size.width) / LOGO.size.height), h);
  return img;
}

// Piccola, nella riga del titolo (mai sopra i riquadri): a che ora sono i dati e ogni quanto cambiano.
// iPhone decide da solo quando aggiornare i widget: si chiede ogni 15 minuti, di solito arriva entro la mezz'ora.
function scrittaAggiornato(stack, d, vecchi, largo) {
  const t = vecchi ? `non aggiornato · ${d.aggiornato}` : largo ? `aggiornato ${d.aggiornato} · ogni 30 min circa` : d.aggiornato;
  const x = testo(stack, t, Font.regularSystemFont(largo ? 8 : 9), vecchi ? C.rossoTesto : C.crema3);
  x.minimumScaleFactor = 0.7;
  x.rightAlignText();
  return x;
}

// Pillola con la variazione: oro se sale, mattone se scende, neutra se uguale.
function pillola(stack, pct, suffisso = "") {
  const s = stack.addStack();
  s.setPadding(2, 5, 2, 5);
  s.cornerRadius = 8;
  let t;
  let colore;
  if (pct === null || pct === undefined) {
    s.backgroundColor = C.neutroFondo;
    t = "—";
    colore = C.crema2;
  } else if (pct > 0) {
    s.backgroundColor = C.oroFondo;
    t = `▲ ${pct}%`;
    colore = C.oro;
  } else if (pct < 0) {
    s.backgroundColor = C.rossoFondo;
    t = `▼ ${Math.abs(pct)}%`;
    colore = C.rossoTesto;
  } else {
    s.backgroundColor = C.neutroFondo;
    t = "=";
    colore = C.crema2;
  }
  testo(s, t + suffisso, F.forte(9.5), colore);
  return s;
}

// Pillola oro con un testo (es. «tra 26 ore»).
function etichetta(stack, t) {
  const s = stack.addStack();
  s.setPadding(2, 7, 2, 7);
  s.cornerRadius = 8;
  s.backgroundColor = C.oroFondo;
  testo(s, t, F.forte(10), C.oro);
  return s;
}

function lineaOrizzontale(stack) {
  const s = stack.addStack();
  s.size = new Size(0, 1);
  s.backgroundColor = C.linea;
  s.addSpacer();
  return s;
}

function lineaVerticale(stack, altezza) {
  const s = stack.addStack();
  s.size = new Size(1, altezza);
  s.backgroundColor = C.linea;
  return s;
}

// I link al menù dei clienti segnano il telefono come «del personale» (?personale=1): chi apre il menù
// dal widget è il personale, non un cliente, e non deve contare nelle statistiche.
function link(path) {
  if (/^\/menu(\/|\?|#|$)/.test(path)) {
    const [via, ancora] = path.split("#");
    return `${SITO}${via}${via.includes("?") ? "&" : "?"}personale=1${ancora ? `#${ancora}` : ""}`;
  }
  return `${SITO}${path}`;
}

// Mini grafico: linea oro con area sfumata; facoltativa la linea tratteggiata di confronto.
function grafico(valori, w, h, opz = {}) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const tutti = valori.concat(opz.confronto || []);
  const max = Math.max(1, ...tutti) * 1.1;
  const n = opz.punti || valori.length;
  const x = (i) => 3 + (i * (w - 6)) / Math.max(1, n - 1);
  const y = (v) => h - 3 - (v / max) * (h - 8);
  if (opz.griglia) {
    ctx.setFillColor(C.linea);
    for (const f of [0.33, 0.66]) ctx.fillRect(new Rect(0, Math.round(h * f), w, 1));
  }
  if (opz.confronto) {
    ctx.setFillColor(C.crema3);
    for (let i = 0; i < opz.confronto.length - 1; i++) {
      const x1 = x(i), y1 = y(opz.confronto[i]), x2 = x(i + 1), y2 = y(opz.confronto[i + 1]);
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let t = 0; t < len; t += 7) {
        const a = t / len, b = Math.min(1, (t + 3.5) / len);
        const p = new Path();
        p.move(new Point(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a));
        p.addLine(new Point(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b));
        ctx.addPath(p);
        ctx.setStrokeColor(C.crema3);
        ctx.setLineWidth(1.5);
        ctx.strokePath();
      }
    }
  }
  if (valori.length > 1) {
    const area = new Path();
    area.move(new Point(x(0), h));
    valori.forEach((v, i) => area.addLine(new Point(x(i), y(v))));
    area.addLine(new Point(x(valori.length - 1), h));
    area.closeSubpath();
    ctx.addPath(area);
    ctx.setFillColor(C.oroArea);
    ctx.fillPath();
    const linea = new Path();
    valori.forEach((v, i) => (i ? linea.addLine(new Point(x(i), y(v))) : linea.move(new Point(x(i), y(v)))));
    ctx.addPath(linea);
    ctx.setStrokeColor(C.oro);
    ctx.setLineWidth(opz.spessore || 2);
    ctx.strokePath();
  }
  const ultimo = valori.length - 1;
  if (ultimo >= 0) {
    const r = opz.punto || 3.5;
    ctx.setFillColor(C.oro);
    ctx.fillEllipse(new Rect(x(ultimo) - r - 1.5, y(valori[ultimo]) - r - 1.5, (r + 1.5) * 2, (r + 1.5) * 2));
    ctx.setFillColor(C.crema);
    ctx.fillEllipse(new Rect(x(ultimo) - r + 0.5, y(valori[ultimo]) - r + 0.5, (r - 0.5) * 2, (r - 0.5) * 2));
  }
  return ctx.getImage();
}

function barra(frazione, w, h = 4) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const tondo = (r, colore) => {
    const p = new Path();
    p.addRoundedRect(r, h / 2, h / 2);
    ctx.addPath(p);
    ctx.setFillColor(colore);
    ctx.fillPath();
  };
  tondo(new Rect(0, 0, w, h), C.neutroFondo);
  const f = Math.max(0, Math.min(1, frazione));
  if (f > 0) tondo(new Rect(0, 0, Math.max(h, w * f), h), C.oro);
  return ctx.getImage();
}

function anello(frazione, lato, spessore, colore, fondo) {
  const ctx = new DrawContext();
  ctx.size = new Size(lato, lato);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const c = lato / 2, r = c - spessore / 2 - 1;
  const segmenti = 90;
  const disegna = (da, a, col) => {
    for (let i = Math.floor(da * segmenti); i < Math.ceil(a * segmenti); i++) {
      const t = (i / segmenti) * Math.PI * 2 - Math.PI / 2;
      ctx.setFillColor(col);
      ctx.fillEllipse(new Rect(c + Math.cos(t) * r - spessore / 2, c + Math.sin(t) * r - spessore / 2, spessore, spessore));
    }
  };
  disegna(0, 1, fondo);
  disegna(0, Math.max(0, Math.min(1, frazione)), colore);
  return ctx.getImage();
}

// «Giulia, Marco e Sara»; da quattro in su «Giulia, Marco e altri 2».
function nomi(persone) {
  const n = persone.map((p) => p.nome);
  if (n.length <= 1) return n.join("");
  if (n.length <= 3) return `${n.slice(0, -1).join(", ")} e ${n.at(-1)}`;
  return `${n.slice(0, 2).join(", ")} e altri ${n.length - 2}`;
}

// ---------- Messaggi (errori, formato sbagliato)
function accessorio() {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  return w;
}

function messaggio(fam, titolo, testoMsg, colore = C.oro) {
  const w = nuovoWidget(fam);
  if (fam && fam.startsWith("accessory")) {
    const a = accessorio();
    testo(a, testoMsg, F.forte(11), Color.white(), fam === "accessoryInline" ? 1 : 3);
    return a;
  }
  w.addSpacer();
  const t = testo(w, titolo.toUpperCase(), F.titoletto(), colore);
  t.centerAlignText();
  w.addSpacer(8);
  const m = testo(w, testoMsg, F.testo(fam === "small" ? 12 : 13), C.crema2, 5);
  m.centerAlignText();
  w.addSpacer();
  return w;
}

const NOMI_FORMATO = { small: "piccolo", medium: "medio", large: "grande", extraLarge: "extra grande" };
const FORMATI = {
  aperture: ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"],
  riepilogo: ["medium", "large", "extraLarge"],
  settimana: ["medium", "large", "extraLarge"],
  oggi: ["small", "medium", "large", "extraLarge"],
  dafare: ["small", "medium"],
  menu: ["medium", "large", "extraLarge"],
  fuorimenu: ["medium", "large", "extraLarge"],
  qr: ["small", "large"],
  turni: ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"],
  pannello: ["large"],
  apri: ["small"],
  sala: ["medium"],
  mattina: ["medium"],
  stasera: ["medium"],
  andamento: ["large"],
  clienti: ["medium"],
};

function disegna(nome, fam, risposta) {
  if (!FORMATI[nome]) return messaggio(fam, "Parameter", `Parola «${nome}» sconosciuta. Controlla il campo «Parameter» del widget.`);
  if (risposta.errore) return messaggio(fam, risposta.codice === "rete" ? "Senza rete" : "Angolo del Vino", risposta.errore, risposta.codice === "tolto" ? C.rossoTesto : C.oro);
  if (!FORMATI[nome].includes(fam)) {
    const adatti = FORMATI[nome].filter((f) => NOMI_FORMATO[f]).map((f) => NOMI_FORMATO[f]);
    // Dice cosa fare: scegliere uno script della grandezza giusta per questo riquadro.
    const qui = fam && fam.startsWith("accessory") ? "blocco" : NOMI_FORMATO[fam] === "extra grande" ? "grande" : NOMI_FORMATO[fam];
    // Nel piccolo il testo deve stare in poche righe: solo cosa scegliere.
    const testoPiccolo = `Tienilo premuto, «Modifica widget» e in «Script» scegli un «Angolo\u00A0${qui}…».`;
    return messaggio(fam, fam === "small" ? "Non va qui" : "Grandezza sbagliata", fam === "small" ? testoPiccolo : `Questo è per il widget ${(Device.isPad() ? adatti : adatti.filter((a) => a !== "extra grande")).join(" o ")}. ${testoPiccolo}`);
  }
  const d = risposta.dati;
  const v = risposta.vecchi;
  const w =
    nome === "aperture" ? wAperture(fam, d, v)
    : nome === "riepilogo" ? wRiepilogo(fam, d, v)
    : nome === "settimana" ? wSettimana(fam, d, v)
    : nome === "oggi" ? wOggi(fam, d, v)
    : nome === "dafare" ? wDaFare(fam, d, v)
    : nome === "menu" ? wMenu(fam, d, v)
    : nome === "fuorimenu" ? wFuoriMenu(fam, d, v)
    : nome === "qr" ? wQr(fam, d)
    : nome === "pannello" ? wPannello(fam, d, v)
    : nome === "apri" ? wApri(fam, d)
    : nome === "sala" ? wSala(fam, d, v)
    : nome === "mattina" ? wMattina(fam, d, v)
    : nome === "stasera" ? wStasera(fam, d, v)
    : nome === "andamento" ? wAndamento(fam, d, v)
    : nome === "clienti" ? wClienti(fam, d, v)
    : wTurni(fam, d, v);
  if (!w.url && d.link) w.url = link(d.link);
  return w;
}

// ---------- Aperture di oggi
function wAperture(fam, d, v) {
  const giornoBreve = d.giornoSettimana.slice(0, 3);
  if (fam === "accessoryInline") {
    const w = accessorio();
    testo(w, `Menù oggi ${d.oggi}${d.deltaSettimanaScorsa !== null ? ` · ${d.deltaSettimanaScorsa >= 0 ? "▲" : "▼"}${Math.abs(d.deltaSettimanaScorsa)}%` : ""}`, F.forte(12), Color.white());
    return w;
  }
  if (fam === "accessoryCircular") {
    const w = accessorio();
    const s = w.addStack();
    s.size = new Size(60, 60);
    s.backgroundImage = anello(d.media ? d.oggi / d.media : 0, 60, 5, Color.white(), new Color("#FFFFFF", 0.25));
    s.layoutVertically();
    s.centerAlignContent();
    s.addSpacer();
    const r1 = riga(s); r1.addSpacer(); testo(r1, d.oggi, F.numero(19), Color.white()); r1.addSpacer();
    const r2 = riga(s); r2.addSpacer(); testo(r2, "MENÙ", F.forte(8), new Color("#FFFFFF", 0.75)); r2.addSpacer();
    s.addSpacer();
    return w;
  }
  if (fam === "accessoryRectangular") {
    const w = accessorio();
    testo(w, "MENÙ OGGI", F.forte(11), new Color("#FFFFFF", 0.75));
    const r = riga(w);
    testo(r, d.oggi, F.numero(24), Color.white());
    r.addSpacer(6);
    testo(r, "aperture", F.medio(12), new Color("#FFFFFF", 0.75));
    if (d.deltaSettimanaScorsa !== null) testo(w, `${d.deltaSettimanaScorsa >= 0 ? "▲" : "▼"} ${Math.abs(d.deltaSettimanaScorsa)}% su ${giornoBreve} scorso`, F.medio(11), new Color("#FFFFFF", 0.75));
    return w;
  }
  const w = nuovoWidget(fam);
  if (fam === "small") {
    intestazione(w, "Oggi", d, v);
    w.addSpacer(4);
    testo(w, d.oggi, F.numero(50), C.crema);
    testo(w, "aperture del menù", F.testo(11), C.crema2);
    w.addSpacer();
    for (const [lab, val, pct] of [["ieri", d.ieri, d.deltaIeri], [`${giornoBreve} scorso`, d.settimanaScorsa, d.deltaSettimanaScorsa]]) {
      const r = riga(w);
      testo(r, lab, F.testo(10), C.crema2);
      r.addSpacer(3);
      testo(r, val, F.forte(10), C.crema);
      r.addSpacer();
      pillola(r, pct);
      w.addSpacer(4);
    }
    return w;
  }
  // medio
  intestazione(w, "Aperture di oggi", d, v);
  w.addSpacer(misure(fam).H < 155 ? 4 : 8);
  const corpo = riga(w);
  corpo.topAlignContent();
  const sx = colonna(corpo);
  testo(sx, d.oggi, F.numero(misure(fam).H < 155 ? 46 : 54), C.crema);
  testo(sx, `${d.giorno.split(" ").slice(0, 2).join(" ").toLowerCase()} · menù aperto`, F.testo(11), C.crema2);
  corpo.addSpacer();
  lineaVerticale(corpo, misure(fam).H < 155 ? 64 : 72);
  corpo.addSpacer(12);
  const dx = colonna(corpo);
  dx.size = new Size(128, 0);
  const basso = misure(fam).H < 155;
  const voce = (lab, val, pct, url) => {
    const b = colonna(dx);
    b.url = link(url);
    testo(b, lab, F.testo(10), C.crema2);
    if (!basso) b.addSpacer(2);
    const r = riga(b);
    testo(r, val, F.numero(basso ? 17 : 20), C.crema);
    r.addSpacer();
    pillola(r, pct);
  };
  voce("Ieri", d.ieri, d.deltaIeri, d.linkIeri);
  dx.addSpacer(basso ? 4 : 6);
  lineaOrizzontale(dx);
  dx.addSpacer(basso ? 4 : 6);
  voce(`${d.giornoSettimana.charAt(0).toUpperCase()}${d.giornoSettimana.slice(1)} scorso`, d.settimanaScorsa, d.deltaSettimanaScorsa, d.linkSettimanaScorsa);
  w.addSpacer();
  if (d.media) {
    const { CW } = misure(fam);
    const img = w.addImage(barra(d.oggi / d.media, CW));
    img.imageSize = new Size(CW, 4);
    w.addSpacer(4);
    const r = riga(w);
    testo(r, `${Math.round((d.oggi / d.media) * 100)}% di un ${d.giornoSettimana} medio`, F.testo(9), C.crema3);
    r.addSpacer();
    testo(r, "confronti alla stessa ora", F.testo(9), C.crema3);
  }
  return w;
}

// ---------- Statistiche della settimana
function wSettimana(fam, d, v) {
  const w = nuovoWidget(fam);
  const { CW } = misure(fam);
  const grande = fam !== "medium";
  intestazione(w, grande ? "Menù · questa settimana" : "Menù · settimana", d, v);
  w.addSpacer(grande ? 8 : 6);
  if (!grande) {
    const corpo = riga(w);
    corpo.bottomAlignContent();
    const sx = colonna(corpo);
    sx.size = new Size(92, 0);
    testo(sx, d.totale, F.numero(40), C.crema);
    testo(sx, "da lunedì", F.testo(11), C.crema2);
    sx.addSpacer(6);
    pillola(sx, d.delta);
    corpo.addSpacer(8);
    const dx = colonna(corpo);
    const gw = CW - 100;
    const img = dx.addImage(grafico(d.questa, gw, 80, { confronto: d.scorsa, punti: 7, griglia: true }));
    img.imageSize = new Size(gw, 80);
    dx.addSpacer(2);
    giorniSotto(dx, d, gw);
    return w;
  }
  const top = riga(w);
  top.bottomAlignContent();
  const sx = colonna(top);
  testo(sx, d.totale, F.numero(48), C.crema);
  testo(sx, "aperture da lunedì", F.testo(12), C.crema2);
  top.addSpacer();
  const dx = colonna(top);
  pillola(dx, d.delta, " sulla scorsa");
  dx.addSpacer(4);
  testo(dx, `stesso punto: ${d.stessoPunto}`, F.testo(10), C.crema3);
  w.addSpacer(12);
  const leg = riga(w);
  const tratto = (colore) => {
    const t = leg.addStack();
    t.size = new Size(12, 2);
    t.backgroundColor = colore;
    leg.addSpacer(5);
  };
  tratto(C.oro);
  testo(leg, "questa", F.testo(10), C.crema2);
  leg.addSpacer(12);
  tratto(C.crema3);
  testo(leg, "scorsa", F.testo(10), C.crema2);
  leg.addSpacer();
  if (d.piccoScorsa) testo(leg, `picco ${d.piccoScorsa}`, F.testo(10), C.crema3);
  w.addSpacer(6);
  const { CH } = misure(fam);
  const h = Math.max(80, Math.min(150, CH - 196));
  const img = w.addImage(grafico(d.questa, CW, h, { confronto: d.scorsa, punti: 7, griglia: true, spessore: 2.4, punto: 4 }));
  img.imageSize = new Size(CW, h);
  w.addSpacer(2);
  giorniSotto(w, d, CW);
  w.addSpacer();
  lineaOrizzontale(w);
  w.addSpacer(8);
  const fondo = riga(w);
  fondo.topAlignContent();
  const cella = (lab, val, serif, url) => {
    const c = colonna(fondo);
    c.size = new Size(Math.floor((CW - 16) / 3), 0);
    if (url) c.url = link(url);
    testo(c, lab, F.testo(10), C.crema2);
    c.addSpacer(2);
    // Nomi lunghi («Henriot · Brut Souverain»): su due righe invece di tagliarli.
    testo(c, val || "—", serif ? F.serifCorsivo(15) : F.numero(16), C.crema, serif ? 2 : 1);
  };
  cella("Ora di punta", d.oraDiPunta, false, d.link);
  fondo.addSpacer(8);
  cella("Più cercato", d.piuCercato, true, d.linkCercati);
  fondo.addSpacer(8);
  cella("Più guardato", d.piuGuardato, true, d.linkGuardati);
  return w;
}

function giorniSotto(stack, d, larghezza) {
  // Una lettera sotto ogni punto del grafico (i punti vanno da 3 a larghezza − 3).
  const r = riga(stack);
  r.size = new Size(larghezza, 12);
  const passo = (larghezza - 6) / 6;
  d.giorni.forEach((g, i) => {
    const c = r.addStack();
    c.size = new Size(i === 0 || i === 6 ? passo / 2 + 3 : passo, 12);
    if (i === 6) c.addSpacer();
    else if (i > 0) c.addSpacer();
    testo(c, g, i === d.oggiIndice ? F.forte(9) : F.testo(9), i === d.oggiIndice ? C.oro : C.crema3);
    if (i < 6 && i > 0) c.addSpacer();
    if (i === 0) c.addSpacer();
  });
}

// ---------- Riepilogo
function wRiepilogo(fam, d, v) {
  const w = nuovoWidget(fam);
  const { CW } = misure(fam);
  const giornoBreve = d.giornoSettimana.slice(0, 3);
  intestazione(w, fam === "medium" ? "Riepilogo" : `Riepilogo · ${d.giorno.toLowerCase()}`, d, v);
  w.addSpacer(fam === "medium" ? 8 : 10);
  const scheda = (stack, larghezza, lab, val, unita, sotto, url) => {
    const c = colonna(stack);
    c.size = new Size(larghezza, 0);
    c.backgroundColor = C.riquadro;
    c.cornerRadius = 14;
    c.setPadding(10, 10, 10, 10);
    if (url) c.url = link(url);
    testo(c, lab, F.testo(10), C.crema2);
    c.addSpacer(4);
    const r = riga(c);
    r.bottomAlignContent();
    testo(r, val, F.numero(fam === "medium" ? 26 : 32), C.crema);
    if (unita) {
      r.addSpacer(3);
      testo(r, unita, F.medio(12), C.crema2);
    }
    r.addSpacer();
    c.addSpacer(6);
    sotto(c);
    return c;
  };
  if (fam === "medium") {
    const lw = Math.floor((CW - 16) / 3);
    const r = riga(w);
    r.topAlignContent();
    scheda(r, lw, "Menù oggi", d.oggi, null, (c) => pillola(c, d.deltaOggi, ` ${giornoBreve}`), d.link);
    r.addSpacer(8);
    scheda(r, lw, "Settimana", d.settimana, null, (c) => pillola(c, d.deltaSettimana), d.link);
    r.addSpacer(8);
    scheda(r, lw, "In turno", d.oreSettimana, "h", (c) => testo(c, "questa settimana", F.testo(9), C.crema3), d.linkOre);
    w.addSpacer();
    return w;
  }
  const lw = Math.floor((CW - 10) / 2);
  const r1 = riga(w);
  r1.topAlignContent();
  scheda(r1, lw, "Menù aperto oggi", d.oggi, null, (c) => pillola(c, d.deltaOggi, ` vs ${giornoBreve}`), d.link);
  r1.addSpacer(10);
  scheda(r1, lw, "Questa settimana", d.settimana, null, (c) => pillola(c, d.deltaSettimana), d.link);
  w.addSpacer(10);
  const r2 = riga(w);
  r2.topAlignContent();
  scheda(r2, lw, "Ore in turno", d.oreSettimana, "h", (c) => testo(c, "questa settimana", F.testo(9), C.crema3), d.linkOre);
  r2.addSpacer(10);
  if (d.evento) {
    scheda(r2, lw, "Prossimo evento", d.evento.oggi ? "Oggi" : d.evento.giorni, d.evento.oggi ? null : d.evento.giorni === 1 ? "giorno" : "giorni", (c) => testo(c, d.evento.titolo, F.serifCorsivo(14), C.crema), d.evento.link);
  } else {
    scheda(r2, lw, "Prossimo evento", "—", null, (c) => testo(c, "nessuno in programma", F.testo(9), C.crema3), "/gestione-menu");
  }
  w.addSpacer();
  lineaOrizzontale(w);
  w.addSpacer(8);
  const leg = riga(w);
  testo(leg, "Aperture · ultimi 14 giorni", F.testo(10), C.crema2);
  leg.addSpacer();
  testo(leg, `oggi ${d.oggi}`, F.forte(10), C.oro);
  w.addSpacer(4);
  const img = w.addImage(grafico(d.ultimi14, CW, 40));
  img.imageSize = new Size(CW, 40);
  return w;
}

// ---------- Oggi al locale
function wOggi(fam, d, v) {
  const w = nuovoWidget(fam);
  const { CW } = misure(fam);
  intestazione(w, "Oggi al locale", d, v);
  w.addSpacer(fam === "small" ? 8 : 10);
  const stato = (stack) => {
    const r = riga(stack);
    const pal = r.addStack();
    pal.size = new Size(8, 8);
    pal.cornerRadius = 4;
    pal.backgroundColor = d.chiusoOggi || !d.aperto ? C.rosso : C.verde;
    r.addSpacer(6);
    testo(r, d.chiusoOggi ? "Chiuso oggi" : d.aperto ? "Aperto" : "Chiuso", F.forte(12), C.crema);
  };
  const orario = (d.stato.match(/(\d{2}:\d{2})/) || [])[1] || null;
  const quando = d.aperto ? "chiude alle" : d.chiusoOggi ? d.chiusoOggi : (d.stato.split("riapre ")[1] || "").replace(/ alle \d{2}:\d{2}/, "");
  const grandeOra = d.chiusoOggi ? "—" : orario || "—";
  const persone = [...(d.mattina ? d.mattina.persone : []), ...(d.sera ? d.sera.persone : [])];
  if (fam === "small") {
    stato(w);
    w.addSpacer(misure(fam).H < 155 ? 2 : 6);
    testo(w, grandeOra, F.numero(misure(fam).H < 155 ? 30 : 36), C.crema);
    testo(w, d.aperto ? "chiude alle" : d.chiusoOggi ? d.chiusoOggi : `riapre ${quando}`, F.testo(11), C.crema2);
    w.addSpacer();
    if (d.evento) testo(w, d.evento.titolo, F.serifCorsivo(13), C.oro, 2);
    else testo(w, persone.length ? `${persone.length} al lavoro oggi` : "nessuno in turno", F.testo(11), C.crema2);
    return w;
  }
  const corpo = riga(w);
  corpo.topAlignContent();
  const sx = colonna(corpo);
  sx.size = new Size(fam === "medium" ? 108 : 118, 0);
  stato(sx);
  sx.addSpacer(8);
  testo(sx, grandeOra, F.numero(32), C.crema);
  sx.addSpacer(2);
  testo(sx, d.aperto ? "chiude alle" : d.chiusoOggi ? d.chiusoOggi : `riapre ${quando}`, F.testo(11), C.crema2, 2);
  corpo.addSpacer(10);
  lineaVerticale(corpo, fam === "medium" ? 92 : 104);
  corpo.addSpacer(12);
  const dx = colonna(corpo);
  dx.size = new Size(CW - (fam === "medium" ? 108 : 118) - 23, 0);
  const fascia = (lab, f) => {
    const t = riga(dx);
    testo(t, lab.toUpperCase(), F.titoletto(), C.crema2);
    t.addSpacer();
    testo(t, f ? f.orario : "", F.testo(10), C.crema2);
    dx.addSpacer(5);
    if (!f) {
      testo(dx, "nessuno", F.testo(11), C.crema3);
      return;
    }
    const r = riga(dx);
    testo(r, nomi(f.persone), F.medio(11), C.crema, 1);
    r.addSpacer();
  };
  fascia("Mattina", d.mattina);
  dx.addSpacer(8);
  lineaOrizzontale(dx);
  dx.addSpacer(8);
  fascia("Sera", d.sera);
  if (fam === "medium") {
    w.addSpacer();
    return w;
  }
  // Grande: chi lavora, per nome, e l'evento della sera in fondo.
  w.addSpacer();
  lineaOrizzontale(w);
  w.addSpacer(10);
  testo(w, "AL LAVORO OGGI", F.titoletto(), C.crema2);
  w.addSpacer(6);
  if (persone.length) {
    const visti = new Set();
    const elenco = persone.filter((p) => !visti.has(p.nome) && visti.add(p.nome));
    for (let i = 0; i < Math.min(elenco.length, 6); i += 2) {
      const r = riga(w);
      elenco.slice(i, i + 2).forEach((p, j) => {
        const c = riga(r);
        c.size = new Size(Math.floor((CW - 8) / 2), 0);
        testo(c, p.nome, F.medio(12), C.crema);
        c.addSpacer();
        if (j === 0) r.addSpacer(8);
      });
      w.addSpacer(6);
    }
  } else testo(w, d.chiusoOggi ? "Locale chiuso" : "Nessuno in turno", F.testo(12), C.crema3);
  w.addSpacer();
  if (d.evento) {
    lineaOrizzontale(w);
    w.addSpacer(10);
    const r = riga(w);
    r.url = link(d.evento.link);
    testo(r, "STASERA", F.titoletto(), C.crema2);
    r.addSpacer(8);
    testo(r, d.evento.titolo, F.serifCorsivo(16), C.crema);
    r.addSpacer();
    if (d.evento.ora) testo(r, `dalle ${d.evento.ora}`, F.testo(11), C.crema2);
  }
  return w;
}

// ---------- Da fare
function wDaFare(fam, d, v) {
  const w = nuovoWidget(fam);
  const { CW } = misure(fam);
  intestazione(w, "Da fare", d, v);
  w.addSpacer(fam === "small" ? 10 : 12);
  if (d.tuttoAPosto) {
    w.addSpacer();
    const r = riga(w);
    r.addSpacer();
    testo(r, "✓", F.numero(fam === "small" ? 26 : 30), C.oro);
    r.addSpacer(8);
    testo(r, "Tutto a posto", F.forte(fam === "small" ? 13 : 15), C.crema);
    r.addSpacer();
    w.addSpacer();
    return w;
  }
  const colori = { rosso: C.rosso, ambra: C.ambra, verde: C.verde };
  const voce = (stack, x, larghezza) => {
    const r = riga(stack);
    if (larghezza) r.size = new Size(larghezza, 0);
    r.url = link(x.link);
    const pal = r.addStack();
    pal.size = new Size(8, 8);
    pal.cornerRadius = 4;
    pal.backgroundColor = colori[x.livello];
    r.addSpacer(8);
    testo(r, x.n, F.numero(fam === "small" ? 15 : 22), x.n ? C.crema : C.crema3);
    r.addSpacer(fam === "small" ? 6 : 8);
    testo(r, fam === "small" ? x.breve : x.testo, F.testo(fam === "small" ? 12 : 11), x.n ? C.crema2 : C.crema3, fam === "small" ? 1 : 2);
    r.addSpacer();
  };
  if (fam === "small") {
    d.righe.forEach((x, i) => {
      voce(w, x);
      if (i < d.righe.length - 1) w.addSpacer();
    });
    return w;
  }
  const lw = Math.floor((CW - 12) / 2);
  for (let i = 0; i < 4; i += 2) {
    const r = riga(w);
    voce(r, d.righe[i], lw);
    r.addSpacer(12);
    voce(r, d.righe[i + 1], lw);
    if (i === 0) w.addSpacer();
  }
  w.addSpacer();
  return w;
}

// ---------- Anteprima menù e Oggi fuori menù
// Una voce: nome con le grazie a sinistra, prezzo in oro allineato a destra.
// «ampia» (formati grandi con poche voci): caratteri più grandi e dettaglio sotto.
function voceMenu(stack, x, grande, ampia = false) {
  const r = riga(stack);
  r.url = link(x.link);
  r.topAlignContent();
  const c = colonna(r);
  testo(c, x.nome, F.serifForte(ampia ? 20 : grande ? 17 : 15), C.crema);
  if (grande && x.dettaglio) {
    c.addSpacer(2);
    testo(c, x.dettaglio, F.testo(ampia ? 12 : 10), C.crema3, ampia ? 2 : 1);
  }
  r.addSpacer();
  if (x.prezzo) {
    const p = colonna(r);
    p.addSpacer(ampia ? 4 : 2);
    testo(p, x.prezzo, F.numero(ampia ? 16 : grande ? 14 : 13), C.oro);
  }
}

function wMenu(fam, d, v) {
  const w = nuovoWidget(fam);
  const grande = fam !== "medium";
  intestazione(w, grande ? "Anteprima menù" : "Menù di oggi", d, v);
  w.addSpacer(grande ? 10 : 8);
  const oggi = [...d.piatti, ...d.vini];
  if (grande) testo(w, "OGGI FUORI MENÙ", F.titoletto(), C.crema2);
  if (grande) w.addSpacer(6);
  if (oggi.length) {
    oggi.slice(0, grande ? 3 : 2).forEach((x, i) => {
      if (i) w.addSpacer(grande ? 6 : 4);
      voceMenu(w, x, grande);
    });
  } else {
    testo(w, "Oggi niente fuori menù", F.serifCorsivo(15), C.crema3);
  }
  if (!grande) {
    w.addSpacer();
    const r = riga(w);
    if (d.evento) {
      r.url = link(d.evento.link);
      testo(r, d.evento.oggi ? "STASERA" : "PROSSIMO", F.titoletto(), C.crema2);
      r.addSpacer(8);
      testo(r, d.evento.titolo, F.serifCorsivo(14), C.crema);
      r.addSpacer();
      testo(r, d.evento.quando, F.testo(10), C.crema2);
    } else if (d.consigli.length) {
      testo(r, "CONSIGLI", F.titoletto(), C.crema2);
      r.addSpacer(8);
      testo(r, d.consigli.map((x) => x.nome).join(" · "), F.serifCorsivo(13), C.crema);
    }
    return w;
  }
  w.addSpacer(10);
  lineaOrizzontale(w);
  w.addSpacer(10);
  testo(w, "I CONSIGLI DELLA CASA", F.titoletto(), C.oro);
  w.addSpacer(6);
  for (let i = 0; i < d.consigli.length; i += 2) {
    const r = riga(w);
    d.consigli.slice(i, i + 2).forEach((x, j) => {
      const c = colonna(r);
      c.url = link(x.link);
      c.size = new Size(Math.floor((misure(fam).CW - 8) / 2), 0);
      testo(c, x.nome, F.serifCorsivo(15), C.crema);
      if (j === 0) r.addSpacer(8);
    });
    w.addSpacer(4);
  }
  if (!d.consigli.length) testo(w, "nessuno", F.testo(11), C.crema3);
  w.addSpacer();
  lineaOrizzontale(w);
  w.addSpacer(10);
  const r = riga(w);
  r.topAlignContent();
  const es = colonna(r);
  testo(es, "ESAURITI OGGI", F.titoletto(), C.crema2);
  es.addSpacer(4);
  testo(es, d.esauriti.length ? d.esauriti.join(" · ") : "nessuno", F.testo(11), C.crema3, 2);
  r.addSpacer(12);
  if (d.vetrina.length) {
    const vt = colonna(r);
    const t = testo(vt, "IN VETRINA", F.titoletto(), C.oro);
    t.rightAlignText();
    vt.addSpacer(4);
    const x = testo(vt, d.vetrina.join(" · "), F.serifCorsivo(13), C.crema, 2);
    x.rightAlignText();
  }
  if (d.evento) {
    w.addSpacer(12);
    eventoGrande(w, d.evento);
  }
  return w;
}

function wFuoriMenu(fam, d, v) {
  const w = nuovoWidget(fam);
  const grande = fam !== "medium";
  intestazione(w, "Oggi fuori menù", d, v);
  w.addSpacer(grande ? 12 : 8);
  const oggi = [...d.piatti, ...d.vini];
  if (oggi.length) {
    const ampia = grande && oggi.length <= 2;
    oggi.slice(0, grande ? 5 : 2).forEach((x, i) => {
      if (i) w.addSpacer(grande ? (ampia ? 14 : 10) : 4);
      voceMenu(w, x, grande, ampia);
    });
  } else testo(w, "Oggi niente fuori menù", F.serifCorsivo(15), C.crema3);
  w.addSpacer();
  if (grande && d.evento) {
    lineaOrizzontale(w);
    w.addSpacer(12);
    eventoGrande(w, d.evento);
    w.addSpacer();
  }
  lineaOrizzontale(w);
  w.addSpacer(8);
  if (!grande && d.evento) {
    const r = riga(w);
    r.url = link(d.evento.link);
    testo(r, d.evento.oggi ? "STASERA" : "PROSSIMO", F.titoletto(), C.crema2);
    r.addSpacer(8);
    testo(r, d.evento.titolo, F.serifCorsivo(14), C.crema);
    r.addSpacer();
    testo(r, d.evento.quando, F.testo(10), C.crema2);
    w.addSpacer(4);
  }
  testo(w, d.esauriti.length ? `Esauriti: ${d.esauriti.join(", ")}` : "Nessun esaurito", F.testo(10), C.crema3, grande ? 2 : 1);
  return w;
}

// Evento con la data in un riquadro oro (formati grandi).
function eventoGrande(stack, e) {
  const r = riga(stack);
  r.url = link(e.link);
  const data = r.addStack();
  data.layoutVertically();
  data.size = new Size(44, 44);
  data.cornerRadius = 11;
  data.backgroundColor = C.oroFondo;
  data.centerAlignContent();
  data.addSpacer();
  const n = riga(data); n.addSpacer(); testo(n, e.giorno, F.numero(17), C.oro); n.addSpacer();
  const m = riga(data); m.addSpacer(); testo(m, e.mese, F.forte(8), C.crema2); m.addSpacer();
  data.addSpacer();
  r.addSpacer(12);
  const t = colonna(r);
  testo(t, e.oggi ? "STASERA" : "PROSSIMO EVENTO", F.titoletto(), C.crema2);
  t.addSpacer(3);
  testo(t, e.titolo, F.serifCorsivo(17), C.crema);
  if (e.ora || !e.oggi) {
    t.addSpacer(2);
    testo(t, e.oggi ? `dalle ${e.ora}` : e.quando, F.testo(10), C.crema2);
  }
}

// ---------- QR del menù (immagine dal sito, salvata sul telefono)
function wQr(fam, d) {
  const w = nuovoWidget(fam);
  const { CH } = misure(fam);
  w.url = link(d.link);
  // Il QR occupa tutto lo spazio che resta sotto la scritta.
  const scritta = (fam === "small" ? 17 : 26) + (LOGO ? (fam === "small" ? 17 : 32) : 0);
  const lato = Math.floor(CH - scritta - 16 - (fam === "small" ? 8 : 14));
  w.addSpacer();
  const r = riga(w);
  r.addSpacer();
  const box = r.addStack();
  box.backgroundColor = C.qr;
  box.cornerRadius = fam === "small" ? 12 : 20;
  box.setPadding(8, 8, 8, 8);
  box.borderColor = C.oroBordo;
  box.borderWidth = 1.5;
  const img = box.addImage(QR);
  img.imageSize = new Size(lato, lato);
  r.addSpacer();
  w.addSpacer(fam === "small" ? 6 : 14);
  const t = riga(w);
  t.addSpacer();
  testo(t, "Inquadra per il menù", F.serifCorsivo(fam === "small" ? 13 : 20), C.crema);
  t.addSpacer();
  // Sotto, il logo: chi guarda il telefono capisce subito di che menù si tratta.
  if (LOGO) {
    w.addSpacer(fam === "small" ? 3 : 6);
    const l = riga(w);
    l.addSpacer();
    logo(l, fam === "small" ? 14 : 20);
    l.addSpacer();
  }
  w.addSpacer();
  return w;
}

// ---------- I miei prossimi orari
function wTurni(fam, d, v) {
  const p = d.prossimo;
  if (fam === "accessoryInline") {
    const w = accessorio();
    // «Turno · oggi 18:00», «Turno · domani 18:00», «Turno · lun 3 nov 18:00» (mai «Dom» per «domani»).
    const giorno = p ? (p.quando === "Oggi" || p.quando === "Domani" ? p.quando.toLowerCase() : p.giorno.toLowerCase()) : "";
    testo(w, p ? `Turno · ${giorno} ${p.inizio}` : "Nessun turno in vista", F.forte(12), Color.white());
    return w;
  }
  if (fam === "accessoryRectangular") {
    const w = accessorio();
    testo(w, p ? `TURNO ${p.quando.toUpperCase()}` : "TURNI", F.forte(11), new Color("#FFFFFF", 0.75));
    testo(w, p ? `${p.inizio}–${p.fine}` : "nessuno in vista", F.numero(p ? 20 : 15), Color.white());
    if (p) testo(w, p.tra, F.medio(11), new Color("#FFFFFF", 0.75));
    return w;
  }
  if (fam === "accessoryCircular") {
    const w = accessorio();
    const s = w.addStack();
    s.layoutVertically();
    s.size = new Size(60, 60);
    s.cornerRadius = 30;
    s.backgroundColor = new Color("#FFFFFF", 0.16);
    s.addSpacer();
    const etichetta = p ? (p.quando === "Oggi" ? "OGGI" : p.quando === "Domani" ? "DOMANI" : p.giorno.split(" ")[0].toUpperCase()) : "—";
    const a = riga(s); a.addSpacer(); testo(a, etichetta, F.forte(8), new Color("#FFFFFF", 0.8)); a.addSpacer();
    const b = riga(s); b.addSpacer(); testo(b, p ? p.inizio : "", F.numero(15), Color.white()); b.addSpacer();
    s.addSpacer();
    return w;
  }
  const w = nuovoWidget(fam);
  intestazione(w, fam === "small" ? "Turno" : "I miei turni", d, v);
  w.addSpacer(fam === "small" ? 8 : 10);
  if (fam === "small") {
    if (!p) {
      w.addSpacer();
      testo(w, "Nessun turno", F.forte(14), C.crema);
      w.addSpacer(4);
      testo(w, "confermato nei prossimi giorni", F.testo(11), C.crema2, 2);
      w.addSpacer();
      return w;
    }
    testo(w, `${p.quando} · ${p.giorno.split(" ").slice(1).join(" ")}`, F.testo(12), C.crema2);
    w.addSpacer(2);
    testo(w, p.inizio, F.numero(36), C.crema);
    testo(w, `fino alle ${p.fine}`, F.medio(13), C.crema2);
    w.addSpacer();
    etichetta(w, p.tra);
    return w;
  }
  const corpo = riga(w);
  corpo.topAlignContent();
  const sx = colonna(corpo);
  sx.size = new Size(100, 0);
  if (p) {
    testo(sx, p.quando, F.testo(11), C.crema2);
    sx.addSpacer(2);
    testo(sx, p.inizio, F.numero(32), C.crema);
    sx.addSpacer(2);
    testo(sx, `→ ${p.fine} · ${String(p.ore).replace(".", ",")} h`, F.testo(11), C.crema2);
    sx.addSpacer(6);
    testo(sx, p.tra, F.forte(10), C.oro);
  } else {
    testo(sx, "Nessun turno confermato in vista", F.testo(12), C.crema2, 3);
  }
  corpo.addSpacer(10);
  const dx = colonna(corpo);
  const g = riga(dx);
  const cella = Math.max(22, Math.floor((misure(fam).CW - 110 - 18) / 7));
  d.settimana.forEach((x, i) => {
    if (i) g.addSpacer(3);
    const c = g.addStack();
    c.layoutVertically();
    c.size = new Size(cella, 64);
    c.cornerRadius = 9;
    c.backgroundColor = x.prossimo ? C.oroFondo : C.riquadro;
    if (x.prossimo) {
      c.borderColor = C.oroBordo;
      c.borderWidth = 1;
    }
    c.setPadding(5, 0, 5, 0);
    const centro = (t, f, col) => {
      const r = riga(c);
      r.addSpacer();
      testo(r, t, f, col);
      r.addSpacer();
    };
    centro(x.lettera, F.testo(9), C.crema3);
    c.addSpacer(2);
    centro(x.numero, F.numero(13), x.oggi ? C.oro : C.crema);
    c.addSpacer(4);
    const pal = riga(c);
    pal.addSpacer();
    const dot = pal.addStack();
    dot.size = new Size(6, 6);
    dot.cornerRadius = 3;
    if (x.lavoro) dot.backgroundColor = C.oro;
    else {
      dot.borderColor = C.crema3;
      dot.borderWidth = 1;
    }
    pal.addSpacer();
    c.addSpacer(3);
    centro(x.lavoro ? x.testo.split("–")[0] : "–", F.testo(8), x.lavoro ? C.crema2 : C.crema3);
  });
  dx.addSpacer(6);
  const nota = riga(dx);
  nota.addSpacer();
  testo(nota, "solo orari confermati", F.testo(9), C.crema3);
  return w;
}


// =====================================================================================
// Widget dei momenti della giornata. Regole: margini 14 (16 nei grandi), spazi multipli di 4,
// in ogni riquadro un solo dato grande; tutto ciò che si tocca porta alla pagina giusta.

// Riquadro toccabile del pannello: titoletto, un dato, una riga sotto.
function tessera(stack, w, h, url) {
  const t = stack.addStack();
  t.layoutVertically();
  t.size = new Size(w, h);
  t.cornerRadius = 16;
  t.backgroundColor = C.riquadro;
  t.setPadding(10, 12, 10, 12);
  if (url) t.url = link(url);
  return t;
}

function freccina(stack, t, colore = C.oro) {
  const r = riga(stack);
  testo(r, t, F.forte(10), colore);
  return r;
}

// Mini grafico della giornata: oggi pieno fino a quest'ora, ieri tratteggiato.
function graficoGiornata(oggi, ieri, w, h) {
  return grafico(oggi, w, h, { confronto: ieri, punti: ieri.length, spessore: 2, punto: 3 });
}

// ---------- Apri il menù (piccolo): un tocco e il menù è sullo schermo
function wApri(fam, d) {
  const w = nuovoWidget(fam);
  w.url = link("/menu");
  if (LOGO) logo(riga(w), 17);
  else testo(w, "L'ANGOLO DEL VINO", F.titoletto(), C.oro);
  w.addSpacer();
  testo(w, "Il menù", F.serifForte(30), C.crema);
  w.addSpacer(2);
  testo(w, "vini, piatti, eventi", F.serifCorsivo(13), C.crema2);
  w.addSpacer();
  const r = riga(w);
  const p = r.addStack();
  p.setPadding(5, 10, 5, 10);
  p.cornerRadius = 12;
  p.backgroundColor = C.oro;
  testo(p, "Apri  →", F.forte(12), C.fondo1);
  r.addSpacer();
  return w;
}

// ---------- Pannello (grande): sei scorciatoie
function wPannello(fam, d, v) {
  const w = nuovoWidget(fam);
  const { CW, CH } = misure(fam);
  intestazione(w, "L'Angolo del Vino", d, v);
  w.addSpacer(LOGO ? 4 : 10);
  const gap = 8;
  const tw = Math.floor((CW - gap) / 2);
  const th = Math.floor((CH - 22 - gap * 2) / 3);
  const fila = () => {
    const r = riga(w);
    r.topAlignContent();
    return r;
  };
  const dipendente = d.ruolo === "dipendente";

  // 1 · Menù (per tutti): da mostrare al cliente
  const r1 = fila();
  const menu = tessera(r1, tw, th, "/menu");
  testo(menu, "MENÙ", F.titoletto(), C.oro);
  menu.addSpacer();
  testo(menu, "Apri il menù", F.serifForte(17), C.crema);
  menu.addSpacer(2);
  freccina(menu, "da mostrare  →");
  r1.addSpacer(gap);
  // 2 · QR da mostrare
  const qr = tessera(r1, tw, th, "/menu/qr");
  const qrr = riga(qr);
  qrr.centerAlignContent();
  const qc = colonna(qrr);
  testo(qc, "QR", F.titoletto(), C.oro);
  qc.addSpacer();
  testo(qc, "Mostra", F.serifForte(17), C.crema);
  testo(qc, "il codice", F.serifCorsivo(12), C.crema2);
  qrr.addSpacer();
  const box = qrr.addStack();
  box.backgroundColor = C.qr;
  box.cornerRadius = 8;
  box.setPadding(4, 4, 4, 4);
  const lato = Math.min(th - 28, 58);
  const img = box.addImage(QR);
  img.imageSize = new Size(lato, lato);
  w.addSpacer(gap);

  const r2 = fila();
  if (dipendente) {
    // 3 · Il mio turno
    const tu = tessera(r2, tw, th, d.turno ? d.turno.link : d.linkTurni);
    testo(tu, "IL MIO TURNO", F.titoletto(), C.oro);
    tu.addSpacer();
    if (d.turno) {
      testo(tu, d.turno.quando, F.medio(11), C.crema2);
      testo(tu, d.turno.orario, F.numero(20), C.crema);
      tu.addSpacer(2);
      freccina(tu, d.turno.tra);
    } else testo(tu, "Nessun turno in vista", F.testo(12), C.crema2, 2);
  } else {
    // 3 · Statistiche: aperture di oggi contro ieri alla stessa ora
    const st = tessera(r2, tw, th, d.linkStatistiche);
    testo(st, "APERTURE OGGI", F.titoletto(), C.oro);
    st.addSpacer();
    const n = riga(st);
    n.bottomAlignContent();
    testo(n, d.aperture, F.numero(30), C.crema);
    n.addSpacer();
    st.addSpacer(2);
    const pr = riga(st);
    if (d.delta === null) testo(pr, `ieri a quest'ora ${d.ieriFinora}`, F.testo(10), C.crema2);
    else {
      pillola(pr, d.delta);
      pr.addSpacer(5);
      testo(pr, "su ieri a quest'ora", F.testo(10), C.crema2).minimumScaleFactor = 0.75;
    }
  }
  r2.addSpacer(gap);
  // 4 · Fuori menù di oggi
  const fm = tessera(r2, tw, th, dipendente ? "/menu#oggi" : "/gestione-menu");
  testo(fm, "FUORI MENÙ", F.titoletto(), C.oro);
  fm.addSpacer();
  if (d.fuori.length) {
    for (const x of d.fuori) testo(fm, x, F.serif(CW < 300 ? 11 : 12), C.crema);
  } else {
    // Il fuori menù è facoltativo: se oggi non c'è, niente rosso, solo la via per aggiungerlo.
    testo(fm, "Oggi niente", F.serifCorsivo(16), C.crema2);
    if (!dipendente) freccina(fm, "aggiungi  →", C.crema3);
  }
  w.addSpacer(gap);

  const r3 = fila();
  if (dipendente) {
    // 5 · Esauriti di oggi
    const es = tessera(r3, tw, th, "/menu");
    testo(es, "ESAURITI OGGI", F.titoletto(), C.oro);
    es.addSpacer();
    testo(es, d.esauriti, F.numero(30), d.esauriti ? C.rossoTesto : C.crema);
    testo(es, d.esauriti ? "da non proporre" : "c'è tutto", F.testo(10), C.crema2);
    r3.addSpacer(gap);
    // 6 · Le mie ore
    const ore = tessera(r3, tw, th, d.linkOre);
    testo(ore, "LE MIE ORE", F.titoletto(), C.oro);
    ore.addSpacer();
    testo(ore, "Ore e mesi", F.serifForte(17), C.crema);
    freccina(ore, "apri  →");
  } else {
    // 5 · Chi lavora stasera
    const tu = tessera(r3, tw, th, d.linkTurni);
    testo(tu, "STASERA AL LAVORO", F.titoletto(), C.oro);
    tu.addSpacer();
    if (d.stasera.chiuso) testo(tu, d.stasera.chiuso, F.serifForte(15), C.rossoTesto, 2);
    else if (d.stasera.persone.length) {
      // Tutti quelli in turno, mai «e altri»: fino a 4 nome e orario (più piccoli se sono 4),
      // da 5 in su solo i nomi su due colonne; i nomi lunghi si stringono da soli.
      const ps = d.stasera.persone.map((p) => (typeof p === "string" ? { nome: p, orario: "" } : p));
      // Fino a 5 persone nome e orario, con la scritta più grande che ci sta nel riquadro
      // (altezza meno margini 20 e titolo 13, diviso per le righe); da 6 in su i nomi su due colonne.
      const perRiga = (th - 20 - 13) / ps.length;
      if (ps.length <= 5) {
        const f = Math.max(8, Math.min(12, Math.floor((perRiga / 1.25) * 2) / 2));
        ps.forEach((p) => {
          const r = riga(tu);
          testo(r, p.nome, F.medio(f), C.crema).minimumScaleFactor = 0.7;
          r.addSpacer(4);
          r.addSpacer();
          if (p.orario) testo(r, p.orario, F.testo(f - 1), C.crema2);
        });
      } else if (ps.length <= 10) {
        // A coppie, riga per riga, così le due colonne restano allineate; tutti con la stessa grandezza.
        const cella = Math.floor((tw - 24 - 6) / 2);
        const f = ps.some((p) => p.nome.length > 10) ? 9 : 10;
        for (let i = 0; i < ps.length; i += 2) {
          const r = riga(tu);
          ps.slice(i, i + 2).forEach((p, j) => {
            if (j) r.addSpacer(6);
            const c = riga(r);
            c.size = new Size(cella, 0);
            testo(c, p.nome, F.medio(f), C.crema).minimumScaleFactor = 0.6;
            c.addSpacer();
          });
        }
      } else {
        // Un nome non va mai a capo a metà («Andrea R.» resta intero).
        const t = testo(tu, ps.map((p) => p.nome.replace(/ /g, " ")).join(" · "), F.medio(9), C.crema, 6);
        t.minimumScaleFactor = 0.5;
      }
    } else testo(tu, "Nessuno in turno", F.testo(12), C.crema2);
    r3.addSpacer(gap);
    // 6 · Da fare
    const df = tessera(r3, tw, th, d.daFarePrimo ? d.daFarePrimo.link : "/gestione-menu");
    testo(df, "DA FARE", F.titoletto(), C.oro);
    df.addSpacer();
    if (d.daFare) {
      testo(df, d.daFare, F.numero(30), C.ambra);
      testo(df, d.daFarePrimo.testo, F.testo(10), C.crema2);
    } else {
      testo(df, "Tutto a posto", F.serifForte(17), C.verde);
      testo(df, "niente in sospeso", F.testo(10), C.crema2);
    }
  }
  return w;
}

// ---------- In sala (medio): come va adesso
function wSala(fam, d, v) {
  const w = nuovoWidget(fam);
  const { CW } = misure(fam);
  w.url = link(d.link);
  intestazione(w, "In sala", d, v);
  w.addSpacer(6);
  const corpo = riga(w);
  corpo.topAlignContent();
  const sx = colonna(corpo);
  sx.size = new Size(104, 0);
  testo(sx, d.oggi, F.numero(40), C.crema);
  testo(sx, "aperture oggi", F.testo(10), C.crema2);
  sx.addSpacer(6);
  if (d.delta !== null) {
    pillola(riga(sx), d.delta);
    sx.addSpacer(3);
  }
  testo(sx, `ieri a quest'ora ${d.ieriFinora}`, F.testo(9), C.crema3);
  corpo.addSpacer(12);
  const dx = colonna(corpo);
  const gw = CW - 104 - 12;
  dx.size = new Size(gw, 0);
  const img = dx.addImage(graficoGiornata(d.serieOggi, d.serieIeri, gw, 36));
  img.imageSize = new Size(gw, 36);
  dx.addSpacer(8);
  const team = riga(dx);
  team.url = link(d.linkTurni);
  if (d.chiuso) testo(team, d.chiuso, F.medio(11), C.rossoTesto);
  else if (d.alLavoro.length) {
    const ultimo = d.alLavoro.reduce((a, b) => (b.fine > a.fine ? b : a));
    testo(team, `${nomi(d.alLavoro)} · fino alle ${ultimo.alle}`, F.medio(10.5), C.crema);
  } else testo(team, d.arrivano.length ? `${d.arrivano[0].nome} arriva alle ${d.arrivano[0].dalle}` : "Nessuno in turno adesso", F.testo(10), C.crema2);
  dx.addSpacer(6);
  const es = riga(dx);
  es.url = link(d.linkMenu);
  testo(es, d.esauriti.length ? `${d.esauriti.length} esaurit${d.esauriti.length === 1 ? "o" : "i"}: ${d.esauriti.join(", ")}` : "Niente di esaurito", F.testo(10), C.crema2, misure(fam).H < 155 ? 1 : 2);
  es.addSpacer();
  // Le parole cercate che nel menù non ci sono: un'idea di cosa aggiungere.
  if (d.nonTrovati.length) {
    dx.addSpacer(2);
    const nt = riga(dx);
    nt.url = link(d.link);
    const x = d.nonTrovati[0];
    testo(nt, `«${x.parola}» cercato${x.volte > 1 ? ` ${x.volte} volte` : ""}, non c'è`, F.medio(10), C.ambra);
    nt.addSpacer();
  }
  return w;
}

// ---------- Prima di aprire (medio): ieri in breve e cosa fare oggi
function wMattina(fam, d, v) {
  const w = nuovoWidget(fam);
  w.url = link(d.link);
  intestazione(w, "Prima di aprire", d, v);
  w.addSpacer(8);
  const corpo = riga(w);
  corpo.topAlignContent();
  const sx = colonna(corpo);
  sx.size = new Size(100, 0);
  testo(sx, "IERI", F.titoletto(), C.crema2);
  sx.addSpacer(2);
  testo(sx, d.ieri.aperture, F.numero(32), C.crema);
  testo(sx, "aperture", F.testo(10), C.crema2);
  sx.addSpacer(5);
  if (d.ieri.delta !== null) {
    pillola(riga(sx), d.ieri.delta);
    sx.addSpacer(2);
    testo(sx, `su ${d.ieri.giorno.slice(0, 3)}. scorso`, F.testo(9), C.crema3);
  }
  corpo.addSpacer(8);
  lineaVerticale(corpo, 92);
  corpo.addSpacer(12);
  const dx = colonna(corpo);
  dx.size = new Size(misure(fam).CW - 100 - 8 - 1 - 12, 0);
  testo(dx, "OGGI", F.titoletto(), C.crema2);
  dx.addSpacer(4);
  const oggi = riga(dx);
  oggi.url = link(d.linkTurni);
  if (d.oggi.chiuso) testo(oggi, d.oggi.chiuso, F.medio(11), C.rossoTesto);
  else {
    testo(oggi, d.oggi.persone.length ? `${nomi(d.oggi.persone)} · dalle ${d.oggi.persone[0].dalle}` : "Nessun turno oggi", F.medio(11), C.crema);
    oggi.addSpacer();
  }
  dx.addSpacer(8);
  if (d.oggi.evento) {
    const r = riga(dx);
    testo(r, "★", F.forte(9), C.oro);
    r.addSpacer(6);
    testo(r, `${d.oggi.evento.titolo}${d.oggi.evento.ora ? ` · ${d.oggi.evento.ora}` : ""}`, F.serifCorsivo(12), C.crema);
    r.addSpacer();
    dx.addSpacer(4);
  }
  for (const c of d.cose.slice(0, d.oggi.evento ? 2 : 3)) {
    const r = riga(dx);
    r.url = link(c.link);
    testo(r, c.fatto ? "✓" : "●", F.forte(c.fatto ? 10 : 7), c.fatto ? C.verde : C.ambra);
    r.addSpacer(6);
    testo(r, c.testo, F.testo(11), c.fatto ? C.crema2 : C.crema);
    r.addSpacer();
    dx.addSpacer(4);
  }
  return w;
}

// ---------- Stasera (medio): l'evento di oggi o il prossimo, con la locandina
function wStasera(fam, d, v) {
  if (!d.evento) return messaggio(fam, "Stasera", "Nessun evento in programma.");
  const e = d.evento;
  const w = nuovoWidget(fam);
  const { CH } = misure(fam);
  w.url = link(d.link);
  const corpo = riga(w);
  corpo.topAlignContent();
  if (LOCANDINA) {
    const h = CH;
    const box = corpo.addStack();
    box.cornerRadius = 10;
    const img = box.addImage(LOCANDINA);
    img.imageSize = new Size(Math.round(h * 0.8), h);
  } else {
    const data = corpo.addStack();
    data.layoutVertically();
    data.size = new Size(64, CH);
    data.cornerRadius = 12;
    data.backgroundColor = C.oroFondo;
    data.centerAlignContent();
    data.addSpacer();
    const n = riga(data); n.addSpacer(); testo(n, e.giorno, F.numero(26), C.oro); n.addSpacer();
    const m = riga(data); m.addSpacer(); testo(m, e.mese, F.forte(10), C.crema2); m.addSpacer();
    data.addSpacer();
  }
  corpo.addSpacer(12);
  const t = colonna(corpo);
  const top = riga(t);
  if (LOGO) {
    logo(top, 13);
    top.addSpacer(7);
  }
  testo(top, (e.oggi ? "Stasera" : "Prossimo evento").toUpperCase(), F.titoletto(), C.oro).minimumScaleFactor = 0.8;
  top.addSpacer();
  scrittaAggiornato(top, d, v, false);
  t.addSpacer(4);
  testo(t, e.titolo, F.serifForte(19), C.crema, 2);
  t.addSpacer(2);
  testo(t, e.tipo, F.serifCorsivo(12), C.crema2);
  t.addSpacer();
  const q = riga(t);
  testo(q, e.quando, F.medio(11), C.crema);
  q.addSpacer(6);
  etichetta(q, e.tra);
  q.addSpacer();
  t.addSpacer(6);
  testo(t, e.visite ? `${e.visite} ${e.visite === 1 ? "visita" : "visite"} alla pagina${e.visiteOggi ? ` · ${e.visiteOggi} oggi` : ""}` : "Pagina dell'evento: ancora nessuna visita", F.testo(9.5), C.crema3);
  return w;
}

// ---------- Andamento (grande): per il consulente
function wAndamento(fam, d, v) {
  const w = nuovoWidget(fam);
  const { CW } = misure(fam);
  const stretto = misure(fam).H < 340;
  w.url = link(d.link);
  intestazione(w, "Andamento del menù", d, v);
  w.addSpacer(stretto ? 6 : 10);

  // 1 · Due numeri grandi, ognuno con il suo confronto scritto per intero: niente percentuali senza un «su cosa».
  const gap = stretto ? 6 : 8;
  const cw = Math.floor((CW - gap) / 2);
  const kpi = riga(w);
  kpi.topAlignContent();
  const blocco = (titolo, n, cosa, x, nomePrima, nonContato) => {
    const c = colonna(kpi);
    c.size = new Size(cw, 0);
    testo(c, titolo.toUpperCase(), F.titoletto(), C.oro);
    testo(c, n, F.numero(stretto ? 26 : 30), C.crema);
    testo(c, cosa, F.testo(9), C.crema2).minimumScaleFactor = 0.8;
    c.addSpacer(3);
    const r = riga(c);
    if (x.prima === null) testo(r, nonContato, F.testo(9), C.crema3).minimumScaleFactor = 0.8;
    else {
      if (x.delta !== null) {
        pillola(r, x.delta);
        r.addSpacer(5);
      }
      testo(r, `${nomePrima}: ${x.prima}`, F.testo(9), C.crema2).minimumScaleFactor = 0.8;
    }
    r.addSpacer();
    return c;
  };
  blocco("Questa settimana", d.settimana.n, `aperture ${d.settimana.giorni}`, d.settimana, "sett. scorsa", "sett. scorsa non contata");
  kpi.addSpacer(gap);
  // Il mese: l'ultimo finito contro quello prima (mai un mese appena iniziato contro uno intero).
  const m = d.mese;
  blocco(`${m.nome} finora`, m.n, `aperture ${m.dal || m.giorni}`, m, m.giorniPrima, m.confrontoDa ? `confronto da ${m.confrontoDa}` : `${m.nomePrima} non contato`);
  w.addSpacer(stretto ? 6 : 10);

  // 2 · Settimana per settimana: il numero sopra ogni barra, la data sotto; quella in corso si chiama «questa».
  const st = riga(w);
  testo(st, "SETTIMANA PER SETTIMANA", F.titoletto(), C.crema2);
  st.addSpacer();
  testo(st, "aperture", F.testo(9), C.crema3);
  w.addSpacer(4);
  if (d.settimane.length < 2) {
    testo(w, "Le settimane compariranno qui man mano che si contano.", F.testo(10), C.crema2, 2);
  } else {
    const n = d.settimane.length;
    const sg = 5;
    const bw = Math.floor((CW - sg * (n - 1)) / n);
    const hMax = stretto ? 20 : 28;
    const max = Math.max(1, ...d.settimane.map((x) => x.n));
    const br = riga(w);
    br.bottomAlignContent();
    d.settimane.forEach((x, i) => {
      if (i) br.addSpacer(sg);
      const c = colonna(br);
      c.size = new Size(bw, 0);
      const centro = (t, f, col) => {
        const r = riga(c);
        r.addSpacer();
        testo(r, t, f, col).minimumScaleFactor = 0.7;
        r.addSpacer();
      };
      centro(x.n, F.forte(9), x.inCorso ? C.crema : C.crema2);
      c.addSpacer(2);
      const h = Math.max(3, Math.round((x.n / max) * hMax));
      const img = c.addImage(barra(bw, h, x.inCorso ? C.oro : C.oroArea));
      img.imageSize = new Size(bw, h);
      c.addSpacer(3);
      centro(x.inCorso ? "questa" : x.da, F.testo(8), x.inCorso ? C.oro : C.crema3);
    });
  }
  w.addSpacer(stretto ? 6 : 10);

  // 3 · Quattro risposte brevi, ognuna con il suo periodo.
  const cella = (r, tit, val, sotto, url, coloreVal = C.crema, unita = "") => {
    const c = r.addStack();
    c.layoutVertically();
    c.size = new Size(cw, 0);
    c.cornerRadius = 12;
    c.backgroundColor = C.riquadro;
    c.setPadding(stretto ? 5 : 7, 10, stretto ? 5 : 7, 10);
    if (url) c.url = link(url);
    testo(c, tit.toUpperCase(), F.titoletto(), C.oro);
    c.addSpacer(stretto ? 1 : 2);
    const vr = riga(c);
    vr.bottomAlignContent();
    testo(vr, val, F.numero(stretto ? 15 : 18), coloreVal);
    if (unita) {
      vr.addSpacer(4);
      testo(vr, unita, F.medio(10), coloreVal);
    }
    vr.addSpacer();
    testo(c, sotto, F.testo(9), C.crema2).minimumScaleFactor = 0.8;
    return c;
  };
  const a = riga(w);
  a.topAlignContent();
  if (d.eventi) {
    const piu = d.eventi.delta !== null && d.eventi.delta > 0;
    cella(a, "Giorni con evento", d.eventi.delta === null ? "—" : `${piu ? "+" : ""}${d.eventi.delta}%`, `${d.eventi.conEvento} al giorno, gli altri ${d.eventi.senza}`, "/statistiche#eventi", piu ? C.verde : C.crema, d.eventi.delta === null ? "" : "di aperture");
  } else cella(a, "Giorni con evento", "—", "ancora nessun evento", "/statistiche#eventi");
  a.addSpacer(gap);
  cella(a, "Ore in turno", `${d.ore.questa} h`, `questa settimana · scorsa ${d.ore.scorsa} h`, d.linkOre);
  w.addSpacer(gap);
  const b = riga(w);
  b.topAlignContent();
  // Il giorno e l'ora più forti con la loro media di aperture; sotto, piccolo, il periodo.
  const oraTesto = d.oraForte ? `ore ${d.oraForte}${d.oraMedia ? ` · ${d.oraMedia} in media` : ""}` : "";
  const forte = cella(b, "Momento più forte", d.giornoForte || "—", oraTesto || d.periodo, "/statistiche#quando", C.crema, d.giornoMedia ? `${d.giornoMedia} in media` : "");
  if (oraTesto) testo(forte, d.periodo, F.testo(8), C.crema3);
  b.addSpacer(gap);
  // I mesi finiti, a consuntivo: nome a sinistra, aperture a destra.
  const mi = b.addStack();
  mi.layoutVertically();
  mi.cornerRadius = 12;
  mi.backgroundColor = C.riquadro;
  mi.setPadding(stretto ? 5 : 7, 10, stretto ? 5 : 7, 10);
  mi.url = link("/statistiche");
  const treMesi = misure(fam).H >= 370;
  testo(mi, "MESI INTERI", F.titoletto(), C.oro);
  mi.addSpacer(stretto ? 1 : 3);
  if (d.mesi.length) {
    d.mesi.slice(0, treMesi ? 3 : 2).forEach((x) => {
      const r = riga(mi);
      testo(r, x.nome.charAt(0).toUpperCase() + x.nome.slice(1), F.testo(9.5), C.crema2);
      if (x.dal) {
        r.addSpacer(3);
        testo(r, `(${x.dal})`, F.testo(8), C.crema3);
      }
      r.addSpacer();
      testo(r, x.n, F.forte(9.5), C.crema);
    });
  } else {
    testo(mi, "—", F.numero(stretto ? 15 : 18), C.crema);
    testo(mi, `il primo a fine ${d.mese.nome}`, F.testo(9), C.crema2).minimumScaleFactor = 0.8;
  }
  mi.addSpacer();
  forte.addSpacer();
  // Stessa altezza per i due riquadri della riga (quanto serve a tre mesi, o due sui telefoni piccoli).
  const alto = treMesi ? 74 : stretto ? 62 : 68;
  forte.size = new Size(cw, alto);
  mi.size = new Size(cw, alto);
  return w;
}

// Una barra sola, con gli angoli in alto arrotondati.
function barra(w, h, colore) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const p = new Path();
  p.addRoundedRect(new Rect(0, 0, w, h), Math.min(3, h / 2), Math.min(3, h / 2));
  ctx.addPath(p);
  ctx.setFillColor(colore);
  ctx.fillPath();
  return ctx.getImage();
}

// ---------- Cosa dire ai clienti (medio): per chi è in sala
function wClienti(fam, d, v) {
  const w = nuovoWidget(fam);
  w.url = link(d.link);
  intestazione(w, "Da dire ai clienti", d, v);
  w.addSpacer(8);
  const corpo = riga(w);
  corpo.topAlignContent();
  const sx = colonna(corpo);
  testo(sx, "FUORI MENÙ", F.titoletto(), C.crema2);
  sx.addSpacer(4);
  if (d.fuori.length) {
    for (const x of d.fuori.slice(0, 2)) {
      const r = riga(sx);
      testo(r, x.nome, F.serif(misure(fam).CW < 300 ? 11 : 12), C.crema);
      r.addSpacer(4);
      testo(r, x.prezzo, F.forte(10.5), C.oro);
      r.addSpacer();
      sx.addSpacer(2);
    }
  } else testo(sx, "Niente di speciale", F.serifCorsivo(13), C.crema2);
  sx.addSpacer(6);
  testo(sx, "CONSIGLIATI", F.titoletto(), C.crema2);
  sx.addSpacer(3);
  testo(sx, d.consigli.length ? d.consigli.slice(0, 2).join(" · ") : "—", F.serifCorsivo(11.5), C.crema, 2);
  corpo.addSpacer(12);
  lineaVerticale(corpo, 86);
  corpo.addSpacer(12);
  const dx = colonna(corpo);
  dx.size = new Size(Math.round(misure(fam).CW * 0.42), 0);
  testo(dx, "ESAURITI", F.titoletto(), C.crema2);
  dx.addSpacer(4);
  if (d.esauriti.length) for (const x of d.esauriti.slice(0, 2)) testo(dx, x, F.medio(10), C.rossoTesto);
  else testo(dx, "c'è tutto", F.medio(11), C.verde);
  dx.addSpacer();
  if (d.evento) {
    testo(dx, d.evento.ora ? `STASERA · ${d.evento.ora}` : d.evento.quando ? `PROSSIMO · ${d.evento.quando}` : "STASERA", F.titoletto(), C.oro);
    dx.addSpacer(2);
    testo(dx, d.evento.titolo, F.serifCorsivo(12), C.crema, 2);
  }
  return w;
}

// ---------- Avvio (in fondo: prima devono esistere tutte le costanti qui sopra)
// Quale widget: lo dice lo script «Angolo … · …» creato dall'installatore (WIDGET); per quelli della
// prima versione, la prima parola del campo «Parameter» che non è un colore (es. «aperture»).
const param = ((typeof WIDGET !== "undefined" && WIDGET) || PAROLE.find((p) => !TEMI[p]) || "aperture").replace(/[^a-z]/g, "");
let famiglia = config.widgetFamily;
if (!config.runsInWidget) famiglia = await scegliAnteprima();

// QR scuro su chiaro, sempre: è quello che le fotocamere leggono meglio.
const QR = param === "qr" || param === "pannello" ? await caricaImmagine("qr.png") : null;
const risposta = await caricaDati(param);
// La locandina dell'evento (widget «stasera»): se non arriva, al suo posto la data.
let LOCANDINA = null;
if (param === "stasera" && risposta.dati && risposta.dati.evento && risposta.dati.evento.locandina) {
  try {
    LOCANDINA = await new Request(`${SITO}${risposta.dati.evento.locandina}`).loadImage();
  } catch (e) {}
}
const TEMA = PAROLE.find((p) => TEMI[p]) || (risposta.dati && risposta.dati.tema) || "crema";
C = colori(TEMA);
// Il logo (scritta a mano dell'Angolo del Vino) nel colore del tema, al posto del nome scritto in maiuscolo.
let LOGO = null;
if (!String(famiglia || "").startsWith("accessory")) {
  try {
    LOGO = await caricaImmagine(`logo/${TEMI[TEMA] ? TEMA : "crema"}.png`);
  } catch (e) {}
}
const widget = disegna(param, famiglia, risposta);
if (config.runsInWidget) Script.setWidget(widget);
else await mostra(widget, famiglia);
Script.complete();
