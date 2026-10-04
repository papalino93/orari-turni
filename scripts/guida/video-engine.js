// Motore del video (gira nel browser): window.render(t) disegna il fotogramma al secondo t.
// Tutto è deterministico: nessun timer, nessuna animazione CSS. Lo include video-build.mjs
// (che prima definisce CFG = { SCENES, G, SIZE, BOX, INTRO, OUTRO, VERSION }).
const { SCENES, G, SIZE, BOX, INTRO, OUTRO } = CFG;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };                 // morbida
const easeIO = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
const outBack = (x) => { x = clamp(x); const c = 1.35; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const $ = (id) => document.getElementById(id);
const px = (n) => n + "px";

// durate e partenze
const starts = []; let acc = INTRO;
for (const s of SCENES) { starts.push(acc); acc += s.dur; }
window.TOTAL = acc + OUTRO;

const center = (name) => { const b = BOX[name]; return [b.x + b.w / 2, b.y + b.h / 2]; };
// i bersagli della camera: nome di un riquadro oppure [x, y]
for (const s of SCENES) {
  s.kf = s.cam.map((k) => { const c = typeof k[1] === "string" ? center(k[1]) : k[1]; return { t: k[0], cx: c[0], cy: c[1], s: k[2] }; });
  s.caps = []; for (const st of s.steps) if (!s.caps.includes(st.cap[0] + "|" + st.cap[1])) s.caps.push(st.cap[0] + "|" + st.cap[1]);
  // segni: ogni tocco e ogni nota evidenziano un riquadro per un po'
  s.marks = [...(s.taps || []).map((x) => ({ ...x, tap: true, t0: x.t - 1.3, t1: x.t + 0.55 })), ...(s.notes || []).map((x) => ({ ...x, tap: false }))];
}
function camAt(kf, t) {
  if (t <= kf[0].t) return kf[0];
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (t >= a.t && t <= b.t) { const u = easeIO((t - a.t) / (b.t - a.t)); return { cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), s: a.s * Math.pow(b.s / a.s, u) }; }
  }
  return kf[kf.length - 1];
}
function vis(el, op) { el.style.display = op > 0.002 ? "block" : "none"; el.style.opacity = op; }

// titoli lunghi: rimpiccioliti finché stanno in una riga
window.fit = () => {
  document.querySelectorAll(".scene").forEach((sc) => {
    const sp = sc.querySelector(".ttl span"); if (!sp) return;
    sc.style.display = "block"; sc.style.visibility = "hidden";
    let fs = 96; sp.style.fontSize = fs + "px";
    while (sp.scrollWidth > 936 && fs > 50) { fs -= 2; sp.style.fontSize = fs + "px"; }
    sc.style.display = ""; sc.style.visibility = "";
  });
};

const bar = document.querySelectorAll("#prog i b");
const glow = $("glow"), prog = $("prog");

