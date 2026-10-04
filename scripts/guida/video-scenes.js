// Il video della guida (gira nel browser): una sola timeline GSAP in pausa, window.render(t) la posiziona al secondo t.
// L'interfaccia è ridisegnata in HTML (non sono screenshot): così tutto si muove — tocchi, righe che scorrono, finestre.
// Solo il menù dei clienti è fotografato (CFG.SHOTS). Lo include video-build.mjs, che prima definisce CFG.
// Deterministico: niente timer, niente animazioni CSS, niente callback (le scritte si «digitano» con caratteri che compaiono).
const { VERSION, SHOTS, ROW } = CFG;
gsap.registerPlugin(DrawSVGPlugin);
const stage = document.getElementById("stage");
const M = gsap.timeline({ paused: true, defaults: { lazy: false } });
const el = (tag, cls, html, p) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (p) p.appendChild(e); return e; };
const W = 1080, H = 1920;

// ───────────────────────── piccoli attrezzi ─────────────────────────
const vis = (e, t0, t1) => { M.fromTo(e, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001 }, t0); if (t1 != null) M.fromTo(e, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.001 }, t1); };
const fade = (e, t, d = 0.4, to = 1) => M.fromTo(e, { autoAlpha: 0 }, { autoAlpha: to, duration: d, ease: "power2.out" }, t);
const rise = (e, t, y = 50, d = 0.8, ease = "expo.out") => M.fromTo(e, { autoAlpha: 0, y }, { autoAlpha: 1, y: 0, duration: d, ease }, t);
const pop = (e, t, d = 0.55) => M.fromTo(e, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: d, ease: "back.out(2.2)" }, t);
// punto al centro di un elemento, in coordinate del telefono (o della finestra) senza scala
function pos(e, root) { const a = e.getBoundingClientRect(), b = root.getBoundingClientRect(), k = b.width / root.offsetWidth; return [(a.left - b.left + a.width / 2) / k, (a.top - b.top + a.height / 2) / k]; }
// scritte «digitate»: ogni carattere compare a turno
function typeInto(host, text, t0, dur) {
  host.innerHTML = [...text].map((c) => `<u>${c === " " ? "&nbsp;" : c}</u>`).join("");
  const us = host.querySelectorAll("u");
  M.fromTo(us, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001, stagger: dur / us.length }, t0);
}
// testo a parole che salgono da una «mascherina»; *parola* = corsivo oro
function words(host, text) {
  let em = false;
  host.innerHTML = text.split(" ").map((w) => {
    if (w.startsWith("*")) em = true;
    const t = w.replace(/\*/g, ""), cls = em ? ' class="em"' : "";
    if (/\*[.,;:!?]*$/.test(w)) em = false;
    return `<span class="w"><i${cls}>${t}</i></span>`;
  }).join(" ");
  return host.querySelectorAll("i");
}

// ───────────────────────── scheletro di ogni capitolo ─────────────────────────
const BGS = [
  "radial-gradient(1100px 1100px at 85% 8%,#8a1c3a 0%,transparent 62%),radial-gradient(1000px 1000px at 5% 95%,#3b0707 0%,transparent 66%),#240707",
  "radial-gradient(1100px 1000px at 10% 12%,#6b1a2c 0%,transparent 60%),radial-gradient(1000px 1000px at 95% 95%,#2b1013 0%,transparent 66%),#1d0d0f",
  "radial-gradient(1200px 1100px at 90% 20%,#7f1730 0%,transparent 60%),radial-gradient(1000px 900px at 0% 100%,#44090c 0%,transparent 66%),#260808",
  "radial-gradient(1100px 1000px at 15% 5%,#5e1738 0%,transparent 60%),radial-gradient(1100px 1000px at 100% 100%,#2a0a1c 0%,transparent 66%),#1f0a14",
  "radial-gradient(1100px 1000px at 90% 10%,#76231d 0%,transparent 60%),radial-gradient(1000px 1000px at 0% 100%,#2e0c0a 0%,transparent 66%),#220a08",
  "radial-gradient(1100px 1100px at 15% 10%,#7a1230 0%,transparent 60%),radial-gradient(1000px 1000px at 100% 100%,#380808 0%,transparent 66%),#240606",
  "radial-gradient(1200px 1100px at 80% 5%,#8a1c3a 0%,transparent 62%),radial-gradient(1000px 1000px at 0% 100%,#3a0606 0%,transparent 66%),#210606",
];
const CH = [
  { n: "Esaurito in un tocco", dur: 16.5 },
  { n: "Tutto in quattro schede", dur: 10 },
  { n: "Aggiungi un vino", dur: 21.5 },
  { n: "Eventi e annunci", dur: 14.5 },
  { n: "Decidi l’ordine", dur: 9.5 },
  { n: "Se sbagli, torni indietro", dur: 9.5 },
  { n: "Strumenti e codice QR", dur: 13.5 },
];
const INTRO = 6.2, OUTRO = 7;
const starts = []; let acc = INTRO; for (const c of CH) { starts.push(acc); acc += c.dur; }
const END = acc + OUTRO; window.TOTAL = END;

