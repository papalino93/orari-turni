// Fotografa video.html (la timeline GSAP, window.render(t)) fotogramma per fotogramma (30 al secondo, fotografato a 1080×1920) e lo trasforma in MP4 da 720×1280.
//   node video-render.mjs [file.mp4]       → di solito .tmp-guida/video/guida.mp4
//   node video-render.mjs --stills 1,5,9   → solo alcune immagini in .tmp-guida/video/stills (per controllare)
// Il lavoro è diviso tra WORKERS browser (di solito 2) che scrivono pezzi MP4, poi uniti senza ricodificare.
// Serve ffmpeg: `pip install imageio-ffmpeg` (se non c'è già) o la variabile FFMPEG.
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { WORK } from "./work.mjs";

const dir = `${WORK}/video`;
const FPS = 30, W = 1080, H = 1920;
const WORKERS = Number(process.env.WORKERS || 2);
const ffmpeg = process.env.FFMPEG || (() => { try { return execFileSync("which", ["ffmpeg"]).toString().trim(); } catch { return execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim(); } })();
const u = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const launch = () => chromium.launch({
  executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--force-color-profile=srgb"],
  ...(u ? { proxy: { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } } : {}),
});

// Apre la pagina, aspetta i caratteri e «scalda» le immagini (decodifica) mostrando ogni capitolo una volta.
async function open(browser) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`file://${dir}/video.html`, { waitUntil: "load", timeout: 120000 });
  const want = ["500 20px 'Cormorant Garamond'", "600 20px 'Cormorant Garamond'", "italic 500 20px 'Cormorant Garamond'", "400 12px Jost", "500 12px Jost", "600 12px Jost", "400 12px Geist", "500 12px Geist", "600 12px Geist"];
  await page.evaluate((w) => Promise.allSettled(w.map((f) => document.fonts.load(f, "Aàèéìòù0123456789«»"))), want);
  if (!(await page.evaluate((w) => w.every((f) => document.fonts.check(f, "Aàè")), want))) throw new Error("Caratteri non caricati (scripts/guida/assets/fonts).");
  await page.evaluate(() => window.fit());
  const marks = await page.evaluate(() => { const a = []; let t = 0.5; while (t < window.TOTAL) { a.push(t); t += 4; } return a; });
  for (const t of marks) { await page.evaluate((x) => window.render(x), t); await page.screenshot({ type: "jpeg", quality: 40 }); }
  return page;
}

const first = await launch();
const probe = await open(first);
const total = await probe.evaluate(() => window.TOTAL);

const si = process.argv.indexOf("--stills");
if (si > 0) {
  mkdirSync(`${dir}/stills`, { recursive: true });
  for (const t of process.argv[si + 1].split(",").map(Number)) {
    await probe.evaluate((x) => window.render(x), t);
    await probe.screenshot({ path: `${dir}/stills/t${String(Math.round(t * 10)).padStart(5, "0")}.png` });
  }
  await first.close();
  process.exit(0);
}

const out = process.argv[2] || `${dir}/guida.mp4`;
// RANGE=da,a (secondi): solo un pezzo, per provare qualità e peso
const [r0, r1] = process.env.RANGE ? process.env.RANGE.split(",").map(Number) : [0, total];
const f0 = Math.round(r0 * FPS), frames = Math.round(r1 * FPS);
const per = Math.ceil((frames - f0) / WORKERS);
const done = new Array(WORKERS).fill(0);
// Si fotografa a 1080×1920 (nitido) e si riduce a 720×1280 in uscita: sul telefono si legge uguale, ma il file
// pesa circa 4,5 MB invece di 10 e si decodifica senza fatica (profilo high, livello 4.0, poche «refs»).
const vf = "scale=720:1280:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p";
async function work(k) {
  const browser = k === 0 ? first : await launch();
  const page = k === 0 ? probe : await open(browser);
  const part = `${dir}/part${k}.mp4`;
  const enc = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", vf, "-c:v", "libx264", "-preset", process.env.PRESET || "slow", "-crf", process.env.CRF || "35", "-profile:v", "high", "-level", "4.0", "-refs", "4", "-bf", "3", "-g", "60", "-r", String(FPS),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", part], { stdio: ["pipe", "inherit", "inherit"] });
  const a = f0 + k * per, b = Math.min(frames, a + per);
  for (let i = a; i < b; i++) {
    await page.evaluate((x) => window.render(x), i / FPS);
    const jpg = await page.screenshot({ type: "jpeg", quality: 96 });
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once("drain", r));
    done[k] = i - a + 1;
    if ((i - a) % 150 === 0) console.log(`pezzo ${k + 1}: ${done[k]} / ${b - a} fotogrammi`);
  }
  enc.stdin.end();
  await new Promise((r) => enc.on("close", r));
  await browser.close();
  return part;
}
const parts = await Promise.all(Array.from({ length: WORKERS }, (_, k) => work(k)));
writeFileSync(`${dir}/parts.txt`, parts.map((p) => `file '${p}'`).join("\n"));
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/parts.txt`, "-c", "copy", "-movflags", "+faststart", out]);
for (const p of parts) rmSync(p);
console.log(`video pronto: ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB, ${total.toFixed(1)} s)`);
