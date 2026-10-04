// Scrive .tmp-guida/video/video.html: la guida animata, verticale 1080×1920 (9:16), a «motion graphics».
// L'interfaccia della gestione è ridisegnata in HTML (non sono screenshot) e animata con GSAP: tocchi, finestre,
// righe che si spostano, il menù dei clienti che cambia in diretta. Solo il menù dei clienti è fotografato
// (video-shots.mjs, sessione «c»); logo, locandine e QR sono veri (assets/).
//
// Come si modifica:
//  - capitoli, testi e tempi: video-scenes.js (CH = elenco capitoli con durata; ogni capitolo è un blocco);
//  - aspetto (colori, caratteri, dimensioni): video.css;
//  - la versione nel video è quella di package.json.
import { readFileSync, writeFileSync } from "node:fs";
import { WORK } from "./work.mjs";

const dir = `${WORK}/video`;
const data = JSON.parse(readFileSync(`${dir}/video-data.json`, "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const gsap = rd("./vendor/gsap.min.js"), draw = rd("./vendor/DrawSVGPlugin.min.js");
const css = rd("./video.css"), scenes = rd("./video-scenes.js");
const CFG = { VERSION: pkg.version, SHOTS: data.shots, ROW: data.boxes["c-row"] };

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Guida animata</title>
<style>${css}</style></head><body><div id="stage"></div>
<script>${gsap}</script><script>${draw}</script>
<script>const CFG = ${JSON.stringify(CFG)};
${scenes}
</script></body></html>`;
writeFileSync(`${dir}/video.html`, html);
console.log(`video.html pronto: ${(html.length / 1e3).toFixed(0)} kB`);
