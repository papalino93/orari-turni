// Fotografa video.html fotogramma per fotogramma (30 al secondo) e lo trasforma in MP4.
//   node video-render.mjs                 → .tmp-guida/video/guida.mp4
//   node video-render.mjs --stills 1,5,9  → solo alcune immagini in .tmp-guida/video/stills (per controllare)
// Serve ffmpeg: `pip install imageio-ffmpeg` (se non c'è già) o la variabile FFMPEG.
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { WORK } from "./work.mjs";

const dir = `${WORK}/video`;
const FPS = 30;
const ffmpeg = process.env.FFMPEG || execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
const u = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
  ...(u ? { proxy: { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } } : {}),
});
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`file://${dir}/video.html`, { waitUntil: "networkidle", timeout: 120000 });
const want = ["500 20px 'Cormorant Garamond'", "400 12px Jost", "500 12px Jost", "600 12px Jost"];
for (let i = 0; i < 6; i++) {
  await page.evaluate((w) => Promise.allSettled(w.map((f) => document.fonts.load(f, "Aàèéìòù0123456789"))), want);
  if (await page.evaluate((w) => w.every((f) => document.fonts.check(f, "Aàè")), want)) break;
  await page.waitForTimeout(1500);
}
if (!(await page.evaluate((w) => w.every((f) => document.fonts.check(f, "Aàè")), want))) {
  console.error("Caratteri non caricati: controlla la rete e rilancia.");
  await browser.close();
  process.exit(1);
}
const total = await page.evaluate(() => window.TOTAL);

const si = process.argv.indexOf("--stills");
if (si > 0) {
  mkdirSync(`${dir}/stills`, { recursive: true });
  for (const t of process.argv[si + 1].split(",").map(Number)) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: `${dir}/stills/t${String(Math.round(t * 10)).padStart(5, "0")}.png` });
  }
  await browser.close();
  process.exit(0);
}

const out = process.argv[2] || `${dir}/guida.mp4`;
const enc = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-profile:v", "main", "-r", String(FPS), "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const frames = Math.round(total * FPS);
for (let i = 0; i < frames; i++) {
  await page.evaluate((x) => window.render(x), i / FPS);
  const jpg = await page.screenshot({ type: "jpeg", quality: 94 });
  if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once("drain", r));
  if (i % 300 === 0) console.log(`${(i / FPS).toFixed(0)} s su ${total.toFixed(0)}`);
}
enc.stdin.end();
await new Promise((r) => enc.on("close", r));
await browser.close();
console.log("video pronto:", out);
