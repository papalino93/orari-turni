// Gestione a quattro schede: Menù · Eventi e annunci · Orari e contatti · Strumenti, il
// «+ Aggiungi» unico (e quello accanto alla sezione), la ricerca che resta in alto.
import { launch, login, check, BASE, results, ADMIN_PW, goTab, discardIfAsked, addButton, openSection } from "./lib.mjs";

const b = await launch();
for (const [label, w, h] of [["computer", 1440, 900], ["telefono", 390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.setDefaultTimeout(30000);
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/gestione-menu`, { waitUntil: "networkidle", timeout: 180000 });
  const tabs = p.getByRole("tablist", { name: "Parti della gestione" }).getByRole("tab");
  const names = (await tabs.allInnerTexts()).map((t) => t.split("\n")[0].trim());
  // Sul telefono i nomi sono corti (una riga sola); il nome per esteso resta come etichetta accessibile.
  check(`${label}: quattro schede con i nomi giusti`, names.join("|") === (w < 640 ? "Menù|Eventi|Orari|Strumenti" : "Menù|Eventi e annunci|Orari e contatti|Strumenti"), names.join("|"));
  check(`${label}: nome accessibile per esteso`, (await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent.split("\n")[0].trim()))).join("|") === "Menù|Eventi e annunci|Orari e contatti|Strumenti");
  check(`${label}: si apre su «Menù»`, (await tabs.first().getAttribute("aria-selected")) === "true");
  const boxes = await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => r.right));
  check(`${label}: tutte le schede dentro lo schermo`, boxes.every((r) => r <= w), JSON.stringify(boxes));
  check(`${label}: niente scorrimento orizzontale`, (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);

  // Menù: sezioni, ricerca e «+ Aggiungi» della sezione
  check(`${label}: Menù mostra le sezioni`, (await p.getByRole("navigation", { name: "Sezioni" }).count()) === 1);
  check(`${label}: Menù non mostra gli strumenti`, (await p.getByRole("list", { name: "Strumenti del menù" }).count()) === 0);
  await p.evaluate(() => window.scrollTo(0, 1500));
  await p.waitForTimeout(400);
  const search = await p.getByRole("searchbox", { name: "Cerca una voce" }).boundingBox();
  check(`${label}: la ricerca resta in alto scorrendo`, search && search.y >= 0 && search.y < 140, JSON.stringify(search));
  await p.evaluate(() => window.scrollTo(0, 0));

  // Eventi e annunci
  await goTab(p, "Eventi e annunci");
  check(`${label}: Eventi mostra l'elenco degli eventi`, (await p.getByRole("navigation", { name: "Eventi e annunci" }).count()) === 1);
  check(`${label}: Eventi ha «+ Nuovo evento» e «+ Nuovo annuncio»`, (await p.getByRole("button", { name: "+ Nuovo evento" }).count()) === 1 && (await p.getByRole("button", { name: "+ Nuovo annuncio" }).count()) === 1);
  check(`${label}: Eventi apre già il primo evento`, (await p.locator('nav[aria-label="Eventi e annunci"] button[aria-current="true"]').count()) === 1);
  check(`${label}: Eventi non mostra le sezioni`, (await p.getByRole("navigation", { name: "Sezioni" }).count()) === 0);
  await p.getByRole("button", { name: "+ Nuovo annuncio" }).click();
  check(`${label}: «+ Nuovo annuncio» parte da Annuncio`, (await p.locator('[role="dialog"] [role="radio"][aria-checked="true"]').innerText()) === "Annuncio");
  await p.keyboard.press("Escape");
  await discardIfAsked(p);

  // Orari e contatti: riquadri già aperti
  await goTab(p, "Orari e contatti");
  check(`${label}: Orari e contatti, «Il locale» già aperto`, (await p.getByRole("button", { name: "Modifica gli orari" }).count()) === 1);
  check(`${label}: Orari e contatti, «Informazioni del menù» già aperto`, (await p.locator('button[aria-expanded="true"]', { hasText: "Informazioni del menù" }).count()) === 1);

  // Strumenti
  await goTab(p, "Strumenti");
  const tools = (await p.getByRole("list", { name: "Strumenti del menù" }).getByRole("listitem").allInnerTexts()).map((t) => t.split("\n")[0].trim());
  check(`${label}: Strumenti, tutti gli strumenti`, ["Tabella prezzi", "Riordina", "Storico", "Anteprima", "Menù da stampare", "Codice QR", "Statistiche", "Guida (PDF)", "Guida (video)"].every((n) => tools.includes(n)), tools.join("|"));
  await p.getByRole("list", { name: "Strumenti del menù" }).getByRole("button", { name: /^Storico/ }).click();
  check(`${label}: Strumenti apre lo Storico`, (await p.getByRole("dialog", { name: "Storico" }).count()) === 1);
  await p.keyboard.press("Escape");

  // «+ Aggiungi» in alto: vino → sezione → gruppo → scheda nuova, nella scheda Menù
    await addButton(p).click();
  const dlg = p.locator('[role="dialog"]');
  check(`${label}: «+ Aggiungi» chiede cosa aggiungere`, (await dlg.getByRole("heading", { name: "Che cosa vuoi aggiungere?" }).count()) === 1);
  await dlg.getByRole("button", { name: /^Un vino/ }).click();
  await dlg.getByRole("button", { name: /^Rossi/ }).click();
  await dlg.getByRole("button", { name: /^Italia/ }).click();
  await dlg.getByRole("heading", { name: "Nuovo vino" }).waitFor();
  check(`${label}: si apre «Nuovo vino» e si torna alla scheda Menù`, (await tabs.first().getAttribute("aria-selected")) === "true");
  await p.keyboard.press("Escape");
  await discardIfAsked(p);
  // «+ Aggiungi» accanto alla sezione
  await goTab(p, "Menù");
  await openSection(p, "Rossi");
  await p.getByRole("button", { name: /^\+ Aggiungi un vino in «Rossi»/ }).click();
  check(`${label}: «+ Aggiungi» della sezione chiede solo il gruppo`, (await dlg.getByRole("heading", { name: "In quale gruppo di «Rossi»?" }).count()) === 1);
  await p.keyboard.press("Escape");
  await p.context().close();
}
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
