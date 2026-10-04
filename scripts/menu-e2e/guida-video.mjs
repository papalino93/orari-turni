// «Guida (video)»: l'MP4 della guida animata, solo per chi gestisce il menù. Il telefono lo
// chiede a pezzi (Range): senza, su iPhone non parte.
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, goTab } from "./lib.mjs";

const b = await launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.setDefaultTimeout(30000);
await login(p, "andrea", ADMIN_PW);
await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
await goTab(p, "Strumenti");
const link = p.getByRole("list", { name: "Strumenti del menù" }).getByRole("link", { name: /^Guida \(video\)/ });
check("Strumenti: c'è «Guida (video)»", (await link.count()) === 1 && (await link.getAttribute("href")) === "/gestione-menu/guida/video");

const url = `${BASE}/gestione-menu/guida/video`;
const full = await p.request.get(url);
const body = await full.body();
const size = body.length;
check("video: scaricato intero (MP4)", full.status() === 200 && full.headers()["content-type"] === "video/mp4" && body.subarray(4, 8).toString() === "ftyp", `${full.status()} ${full.headers()["content-type"]} ${size}`);
check("video: pesa tra 0,5 e 12 MB", size > 500_000 && size < 12_000_000, String(size));
check("video: dice che si può chiedere a pezzi", full.headers()["accept-ranges"] === "bytes");
const part = await p.request.get(url, { headers: { Range: "bytes=0-99" } });
check("video: «Range» → 206 con i primi 100 byte", part.status() === 206 && (await part.body()).length === 100 && part.headers()["content-range"] === `bytes 0-99/${size}`, `${part.status()} ${part.headers()["content-range"]}`);
const tail = await p.request.get(url, { headers: { Range: "bytes=-50" } });
check("video: «Range» dalla fine → ultimi 50 byte", tail.status() === 206 && (await tail.body()).length === 50, String(tail.status()));
const open = await p.request.get(url, { headers: { Range: `bytes=${size - 10}-` } });
check("video: «Range» aperto → fino alla fine", open.status() === 206 && (await open.body()).length === 10, String(open.status()));
const bad = await p.request.get(url, { headers: { Range: `bytes=${size + 5}-` } });
check("video: «Range» oltre la fine → 416", bad.status() === 416, String(bad.status()));

const anon = await (await b.newContext()).request.get(url, { maxRedirects: 0 });
check("video: senza login non si vede", anon.status() >= 300 && anon.status() < 400, String(anon.status()));
const emp = await (await b.newContext()).newPage();
await login(emp, "francesco", EMP_PW);
const eg = await emp.request.get(url, { maxRedirects: 0 });
check("video: dipendente senza permesso non lo vede", eg.status() >= 300 && eg.status() < 400, String(eg.status()));

await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
