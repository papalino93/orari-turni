// «Scrivi o detta» nel foglio «Nuova prenotazione», nel browser (telefono): la frase riempie i campi,
// «Ho capito» lo mostra, si segna in agenda; ora o persone mancanti → «da completare»; un campo
// cambiato a mano non viene più sovrascritto dal testo; frase ambigua → niente indovinato.
// Uso: node scripts/menu-e2e/prenota-scrivi-foglio.mjs (con il server di prova acceso)
import { BASE, ADMIN_PW, DB, q, check, finish, launch, newContext, login, snapshotBookingSetting, restoreBookingSetting, setBookingSetting, onInterrupt } from "./prenota-lib.mjs";

const saved = snapshotBookingSetting();
const clean = () => DB(`delete from "BookingRequest" where name like 'Prova Scrivi%'`);
onInterrupt(() => {
  clean();
  restoreBookingSetting(saved);
});
clean();
setBookingSetting({ agendaEnabled: true });
const row = (name) => DB(`select people||'|'||time||'|'||"timeUnknown"||'|'||"peopleUnknown"||'|'||coalesce(note,'')||'|'||coalesce(phone,'') from "BookingRequest" where name=${q(name)} order by "createdAt" desc limit 1`);

let browser;
try {
  browser = await launch();
  const ctx = await newContext(browser, "phone");
  await ctx.addInitScript(() => {
    localStorage.setItem("install-banner-dismissed", "1");
    localStorage.setItem("prenotazioni-avvisi-suggerito", "1");
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await login(p, "andrea", ADMIN_PW);
  const open = async () => {
    await p.goto(`${BASE}/prenotazioni?vista=giorno`, { waitUntil: "networkidle", timeout: 180000 });
    await p.getByRole("button", { name: /Nuova prenotazione|\+ Prenotazione/ }).first().click();
    await p.locator("#scrivi-o-detta").waitFor();
  };
  const save = async () => {
    await p.getByRole("button", { name: "Segna in agenda" }).click();
    // eventuale domanda «fuori orario / doppione»: si conferma
    const ask = p.getByRole("alertdialog");
    if (await ask.waitFor({ timeout: 2500 }).then(() => true, () => false)) await ask.getByRole("button").last().click();
    await p.locator("#scrivi-o-detta").waitFor({ state: "detached", timeout: 20000 });
  };

  // 1. Frase completa (dettata): tutto riempito, «Ho capito», salvata giusta
  await open();
  await p.locator("#scrivi-o-detta").fill("allora a nome prova scrivi lucia siamo in quattro domani alle otto e mezza il numero è 347 555 1234, seggiolone");
  const heard = await p.getByTestId("ho-capito").innerText();
  check("«Ho capito»: nome, 4 persone, ora, telefono, nota", /Prova Scrivi Lucia/.test(heard) && /4 persone/.test(heard) && /alle 20:30/.test(heard) && /347 555 1234/.test(heard) && /seggiolone/.test(heard), heard.replace(/\s+/g, " "));
  check("il campo Nome si è riempito", (await p.locator("input[placeholder='es. Rossi']").inputValue()) === "Prova Scrivi Lucia");
  await save();
  check("salvata: 4 persone, 20:30, nota e telefono", /^4\|20:30\|false\|false\|seggiolone\|393475551234$/.test(row("Prova Scrivi Lucia")), row("Prova Scrivi Lucia"));

  // 2. «Marco per 10 sabato»: l'ora manca → si segna lo stesso, «da completare»
  await open();
  await p.locator("#scrivi-o-detta").fill("Prova Scrivi Marco per 10 sabato");
  check("«Ho capito»: «Ora da definire»", /Ora da definire/.test(await p.getByTestId("ho-capito").innerText()));
  await save();
  check("salvata con l'ora da definire (da completare)", /^10\|\|true\|false\|/.test(row("Prova Scrivi Marco")), row("Prova Scrivi Marco"));

  // 3. Un campo cambiato a mano resta com'è anche se poi si cambia il testo
  await open();
  await p.locator("#scrivi-o-detta").fill("Prova Scrivi Gino per 6 domani alle 21");
  await p.getByRole("radiogroup", { name: "Persone" }).getByRole("radio", { name: "2", exact: true }).click();
  await p.locator("#scrivi-o-detta").fill("Prova Scrivi Gino per 8 domani alle 21");
  check("persone scelte a mano (2) non sovrascritte dal testo (8)", (await p.getByRole("radiogroup", { name: "Persone" }).getByRole("radio", { name: "2", exact: true }).getAttribute("aria-checked")) === "true");
  await save();
  check("salvata con 2 persone", /^2\|21:00\|false\|false\|/.test(row("Prova Scrivi Gino")), row("Prova Scrivi Gino"));

  // 4. Ambigua: niente indovinato, il dubbio si vede
  await open();
  await p.locator("#scrivi-o-detta").fill("Prova Scrivi Angelo 10 20 30");
  const amb = await p.getByTestId("ho-capito").innerText();
  check("«Angelo 10 20 30»: persone e ora da definire, con il dubbio scritto", /Persone da definire/.test(amb) && /Ora da definire/.test(amb) && /Non so a cosa si riferisce/.test(amb), amb.replace(/\s+/g, " "));
  await p.getByRole("button", { name: "Annulla" }).first().click();
  const leave = p.getByRole("alertdialog");
  if (await leave.waitFor({ timeout: 2000 }).then(() => true, () => false)) await leave.getByRole("button").last().click();
} catch (e) {
  check("la prova è arrivata in fondo", false, String(e?.message ?? e).split("\n")[0]);
} finally {
  await browser?.close();
  clean();
  restoreBookingSetting(saved);
}
process.exit(finish());
