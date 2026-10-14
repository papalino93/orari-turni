// Orari: «Invia orari» permette di mandare solo il pomeriggio (la mattina lavora il titolare da solo).
// L'anteprima cambia, la scelta resta per la volta dopo, e c'è su telefono e computer.
import { launch, login, check, BASE, results, ADMIN_PW } from "./lib.mjs";

const b = await launch();
for (const [label, w, h] of [["computer", 1280, 900], ["telefono", 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/orari`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const dlg = () => p.locator("div.fixed.inset-0").filter({ hasText: "Anteprima orario" });
  const heads = async () => (await dlg().locator("th").allInnerTexts()).map((t) => t.trim().toLowerCase());

  await p.getByRole("button", { name: "Invia orari" }).click();
  await dlg().waitFor();
  check(`${label}: di partenza si invia tutto il giorno`, (await dlg().getByRole("button", { name: "Tutto il giorno" }).getAttribute("aria-pressed")) === "true");
  check(`${label}: l'anteprima ha mattina e pomeriggio`, (await heads()).includes("mattina") && (await heads()).includes("pomeriggio"));

  await dlg().getByRole("button", { name: "Solo pomeriggio" }).click();
  check(`${label}: «Solo pomeriggio» toglie la mattina dall'anteprima`, !(await heads()).includes("mattina") && (await heads()).includes("pomeriggio"));
  check(`${label}: l'anteprima dice «pomeriggio» accanto alla settimana`, /· pomeriggio/.test(await dlg().innerText()));

  // La scelta resta alla volta dopo
  await dlg().getByRole("button", { name: "Chiudi" }).click();
  await p.reload({ waitUntil: "networkidle" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await p.getByRole("button", { name: "Invia orari" }).click();
  await dlg().waitFor();
  check(`${label}: la scelta «Solo pomeriggio» resta`, (await dlg().getByRole("button", { name: "Solo pomeriggio" }).getAttribute("aria-pressed")) === "true" && !(await heads()).includes("mattina"));

  // PDF: nome del file con il pomeriggio
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }).catch(() => null), dlg().getByRole("button", { name: /PDF/ }).click()]);
  check(`${label}: il PDF esce e dice «pomeriggio» nel nome`, !!dl && /pomeriggio/.test(dl.suggestedFilename()), dl?.suggestedFilename());

  await dlg().getByRole("button", { name: "Tutto il giorno" }).click().catch(() => {});
  await p.evaluate(() => localStorage.removeItem("orari-invio-solo-pomeriggio"));
  await ctx.close();
}
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
