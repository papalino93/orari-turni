// Orari: «da verificare» chiede sempre conferma prima di segnare i turni, e dopo c'è «Annulla».
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";

const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const weekDate = day(10); // una settimana già conclusa
const range = `date >= '${day(17)}' and date <= '${day(3)}'`;
DB(`update "ShiftBlock" set confirmed=false where ${range}`);
const open = () => Number(DB(`select count(*) from "ShiftBlock" where ${range} and date < current_date and not confirmed`));

const b = await launch();
for (const [label, w, h] of [["computer", 1280, 900], ["telefono", 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/orari?date=${weekDate}`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  DB(`update "ShiftBlock" set confirmed=false where ${range}`);
  await p.reload({ waitUntil: "networkidle" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const before = open();
  const btn = p.getByRole("button", { name: /^⚠️ \d+ da verificare$/ });
  check(`${label}: il pulsante «da verificare» c'è`, (await btn.count()) === 1 && before > 0, String(before));

  await btn.click();
  const dlg = p.getByRole("dialog", { name: "Verificare i turni passati?" });
  await dlg.waitFor();
  check(`${label}: un tocco apre la domanda di conferma`, true);
  check(`${label}: la domanda dice cosa si segna`, /verificati/.test(await dlg.innerText()) && /davvero lavorato/.test(await dlg.innerText()));
  check(`${label}: finché non confermi non cambia nulla`, open() === before);

  await dlg.getByRole("button", { name: "Annulla" }).click();
  await dlg.waitFor({ state: "detached" });
  check(`${label}: «Annulla» nella domanda chiude e non segna nulla`, open() === before);

  await btn.click();
  await dlg.waitFor();
  await p.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  check(`${label}: Esc chiude la domanda senza segnare`, open() === before);

  await btn.click();
  await dlg.getByRole("button", { name: "Sì, verifica" }).click();
  await p.getByText(/turn[oi] verificat/).first().waitFor();
  const afterOk = open();
  check(`${label}: «Sì, verifica» segna i turni`, afterOk < before, `${before} → ${afterOk}`);

  await p.getByRole("button", { name: "Annulla", exact: true }).click();
  await p.getByText("Verifica annullata").waitFor();
  check(`${label}: «Annulla» dopo la verifica rimette tutto com'era`, open() === before, String(open()));
  await ctx.close();
}
await b.close();
DB(`update "ShiftBlock" set confirmed=false where ${range}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