const wipe = el("div", "wipe", null, stage);
el("div", "edge", null, wipe);
gsap.set(wipe, { yPercent: 100 });
function wipeAt(t) { // tenda che passa tra un capitolo e l'altro: t = istante in cui cambia scena
  M.fromTo(wipe, { yPercent: 100 }, { yPercent: 0, duration: 0.5, ease: "power3.in" }, t - 0.5);
  M.fromTo(wipe, { yPercent: 0 }, { yPercent: -100, duration: 0.55, ease: "power3.out" }, t);
}
function mkScene(i, t0, dur, bgIdx) {
  const s = el("div", "sc", null, stage);
  el("div", "bg", null, s).style.background = BGS[bgIdx];
  s.style.zIndex = 5;
  vis(s, t0, t0 + dur);
  return s;
}
function chapter(i) {
  const t0 = starts[i], c = CH[i], s = mkScene(i, t0, c.dur, i);
  wipeAt(t0);
  // numero gigante dietro, appena visibile
  const big = el("div", "bignum", String(i + 1).padStart(2, "0"), s);
  M.fromTo(big, { autoAlpha: 0, x: 80 }, { autoAlpha: 0.07, x: 0, duration: 1.4, ease: "power3.out" }, t0 + 0.3);
  // titolo del capitolo, grande
  const ttl = el("div", "ttl", null, s);
  const k = el("div", "k", `CAPITOLO ${i + 1} DI ${CH.length}`, ttl);
  const h = el("div", "h", null, ttl);
  const ws = words(h, c.n);
  const rule = el("div", "rule", null, ttl);
  vis(ttl, t0 + 0.1, t0 + 1.7);
  M.fromTo(k, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, t0 + 0.3);
  M.fromTo(ws, { yPercent: 120, rotation: 4 }, { yPercent: 0, rotation: 0, duration: 0.8, ease: "expo.out", stagger: 0.09 }, t0 + 0.35);
  M.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "expo.out" }, t0 + 0.6);
  M.fromTo(ws, { yPercent: 0 }, { yPercent: -125, duration: 0.4, ease: "power3.in", stagger: 0.04 }, t0 + 1.1);
  M.fromTo(k, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, t0 + 1.1);
  M.fromTo(rule, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, t0 + 1.1);
  // etichetta piccola in alto per il resto del capitolo
  const lab = el("div", "lab", `<b>${String(i + 1).padStart(2, "0")}</b> ${c.n}`, s);
  M.fromTo(lab, { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, t0 + 1.5);
  return s;
}
// didascalia in basso: «Passo n» + frase grande
function cap(s, t0, t1, kick, text, y = 1560) {
  const b = el("div", "cap", null, s); b.style.top = y + "px";
  el("div", "k", kick, b); const h = el("div", "h", null, b); const ws = words(h, text);
  vis(b, t0, t1);
  M.fromTo(b.firstChild, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power3.out" }, t0);
  M.fromTo(ws, { yPercent: 118, rotation: 3 }, { yPercent: 0, rotation: 0, duration: 0.7, ease: "expo.out", stagger: 0.055 }, t0 + 0.05);
  M.fromTo(b, { y: 0, opacity: 1 }, { y: -26, opacity: 0, duration: 0.3, ease: "power2.in" }, t1 - 0.3);
  return b;
}
// fumetto che indica un punto, in coordinate della scena
function callout(s, text, cx, by, t0, t1, flip) {
  const c = el("div", "call" + (flip ? " dn" : ""), text, s);
  gsap.set(c, { xPercent: -50, yPercent: flip ? 0 : -100 });
  c.style.left = cx + "px"; c.style.top = by + "px";
  M.fromTo(c, { autoAlpha: 0, scale: 0.5, y: flip ? -16 : 16 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(2.4)" }, t0);
  M.fromTo(c, { autoAlpha: 1 }, { autoAlpha: 0, scale: 0.9, duration: 0.25 }, t1 - 0.25);
  return c;
}

// ───────────────────────── dito e telefoni ─────────────────────────
function cursor(parent) {
  const c = el("div", "cur", `<div class="rip"></div><div class="dot"></div>`, parent);
  return c;
}
function curMove(c, x, y, t, d = 0.75, ease = "power3.inOut") { M.to(c, { x, y, duration: d, ease }, t); }
function curStart(c, x0, y0, x1, y1, t, d = 0.9) {
  M.fromTo(c, { autoAlpha: 0, x: x0, y: y0 }, { autoAlpha: 1, x: x1, y: y1, duration: d, ease: "power3.out" }, t);
}
function curEnd(c, t, d = 0.4) { M.fromTo(c, { autoAlpha: 1 }, { autoAlpha: 0, duration: d }, t); }
function tap(c, t) {
  const dot = c.querySelector(".dot"), rip = c.querySelector(".rip");
  M.fromTo(rip, { autoAlpha: 0 }, { autoAlpha: 0, duration: 0.001 }, t - 0.05);
  M.fromTo(dot, { scale: 1 }, { scale: 0.7, duration: 0.1, ease: "power2.out" }, t);
  M.to(dot, { scale: 1, duration: 0.3, ease: "back.out(3)" }, t + 0.1);
  M.fromTo(rip, { scale: 0.2, autoAlpha: 0.95 }, { scale: 1.6, autoAlpha: 0, duration: 0.6, ease: "power2.out" }, t);
}
function press(e, t) { M.fromTo(e, { scale: 1 }, { scale: 0.93, duration: 0.1, ease: "power2.out" }, t); M.to(e, { scale: 1, duration: 0.35, ease: "back.out(3)" }, t + 0.1); }

const NAVI = [
  ["Orari", `<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>`],
  ["Dipendenti", `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6M16 5.5a3 3 0 010 5.6M18 14.5c1.8.7 3 2.6 3 5.5"/>`],
  ["Menù", `<path d="M7 3h10c0 6-1.6 9.5-5 10.4C8.600 12.500 7 9 7 3zM12 13.500V20M8 21h8"/>`],
  ["Statistiche", `<path d="M5 20V12M12 20V5M19 20v-8"/>`],
];
// telefono col suo schermo; kind = "admin" (gestione) | "cust" (menù dei clienti)
function phone(s, X, Y, k, kind) {
  const ph = el("div", "ph", null, s); ph.style.left = X + "px"; ph.style.top = Y + "px";
  const body = el("div", "phone", null, ph); const scr = el("div", "scr " + kind, null, body);
  if (kind === "admin") el("div", "isl", null, scr);
  const o = { ph, scr, k, X, Y };
  if (kind === "admin") {
    scr.insertAdjacentHTML("beforeend", `<div class="hd"><img src="../jpg/logo.png" alt=""><div class="hic"><i class="g"></i><i class="tg"></i><i class="ex">Esci</i></div></div>`);
    o.pg = el("div", "pg", null, scr);
    const nav = el("div", "nav", NAVI.map(([n, d], i) => `<div class="${i === 2 ? "on" : ""}"><svg viewBox="0 0 24 24">${d}</svg>${n}</div>`).join(""), scr);
  }
  gsap.set(ph, { scale: k, transformOrigin: "0 0" });
  o.st = (x, y) => [X + 15 * k + x * k, Y + 15 * k + y * k]; // da coordinate schermo a coordinate scena
  return o;
}
// punto (centro) di un elemento dentro lo schermo, in coordinate del telefono intero (per il dito)
const at = (o, e) => pos(e, o.ph);
// telefono che entra dal basso
function phoneIn(o, t, d = 1.0, dy = 1100, rot = 0) {
  M.fromTo(o.ph, { autoAlpha: 0, y: dy, rotation: rot }, { autoAlpha: 1, y: 0, rotation: 0, duration: d, ease: "expo.out" }, t);
}
function tag(s, text, x, y, t, w) {
  const e = el("div", "tag", text, s); e.style.left = x + "px"; e.style.top = y + "px"; if (w) e.style.width = w + "px";
  rise(e, t, 14, 0.6, "power3.out"); return e;
}

// righe della lista in gestione
const row = (r) => `<div class="row${r.sold ? " sold" : ""}"><div class="rt"><div class="nm"><span class="n">${r.n}<s class="st"></s></span>${r.enom ? '<em class="en">ENOMATIC</em>' : ""}</div><div class="s1">${r.s1}</div><div class="s1">${r.s2}</div>${r.tags ? `<div class="s1 tg2">${r.tags}</div>` : ""}</div><div class="eb${r.sold ? " on" : ""}">Esaurito</div></div>`;
const ROWS = [
  { n: "Avignonesi", s1: "Da-Di · Toscana Igt", s2: "Calice 5 · Bottiglia 25", tags: "Biologico · Biodinamico · Vegano" },
  { n: "Castello del Trebbio", s1: "Le Anfore di Elena Casadei", s2: "Calice 7 · Bottiglia 35" },
  { n: "Le Macchiole", s1: "Bolgheri Rosso Doc", s2: "Calice 7 · Bottiglia 35" },
  { n: "Mastrojanni", enom: 1, s1: "Rosso di Montalcino", s2: "Calice 8 · Bottiglia 40" },
  { n: "Tenuta Argentiera", enom: 1, s1: "Villa Donoratico · Bolgheri Doc · 2023", s2: "Calice 10 · Bottiglia 50" },
  { n: "Aquila del Torre", s1: "Refosco dal Peduncolo Rosso", s2: "Calice 6 · Bottiglia 30" },
];

// ═════════════════════════ INTRO ═════════════════════════
{
  const s = el("div", "sc", null, stage); s.style.zIndex = 5;
  el("div", "bg", null, s).style.background = BGS[0];
  vis(s, 0, INTRO + 0.05);
  // anelli dorati che si disegnano
  const svg = el("div", "rings", `<svg viewBox="0 0 1080 1920"><circle cx="540" cy="780" r="330"/><circle cx="540" cy="780" r="420"/><path d="M60 1270h960" /></svg>`, s);
  const cs = svg.querySelectorAll("circle,path");
  M.fromTo(cs, { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.8, ease: "power2.inOut", stagger: 0.25 }, 0.1);
  const logo = el("img", "ilogo", null, s); logo.src = "../jpg/logo.png";
  M.fromTo(logo, { autoAlpha: 0, scale: 0.8, y: 30 }, { autoAlpha: 1, scale: 1, y: 0, duration: 1.3, ease: "expo.out" }, 0.35);
  const hd = el("div", "ihead", null, s);
  const ws = words(hd, "Il menù del locale, *sempre* aggiornato.");
  M.fromTo(ws, { yPercent: 120, rotation: 4 }, { yPercent: 0, rotation: 0, duration: 0.9, ease: "expo.out", stagger: 0.1 }, 1.3);
  const sub = el("div", "isub", `GUIDA ALLA GESTIONE · VERSIONE ${VERSION}`, s);
  fade(sub, 2.3, 0.7);
  // i sette capitoli, come icone che entrano
  const chips = el("div", "ichips", null, s);
  const ICONS = ["Esaurito", "Schede", "Aggiungi", "Eventi", "Ordine", "Storico", "QR"];
  const cels = CH.map((c, i) => el("div", "ichip", `<b>${i + 1}</b>${c.n}`, chips));
  M.fromTo(cels, { autoAlpha: 0, y: 40, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.8)", stagger: 0.18 }, 3.0);
}

// ═════════════════════════ 1 · ESAURITO IN UN TOCCO ═════════════════════════
{
  const i = 0, T = starts[i], s = chapter(i), k = 1.6;
  const world = el("div", "world", null, s);          // i due telefoni stanno in un «mondo» che la camera sposta
  const AX = (W - 420 * k) / 2, GAP = 130, BX = AX + 420 * k + GAP, PY = 250, PAN = -(BX - AX);
  const A = phone(world, AX, PY, k, "admin"), B = phone(world, BX, PY, k, "cust");
  A.pg.innerHTML = `<div class="srch">Cerca una voce del menù…</div><div class="chiudi">Chiudi tutti i gruppi</div><div class="grp"><div class="gh"><b>▾</b> Italia <span>· 9</span><div class="gi"><i></i><i></i><i></i><i></i></div></div>${ROWS.map(row).join("")}</div><div class="toast"><span>✓ «Avignonesi» segnata esaurita</span><u>Annulla</u></div>`;
  const rows = A.pg.querySelectorAll(".row"), r0 = rows[0], eb = r0.querySelector(".eb"), st = r0.querySelector(".st"), toast = A.pg.querySelector(".toast");
  // menù dei clienti a strati: sopra, riga, sotto (così la riga può sparire e il resto salire)
  const [rowY, rowH] = [ROW.y, ROW.h];
  const L = (img, top, h, off) => { const d = el("div", "lay", `<div class="in" style="height:${h}px"><img src="${img}" style="top:${-off}px"></div>`, B.scr); d.style.top = top + "px"; d.style.height = h + "px"; return d; };
  L(SHOTS["c-before"], 0, rowY, 0);
  const rowL = L(SHOTS["c-before"], rowY, rowH, rowY);
  const botL = L(SHOTS["c-after"], rowY, 780 - rowY, rowY);
  const botIn = botL.querySelector(".in");            // quello che scorre
  const stamp = el("div", "stamp", "ESAURITO", B.scr); stamp.style.top = rowY + 78 + "px";
  // entrata e cartellini
  phoneIn(A, T + 1.5, 1.0); vis(B.ph, T + 1.5);
  const lab = (text, x, t) => { const e = el("div", "tag", text, world); e.style.left = x + "px"; e.style.top = PY - 64 + "px"; e.style.width = 420 * k + "px"; rise(e, t, 14, 0.6, "power3.out"); };
  lab("IL TUO TELEFONO", AX, T + 2.2); lab("IL TELEFONO DEL CLIENTE", BX, T + 2.2);
  // dito sul pulsante «Esaurito» di Avignonesi
  const cur = cursor(A.ph); const [bx, by] = at(A, eb);
  const bS = [AX + bx * k, PY + by * k];
  curStart(cur, bx + 60, by + 560, bx + 50, by + 150, T + 2.5, 1.0);
  curMove(cur, bx, by, T + 3.45, 0.5);
  callout(world, "Tocca «Esaurito»", bS[0] - 90, bS[1] - 50, T + 3.0, T + 5.0);
  tap(cur, T + 4.0); press(eb, T + 4.0);
  M.fromTo(eb, { backgroundColor: "#ffffff", color: "#201c1e", borderColor: "#d9d1cc" }, { backgroundColor: "#c23b33", color: "#ffffff", borderColor: "#c23b33", duration: 0.25 }, T + 4.05);
  M.fromTo(r0, { backgroundColor: "rgba(243,236,234,0)" }, { backgroundColor: "rgba(243,236,234,1)", duration: 0.35 }, T + 4.05);
  M.fromTo(st, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power2.out" }, T + 4.1);
  M.fromTo(toast, { yPercent: 160, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: "back.out(1.8)" }, T + 4.2);
  M.fromTo(toast, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, T + 5.4);
  // la camera vola sul telefono del cliente, con il segnale «in diretta»
  const live = el("div", "live", `<svg viewBox="0 0 24 24"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg><b>subito</b>`, s);
  M.fromTo(live, { autoAlpha: 0, scale: 0.5, y: 30 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(2.2)" }, T + 4.55);
  M.fromTo(live, { autoAlpha: 1 }, { autoAlpha: 0, scale: 0.9, duration: 0.3 }, T + 5.85);
  M.fromTo(world, { x: 0 }, { x: PAN, duration: 0.95, ease: "power3.inOut" }, T + 4.9);
  // sul telefono del cliente: timbro, la riga sbiadisce, il resto sale
  M.fromTo(stamp, { autoAlpha: 0, scale: 2.4, rotation: -16 }, { autoAlpha: 1, scale: 1, rotation: -7, duration: 0.35, ease: "power4.in" }, T + 5.95);
  M.fromTo(rowL, { opacity: 1 }, { opacity: 0.3, duration: 0.5 }, T + 6.3);
  M.fromTo(stamp, { opacity: 1 }, { opacity: 0, duration: 0.35 }, T + 6.9);
  M.fromTo(rowL, { opacity: 0.3 }, { opacity: 0, duration: 0.4 }, T + 6.95);
  M.fromTo(botIn, { y: rowH }, { y: 0, duration: 0.85, ease: "power3.inOut" }, T + 7.1);
  // torna al telefono del titolare: secondo tocco, torna disponibile
  M.to(world, { x: 0, duration: 0.9, ease: "power3.inOut" }, T + 9.0);
  M.fromTo(cur, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, T + 9.4);
  tap(cur, T + 10.2); press(eb, T + 10.2);
  M.fromTo(eb, { backgroundColor: "#c23b33", color: "#ffffff", borderColor: "#c23b33" }, { backgroundColor: "#ffffff", color: "#201c1e", borderColor: "#d9d1cc", duration: 0.25 }, T + 10.25);
  M.fromTo(r0, { backgroundColor: "rgba(243,236,234,1)" }, { backgroundColor: "rgba(243,236,234,0)", duration: 0.35 }, T + 10.25);
  M.fromTo(st, { scaleX: 1 }, { scaleX: 0, duration: 0.3 }, T + 10.3);
  M.to(world, { x: PAN, duration: 0.9, ease: "power3.inOut" }, T + 11.0);
  M.fromTo(botIn, { y: 0 }, { y: rowH, duration: 0.8, ease: "power3.inOut" }, T + 12.0);
  M.fromTo(rowL, { opacity: 0 }, { opacity: 1, duration: 0.6 }, T + 12.4);
  curEnd(cur, T + 10.8, 0.3);
  cap(s, T + 2.4, T + 5.8, "PASSO 1 DI 3", "Un tocco su *«Esaurito»*", 1560);
  cap(s, T + 5.8, T + 9.1, "PASSO 2 DI 3", "I clienti lo vedono *subito*", 1560);
  cap(s, T + 9.1, T + 16.2, "PASSO 3 DI 3", "Un altro tocco e *torna in carta*", 1560);
}

// ═════════════════════════ 2 · QUATTRO SCHEDE ═════════════════════════
{
  const i = 1, T = starts[i], s = chapter(i);
  const CARDS = [
    ["Menù", "Sezioni, voci, esauriti, Oggi fuori menù", `<path d="M18 8h28c0 14-4 24-14 26-10-2-14-12-14-26zM32 34v18M22 54h20"/>`],
    ["Eventi e annunci", "Locandine, date, menù delle serate", `<rect x="10" y="14" width="44" height="40" rx="6"/><path d="M10 26h44M22 8v10M42 8v10M32 32l3 6 6.500 1-4.700 4.500 1.200 6.500L32 47l-6 3 1.200-6.500-4.700-4.500 6.500-1z"/>`],
    ["Orari e contatti", "Copertina, orari, contatti, coperto e avvisi", `<circle cx="32" cy="32" r="22"/><path d="M32 18v15l10 6"/>`],
    ["Strumenti", "Prezzi, ordine, storico, stampa, QR, guida", `<path d="M10 20h44M10 32h44M10 44h44"/><circle cx="24" cy="20" r="5.500" fill="#faf6f0"/><circle cx="42" cy="32" r="5.500" fill="#faf6f0"/><circle cx="28" cy="44" r="5.500" fill="#faf6f0"/>`],
  ];
  const grid = el("div", "tgrid", null, s);
  const cards = CARDS.map(([n, d, ic], j) => {
    const c = el("div", "tcard", `<svg viewBox="0 0 64 64">${ic}</svg><b>${n}</b><span>${d}</span><div class="ring"></div>`, grid);
    c.style.left = 60 + (j % 2) * 490 + "px"; c.style.top = 300 + Math.floor(j / 2) * 480 + "px";
    return c;
  });
  cards.forEach((c, j) => {
    const dir = [[-300, 0, -6], [300, 0, 6], [-300, 0, 5], [300, 0, -5]][j];
    M.fromTo(c, { autoAlpha: 0, x: dir[0], y: 120, rotation: dir[2] }, { autoAlpha: 1, x: 0, y: 0, rotation: 0, duration: 1.0, ease: "expo.out" }, T + 1.5 + j * 0.16);
    const path = c.querySelectorAll("svg path,svg circle,svg rect");
    M.fromTo(path, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.9, ease: "power2.inOut", stagger: 0.05 }, T + 1.9 + j * 0.16);
    // il riflettore passa da una scheda all'altra
    const t = T + 4.2 + j * 1.35;
    M.fromTo(c, { scale: 1 }, { scale: 1.045, duration: 0.35, ease: "power3.out" }, t);
    M.fromTo(c.querySelector(".ring"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, t);
    M.fromTo(c, { scale: 1.045 }, { scale: 1, duration: 0.35, ease: "power3.inOut" }, t + 1.15);
    M.fromTo(c.querySelector(".ring"), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, t + 1.1);
  });
  cap(s, T + 2.6, T + 9.7, "COME È FATTA", "Quello che cambi qui compare *subito* sul menù dei clienti", 1420);
}

// ═════════════════════════ 3 · AGGIUNGI UN VINO ═════════════════════════
{
  const i = 2, T = starts[i], s = chapter(i), k = 1.58;
  const P = phone(s, (W - 420 * k) / 2, 215, k, "admin");
  P.pg.innerHTML = `
    <div class="pgm"><h1>Menù</h1><p class="sub">Quello che cambi qui compare subito sul menù dei clienti (quello del QR).</p>
    <div class="btns"><span class="btn">Vedi menù ↗</span><span class="btn pri" id="addb">+ Aggiungi</span></div>
    <div class="tabs"><b class="on">Menù</b><b>Eventi e annunci</b><b>Orari e contatti</b><b>Strumenti</b></div>
    <div class="srch">Cerca una voce del menù…</div>
    <div class="oggi"><div class="oh"><b>Oggi fuori menù</b><em class="bd">2 oggi</em><span class="btn pri sm">+ Piatto</span><span class="btn pri sm">+ Vino</span></div>
      <div class="or"><div><small>PIATTO</small><b>Risotto ai porcini</b><span>€ 14</span></div><i class="btn sm">Togli</i></div>
      <div class="or"><div><small>VINO</small><b>Vermentino di Gallura</b><span>Calice 8 · Bottiglia 35</span></div><i class="btn sm">Togli</i></div></div></div>
    <div class="lst"><div class="chiudi">Chiudi tutti i gruppi</div><div class="grp"><div class="gh"><b>▾</b> Italia <span class="cnt">· 9</span><div class="gi"><i></i><i></i><i></i><i></i></div></div><div class="nwrap"></div>${ROWS.slice(0, 4).map(row).join("")}</div></div>
    <div class="dim"></div>
    <div class="sheet" id="sh1"><div class="sht"><span class="tt"><b class="shn t1">Che cosa vuoi aggiungere?</b><b class="shn t2">Un vino: in quale sezione?</b><b class="shn t3">In quale gruppo di «Rossi»?</b></span><i>✕</i></div>
      <div class="sbody"><div class="v v1">
        <div class="opt o1"><b>Un vino</b><span>Nella carta dei vini, al posto della sua regione.</span></div>
        <div class="opt"><b>Un piatto o una bevanda</b><span>Taglieri, tartare, bevande e le altre sezioni.</span></div>
        <div class="opt"><b>Il piatto di oggi</b><span>In «Oggi fuori menù»: sparisce da solo alle 5.</span></div>
        <div class="opt"><b>Il vino di oggi</b><span>In «Oggi fuori menù»: sparisce da solo alle 5.</span></div>
        <div class="opt"><b>Un evento</b><span>Locandina, date, orario e, se serve, il suo menù.</span></div>
        <div class="opt"><b>Un annuncio</b><span>Una riga sotto la copertina, es. «Lunedì chiusi per ferie».</span></div></div>
      <div class="v v2">
        <div class="opt"><b>Bollicine</b><span>Champagne · Metodo classico · Rifermentato in bottiglia</span></div>
        <div class="opt"><b>Bianchi</b><span>Italia · … dal mondo</span></div>
        <div class="opt o2"><b>Rossi</b><span>Italia · Estero</span></div>
        <div class="opt"><b>Rosé &amp; Orange</b><span>Rosé · Orange</span></div></div>
      <div class="v v3">
        <div class="opt o3"><b>Italia</b><span>9 voci</span></div>
        <div class="opt"><b>Estero</b><span>2 voci</span></div></div></div></div>
    <div class="sheet tall" id="shf"><div class="sht"><b class="shn">Nuovo vino</b><i>✕</i></div>
      <div class="fbody"><div class="fin">
        <div class="sec">IL VINO</div>
        <div class="fld" id="f1"><label>Azienda</label><div class="inp"><span class="ph0"></span><span class="val"></span></div></div>
        <div class="fld" id="f2"><label>Nome del vino (facoltativo)</label><div class="inp"><span class="ph0">es. Da-Di</span></div><small>Se il vino non ha un nome proprio, lascia vuoto.</small></div>
        <div class="two"><div class="fld" id="f3"><label>Denominazione</label><div class="inp"><span class="val"></span></div></div><div class="fld" id="f4"><label>Annata</label><div class="inp"><span class="val"></span></div></div></div>
        <div class="fld" id="f5"><label>Uvaggio</label><div class="inp"><span class="val"></span></div></div>
        <div class="sec">DA DOVE VIENE</div>
        <div class="two"><div class="fld" id="f6"><label>Regione</label><div class="inp"><span class="ph0">es. Toscana</span><span class="val"></span></div></div><div class="fld"><label>Nazione (vuota = Italia)</label><div class="inp"><span class="ph0">es. Italia</span></div></div></div>
        <div class="sec">PREZZI</div>
        <div class="two"><div class="fld" id="f7"><label>Calice (€)</label><div class="inp"><span class="val"></span></div></div><div class="fld" id="f8"><label>Bottiglia (€)</label><div class="inp"><span class="val"></span></div></div></div>
      </div></div>
      <div class="fbar"><span class="btn pri big" id="fadd">Aggiungi</span></div></div>
    <div class="toast"><span>✓ «Cantina del Borgo» aggiunto</span></div>`;
  const q = (sel) => P.pg.querySelector(sel);
  P.pg.querySelectorAll(".dim,.sheet").forEach((e) => P.scr.appendChild(e));
  const qs = (sel) => P.scr.querySelector(sel);
  const dim = qs(".dim"), sh1 = qs("#sh1"), shf = qs("#shf"), v1 = qs(".v1"), v2 = qs(".v2"), v3 = qs(".v3");
  const t1 = qs(".t1"), t2 = qs(".t2"), t3 = qs(".t3");
  const pgm = q(".pgm"), lst = q(".lst"), toast = q(".toast");
  // la pagina sotto: prima «Menù», poi la lista (dopo aver aggiunto)
  M.fromTo(lst, { autoAlpha: 0 }, { autoAlpha: 0, duration: 0.001 }, T);
  // il nuovo vino: riga che entra in cima al gruppo
  const nw = q(".nwrap");
  nw.innerHTML = row({ n: "Cantina del Borgo", s1: "Chianti Classico Docg · 2021", s2: "Calice 7 · Bottiglia 35" });
  const nrow = nw.firstChild; nrow.classList.add("fresh");
  // misure (con tutto nello stato «a riposo»)
  const addb = q("#addb"), o1 = qs(".o1"), o2 = qs(".o2"), o3 = qs(".o3"), fadd = qs("#fadd");
  const pAdd = at(P, addb), pO1 = at(P, o1), pO2 = at(P, o2), pO3 = at(P, o3), pFadd = at(P, fadd);
  const fl = {}; for (let j = 1; j <= 8; j++) fl[j] = qs("#f" + j);
  const pF1 = at(P, fl[1].querySelector(".inp"));
  const FS = 0; // la lista del modulo parte da 0
  const fin = qs(".fin");
  const fy = (j) => at(P, fl[j].querySelector(".inp"))[1];
  const scrollY = -Math.max(0, fin.offsetHeight - fin.parentElement.offsetHeight + 12);
  phoneIn(P, T + 1.25, 1.0, 1200);
  const cur = cursor(P.ph);
  curStart(cur, pAdd[0] + 80, pAdd[1] + 600, pAdd[0] + 30, pAdd[1] + 160, T + 2.2, 0.9);
  curMove(cur, pAdd[0], pAdd[1], T + 3.0, 0.5);
  const addS = P.st(pAdd[0] - 15, 0);
  callout(s, "Tocca «+ Aggiungi»", P.X + pAdd[0] * k - 20, P.Y + pAdd[1] * k - 50, T + 2.7, T + 4.2);
  cap(s, T + 2.4, T + 5.1, "PASSO 1 DI 4", "Tocca *«+ Aggiungi»*", 1560);
  tap(cur, T + 3.55); press(addb, T + 3.55);
  M.fromTo(dim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, T + 3.7);
  M.fromTo(sh1, { autoAlpha: 0, yPercent: 105 }, { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: "expo.out" }, T + 3.7);
  // sheet 1 → 2 → 3
  M.fromTo(v2, { autoAlpha: 0, x: 40 }, { autoAlpha: 0, x: 40, duration: 0.001 }, T + 3.7);
  M.fromTo(v3, { autoAlpha: 0, x: 40 }, { autoAlpha: 0, x: 40, duration: 0.001 }, T + 3.7);
  M.fromTo(t2, { autoAlpha: 0 }, { autoAlpha: 0, duration: 0.001 }, T + 3.7);
  M.fromTo(t3, { autoAlpha: 0 }, { autoAlpha: 0, duration: 0.001 }, T + 3.7);
  curMove(cur, pO1[0], pO1[1], T + 4.5, 0.6);
  cap(s, T + 5.1, T + 8.4, "PASSO 2 DI 4", "Scegli *«Un vino»*, la sezione e il gruppo", 1560);
  tap(cur, T + 5.2); press(o1, T + 5.2);
  M.fromTo(o1, { backgroundColor: "#fff" }, { backgroundColor: "#f4dfe3", duration: 0.2 }, T + 5.2);
  M.fromTo(v1, { autoAlpha: 1, x: 0 }, { autoAlpha: 0, x: -40, duration: 0.25, ease: "power2.in" }, T + 5.55);
  M.fromTo(v2, { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: 0.4, ease: "power3.out" }, T + 5.75);
  M.fromTo(t1, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, T + 5.55); M.fromTo(t2, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, T + 5.75);
  curMove(cur, pO2[0], pO2[1], T + 5.9, 0.55);
  tap(cur, T + 6.6); press(o2, T + 6.6);
  M.fromTo(o2, { backgroundColor: "#fff" }, { backgroundColor: "#f4dfe3", duration: 0.2 }, T + 6.6);
  M.fromTo(v2, { autoAlpha: 1, x: 0 }, { autoAlpha: 0, x: -40, duration: 0.25, ease: "power2.in" }, T + 6.95);
  M.fromTo(v3, { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: 0.4, ease: "power3.out" }, T + 7.15);
  M.fromTo(t2, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, T + 6.95); M.fromTo(t3, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, T + 7.15);
  curMove(cur, pO3[0], pO3[1], T + 7.2, 0.5);
  tap(cur, T + 7.75); press(o3, T + 7.75);
  M.fromTo(o3, { backgroundColor: "#fff" }, { backgroundColor: "#f4dfe3", duration: 0.2 }, T + 7.75);
  // modulo
  M.fromTo(shf, { autoAlpha: 0, yPercent: 105 }, { autoAlpha: 1, yPercent: 0, duration: 0.65, ease: "expo.out" }, T + 8.1);
  M.fromTo(sh1, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.001 }, T + 8.8);
  const f1p = at(P, fl[1].querySelector(".inp"));
  curMove(cur, f1p[0] - 40, f1p[1] + 8, T + 8.2, 0.6);
  cap(s, T + 8.4, T + 15.1, "PASSO 3 DI 4", "Scrivi i dati: *il resto lo fa lui*", 1560);
  tap(cur, T + 8.85);
  curEnd(cur, T + 9.1, 0.3);
  // scrittura campo per campo, con il bordo evidenziato
  const typed = (j, text, t, d, ph) => {
    const f = fl[j], inp = f.querySelector(".inp"), val = f.querySelector(".val"), p0 = f.querySelector(".ph0");
    typeInto(val, text, t, d);
    if (p0) M.fromTo(p0, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.05 }, t);
    M.fromTo(inp, { boxShadow: "0 0 0 0 rgba(138,39,64,0)", backgroundColor: "#efe9e5" }, { boxShadow: "0 0 0 3px rgba(138,39,64,.45)", backgroundColor: "#ffffff", duration: 0.15 }, t - 0.12);
    M.fromTo(inp, { boxShadow: "0 0 0 3px rgba(138,39,64,.45)", backgroundColor: "#ffffff" }, { boxShadow: "0 0 0 0 rgba(138,39,64,0)", backgroundColor: "#efe9e5", duration: 0.15 }, t + d + 0.12);
  };
  typed(1, "Cantina del Borgo", T + 9.2, 1.0);
  typed(3, "Chianti Classico Docg", T + 10.4, 1.1);
  typed(4, "2021", T + 11.6, 0.45);
  typed(5, "100% Sangiovese", T + 12.2, 0.9);
  M.fromTo(fin, { y: 0 }, { y: scrollY, duration: 0.7, ease: "power3.inOut" }, T + 13.1);
  typed(6, "Toscana", T + 13.9, 0.5);
  typed(7, "7", T + 14.6, 0.2);
  typed(8, "35", T + 14.95, 0.3);
  // «Aggiungi»
  const cur2 = cursor(P.ph);
  curStart(cur2, pFadd[0] + 120, pFadd[1] - 250, pFadd[0] + 20, pFadd[1] - 60, T + 15.2, 0.7);
  curMove(cur2, pFadd[0], pFadd[1], T + 15.9, 0.35);
  cap(s, T + 15.1, T + 17.9, "PASSO 4 DI 4", "Tocca *«Aggiungi»*", 1560);
  tap(cur2, T + 16.3); press(fadd, T + 16.3);
  M.fromTo(shf, { autoAlpha: 1, yPercent: 0 }, { autoAlpha: 0, yPercent: 105, duration: 0.55, ease: "power3.in" }, T + 16.55);
  M.fromTo(dim, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.4 }, T + 16.6);
  M.fromTo(pgm, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, T + 16.5);
  M.fromTo(lst, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, T + 16.5);
  curEnd(cur2, T + 16.5, 0.2);
  // il nuovo vino entra in cima, con un lampo
  M.fromTo(nrow, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.6, ease: "power3.out" }, T + 17.05);
  M.fromTo(nrow, { backgroundColor: "#f6e2a8" }, { backgroundColor: "rgba(246,226,168,0)", duration: 1.8, ease: "power2.out" }, T + 17.2);
  M.fromTo(toast, { yPercent: 160, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: "back.out(1.8)" }, T + 17.3);
  const chk = el("div", "bigchk", `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><path d="M19 33l9 9 17-19"/></svg>`, s);
  M.fromTo(chk, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "back.out(2)" }, T + 17.4);
  M.fromTo(chk.querySelectorAll("circle,path"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.7, ease: "power2.inOut", stagger: 0.2 }, T + 17.45);
  M.fromTo(chk, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.4 }, T + 20.8);
  cap(s, T + 17.9, T + 21.2, "FATTO", "È già sul *menù dei clienti*", 1560);
}

// ═════════════════════════ 4 · EVENTI E ANNUNCI ═════════════════════════
{
  const i = 3, T = starts[i], s = chapter(i), k = 1.6;
  const world = el("div", "world", null, s);
  const AX = (W - 420 * k) / 2, GAP = 130, BX = AX + 420 * k + GAP, PY = 250, PAN = -(BX - AX);
  const A = phone(world, AX, PY, k, "admin"), B = phone(world, BX, PY, k, "cust");
  A.pg.innerHTML = `<div class="pgm"><h1>Menù</h1><p class="sub">Quello che cambi qui compare subito sul menù dei clienti (quello del QR).</p>
    <div class="tabs"><b class="on" id="tab0">Menù</b><b id="tab1">Eventi e annunci</b><b>Orari e contatti</b><b>Strumenti</b></div></div>
    <div class="evp"><div class="ebtn"><span class="btn">Riordina</span><span class="btn">+ Nuovo annuncio</span><span class="btn pri">+ Nuovo evento</span></div>
    <div class="pills"><b class="pl on" id="pl0">Crudité &amp; Champagne</b><b class="pl" id="pl1">Lunedì 12 chiusi per ferie <em class="bd">IN CORSO</em></b><b class="pl" id="pl2">Oktoberfest <em class="bd">ANNUNCIATO</em></b></div>
    <div class="ecard"><div class="ec c0"><img src="../jpg/locandina-crudite.png"><div class="ex"><div><em class="bd g">IN CORSO</em> <small>SERATA CON IL PRODUTTORE</small></div><h3>Crudité &amp; Champagne</h3><div class="d">4 ottobre</div><p>Locandina in «in evidenza» dal giorno scelto.</p></div></div>
      <div class="ec c1"><div class="ex"><div><em class="bd g">IN CORSO</em> <small>ANNUNCIO</small></div><h3>Lunedì 12 chiusi per ferie</h3><div class="d">4–14 ottobre</div><p>Una riga sotto la copertina del menù dei clienti.</p></div></div>
      <div class="ec c2"><img src="../jpg/locandina-oktoberfest.png"><div class="ex"><div><em class="bd">ANNUNCIATO</em> <small>BIRRE, CIBO E MUSICA</small></div><h3>Oktoberfest</h3><div class="d">12–13 ottobre</div><p>Compare in «in evidenza» dal giorno scelto.</p></div></div>
      <div class="eact"><span class="btn sm">Modifica</span><span class="btn sm">Duplica</span><span class="btn sm">Nascondi</span><span class="btn sm">Apri la pagina ↗</span><span class="btn sm">Elimina</span></div></div></div>`;
  const q = (sel) => A.pg.querySelector(sel);
  const pgm = q(".pgm"), evp = q(".evp"), cards = [".c0", ".c1", ".c2"].map((x) => q(x));
  const tab1 = q("#tab1"), pl0 = q("#pl0"), pl1 = q("#pl1"), pl2 = q("#pl2");
  const pT1 = at(A, tab1), pl1p = at(A, pl1), pl2p = at(A, pl2);
  M.fromTo(evp, { autoAlpha: 0 }, { autoAlpha: 0, duration: 0.001 }, T);
  cards.forEach((c, j) => M.fromTo(c, { autoAlpha: j === 0 ? 1 : 0 }, { autoAlpha: j === 0 ? 1 : 0, duration: 0.001 }, T));
  // menù dei clienti: in cima c'è l'avviso; più giù la locandina «in evidenza»
  const imgTop = el("img", "full", null, B.scr); imgTop.src = SHOTS["c-top"];
  const imgEv = el("img", "full", null, B.scr); imgEv.src = SHOTS["c-evidenza"];
  const bnR = el("div", "bnring", null, B.scr), evR = el("div", "evring", null, B.scr);
  M.fromTo(imgEv, { autoAlpha: 0 }, { autoAlpha: 0, duration: 0.001 }, T);
  phoneIn(A, T + 1.5, 1.0); vis(B.ph, T + 1.5);
  const lab = (text, x, t) => { const e = el("div", "tag", text, world); e.style.left = x + "px"; e.style.top = PY - 64 + "px"; e.style.width = 420 * k + "px"; rise(e, t, 14, 0.6, "power3.out"); };
  lab("IL TUO TELEFONO", AX, T + 2.2); lab("IL TELEFONO DEL CLIENTE", BX, T + 2.2);
  const cur = cursor(A.ph);
  curStart(cur, pT1[0] + 80, pT1[1] + 560, pT1[0] + 40, pT1[1] + 110, T + 2.5, 0.9);
  curMove(cur, pT1[0], pT1[1], T + 3.3, 0.5);
  cap(s, T + 2.4, T + 5.1, "PASSO 1 DI 3", "Apri la scheda *«Eventi e annunci»*", 1560);
  tap(cur, T + 3.85); press(tab1, T + 3.85);
  M.fromTo(tab1, { backgroundColor: "#f1ebe6" }, { backgroundColor: "#ecd7dc", duration: 0.2 }, T + 3.9);
  M.fromTo(q("#tab0"), { backgroundColor: "#ecd7dc" }, { backgroundColor: "#f1ebe6", duration: 0.2 }, T + 3.9);
  M.fromTo(pgm.querySelector(".sub"), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, T + 3.9);
  M.fromTo(evp, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, T + 4.2);
  // 1) un annuncio → compare in cima al menù
  curMove(cur, pl1p[0], pl1p[1], T + 4.6, 0.55);
  cap(s, T + 5.1, T + 8.6, "PASSO 2 DI 3", "Un annuncio compare *in cima al menù*", 1560);
  tap(cur, T + 5.3); press(pl1, T + 5.3);
  M.fromTo(pl1, { backgroundColor: "#ffffff", color: "#201c1e" }, { backgroundColor: "#8a2740", color: "#ffffff", duration: 0.2 }, T + 5.35);
  M.fromTo(pl0, { backgroundColor: "#8a2740", color: "#ffffff" }, { backgroundColor: "#ffffff", color: "#201c1e", duration: 0.2 }, T + 5.35);
  M.fromTo(cards[0], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, T + 5.4);
  M.fromTo(cards[1], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power3.out" }, T + 5.5);
  M.fromTo(world, { x: 0 }, { x: PAN, duration: 0.95, ease: "power3.inOut" }, T + 6.0);
  M.fromTo(bnR, { autoAlpha: 0, scale: 1.08 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, T + 7.0);
  M.fromTo(bnR, { boxShadow: "0 0 0 0 rgba(212,175,106,.8)" }, { boxShadow: "0 0 0 18px rgba(212,175,106,0)", duration: 0.8, ease: "power2.out", repeat: 1, repeatDelay: 0.05 }, T + 7.1);
  M.fromTo(bnR, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, T + 8.7);
  callout(world, "Compare in cima al menù", BX + (15 + 195) * k, PY + (15 + 582) * k - 14, T + 7.1, T + 8.9);
  // 2) un evento → in evidenza, con la locandina
  M.to(world, { x: 0, duration: 0.9, ease: "power3.inOut" }, T + 8.7);
  curMove(cur, pl2p[0], pl2p[1], T + 8.8, 0.5);
  cap(s, T + 8.6, T + 14.3, "PASSO 3 DI 3", "Un evento va *in evidenza*", 1560);
  tap(cur, T + 9.9); press(pl2, T + 9.9);
  M.fromTo(pl2, { backgroundColor: "#ffffff", color: "#201c1e" }, { backgroundColor: "#8a2740", color: "#ffffff", duration: 0.2 }, T + 9.95);
  M.fromTo(pl1, { backgroundColor: "#8a2740", color: "#ffffff" }, { backgroundColor: "#ffffff", color: "#201c1e", duration: 0.2 }, T + 9.95);
  M.fromTo(cards[1], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, T + 10.0);
  M.fromTo(cards[2], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power3.out" }, T + 10.1);
  curEnd(cur, T + 10.5, 0.3);
  M.to(world, { x: PAN, duration: 0.95, ease: "power3.inOut" }, T + 10.6);
  M.fromTo(imgEv, { autoAlpha: 0, y: 780 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.inOut" }, T + 11.0);
  M.fromTo(imgTop, { y: 0 }, { y: -780, duration: 0.8, ease: "power3.inOut" }, T + 11.0);
  M.fromTo(evR, { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, T + 11.9);
  M.fromTo(evR, { boxShadow: "0 0 0 0 rgba(212,175,106,.8)" }, { boxShadow: "0 0 0 18px rgba(212,175,106,0)", duration: 0.8, ease: "power2.out", repeat: 1, repeatDelay: 0.05 }, T + 12.0);
  callout(world, "In evidenza, con la locandina", BX + (15 + 195) * k, PY + (15 + 246) * k + 16, T + 12.0, T + 14.3, true);
}

// ═════════════════════════ finestra (capitoli 5 e 6) ═════════════════════════
function dialog(s, w, h, title, x, y, scale) {
  const d = el("div", "dlg", `<div class="dh"><b>${title}</b><i>✕</i></div><div class="db"></div>`, s);
  d.style.width = w + "px"; d.style.height = h + "px"; d.style.left = x + "px"; d.style.top = y + "px";
  gsap.set(d, { scale, transformOrigin: "0 0" });
  return d;
}

// ═════════════════════════ 5 · DECIDI L'ORDINE ═════════════════════════
{
  const i = 4, T = starts[i], s = chapter(i), k = 2.0;
  const w = 450, h = 372, X = (W - w * k) / 2, Y = 300;
  const d = dialog(s, w, h, "Riordina", X, Y, k);
  const db = d.querySelector(".db");
  db.innerHTML = `<div class="seg2"><b>Menù</b><b class="on">Eventi e annunci</b></div><p class="hint">L’ordine in «in evidenza», da sinistra a destra. Nel giorni dell’evento la sua pagina si apre comunque in cima al menù.</p>
    <div class="rl"></div><div class="sv"><span class="btn pri big dis">Salva ordine</span></div>`;
  db.querySelector(".hint").textContent = "L’ordine in «in evidenza», da sinistra a destra. Nei giorni dell’evento la sua pagina si apre in cima al menù.";
  const rl = db.querySelector(".rl");
  const ITEMS = [["Crudité & Champagne", "4 ottobre · in corso"], ["Lunedì 12 chiusi per ferie", "4–14 ottobre · in corso"], ["Oktoberfest", "12–13 ottobre · annunciato"]];
  const RH = 60;
  const els = ITEMS.map((it, j) => { const r = el("div", "rr", `<span class="grip">≡</span><div><b>${it[0].replace("&", "&amp;")}</b><small>${it[1]}</small></div><div class="ar"><i class="up">↑</i><i class="dn">↓</i></div>`, rl); r.style.top = j * RH + "px"; return r; });
  rl.style.height = RH * 3 + "px";
  // le tre locandine sotto, che si riordinano insieme
  const strip = el("div", "strip", null, s);
  const labels = ["Crudité & Champagne", "Lunedì 12 chiusi per ferie", "Oktoberfest"];
  const chips = labels.map((l, j) => { const c = el("div", "sch", `${l.replace("&", "&amp;")}`, strip); c.style.left = j * 330 + "px"; return c; });
  tag(s, "L’ORDINE CHE VEDONO I CLIENTI", 60, 1110, T + 2.4, 960);
  // posizioni
  gsap.set(chips, {});
  const saveBtn = db.querySelector(".sv .btn");
  const up2 = els[2].querySelector(".up");
  const [u0x, u0y] = pos(up2, d); // coordinate nel dialogo (senza scala)
  const dc = (x, y) => [X + x * k, Y + y * k];
  M.fromTo(d, { autoAlpha: 0, y: 160, scale: k * 0.9 }, { autoAlpha: 1, y: 0, scale: k, duration: 0.9, ease: "expo.out" }, T + 1.3);
  M.fromTo(strip, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: "expo.out" }, T + 1.8);
  const cur = cursor(s);
  const c0 = dc(u0x, u0y);
  curStart(cur, c0[0] + 200, c0[1] + 500, c0[0] + 30, c0[1] + 120, T + 2.2, 0.9);
  curMove(cur, c0[0], c0[1], T + 3.0, 0.5);
  cap(s, T + 2.4, T + 6.0, "PASSO 1 DI 2", "Con le *frecce ↑ ↓* sposti le voci", 1450);
  // primo ↑: Oktoberfest (riga 3) sale in seconda posizione
  const sw = (a, b, t) => { // a sale, b scende
    M.fromTo(a, { y: a.__y }, { y: a.__y - RH, duration: 0.45, ease: "power3.inOut" }, t); M.fromTo(b, { y: b.__y }, { y: b.__y + RH, duration: 0.45, ease: "power3.inOut" }, t);
    a.__y -= RH; b.__y += RH;
  };
  els.forEach((e) => (e.__y = 0));
  tap(cur, T + 3.6); press(up2, T + 3.6);
  sw(els[2], els[1], T + 3.7);
  M.fromTo(chips[2], { x: 0 }, { x: -330, duration: 0.55, ease: "power3.inOut" }, T + 3.7); M.fromTo(chips[1], { x: 0 }, { x: 330, duration: 0.55, ease: "power3.inOut" }, T + 3.7);
  curMove(cur, c0[0], c0[1] - RH * k, T + 4.3, 0.4);
  tap(cur, T + 4.8); press(up2, T + 4.8);
  sw(els[2], els[0], T + 4.9);
  M.fromTo(chips[2], { x: -330 }, { x: -660, duration: 0.55, ease: "power3.inOut" }, T + 4.9); M.fromTo(chips[0], { x: 0 }, { x: 330, duration: 0.55, ease: "power3.inOut" }, T + 4.9);
  // il pulsante «Salva ordine» si accende, tocco
  M.fromTo(saveBtn, { opacity: 0.4 }, { opacity: 1, duration: 0.3 }, T + 5.0);
  const [sx, sy] = pos(saveBtn, d); const sc = dc(sx, sy);
  curMove(cur, sc[0], sc[1], T + 5.55, 0.6);
  cap(s, T + 6.0, T + 9.3, "PASSO 2 DI 2", "Tocca *«Salva ordine»*", 1450);
  tap(cur, T + 6.3); press(saveBtn, T + 6.3);
  M.fromTo(d, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: 40, duration: 0.4, ease: "power2.in" }, T + 6.7);
  M.fromTo(strip, { scale: 1 }, { scale: 1.0, duration: 0.01 }, T + 6.7);
  curEnd(cur, T + 6.6, 0.3);
  // la fila ordinata resta in vista e si illumina
  M.fromTo(chips, { backgroundColor: "#faf6f0" }, { backgroundColor: "#f6e2a8", duration: 0.25, stagger: 0.12 }, T + 6.9);
  M.fromTo(chips, { backgroundColor: "#f6e2a8" }, { backgroundColor: "#faf6f0", duration: 0.6 }, T + 7.7);
}

// ═════════════════════════ 6 · STORICO ═════════════════════════
{
  const i = 5, T = starts[i], s = chapter(i), k = 2.0;
  const w = 450, h = 292, X = (W - w * k) / 2, Y = 320;
  const d = dialog(s, w, h, "Storico modifiche", X, Y, k);
  const db = d.querySelector(".db");
  db.innerHTML = `<div class="hl"></div>`;
  const hl = db.querySelector(".hl");
  const RH = 62;
  const LOG = [["Segnato esaurito: <b>Pol Roger</b>"], ["Segnato esaurito: <b>Henriot</b>"], ["Segnato esaurito: <b>De Villepin</b>"]];
  const newRow = el("div", "lg new", `<div><span>Ripristinato: <b>Pol Roger</b></span><small>Andrea · 04/10, 18:58</small></div><i class="bg2">Annullata</i>`, hl); newRow.querySelector(".bg2").style.display = "none";
  newRow.querySelector(".bg2").remove();
  const rows = LOG.map((l, j) => { const r = el("div", "lg", `<div><span>${l[0]}</span><small>Andrea · 04/10, 18:56</small></div><i class="rb">Ripristina</i>`, hl); r.style.top = j * RH + "px"; return r; });
  newRow.style.top = "0px";
  hl.style.height = RH * 4 + "px";
  rows.forEach((r) => (r.__y = 0));
  // nel punto di partenza, la lista è: 3 righe (pos 0..2); dopo il ripristino la nuova riga è in cima e le altre scendono
  const rb0 = rows[0].querySelector(".rb"); const [rx, ry] = pos(rb0, d);
  const dc = (x, y) => [X + x * k, Y + y * k];
  const p0 = dc(rx, ry);
  M.fromTo(d, { autoAlpha: 0, y: 160 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "expo.out" }, T + 1.3);
  const cur = cursor(s);
  curStart(cur, p0[0] + 200, p0[1] + 500, p0[0] + 40, p0[1] + 120, T + 2.2, 0.9);
  curMove(cur, p0[0], p0[1], T + 3.0, 0.5);
  callout(s, "Tocca «Ripristina»", p0[0] - 60, p0[1] - 50, T + 2.9, T + 4.3);
  cap(s, T + 2.4, T + 5.8, "PASSO 1 DI 2", "Apri *«Storico»* e trova la modifica", 1400);
  tap(cur, T + 3.7); press(rb0, T + 3.7);
  // la riga diventa «Annullata», entra la nuova in cima
    const bdg = el("i", "bg2", "Annullata", rows[0]); bdg.style.cssText = "position:absolute;right:0;top:50%;margin-top:-17px";
  M.fromTo(rb0, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, T + 3.85);
  M.fromTo(bdg, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, T + 3.9);
  rows.forEach((r, j) => M.fromTo(r, { y: 0 }, { y: RH, duration: 0.55, ease: "power3.inOut" }, T + 4.2));
  M.fromTo(newRow, { autoAlpha: 0, y: -20, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.6)" }, T + 4.35);
  M.fromTo(newRow, { backgroundColor: "#f6e2a8" }, { backgroundColor: "rgba(246,226,168,0)", duration: 1.6, ease: "power2.out" }, T + 4.4);
  const toast = el("div", "toast2", "✓ Modifica annullata", s);
  M.fromTo(toast, { autoAlpha: 0, y: 60, scale: 0.8 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(2)" }, T + 4.7);
  M.fromTo(toast, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, T + 8.8);
  curEnd(cur, T + 4.4, 0.3);
  // freccia di «annulla» che gira
  const un = el("div", "undo", `<svg viewBox="0 0 64 64"><path d="M22 18L12 28l10 10"/><path d="M12 28h26a14 14 0 010 28H26"/></svg>`, s);
  M.fromTo(un, { autoAlpha: 0, scale: 0.4, rotation: -90 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.8, ease: "back.out(1.8)" }, T + 5.0);
  M.fromTo(un.querySelectorAll("path"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.8, ease: "power2.inOut", stagger: 0.2 }, T + 5.05);
  M.fromTo(un, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, T + 8.8);
  cap(s, T + 5.8, T + 9.3, "PASSO 2 DI 2", "Tocca *«Ripristina»*: torna com’era", 1400);
}

// ═════════════════════════ 7 · STRUMENTI E QR ═════════════════════════
{
  const i = 6, T = starts[i], s = chapter(i);
  const TOOLS = [
    ["Tabella prezzi", "Cambia tanti prezzi insieme, anche di sezioni diverse, e salva una volta sola."],
    ["Riordina", "L’ordine di sezioni, gruppi, voci ed eventi sul menù."],
    ["Storico", "Tutte le modifiche, con chi le ha fatte: si può tornare indietro."],
    ["Anteprima", "Il menù come lo vede il cliente, anche in un giorno scelto."],
    ["Menù da stampare", "Foglio A4 sempre aggiornato, da stampare o salvare in PDF."],
    ["Codice QR", "Il QR del menù da stampare (SVG e PNG)."],
  ];
  const grid = el("div", "tools", null, s);
  const tiles = TOOLS.map(([n, d], j) => { const t = el("div", "tool" + (j === 5 ? " qr" : ""), `<b>${n}</b><span>${d}</span>`, grid); t.style.left = 60 + (j % 2) * 490 + "px"; t.style.top = 300 + Math.floor(j / 2) * 285 + "px"; return t; });
  tiles.forEach((t, j) => M.fromTo(t, { autoAlpha: 0, y: 100, scale: 0.92 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, ease: "expo.out" }, T + 1.4 + j * 0.12));
  vis(grid, T + 1.3, T + 4.75);
  cap(s, T + 2.4, T + 4.8, "TUTTO A PORTATA DI MANO", "Prezzi, storico, stampa e *codice QR*", 1290);
  // il riquadro del QR si ingrandisce nella finestra
  const qt = tiles[5];
  M.fromTo(qt, { scale: 1, backgroundColor: "#faf6f0" }, { scale: 1.06, backgroundColor: "#f6e2a8", duration: 0.4, ease: "power3.out" }, T + 3.9);
  const cur = cursor(s);
  curStart(cur, 900, 1500, 800, 1000, T + 3.0, 0.9);
  curMove(cur, 800, 790, T + 3.5, 0.45);
  tap(cur, T + 4.2); curEnd(cur, T + 4.7, 0.3);
  const dq = el("div", "qdlg", `<div class="dh"><b>Codice QR del menù</b><i>✕</i></div><div class="qbox"><img src="../jpg/qr-prod.png"></div><div class="url">https://orari-turni.vercel.app/menu</div><div class="two2"><span class="btn pri">Nero</span><span class="btn">Bordeaux</span></div><div class="two2"><span class="btn pri">Scarica SVG</span><span class="btn">Scarica PNG</span></div>`, s);
  M.fromTo(dq, { autoAlpha: 0, scale: 0.85, y: 80 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: "expo.out" }, T + 4.8);
  M.fromTo(dq, { autoAlpha: 1, x: 0 }, { autoAlpha: 0, x: -200, scale: 0.9, duration: 0.45, ease: "power3.in" }, T + 7.0);
  M.fromTo(s.querySelector(".qdlg img"), { scale: 1 }, { scale: 1, duration: 0.01 }, T);
  cap(s, T + 5.3, T + 7.6, "IL CODICE QR", "Stampalo: *non cambia mai*", 1580);
  // il cliente inquadra
  const P = phone(s, (W - 420 * 1.35) / 2, 330, 1.35, "cust");
  const cam = el("div", "cam", `<div class="qrcard"><img src="../jpg/qr-prod.png"></div><div class="vf"><i></i><i></i><i></i><i></i></div><div class="laser"></div><div class="banner"><b>Safari</b><span>Apri «orari-turni.vercel.app»</span></div><div class="flash"></div>`, P.scr);
  const menuImg = el("img", "full", null, P.scr); menuImg.src = SHOTS["c-top"];
  M.fromTo(menuImg, { autoAlpha: 0 }, { autoAlpha: 0, duration: 0.001 }, T);
  M.fromTo(P.ph, { autoAlpha: 0, y: 900, rotation: 5 }, { autoAlpha: 1, y: 0, rotation: 0, duration: 1.0, ease: "expo.out" }, T + 7.3);
  M.fromTo(P.ph, { autoAlpha: 1 }, { autoAlpha: 1, duration: 0.01 }, T + 7.3);
  M.fromTo(cam.querySelector(".qrcard"), { scale: 0.7, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.6, ease: "back.out(1.6)" }, T + 8.1);
  M.fromTo(cam.querySelector(".laser"), { y: 140, autoAlpha: 0 }, { y: 430, autoAlpha: 1, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: 1 }, T + 8.5);
  M.fromTo(cam.querySelector(".flash"), { autoAlpha: 0 }, { autoAlpha: 0.9, duration: 0.15 }, T + 10.2);
  M.fromTo(cam.querySelector(".flash"), { autoAlpha: 0.9 }, { autoAlpha: 0, duration: 0.5 }, T + 10.35);
  M.fromTo(cam.querySelector(".banner"), { yPercent: -160, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.55, ease: "back.out(1.6)" }, T + 10.5);
  M.fromTo(menuImg, { autoAlpha: 0, scale: 1.04 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "power2.out" }, T + 11.4);
  M.fromTo(cam, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5 }, T + 11.6);
  cap(s, T + 8.2, T + 13.2, "IL CLIENTE", "Inquadra e trova il *menù aggiornato*", 1600);
}

// ═════════════════════════ OUTRO ═════════════════════════
{
  const T = starts[CH.length - 1] + CH[CH.length - 1].dur;
  const s = el("div", "sc", null, stage); s.style.zIndex = 5;
  el("div", "bg", null, s).style.background = BGS[0];
  vis(s, T, END + 0.1);
  wipeAt(T);
  const svg = el("div", "rings", `<svg viewBox="0 0 1080 1920"><circle cx="540" cy="760" r="330"/><circle cx="540" cy="760" r="420"/></svg>`, s);
  M.fromTo(svg.querySelectorAll("circle"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.6, ease: "power2.inOut", stagger: 0.2 }, T + 0.3);
  const h = el("div", "ohead", null, s);
  const ws = words(h, "Ora *tocca* a te.");
  M.fromTo(ws, { yPercent: 120, rotation: 4 }, { yPercent: 0, rotation: 0, duration: 0.9, ease: "expo.out", stagger: 0.12 }, T + 0.6);
  const tip = el("div", "otip", `Quando hai un dubbio:<br><b>Menù → Strumenti → Guida (PDF)</b>`, s);
  rise(tip, T + 1.8, 30, 0.8);
  const lg = el("img", "olog", null, s); lg.src = "../jpg/logo.png";
  M.fromTo(lg, { autoAlpha: 0, y: 30, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.1, ease: "expo.out" }, T + 2.4);
  const v = el("div", "isub ov", `GUIDA ALLA GESTIONE DEL MENÙ · VERSIONE ${VERSION}`, s);
  fade(v, T + 3.2, 0.7);
}

// ───────────────────────── barra di avanzamento in alto (7 capitoli) ─────────────────────────
{
  const hud = el("div", "hud", null, stage); hud.style.zIndex = 20;
  const segs = CH.map(() => el("div", "seg", "<i></i>", hud));
  vis(hud, starts[0] + 0.6, starts[CH.length - 1] + CH[CH.length - 1].dur - 0.1);
  CH.forEach((c, i) => M.fromTo(segs[i].firstChild, { scaleX: 0 }, { scaleX: 1, duration: c.dur - 0.8, ease: "none" }, starts[i] + 0.7));
}
wipe.style.zIndex = 30; stage.appendChild(wipe);

// ───────────────────────── avvio ─────────────────────────
window.fit = () => {}; window.M = M;
M.time(END, false); M.time(0, false); // un giro avanti e indietro: ogni cosa prende il suo stato iniziale
window.render = (t) => { M.time(Math.min(Math.max(t, 0), END), false); };
M.time(0, false);
