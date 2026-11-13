// Mail, passo 1 «Destinatari»: la tabella «Scrivili qui» (destinatari scritti a mano), accanto a
// «Carica un file» e «Incolla un elenco». Righe scritte con Invio, email sbagliata e doppia segnate
// sotto la casella, riga tolta, più righe incollate in una casella, conteggio, righe ricordate
// dopo aver ricaricato la pagina, ogni modo col suo elenco (si spedisce quello scelto), lettura
// dell'elenco incollato, prova e invio veri (MAIL_PROVIDER=log) e righe dimenticate dopo l'invio.
// Telefono: niente scorrimento di lato, pulsanti da 44 px.
// Con SHOTS=<cartella> salva le foto (telefono chiaro e scuro, computer chiaro).
// Alla fine la sezione Mail resta SPENTA.
import { launch, login, check, BASE, results, ADMIN_PW, DB, SHOTS } from "./lib.mjs";

const RUN = Date.now().toString(36);
const today = DB(`select to_char((now() at time zone 'Europe/Rome')::date, 'YYYY-MM-DD')`);
const setMail = (on) =>
  DB(`insert into "MenuSetting"(id, value) values ('features', '{"mail":${on},"ferie":false}') on conflict (id) do update set value = jsonb_set(coalesce(nullif("MenuSetting".value,'')::jsonb,'{}'::jsonb), '{mail}', '${on}')::text`);
const reset = () => {
  DB(`delete from "MailDay" where day='${today}'`);
  DB(`delete from "MailOptOut" where email like '%@prova-tabella.it'`);
  DB(`delete from "MailSend" where subject like 'Prova tabella%'`);
  // Chi riceve un invio entra nella rubrica: si toglie anche da lì.
  DB(`delete from "MailContact" where email like '%@prova-tabella.it'`);
};
const at = (name) => `${name}-${RUN}@prova-tabella.it`;
reset();
setMail(true);
const gone = at("cancellata");
DB(`insert into "MailOptOut"(email, source) values ('${gone}', 'a mano')`);

const b = await launch();

