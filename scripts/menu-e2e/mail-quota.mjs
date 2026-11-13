// Mail in uso vero: interruttore spento → pagina chiusa e invio rifiutato; mai ai dipendenti;
// quota del giorno con la riserva per le prenotazioni (controllata dal server); disiscrizione
// dal link e «tocco unico» (POST One-Click) → esclusi al prossimo invio; registro degli invii;
// «Riprova» che non rispedisce lo stesso gruppo; errori parziali contati giusti; prova precompilata;
// spunta «Confermo» che si azzera se cambia la lista.
// Serve il server di prova con MAIL_PROVIDER=log (limite 100, riserva 50: per la lista ne restano 50).
// Alla fine la sezione Mail resta SPENTA.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { launch, login, check, BASE, results, ADMIN_PW, EMP_PW, DB } from "./lib.mjs";

const SECRET = process.env.NEXTAUTH_SECRET || readFileSync(new URL("../../.env.local", import.meta.url), "utf8").match(/^NEXTAUTH_SECRET=(.*)$/m)?.[1]?.replace(/^"|"$/g, "");
const LOG = process.env.DEV_LOG; // facoltativo: il registro del server, per contare le mail «partite»
const token = (email) => `${Buffer.from(email).toString("base64url")}.${createHmac("sha256", SECRET).update(`mail-optout:v1:${email}`).digest("base64url").slice(0, 32)}`;
const today = DB(`select to_char((now() at time zone 'Europe/Rome')::date, 'YYYY-MM-DD')`);
const setFeature = (on) =>
  DB(`insert into "MenuSetting"(id, value) values ('features', '{"mail":${on},"ferie":false}') on conflict (id) do update set value = jsonb_set(coalesce(nullif("MenuSetting".value,'')::jsonb,'{}'::jsonb), '{mail}', '${on}')::text`);
const setUsed = (transactional, bulk = 0) =>
  DB(`insert into "MailDay"(day, transactional, bulk, "updatedAt") values ('${today}', ${transactional}, ${bulk}, now()) on conflict (day) do update set transactional=${transactional}, bulk=${bulk}`);
const RUN = Date.now().toString(36);
const reset = () => {
  DB(`delete from "MailDay" where day='${today}'`);
  DB(`delete from "MailOptOut" where email like '%@prova-mail.it'`);
  DB(`delete from "MailSend" where subject like 'Prova quota%'`);
  DB(`delete from "MenuSetting" where id='mailSender'`);
};
reset();

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
const body = () => p.locator("body").innerText();

