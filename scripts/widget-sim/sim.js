// Simulatore dei comandi di Scriptable usati da public/widget/angolo.js: disegna il widget
// nella pagina con la stessa logica di SwiftUI (stack orizzontali e verticali, spazi elastici),
// così si controllano misure, testi tagliati e sovrapposizioni senza un iPhone.
/* eslint-disable */
(function () {
  const SIZES = {
    small: [158, 158],
    medium: [338, 158],
    large: [338, 354],
    extraLarge: [715, 354],
    accessoryRectangular: [158, 72],
    accessoryCircular: [72, 72],
    accessoryInline: [240, 20],
  };

  class Color {
    constructor(hex, alpha = 1) {
      this.hex = hex;
      this.alpha = alpha;
    }
    css() {
      const h = this.hex.replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${this.alpha})`;
    }
    static white() {
      return new Color("#FFFFFF");
    }
    static black() {
      return new Color("#000000");
    }
    static clear() {
      return new Color("#000000", 0);
    }
  }
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }
  class Size {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
  }
  class Rect {
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.width = w;
      this.height = h;
    }
  }
  class LinearGradient {
    constructor() {
      this.colors = [];
      this.locations = [];
      this.startPoint = new Point(0, 0);
      this.endPoint = new Point(0, 1);
    }
  }
  class Font {
    constructor(name, size, weight = 400, rounded = false) {
      this.name = name;
      this.size = size;
      this.weight = weight;
      this.rounded = rounded;
    }
    css() {
      const serif = /Baskerville|Georgia|Didot/.test(this.name);
      const italic = /Italic/.test(this.name);
      const weight = /SemiBold/.test(this.name) ? 600 : /Bold/.test(this.name) ? 700 : this.weight;
      const family = serif ? "'Baskervville', 'Libre Baskerville', serif" : "'Inter', -apple-system, sans-serif";
      return `${italic ? "italic " : ""}${weight} ${this.size}px ${family}`;
    }
    static regularSystemFont(s) { return new Font("system", s, 400); }
    static mediumSystemFont(s) { return new Font("system", s, 500); }
    static semiboldSystemFont(s) { return new Font("system", s, 600); }
    static boldSystemFont(s) { return new Font("system", s, 700); }
    static heavySystemFont(s) { return new Font("system", s, 800); }
    static italicSystemFont(s) { return new Font("system-Italic", s, 400); }
    static boldRoundedSystemFont(s) { return new Font("rounded", s, 700, true); }
    static semiboldRoundedSystemFont(s) { return new Font("rounded", s, 600, true); }
    static mediumRoundedSystemFont(s) { return new Font("rounded", s, 500, true); }
    static regularRoundedSystemFont(s) { return new Font("rounded", s, 400, true); }
  }

  class Path {
    constructor() {
      this.ops = [];
    }
    move(p) { this.ops.push(["M", p.x, p.y]); }
    addLine(p) { this.ops.push(["L", p.x, p.y]); }
    closeSubpath() { this.ops.push(["Z"]); }
    addRoundedRect(r, rx, ry) { this.ops.push(["RR", r.x, r.y, r.width, r.height, rx]); }
    addRect(r) { this.ops.push(["RR", r.x, r.y, r.width, r.height, 0]); }
  }
  class SimImage {
    constructor(src, w, h) {
      this.src = src;
      this.size = new Size(w, h);
    }
  }
  class DrawContext {
    constructor() {
      this.size = new Size(100, 100);
      this.opaque = true;
      this.respectScreenScale = false;
      this._ops = [];
      this._fill = "#000";
      this._stroke = "#000";
      this._lw = 1;
      this._path = null;
    }
    _canvas() {
      if (!this._c) {
        this._c = document.createElement("canvas");
        this._c.width = this.size.width * 3;
        this._c.height = this.size.height * 3;
        this._x = this._c.getContext("2d");
        this._x.scale(3, 3);
      }
      return this._x;
    }
    setFillColor(c) { this._fill = c.css(); }
    setStrokeColor(c) { this._stroke = c.css(); }
    setLineWidth(w) { this._lw = w; }
    fillRect(r) { const x = this._canvas(); x.fillStyle = this._fill; x.fillRect(r.x, r.y, r.width, r.height); }
    fillEllipse(r) { const x = this._canvas(); x.fillStyle = this._fill; x.beginPath(); x.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2); x.fill(); }
    addPath(p) { this._path = p; }
    _trace() {
      const x = this._canvas();
      x.beginPath();
      for (const o of this._path.ops) {
        if (o[0] === "M") x.moveTo(o[1], o[2]);
        else if (o[0] === "L") x.lineTo(o[1], o[2]);
        else if (o[0] === "Z") x.closePath();
        else if (o[0] === "RR") x.roundRect(o[1], o[2], o[3], o[4], o[5]);
      }
      return x;
    }
    fillPath() { const x = this._trace(); x.fillStyle = this._fill; x.fill(); }
    strokePath() { const x = this._trace(); x.strokeStyle = this._stroke; x.lineWidth = this._lw; x.lineJoin = "round"; x.lineCap = "round"; x.stroke(); }
    drawText(t, p) { const x = this._canvas(); x.fillStyle = this._fill; x.fillText(t, p.x, p.y); }
    getImage() { this._canvas(); return new SimImage(this._c.toDataURL(), this.size.width, this.size.height); }
  }

  // ---------- Elementi del widget
  class Base {
    constructor() {
      this.children = [];
    }
  }
  class WidgetSpacer {
    constructor(length) {
      this.length = length === undefined || length === null ? null : length;
    }
  }
  class WidgetText {
    constructor(t) {
      this.text = t;
      this.font = Font.regularSystemFont(17);
      this.textColor = Color.white();
      this.lineLimit = 0;
      this.align = "left";
      this.minimumScaleFactor = 1;
    }
    leftAlignText() { this.align = "left"; }
    centerAlignText() { this.align = "center"; }
    rightAlignText() { this.align = "right"; }
  }
  class WidgetImage {
    constructor(img) {
      this.image = img;
      this.imageSize = null;
    }
    leftAlignImage() {}
    centerAlignImage() {}
    rightAlignImage() {}
  }
  class WidgetStack extends Base {
    constructor() {
      super();
      this.dir = "row";
      this.align = "top";
      this.size = new Size(0, 0);
      this.padding = [0, 0, 0, 0];
      this.spacing = 0;
    }
    layoutHorizontally() { this.dir = "row"; }
    layoutVertically() { this.dir = "column"; }
    topAlignContent() { this.align = "top"; }
    centerAlignContent() { this.align = "center"; }
    bottomAlignContent() { this.align = "bottom"; }
    setPadding(t, l, b, r) { this.padding = [t, l, b, r]; }
    useDefaultPadding() { this.padding = [0, 0, 0, 0]; }
    addStack() { const s = new WidgetStack(); this.children.push(s); return s; }
    addText(t) { const x = new WidgetText(t); this.children.push(x); return x; }
    addSpacer(l) { const s = new WidgetSpacer(l); this.children.push(s); return s; }
    addImage(i) { const x = new WidgetImage(i); this.children.push(x); return x; }
    addDate(d) { return this.addText(String(d)); }
  }
  class ListWidget extends WidgetStack {
    constructor() {
      super();
      this.dir = "column";
      // Come su iPhone: margine di serie nei widget della Home, nessuno nella schermata di blocco.
      this.padding = window.config && String(window.config.widgetFamily).startsWith("accessory") ? [0, 0, 0, 0] : [16, 16, 16, 16];
    }
    setPadding(t, l, b, r) { this.padding = [t, l, b, r]; }
    async presentSmall() {}
    async presentMedium() {}
    async presentLarge() {}
  }

  // Uno stack «si allarga» lungo un asse se contiene uno spazio elastico su quell'asse
  // (come gli Spacer di SwiftUI): serve per riprodurre la disposizione dell'iPhone.
  function greedy(el) {
    if (!(el instanceof WidgetStack)) return { h: false, v: false };
    let h = false, v = false;
    for (const c of el.children) {
      if (c instanceof WidgetSpacer && c.length === null) {
        if (el.dir === "row") h = true;
        else v = true;
      } else if (c instanceof WidgetStack) {
        const g = greedy(c);
        if (g.h && !(c.size.width > 0)) h = true;
        if (g.v && !(c.size.height > 0)) v = true;
      } else if (c instanceof WidgetText && c.align !== "left" && el.dir === "column") h = true;
    }
    return { h, v };
  }

  function render(el, parentDir) {
    if (el instanceof WidgetSpacer) {
      const d = document.createElement("div");
      d.className = "sp";
      if (el.length === null) d.style.flex = "1 1 0";
      else d.style.flex = `0 0 ${el.length}px`;
      d.style.minWidth = d.style.minHeight = "0";
      return d;
    }
    if (el instanceof WidgetText) {
      const d = document.createElement("div");
      d.className = "tx";
      d.textContent = el.text;
      d.style.font = el.font.css();
      d.style.color = el.textColor.css();
      d.style.lineHeight = "1.2";
      d.style.textAlign = el.align;
      d.style.minWidth = "0";
      d.style.flexShrink = "1";
      if (el.lineLimit === 1) {
        d.style.whiteSpace = "pre";
        d.style.overflow = "hidden";
        d.style.textOverflow = "ellipsis";
      } else if (el.lineLimit > 1) {
        d.style.display = "-webkit-box";
        d.style.webkitLineClamp = String(el.lineLimit);
        d.style.webkitBoxOrient = "vertical";
        d.style.overflow = "hidden";
      }
      if (el.align !== "left" && parentDir === "column") d.style.alignSelf = "stretch";
      // In una colonna un testo non va mai oltre la larghezza disponibile (come su iPhone).
      if (parentDir === "column") d.style.maxWidth = "100%";
      return d;
    }
    if (el instanceof WidgetImage) {
      const d = document.createElement("img");
      d.className = "im";
      d.src = el.image.src;
      const s = el.imageSize || el.image.size;
      d.style.width = s.width + "px";
      d.style.height = s.height + "px";
      d.style.flex = "0 0 auto";
      return d;
    }
    const d = document.createElement("div");
    d.className = "st";
    d.style.display = "flex";
    d.style.flexDirection = el.dir;
    d.style.alignItems = el.dir === "row" ? { top: "flex-start", center: "center", bottom: "flex-end" }[el.align] : "flex-start";
    if (el.dir === "column" && el.align === "center") d.style.alignItems = "center";
    d.style.padding = el.padding.map((p) => p + "px").join(" ").replace(/^(\S+) (\S+) (\S+) (\S+)$/, "$1 $4 $3 $2");
    d.style.gap = el.spacing ? el.spacing + "px" : "";
    d.style.minWidth = "0";
    d.style.minHeight = "0";
    d.style.boxSizing = "border-box";
    d.style.flexShrink = "0";
    if (el.backgroundColor) d.style.background = el.backgroundColor.css();
    if (el.backgroundImage) {
      d.style.backgroundImage = `url(${el.backgroundImage.src})`;
      d.style.backgroundSize = "100% 100%";
    }
    if (el.backgroundGradient) {
      const g = el.backgroundGradient;
      const ang = Math.atan2(g.endPoint.x - g.startPoint.x, -(g.endPoint.y - g.startPoint.y)) * (180 / Math.PI);
      d.style.background = `linear-gradient(${ang}deg, ${g.colors.map((c, i) => `${c.css()} ${(g.locations[i] ?? i) * 100}%`).join(", ")})`;
    }
    if (el.cornerRadius) d.style.borderRadius = el.cornerRadius + "px";
    if (el.borderWidth) d.style.border = `${el.borderWidth}px solid ${el.borderColor ? el.borderColor.css() : "transparent"}`;
    if (el.size.width > 0) { d.style.width = el.size.width + "px"; d.style.flexShrink = "0"; }
    if (el.size.height > 0) d.style.height = el.size.height + "px";
    if (el.url) d.dataset.url = el.url;
    for (const c of el.children) {
      const child = render(c, el.dir);
      if (c instanceof WidgetStack) {
        const g = greedy(c);
        if (el.dir === "column") {
          if (g.h && !(c.size.width > 0)) child.style.alignSelf = "stretch";
          if (g.v && !(c.size.height > 0)) child.style.flex = "1 1 0";
        } else {
          if (g.h && !(c.size.width > 0)) child.style.flex = "1 1 0";
          if (g.v && !(c.size.height > 0)) child.style.alignSelf = "stretch";
        }
      }
      // Come SwiftUI: un testo su più righe va a capo prima di stringere i numeri accanto.
      if (c instanceof WidgetText && el.dir === "row") child.style.flexShrink = c.lineLimit !== 1 ? "20" : String(c.text).length <= 5 ? "0" : "1";
      d.appendChild(child);
    }
    return d;
  }

  // ---------- Ambiente di Scriptable
  const files = new Map();
  window.__sim = { files, SIZES, render };
  window.Color = Color;
  window.Point = Point;
  window.Size = Size;
  window.Rect = Rect;
  window.Font = Font;
  window.Path = Path;
  window.LinearGradient = LinearGradient;
  window.DrawContext = DrawContext;
  window.ListWidget = ListWidget;
  window.Device = { name: () => "iPhone di prova", model: () => "iPhone", isPad: () => !!window.__isPad, screenSize: () => new Size(window.__screenWidth || 393, 852) };
  window.FileManager = {
    local: () => ({
      documentsDirectory: () => "/doc",
      joinPath: (a, b) => `${a}/${b}`,
      fileExists: (p) => files.has(p),
      writeString: (p, s) => files.set(p, s),
      readString: (p) => files.get(p),
      writeImage: (p, i) => files.set(p, i),
      readImage: (p) => files.get(p),
    }),
  };
  window.Request = class {
    constructor(url) {
      this.url = url;
      this.headers = {};
      this.response = null;
    }
    async _go() {
      const r = await fetch(this.url, { headers: this.headers });
      this.response = { statusCode: r.status };
      return r;
    }
    async loadJSON() { return (await this._go()).json(); }
    async loadString() { return (await this._go()).text(); }
    async loadImage() {
      const r = await this._go();
      const b = await r.blob();
      const src = await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); });
      const img = new Image();
      img.src = src;
      await img.decode();
      return new SimImage(src, img.naturalWidth, img.naturalHeight);
    }
  };
  window.Alert = class {
    addAction() {}
    addCancelAction() {}
    async presentSheet() { return 1; }
  };
})();