async function page(w, h, theme = "light") {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
      localStorage.setItem("install-banner-dismissed", "1");
    } catch {}
  }, theme);
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await login(p, "andrea", ADMIN_PW);
  return p;
}
// Con qualcuno in rubrica il passo 1 parte da «Dalla rubrica» (senza, da «Scrivili qui»): qui si usa la tabella.
const open = async (p) => {
  await p.goto(`${BASE}/mail`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const typed = p.getByRole("radio", { name: /Scrivili qui/ });
  if (!(await typed.isChecked())) await typed.locator("xpath=..").click();
};
const email = (p, n) => p.getByLabel(`Email della riga ${n}`, { exact: true });
const name = (p, n) => p.getByLabel(`Nome o azienda della riga ${n}`, { exact: true });
const rowsCount = (p) => p.getByRole("list", { name: "Destinatari scritti qui" }).locator(":scope > li").count();
const text = (p) => p.locator("body").innerText();
const pasteInto = (loc, value) =>
  loc.evaluate((el, value) => {
    el.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, value);
// Le linguette sono radio nascosti dentro un'etichetta: si tocca l'etichetta, come farebbe una persona.
const pick = (p, label) => p.getByRole("radio", { name: new RegExp(label) }).locator("xpath=..").click();
const noSideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  // ---------- Computer: il giro completo
  const p = await page(1280, 900);
  await open(p);
  check("si parte da «Scrivili qui»", await p.getByRole("radio", { name: /Scrivili qui/ }).isChecked());
  check("tabella vuota: una riga", (await rowsCount(p)) === 1);
  check("tabella vuota: «Avanti» spento e spiegato", (await p.getByRole("button", { name: "Avanti: scrivi il messaggio" }).isDisabled()) && /Scrivi almeno un indirizzo per andare avanti/.test(await text(p)));

  // Tre righe scritte con la tastiera: Invio passa al nome, Invio nel nome dell'ultima riga ne aggiunge una.
  await email(p, 1).fill(at("uno"));
  await email(p, 1).press("Enter");
  check("Invio nell'email porta al nome", await name(p, 1).evaluate((el) => el === document.activeElement));
  await name(p, 1).fill("Dott. Rossi");
  await name(p, 1).press("Enter");
  check("Invio nell'ultima casella aggiunge una riga", (await rowsCount(p)) === 2 && (await email(p, 2).evaluate((el) => el === document.activeElement)));
  await email(p, 2).fill(at("due"));
  await name(p, 2).fill("Laura");
  await name(p, 2).press("Enter");
  await email(p, 3).fill("pippo@");
  await name(p, 3).click();
  check("email sbagliata: segnata in rosso con il motivo", (await email(p, 3).getAttribute("aria-invalid")) === "true" && /Non sembra un'email/.test(await text(p)));
  check("conteggio: «2 destinatari pronti»", /2\s+destinatari pronti/.test(await text(p)));
  check("riga sbagliata contata: «1 riga da correggere»", /1 riga da correggere/.test(await text(p)));
  await email(p, 3).fill(at("tre"));
  await name(p, 3).click();
  check("corretta: «3 destinatari pronti», niente rosso", /3\s+destinatari pronti/.test(await text(p)) && (await email(p, 3).getAttribute("aria-invalid")) === null);

  // Doppione e riga tolta.
  await p.getByRole("button", { name: "+ Aggiungi una riga" }).click();
  await email(p, 4).fill(at("UNO"));
  await name(p, 4).click();
  check("doppione segnalato: «Già scritta alla riga 1»", /Già scritta alla riga 1: riceverà una mail sola/.test(await text(p)));
  check("doppione contato una volta: ancora 3 pronti", /3\s+destinatari pronti/.test(await text(p)));
  await p.getByRole("button", { name: `Togli la riga 4 (${at("UNO")})` }).click();
  check("riga tolta: restano 3 righe", (await rowsCount(p)) === 3 && !/Già scritta/.test(await text(p)));

  // Più righe incollate nella casella dell'email di una riga nuova.
  await p.getByRole("button", { name: "+ Aggiungi una riga" }).click();
  await pasteInto(email(p, 4), `${at("quattro")};Studio Lenzi\n${at("cinque")}\tCinque Srl\nnon-una-mail\n${gone};Cancellata`);
  await p.getByText("Aggiunte 4 righe.").waitFor();
  check("incolla più righe: diventano 4 righe", (await rowsCount(p)) === 7);
  check("incolla: email e nome al posto giusto", (await email(p, 5).inputValue()) === at("cinque") && (await name(p, 5).inputValue()) === "Cinque Srl" && (await name(p, 4).inputValue()) === "Studio Lenzi");
  check("incolla: la riga sbagliata è subito in rosso", (await email(p, 6).getAttribute("aria-invalid")) === "true");
  check("incolla: chi si è cancellato è segnato e escluso", /Si è cancellata dalle nostre mail/.test(await text(p)) && /1 indirizzo escluso perché si è cancellato/.test(await text(p)));
  check("conteggio: 5 pronti", /5\s+destinatari pronti/.test(await text(p)));
  await p.getByRole("button", { name: "Togli la riga 6 (non-una-mail)" }).click();

  // Ricaricando, le righe restano.
  await open(p);
  check("ricaricata: le righe restano", (await rowsCount(p)) === 6 && (await email(p, 1).inputValue()) === at("uno") && (await name(p, 4).inputValue()) === "Studio Lenzi");
  check("ricaricata: conteggio uguale", /5\s+destinatari pronti/.test(await text(p)));

  // «Incolla un elenco»: formato spiegato, lettura sotto la casella, separatori diversi.
  await pick(p, "Incolla un elenco");
  check("incolla: formato spiegato sopra la casella", /Una persona per riga: email, poi punto e virgola, poi il nome/.test(await text(p)));
  await p.locator("#mail-csv").fill(`${at("p1")}, Primo\n${at("p2")}\tSecondo\nsbagliata.it;X\n${at("p3")}`);
  const read = await text(p);
  const firstRead = (await p.locator("li", { hasText: at("p1") }).first().innerText()).replace(/\s+/g, " ");
  check("incolla: «Come l'ho letto» con email → nome", /Come l.ho letto/.test(read) && firstRead === `${at("p1")} → Primo`, firstRead);
  check("incolla: virgola e tabulazione vanno bene, «3 pronti · 1 da correggere»", /3 pronti · 1 da correggere/.test(read));
  check("incolla: riga sbagliata elencata", /Da correggere \(l.email non va\): «sbagliata\.it/.test(read));
  check("incolla: si userà l'elenco incollato (3)", /3\s+destinatari pronti/.test(read) && /Si userà l'elenco incollato/.test(read));
  check("le righe scritte restano da parte, e lo dice", /non partono con questo invio: gli indirizzi scritti qui/.test(read) && /5 pronti/.test(await p.getByRole("radio", { name: /Scrivili qui/ }).locator("xpath=..").innerText()));

  // Si torna alla tabella: si usa quella.
  await pick(p, "Scrivili qui");
  check("di nuovo «Scrivili qui»: 5 pronti, l'elenco incollato da parte", /5\s+destinatari pronti/.test(await text(p)) && /l'elenco incollato/.test(await text(p)));

  // Prova e invio veri.
  await p.getByRole("button", { name: "Avanti: scrivi il messaggio" }).click();
  await p.locator("#mail-subject").fill(`Prova tabella ${RUN}`);
  await p.locator("#mail-body").fill("Ciao!");
  check("saluto: «La mail comincerà così» con il nome", /La mail comincerà così: «Gentile /.test(await p.locator("main").innerText()));
  check("anteprima: il nome della prima riga", /Gentile Dott\. Rossi,/.test(await text(p)));
  await p.getByRole("button", { name: "Avanti: controlla" }).click();
  await p.getByRole("textbox", { name: "Il tuo indirizzo email" }).fill(at("io"));
  await p.getByRole("button", { name: "Invia la prova" }).click();
  await p.getByText(`Prova inviata a ${at("io")}`).waitFor({ timeout: 60000 });
  check("«Invia la prova» parte", true);
  await p.getByRole("radio", { name: "Sono clienti o contatti già avuti" }).check();
  await p.getByRole("button", { name: "Invia a 5 persone" }).click();
  await p.getByRole("button", { name: "Sì, invia" }).click();
  await p.getByText("5 mail inviate").waitFor({ timeout: 60000 });
  const row = DB(`select concat_ws('|', recipients, sent, failed, status) from "MailSend" where subject='Prova tabella ${RUN}'`);
  check("invio: 5 partite, nel registro", row === "5|5|0|INVIATA", row);
  check("invio: quota contata (1 prova + 5)", DB(`select bulk from "MailDay" where day='${today}'`) === "6");
  check("dopo l'invio le righe scritte sono dimenticate", (await p.evaluate(() => sessionStorage.getItem("mail-destinatari-scritti"))) === null);
  await open(p);
  check("ricaricata dopo l'invio: tabella vuota", (await rowsCount(p)) === 1 && (await email(p, 1).inputValue()) === "");
  await p.context().close();

  // ---------- Telefono
  const t = await page(390, 844);
  await open(t);
  await email(t, 1).fill(at("tel1"));
  await name(t, 1).fill("Dott. Rossi");
  await t.getByRole("button", { name: "+ Aggiungi una riga" }).click();
  await email(t, 2).fill("sbagliata@");
  await name(t, 2).click();
  check("telefono: errore sotto la casella", /Non sembra un'email/.test(await text(t)));
  check("telefono: niente scorrimento di lato", await noSideScroll(t));
  const sizes = await t.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="Togli la riga"], label:has(> input[name="mail-mode"])')].map((el) => el.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)),
  );
  check("telefono: pulsanti e linguette almeno 44 px", sizes.length >= 5 && sizes.every((s) => s >= 44), sizes.join(","));
  await pick(t, "Incolla un elenco");
  await t.locator("#mail-csv").fill(`${at("x")};Uno\nnope`);
  check("telefono: incolla senza scorrimento di lato", await noSideScroll(t));
  await pick(t, "Carica un file");
  check("telefono: il file e l'esempio da scaricare ci sono ancora", /Scegli il file/.test(await text(t)) && /Scarica un file di esempio/.test(await text(t)));
  check("telefono: carica un file senza scorrimento di lato", await noSideScroll(t));
  await t.evaluate(() => sessionStorage.removeItem("mail-destinatari-scritti"));
  await t.context().close();

  // ---------- Foto
  if (SHOTS) {
    for (const [label, w, h, theme] of [["telefono-chiaro", 390, 844, "light"], ["telefono-scuro", 390, 844, "dark"], ["computer-chiaro", 1440, 900, "light"]]) {
      const s = await page(w, h, theme);
      await open(s);
      await s.locator("h2", { hasText: "A chi vuoi scrivere?" }).scrollIntoViewIfNeeded();
      await s.screenshot({ path: `${SHOTS}/${label}-1-vuota.png`, fullPage: true });
      await email(s, 1).fill("mario.rossi@esempio.it");
      await name(s, 1).fill("Dott. Rossi");
      await name(s, 1).press("Enter");
      await email(s, 2).fill("laura.bianchi@esempio");
      await name(s, 2).fill("Laura");
      await name(s, 2).press("Enter");
      await email(s, 3).fill("studio.lenzi@esempio.it");
      await name(s, 3).fill("Studio Lenzi");
      await s.locator("h2", { hasText: "A chi vuoi scrivere?" }).click();
      await s.screenshot({ path: `${SHOTS}/${label}-2-tre-righe.png`, fullPage: true });
      await s.screenshot({ path: `${SHOTS}/${label}-2-tre-righe-schermo.png` });
      await pick(s, "Incolla un elenco");
      await s.locator("#mail-csv").fill("mario.rossi@esempio.it; Dott. Rossi\nlaura.bianchi@esempio.it, Laura\nanna@esempio\nstudio.lenzi@esempio.it\tStudio Lenzi");
      await s.screenshot({ path: `${SHOTS}/${label}-3-incolla.png`, fullPage: true });
      await pick(s, "Carica un file");
      await s.screenshot({ path: `${SHOTS}/${label}-4-file.png`, fullPage: true });
      await s.evaluate(() => sessionStorage.removeItem("mail-destinatari-scritti"));
      await s.context().close();
    }
  }
} finally {
  setMail(false);
  reset();
  await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