window.render = (t) => {
  // luce di fondo che respira piano
  // (il fondo sta fermo: ogni movimento in più pesa molto sul file)
  let progress = null;

  // ---------- introduzione ----------
  const intro = $("intro");
  const iOut = 1 - ease((t - (INTRO - 0.7)) / 0.7);
  vis(intro, t < INTRO ? iOut : 0);
  if (t < INTRO) {
    const lg = intro.querySelector(".logo");
    lg.style.opacity = ease(t / 1.1); lg.style.transform = "scale(" + (0.9 + 0.1 * outCubic(t / 1.8)) + ")";
    const lw = outCubic((t - 0.5) / 1.2);
    intro.querySelectorAll(".rule i").forEach((e) => { e.style.width = px(300 * lw); });
    intro.querySelector(".rule b").style.opacity = ease((t - 0.9) / 0.5);
    intro.querySelectorAll(".mask span").forEach((e, k) => { const u = outCubic((t - 1.1 - k * 0.22) / 0.9); e.style.transform = "translateY(" + (1 - u) * 118 + "%)"; });
    const sub = intro.querySelector(".sub"); const su = ease((t - 2.1) / 0.8); sub.style.opacity = su; sub.style.transform = "translateY(" + (1 - su) * 16 + "px)";
    [["i-lap", 2.3], ["i-tab", 3.0], ["i-pho", 3.6]].forEach(([id, at], k) => {
      const e = $(id), u = outBack((t - at) / 1.1), fl = Math.sin(t * 1.1 + k * 2) * 7;
      e.style.opacity = ease((t - at) / 0.45);
      e.style.transform = "translateY(" + ((1 - u) * 260 + fl) + "px) scale(" + (0.9 + 0.1 * u) + ")";
    });
    const ver = intro.querySelector(".ver"); ver.style.opacity = ease((t - 4.4) / 0.8);
  }

  // ---------- capitoli ----------
  SCENES.forEach((s, i) => {
    const el = $("s" + i), lt = t - starts[i];
    if (lt < 0 || lt > s.dur) { el.style.display = "none"; return; }
    const g = G[s.dev], sh = SIZE[s.dev];
    const exit = ease((lt - (s.dur - 0.5)) / 0.5);
    el.style.display = "block"; el.style.opacity = ease(lt / 0.35) * (1 - exit);
    progress = i + clamp(lt / s.dur);

    // intestazione
    const hd = el.querySelector(".hd");
    hd.querySelector(".kick").style.opacity = ease(lt / 0.5);
    hd.querySelector(".ttl span").style.transform = "translateY(" + (1 - outCubic((lt - 0.12) / 0.85)) * 118 + "%)";
    const badge = hd.querySelector(".badge"); badge.style.opacity = ease((lt - 0.4) / 0.6);
    const wm = el.querySelector(".wm"); wm.style.opacity = 0.075 * ease((lt - 0.1) / 1.4); wm.style.transform = "translateX(" + (1 - outCubic(lt / 1.8)) * 80 + "px)";

    // dispositivo che sale
    const dv = el.querySelector(".dev"), eIn = outBack((lt - 0.1) / 1.0);
    dv.style.transform = "translateY(" + ((1 - eIn) * 120 - exit * 26) + "px) scale(" + (0.93 + 0.07 * eIn) + ")";
    dv.style.opacity = ease((lt - 0.1) / 0.5);

    // schermata corrente
    let idx = 0; s.steps.forEach((st, k) => { if (st.t <= lt) idx = k; });
    const cur = s.steps[idx], prev = s.steps[idx - 1], next = s.steps[idx + 1];
    const p = ease((lt - cur.t) / 0.3);
    const win = el.querySelector(".win"), cam = win.querySelector(".cam");
    win.querySelectorAll("img").forEach((img) => {
      const n = img.dataset.n; let o = 0, z = 0;
      if (n === cur.shot) { o = prev && prev.shot !== cur.shot ? p : 1; z = 2; }
      else if (prev && n === prev.shot) { o = 1; z = 1; }
      img.style.opacity = o; img.style.zIndex = z;
    });

    // camera
    const c = camAt(s.kf, lt);
    const bob = 1;
    const K = g.w / sh[0], sc = K * c.s * bob;
    const visW = g.w / sc, visH = g.h / sc;
    const cx = visW >= sh[0] ? sh[0] / 2 : clamp(c.cx, visW / 2, sh[0] - visW / 2);
    const cy = visH >= sh[1] ? sh[1] / 2 : clamp(c.cy, visH / 2, sh[1] - visH / 2);
    const tx = g.w / 2 - cx * sc, ty = g.h / 2 - cy * sc;
    cam.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + sc + ")";
    const u = 1 / sc;   // 1 px del video, in px della schermata

    // evidenziazioni
    const ring = cam.querySelector(".ring"), dim = cam.querySelector(".dim"), fing = cam.querySelector(".finger"), arrow = cam.querySelector(".arrow"), rip = cam.querySelectorAll(".rip");
    const call = el.querySelector(".call");
    let mk = null; for (const m of s.marks) if (lt > m.t0 && lt < m.t1) mk = m;
    if (mk) {
      const b = BOX[mk.box], d = lt - mk.t0, span = mk.t1 - mk.t0;
      const a = ease(d / 0.45) * (1 - ease((d - (span - 0.4)) / 0.4));
      const pad = 12 * u, pulse = 1 + 0.02 * Math.sin(lt * 7);
      const pw = (b.w + 2 * pad) * pulse, ph = (b.h + 2 * pad) * pulse, pxl = b.x + b.w / 2 - pw / 2, pyt = b.y + b.h / 2 - ph / 2;
      Object.assign(dim.style, { left: px(pxl), top: px(pyt), width: px(pw), height: px(ph), borderRadius: px(22 * u), opacity: a, boxShadow: "0 0 0 " + px(9000) + " rgba(22,4,8," + 0.52 + ")" });
      Object.assign(ring.style, { left: px(pxl), top: px(pyt), width: px(pw), height: px(ph), borderWidth: px(4 * u), borderRadius: px(22 * u), opacity: a, boxShadow: "0 0 " + px(30 * u) + " rgba(201,169,110,.85), inset 0 0 " + px(14 * u) + " rgba(201,169,110,.35)" });
      // etichetta sul fotogramma
      const bx = g.ox + tx + (b.x + b.w / 2) * sc, byTop = g.oy + ty + (b.y - pad) * sc, byBot = g.oy + ty + (b.y + b.h + pad) * sc;
      const up = byTop - 150 > g.oy + 10;
      call.querySelector("span").textContent = mk.label || (mk.tap ? "Tocca qui" : "");
      call.className = "call " + (up ? "up" : "down");
      call.style.display = "block";
      const half = call.offsetWidth / 2;
      const lx = clamp(bx, g.ox + half + 14, g.ox + g.w - half - 14);
      const ly = (up ? byTop - 112 : byBot + 36) + Math.sin(lt * 4.5) * 5;
      call.style.left = px(lx - half); call.style.top = px(ly);
      call.style.opacity = ease(d / 0.4) * (1 - ease((d - (span - 0.35)) / 0.35));
      const pt = call.querySelector("i"); if (pt) pt.style.left = px(clamp(bx - (lx - half), 30, call.offsetWidth - 30));
    } else { dim.style.opacity = 0; ring.style.opacity = 0; call.style.display = "none"; }

    // il dito (telefono, tablet) o il puntatore (computer)
    const tp = (s.taps || []).find((x) => lt > x.t - 1.3 && lt < x.t + 0.6);
    const hand = s.dev === "l" ? arrow : fing;
    (s.dev === "l" ? fing : arrow).style.opacity = 0;
    if (tp) {
      const k = s.taps.indexOf(tp), b = BOX[tp.box], d = lt - tp.t;
      const tgt = [b.x + b.w * (tp.fx ?? 0.5), b.y + b.h * (tp.fy ?? 0.5)];
      const from = [tgt[0] + 150 * u, tgt[1] + 230 * u];
      const a = easeIO((d + 1.2) / 0.95);
      let hx = lerp(from[0], tgt[0], a) - Math.sin(Math.PI * a) * 50 * u, hy = lerp(from[1], tgt[1], a);
      const press = d > -0.14 && d < 0.06 ? 0.8 : 1;
      const alpha = ease((d + 1.3) / 0.3) * (1 - ease((d - 0.2) / 0.38));
      const ds = (s.dev === "l" ? 62 : 96) * u;
      if (s.dev === "l") {
        Object.assign(arrow.style, { left: px(hx), top: px(hy), width: px(ds * 0.66), height: px(ds), opacity: alpha, transform: "scale(" + press + ")", transformOrigin: "0 0" });
      } else {
        Object.assign(fing.style, { left: px(hx), top: px(hy), width: px(ds), height: px(ds), borderWidth: px(4 * u), opacity: alpha, transform: "translate(-50%,-50%) scale(" + press + ")" });
      }
      rip.forEach((r, j) => {
        const w = clamp((d - 0.0 - j * 0.14) / 0.6);
        Object.assign(r.style, { left: px(tgt[0]), top: px(tgt[1]), width: px(80 * u), height: px(80 * u), borderWidth: px(4 * u), opacity: d > j * 0.14 && w < 1 ? (1 - w) * 0.9 : 0, transform: "translate(-50%,-50%) scale(" + (0.6 + w * 3.2) + ")" });
      });
    } else { fing.style.opacity = 0; arrow.style.opacity = 0; rip.forEach((r) => (r.style.opacity = 0)); }

    // didascalia
    const cap = el.querySelector(".cap");
    const key = cur.cap[0] + "|" + cur.cap[1], prevKey = prev ? prev.cap[0] + "|" + prev.cap[1] : null, nextKey = next ? next.cap[0] + "|" + next.cap[1] : null;
    const changed = prevKey !== key;
    const fin = easeIO((lt - cur.t - (changed ? 0.1 : 0)) / 0.55), fout = nextKey && nextKey !== key ? 1 - ease((lt - (next.t - 0.35)) / 0.3) : 1;
    cap.querySelector(".ct").textContent = cur.cap[0];
    cap.querySelector(".cx").textContent = cur.cap[1];
    const ci = s.caps.indexOf(key);
    cap.querySelector(".st b").textContent = "Passo " + (ci + 1) + " di " + s.caps.length;
    cap.querySelectorAll(".dots i").forEach((dt, k) => { dt.className = k === ci ? "on" : k < ci ? "done" : ""; });
    const capIn = lt < 0.9 ? ease((lt - 0.6) / 0.6) : 1;
    cap.style.opacity = (changed ? fin : 1) * fout * capIn;
    cap.style.transform = "translateY(" + ((changed ? 1 - fin : 0) * 26 - (1 - fout) * 10) + "px)";
  });

  // ---------- chiusura ----------
  const outro = $("outro"), ot = t - acc;
  vis(outro, ot > -0.5 ? ease((ot + 0.5) / 0.8) : 0);
  if (ot > -0.5) {
    const lg = outro.querySelector(".logo"); const lu = outCubic((ot + 0.3) / 1.4);
    lg.style.opacity = lu; lg.style.transform = "scale(" + (0.92 + 0.08 * lu) + ")";
    outro.querySelectorAll(".mask span").forEach((e, k) => { const u = outCubic((ot - 0.2 - k * 0.2) / 0.9); e.style.transform = "translateY(" + (1 - u) * 118 + "%)"; });
    outro.querySelectorAll(".rule i").forEach((e) => { e.style.width = px(300 * outCubic((ot - 0.5) / 1.1)); });
    outro.querySelectorAll(".tip").forEach((e, k) => { const u = outCubic((ot - 1.0 - k * 0.55) / 0.8); e.style.opacity = u; e.style.transform = "translateY(" + (1 - u) * 44 + "px)"; });
    outro.querySelector(".ver").style.opacity = ease((ot - 3.4) / 0.8);
  }

  // barra di avanzamento: sette segmenti, solo durante i capitoli
  const pvis = t < INTRO - 0.4 || t > acc - 0.2 ? 0 : ease((t - (INTRO - 0.4)) / 0.5);
  prog.style.opacity = pvis;
  bar.forEach((b, k) => { const v = progress == null ? (t > acc - 0.2 ? 1 : 0) : clamp(progress - k); b.style.width = (v * 100) + "%"; });
};
window.render(0);