try {
  // 1. Interruttore spento: la pagina non si apre, si torna a Impostazioni con la spiegazione.
  setFeature(false);
  await login(p, "andrea", ADMIN_PW);
  await p.goto(`${BASE}/mail`, { waitUntil: "networkidle", timeout: 180000 });
  check("spenta: /mail rimanda a Impostazioni", new URL(p.url()).pathname === "/account");
  check("spenta: Impostazioni dice perché", /La sezione Mail è spenta/.test(await body()));

  // 2. Dipendente: mai, nemmeno con la sezione accesa.
  setFeature(true);
  const emp = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(emp, "marta", EMP_PW);
  await emp.goto(`${BASE}/mail`, { waitUntil: "networkidle", timeout: 180000 });
  check("dipendente: /mail non si apre", !new URL(emp.url()).pathname.startsWith("/mail"));
  await emp.close();

  const open = async () => {
    await p.goto(`${BASE}/mail`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  };
  // Passo 1, linguetta «Incolla un elenco» (radio nascosto: si tocca l'etichetta).
  const pasteMode = () => p.getByRole("radio", { name: /Incolla un elenco/ }).locator("xpath=..").click();
  const paste = async (lines) => {
    await pasteMode();
    await p.locator("#mail-csv").fill(lines.join("\n"));
  };
  const toStep2 = async (subject) => {
    await p.getByRole("button", { name: "Avanti: scrivi il messaggio" }).click();
    await p.locator("#mail-subject").fill(subject);
    await p.locator("#mail-body").fill("Spett.le {intestazione},\n\nCiao!");
    await p.getByRole("button", { name: "Avanti: controlla" }).click();
  };
  const consent = () => p.getByRole("checkbox", { name: /Confermo/ });
  const sendAll = async () => {
    await consent().check();
    await p.getByRole("button", { name: /^Invia a \d+/ }).click();
    await p.getByRole("button", { name: "Sì, invia" }).click();
  };
  const mails = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i}-${RUN}@prova-mail.it;Persona ${i}`);

  // 3. Quota con la riserva: 45 mail delle prenotazioni → per la lista ne restano 5 (100 − 50 − 45).
  setUsed(45);
  await open();
  check("quota: la pagina mostra quante ne restano e la riserva", /Oggi puoi mandare ancora 5 mail \(50 sono tenute per le prenotazioni\)/.test(await body()));
  await paste(mails(7, "q"));
  await toStep2("Prova quota troppe");
  check("quota: 7 su 5 → «Invia» spento", await p.getByRole("button", { name: /^Invia a 7/ }).isDisabled());

  // Controllo sul server: la lista andava bene, poi le prenotazioni hanno usato la quota.
  setUsed(0);
  await open();
  await paste(mails(3, "s"));
  await toStep2("Prova quota server");
  setUsed(49);
  await sendAll();
  await p.getByText(/Oggi puoi mandare ancora 1 mail/).first().waitFor();
  check("quota: il server rifiuta un invio che toccherebbe la riserva", /Non è partita nessuna mail/.test(await body()));
  check("quota: nessuna mail contata", DB(`select bulk from "MailDay" where day='${today}'`) === "0");
  setUsed(0);

  // 4. Disiscrizione dal link nella mail: pagina pubblica, «Sì, cancellami» → «Fatto».
  const gone = `via-${RUN}@prova-mail.it`;
  const anon = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await anon.goto(`${BASE}/mail/cancellami/${token(gone)}`, { waitUntil: "networkidle", timeout: 180000 });
  check("disiscrizione: la pagina si apre senza accesso", /Vuoi smettere di ricevere le email dell.Angolo del Vino\?/.test(await anon.locator("body").innerText()));
  await anon.getByRole("button", { name: "Sì, cancellami" }).click();
  await anon.getByRole("heading", { name: "Fatto" }).waitFor();
  check("disiscrizione: «Fatto, non riceverai più le nostre email»", /Non riceverai più le nostre email/.test(await anon.locator("body").innerText()));
  check("disiscrizione: salvata nel database", DB(`select source from "MailOptOut" where email='${gone}'`) === "link");
  await anon.goto(`${BASE}/mail/cancellami/${token(gone).slice(0, -3)}xyz`, { waitUntil: "networkidle" });
  check("disiscrizione: link manomesso → «non funziona»", /Questo link non funziona/.test(await anon.locator("body").innerText()));
  await anon.close();

  // POST da un altro sito: rifiutato. One-Click (RFC 8058): accettato senza pagina.
  const other = `altro-${RUN}@prova-mail.it`;
  let r = await fetch(`${BASE}/mail/cancellami/${token(other)}/conferma`, { method: "POST", redirect: "manual", headers: { Origin: "https://cattivo.example", "Content-Type": "application/x-www-form-urlencoded" }, body: "" });
  check("disiscrizione: POST da un altro sito non vale", r.status === 303 && /errore=1/.test(r.headers.get("location") ?? "") && DB(`select count(*) from "MailOptOut" where email='${other}'`) === "0");
  const oneClick = `click-${RUN}@prova-mail.it`;
  r = await fetch(`${BASE}/mail/cancellami/${token(oneClick)}/conferma`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  check("one-click: risposta 200", r.status === 200);
  check("one-click: salvata", DB(`select source from "MailOptOut" where email='${oneClick}'`) === "one-click");
  r = await fetch(`${BASE}/mail/cancellami/${token(oneClick)}/conferma`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  check("one-click: due volte va bene (idempotente)", r.status === 200 && DB(`select count(*) from "MailOptOut" where email='${oneClick}'`) === "1");

  // 5. Dati del mittente: indirizzo delle prove precompilato, ragione sociale nel piè di pagina.
  await open();
  // Con ragione sociale e P. IVA già presenti il riquadro è chiuso: si apre.
  if (!(await p.locator("#sender-company").isVisible())) await p.getByText("Dati del mittente", { exact: true }).click();
  await p.locator("#sender-company").fill("Prova Vini S.r.l.");
  await p.locator("#sender-vat").fill("01234567890");
  check("dati del mittente: niente campo per le prove (sta in «Prova su di te»)", (await p.locator("#sender-test").count()) === 0);
  await p.getByRole("button", { name: "Salva i dati del mittente" }).click();
  await p.getByText("Salvato: da ora è nel piè di pagina delle mail.").waitFor();
  // L'indirizzo delle prove si ricorda dopo una prova riuscita (qui lo si mette come se la prova fosse già partita).
  DB(`update "MenuSetting" set value = jsonb_set(value::jsonb, '{testEmail}', '"me-${RUN}@prova-mail.it"')::text where id='mailSender'`);

  // 6. Invio vero: i cancellati esclusi al passo 1 e dal server, uno rifiutato dal servizio, registro.
  const late = `tardi-${RUN}@prova-mail.it`;
  await open();
  await paste([...mails(3, "ok"), `${gone};Via`, `${oneClick};Click`, `${late};Tardi`, `rifiuto-${RUN}+errore@prova-mail.it;Rifiuto`]);
  check("passo 1: «2 indirizzi esclusi perché si sono cancellati»", /2 indirizzi esclusi perché si sono cancellati/.test(await body()));
  check("passo 1: 5 destinatari pronti", /5\s+destinatari pronti/.test(await body()));
  await toStep2("Prova quota invio");
  check("prova: indirizzo precompilato (ultima prova)", (await p.getByRole("textbox", { name: "Il tuo indirizzo email" }).inputValue()) === `me-${RUN}@prova-mail.it`);
  check("anteprima: piè di pagina con ragione sociale e P. IVA", /Prova Vini S\.r\.l\. · P\. IVA 01234567890/.test(await body()));
  check("anteprima: link «Non voglio più ricevere queste email»", /Non voglio più ricevere queste email/.test(await body()));

  // La spunta si azzera se cambia la lista.
  await consent().check();
  await p.getByRole("button", { name: "Indietro" }).click();
  await p.getByRole("button", { name: "Indietro" }).click();
  await pasteMode();
  await p.locator("#mail-csv").fill([...mails(3, "ok"), `${late};Tardi`, `rifiuto-${RUN}+errore@prova-mail.it;Rifiuto`, `nuovo-${RUN}@prova-mail.it;Nuovo`].join("\n"));
  await p.getByRole("button", { name: "Avanti: scrivi il messaggio" }).click();
  await p.getByRole("button", { name: "Avanti: controlla" }).click();
  check("conferma: la spunta si azzera se cambia la lista", !(await consent().isChecked()));
  await p.getByRole("button", { name: "Indietro" }).click();
  await p.getByRole("button", { name: "Indietro" }).click();
  await pasteMode();
  await p.locator("#mail-csv").fill([...mails(3, "ok"), `${late};Tardi`, `rifiuto-${RUN}+errore@prova-mail.it;Rifiuto`].join("\n"));
  await p.getByRole("button", { name: "Avanti: scrivi il messaggio" }).click();
  await p.getByRole("button", { name: "Avanti: controlla" }).click();

  // Si cancella mentre la pagina è aperta: lo esclude il server.
  DB(`insert into "MailOptOut"(email, source) values ('${late}', 'a mano')`);
  await sendAll();
  await p.getByText(/mail inviate|Mail inviata/).waitFor({ timeout: 60000 });
  const done = await body();
  check("invio: partite 3 (una rifiutata, una cancellata)", /3 mail inviate/.test(done));
  check("invio: «1 mail non è partita» con il motivo", /1 mail non è partita/.test(done));
  check("invio: «1 indirizzo escluso perché si è cancellato»", /1 indirizzo escluso perché si è cancellato/.test(done));
  const row = DB(`select concat_ws('|', "by", recipients, sent, failed, excluded, status) from "MailSend" where subject='Prova quota invio'`);
  check("registro: chi, quanti, esito", row === "Andrea|5|3|1|1|PARZIALE", row);
  check("quota: contate solo le 3 partite", DB(`select bulk from "MailDay" where day='${today}'`) === "3");
  await p.getByRole("button", { name: "Nuovo invio" }).click();
  await p.getByRole("heading", { name: "Invii recenti" }).scrollIntoViewIfNeeded();
  check("pagina: «Invii recenti» mostra l'invio", /Prova quota invio[\s\S]*Andrea · partite 3 su 5/.test(await body()));

  // 7. «Riprova» non rispedisce un gruppo già partito: la risposta del primo gruppo si perde.
  await open();
  await paste(mails(4, "r"));
  await toStep2("Prova quota riprova");
  let cut = true;
  await p.route(`${BASE}/mail`, async (route) => {
    const req = route.request();
    if (cut && req.method() === "POST" && /sendId/.test(req.postData() ?? "")) {
      cut = false;
      await route.fetch(); // il server lo riceve e spedisce…
      return route.abort(); // …ma la risposta non arriva al browser
    }
    return route.continue();
  });
  await sendAll();
  await p.getByRole("button", { name: "Riprova" }).waitFor({ timeout: 60000 });
  check("riprova: messaggio di connessione interrotta", /La connessione si è interrotta/.test(await body()));
  await p.getByRole("button", { name: "Riprova" }).click();
  await p.getByText("4 mail inviate").waitFor({ timeout: 60000 });
  const retry = DB(`select concat_ws('|', count(*), sum(sent), max(status)) from "MailSend" where subject='Prova quota riprova'`);
  check("riprova: un solo invio nel registro, 4 partite", retry === "1|4|INVIATA", retry);
  check("riprova: quota contata una volta sola (3 + 4)", DB(`select bulk from "MailDay" where day='${today}'`) === "7");
  if (LOG) {
    const n = readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes("[mail di prova]") && l.includes("Prova quota riprova") && l.includes(`-${RUN}@`)).length;
    check("riprova: ogni persona ha ricevuto una mail sola", n === 4, `${n} righe`);
  }
  await p.unroute(`${BASE}/mail`);

  // 8. «Segna come cancellato».
  await open();
  await p.locator("#optout-email").fill(`Mano-${RUN}@Prova-Mail.it`);
  await p.getByRole("button", { name: "Segna come cancellato" }).click();
  await p.getByText(`mano-${RUN}@prova-mail.it non riceverà più le mail della lista.`).waitFor();
  check("segna come cancellato: salvato in minuscolo", DB(`select source from "MailOptOut" where email='mano-${RUN}@prova-mail.it'`) === "a mano");

  // 9. Sezione spenta con la pagina già aperta: l'invio viene rifiutato dal server.
  await paste(mails(1, "z"));
  await toStep2("Prova quota spenta");
  setFeature(false);
  await sendAll();
  await p.getByText(/La sezione Mail è spenta/).first().waitFor({ timeout: 60000 });
  check("spenta: l'azione di invio rifiuta", DB(`select count(*) from "MailSend" where subject='Prova quota spenta'`) === "0");
} finally {
  setFeature(false);
  reset();
  await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
