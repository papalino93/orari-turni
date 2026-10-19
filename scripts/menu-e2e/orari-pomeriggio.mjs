// Orari: «Invia orari» parte dal solo pomeriggio (la mattina lavora il titolare da solo); con un tocco si passa a tutto il giorno.
// L'anteprima e il nome del file cambiano, si riparte sempre dal pomeriggio, e c'è su telefono e computer.
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
  check(`${label}: di partenza si invia solo il pomeriggio`, (await dlg().getByRole("button", { name: "Solo pomeriggio" }).getAttribute("aria-pressed")) === "true");
  check(`${label}: l'anteprima di partenza ha solo il pomeriggio`, !(await heads()).includes("mattina") && (await heads()).includes("pomeriggio"));
  check(`${label}: l'anteprima dice «pomeriggio» accanto alla settimana`, /· pomeriggio/.test(await dlg().innerText()));

  // PDF di partenza: nome del file con il pomeriggio
  const [dl0] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }).catch(() => null), dlg().getByRole("button", { name: /PDF/ }).click()]);
  check(`${label}: il PDF di partenza dice «pomeriggio» nel nome`, !!dl0 && /pomeriggio/.test(dl0.suggestedFilename()), dl0?.suggestedFilename());

  // Un tocco su «Tutto il giorno»: compare anche la mattina
  await dlg().getByRole("button", { name: "Tutto il giorno" }).click();
  check(`${label}: «Tutto il giorno» aggiunge la mattina`, (await heads()).includes("mattina") && (await heads()).includes("pomeriggio"));
  check(`${label}: con tutto il giorno non c'è «· pomeriggio»`, !/· pomeriggio/.test(await dlg().innerText()));
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }).catch(() => null), dlg().getByRole("button", { name: /PDF/ }).click()]);
  check(`${label}: il PDF di tutto il giorno non ha «pomeriggio» nel nome`, !!dl && !/pomeriggio/.test(dl.suggestedFilename()), dl?.suggestedFilename());

  // La volta dopo si riparte dal pomeriggio (la scelta «Tutto il giorno» non resta)
  await dlg().getByRole("button", { name: "Chiudi" }).click();
  await p.getByRole("button", { name: "Invia orari" }).click();
  await dlg().waitFor();
  check(`${label}: riaprendo si riparte da «Solo pomeriggio»`, (await dlg().getByRole("button", { name: "Solo pomeriggio" }).getAttribute("aria-pressed")) === "true" && !(await heads()).includes("mattina"));
  await ctx.close();
}
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
