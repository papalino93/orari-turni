// Mail, la rubrica: chi riceve un invio entra da solo; chi spunta le novità prenotando entra con il
// consenso (senza spunta no); importazione .vcf e CSV (anche la vecchia lista di Brevo con la colonna
// «Gruppo») con i conti dell'anteprima e i doppioni; chi non vuole più email si vede ma non si sceglie;
// gruppi e azioni su più contatti; «Scrivi a questi»; «Dalla rubrica» al passo 1; ricerca, ordine e
// filtri; modifica, eliminazione con «Annulla»; cancellazione dei dati su richiesta; scarica in Excel e
// CSV; telefono senza scorrimento di lato; 5.000 contatti (creati e poi tolti).
// Serve il server di prova con MAIL_PROVIDER=log. Foto in SHOTS (o nella cartella data come 1° argomento).
// Alla fine la sezione Mail resta SPENTA e le prenotazioni come erano.
// Uso: node scripts/menu-e2e/mail-rubrica.mjs [cartella-foto]
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { unzipSync, strFromU8 } from "fflate";
import { launch, login, check, BASE, results, ADMIN_PW, DB } from "./lib.mjs";
import { snapshotBookingSetting, restoreBookingSetting, setBookingSetting, bookableDays, formStamp, postRequest, randomPhone, cleanBookings, coolDown, newContext } from "./prenota-lib.mjs";

const SHOTS = process.argv[2] || process.env.SHOTS;
const RUN = Date.now().toString(36);
const DOMAIN = "prova-rubrica.it";
const at = (name) => `${name}-${RUN}@${DOMAIN}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const today = DB(`select to_char((now() at time zone 'Europe/Rome')::date, 'YYYY-MM-DD')`);
const setMail = (on) =>
  DB(`insert into "MenuSetting"(id, value) values ('features', '{"mail":${on},"ferie":false}') on conflict (id) do update set value = jsonb_set(coalesce(nullif("MenuSetting".value,'')::jsonb,'{}'::jsonb), '{mail}', '${on}')::text`);
const siteGroupBefore = DB(`select count(*) from "MailGroup" where name='Clienti dal sito'`) !== "0";
const savedBooking = snapshotBookingSetting();
const clean = () => {
  DB(`delete from "MailContact" where email like '%@${DOMAIN}' or email like '%@prova-rubrica-5k.it'`);
  DB(`delete from "MailOptOut" where email like '%@${DOMAIN}'`);
  DB(`delete from "MailSendRecipient" where email like '%@${DOMAIN}'`);
  DB(`delete from "MailSend" where subject like 'Prova rubrica%'`);
  DB(`delete from "MailGroup" where name like 'Prova R %'`);
  if (!siteGroupBefore) DB(`delete from "MailGroup" where name='Clienti dal sito' and not exists (select 1 from "MailContactGroup" g where g."groupId"="MailGroup".id)`);
  DB(`delete from "MailDay" where day='${today}'`);
  cleanBookings();
};
const restoreAll = () => {
  clean();
  setMail(false);
  restoreBookingSetting(savedBooking);
};
process.once("SIGINT", () => (restoreAll(), process.exit(130)));
clean();
setMail(true);
setBookingSetting({ enabled: true });
const contact = (email) => DB(`select concat_ws('|', name, source, consent, "sentCount", ("lastSentAt" is not null), ("deletedAt" is not null), coalesce(phone,'')) from "MailContact" where email=${q(email)}`);
const groupsOf = (email) => DB(`select string_agg(g.name, ',' order by g.name) from "MailContactGroup" cg join "MailGroup" g on g.id=cg."groupId" join "MailContact" c on c.id=cg."contactId" where c.email=${q(email)}`);

const b = await launch();
async function page(w, h, theme = "light") {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, acceptDownloads: true, locale: "it-IT", timezoneId: "Europe/Rome" });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
      localStorage.setItem("install-banner-dismissed", "1");
    } catch {}
  }, theme);
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await login(p, "andrea", ADMIN_PW);
  return p;
}
const hideDev = (p) => p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
async function open(p, scheda = "rubrica") {
  await p.goto(`${BASE}/mail${scheda ? `?scheda=${scheda}` : ""}`, { waitUntil: "networkidle", timeout: 180000 });
  await hideDev(p);
  if (scheda === "rubrica") await p.locator("#mail-pannello-rubrica").getByText(/Apro la rubrica/).waitFor({ state: "detached", timeout: 60000 });
}
const text = (p) => p.locator("main").innerText();
const shot = async (p, name, full = true) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
const noSideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dialog = (p, name) => p.getByRole("dialog", { name });
const toast = (p, re) => p.locator('[role="status"]').filter({ hasText: re }).first();
const search = async (p, value) => {
  await p.locator("#rubrica-cerca").fill(value);
  await p.waitForTimeout(150);
};
const pickMode = (p, label) => p.getByRole("radio", { name: new RegExp(label) }).locator("xpath=..").click();
async function sendFromStep1(p, subject, basis = "Sono clienti o contatti già avuti") {
  await p.getByRole("button", { name: "Avanti: scrivi il messaggio" }).click();
  await p.locator("#mail-subject").fill(subject);
  await p.locator("#mail-body").fill("Ciao! Una prova della rubrica.");
  await p.getByRole("button", { name: "Avanti: controlla" }).click();
  await p.getByRole("radio", { name: basis }).check();
  await p.getByRole("button", { name: /^Invia a \d+ person/ }).click();
  await p.getByRole("button", { name: "Sì, invia" }).click();
  await p.getByText(/mail inviate|Mail inviata/).waitFor({ timeout: 60000 });
}

// File di prova: un .vcf da iPhone (uno già in rubrica con un altro nome, uno cancellato, uno senza
// email, uno con due email) e la vecchia lista di Brevo del titolare.
const vcf = (lines) => lines.join("\r\n");
const VCF = vcf([
  "BEGIN:VCARD", "VERSION:3.0", "N:Bàrberi;Nicolò;;;", "FN:Nicolò Bàrberi", `item1.EMAIL;type=INTERNET;type=pref:${at("nicolo")}`, "TEL;type=CELL:+39 333 7654321", "END:VCARD",
  "BEGIN:VCARD", "VERSION:3.0", "FN:Enoteca Sant’Ambrogio", `EMAIL;type=INTERNET;type=WORK:${at("santambrogio")}`, `EMAIL;type=INTERNET;type=HOME:${at("ambrogio-casa")}`, "END:VCARD",
  "BEGIN:VCARD", "VERSION:3.0", "FN:Dott. Mario Rossi", `EMAIL;type=INTERNET:${at("uno")}`, "END:VCARD",
  "BEGIN:VCARD", "VERSION:3.0", "FN:Persona Cancellata", `EMAIL;type=INTERNET:${at("via")}`, "END:VCARD",
  "BEGIN:VCARD", "VERSION:3.0", "FN:Giuseppe Senza Mail", "TEL;type=CELL:+39 347 0001111", "END:VCARD",
]);
const BREVO = `\uFEFFEmail;Nome o azienda;Gruppo\r\n${at("cantina")};Cantina Rossi S.r.l.;Prova R Aziende\r\n${at("studio")};Studio Bianchi & Associati;Prova R Aziende, Prova R Storici\r\n${at("fattoria")};Fattoria Verdi;Prova R Aziende\r\n`;

try {
  const p = await page(1280, 900);

  // ---------- 1. Rubrica vuota (se il database di prova non ha altri contatti)
  const others = DB(`select count(*) from "MailContact" where "deletedAt" is null`);
  await open(p);
  if (others === "0") {
    check("vuota: spiega cos'è e i tre modi in cui si riempie", /La rubrica è vuota/.test(await text(p)) && /Da sola, con gli invii/.test(await text(p)) && /Dal sito/.test(await text(p)) && /Da te/.test(await text(p)));
    check("vuota: «Importa contatti» e «+ Nuovo contatto»", (await p.getByRole("button", { name: "Importa contatti" }).count()) === 1 && (await p.getByRole("button", { name: "+ Nuovo contatto" }).count()) === 1);
    await shot(p, "vuota-computer-chiaro");
    await open(p, null);
    check("passo 1 con la rubrica vuota: si parte da «Scrivili qui»", await p.getByRole("radio", { name: /Scrivili qui/ }).isChecked());
    await pickMode(p, "Dalla rubrica");
    await p.getByText("La rubrica è ancora vuota.").waitFor({ timeout: 15000 }).catch(() => {});
    check("«Dalla rubrica» vuota: lo dice e porta alla Rubrica", /La rubrica è ancora vuota/.test(await text(p)) && (await p.getByRole("button", { name: "Vai alla Rubrica" }).count()) === 1);
    await shot(p, "vuota-passo1-dalla-rubrica", false);
  } else check(`(rubrica non vuota: ${others} contatti di altre prove, salto lo stato vuoto)`, true);

  // ---------- 2. Un invio vero riempie la rubrica (le prove no)
  await open(p, null);
  await pickMode(p, "Scrivili qui");
  await p.getByLabel("Email della riga 1", { exact: true }).fill(at("uno"));
  await p.getByLabel("Nome o azienda della riga 1", { exact: true }).fill("Mario Rossi");
  await p.getByRole("button", { name: "+ Aggiungi una riga" }).click();
  await p.getByLabel("Email della riga 2", { exact: true }).fill(at("due"));
  check("passo 1: dice che dopo l'invio entrano in rubrica", /Dopo l'invio, chi lo riceve entra da solo nella rubrica/.test(await text(p)));
  await p.getByRole("button", { name: "Avanti: scrivi il messaggio" }).click();
  await p.locator("#mail-subject").fill(`Prova rubrica ${RUN}`);
  await p.locator("#mail-body").fill("Ciao!");
  await p.getByRole("button", { name: "Avanti: controlla" }).click();
  check("passo 3: «Invia» spento finché non si dice perché", await p.getByRole("button", { name: "Invia a 2 persone" }).isDisabled());
  check("passo 3: tre motivi da toccare", (await p.getByRole("radio", { name: "Sono clienti o contatti già avuti" }).count()) === 1 && (await p.getByRole("radio", { name: "Hanno chiesto di riceverle" }).count()) === 1 && (await p.getByRole("radio", { name: "Altro motivo" }).count()) === 1);
  await p.getByRole("textbox", { name: "Il tuo indirizzo email" }).fill(at("io"));
  await p.getByRole("button", { name: "Invia la prova" }).click();
  await p.getByText(`Prova inviata a ${at("io")}`).waitFor({ timeout: 60000 });
  await shot(p, "passo3-motivo", false);
  await p.getByRole("radio", { name: "Sono clienti o contatti già avuti" }).check();
  await p.getByRole("button", { name: "Invia a 2 persone" }).click();
  await p.getByRole("button", { name: "Sì, invia" }).click();
  await p.getByText("2 mail inviate").waitFor({ timeout: 60000 });
  check("invio: entrati in rubrica con nome, «invio», motivo dichiarato, 1 mail, ultima mail", contact(at("uno")) === "Mario Rossi|invio|cliente|1|t|f|" && contact(at("due")) === "|invio|cliente|1|t|f|", `${contact(at("uno"))} / ${contact(at("due"))}`);
  check("invio: la prova su di sé non entra in rubrica", contact(at("io")) === "");
  check("invio: nel registro il motivo e a chi è andato", DB(`select basis from "MailSend" where subject='Prova rubrica ${RUN}'`) === "cliente" && DB(`select count(*) from "MailSendRecipient" r join "MailSend" s on s.id=r."sendId" where s.subject='Prova rubrica ${RUN}' and r.status='sent'`) === "2");
  await p.getByRole("tab", { name: /Invii/ }).click();
  const sendRow = p.locator("li", { hasText: `Prova rubrica ${RUN}` });
  check("«Invii»: l'invio con il motivo", /motivo: cliente o contatto/.test(await sendRow.innerText()));
  await sendRow.getByText("A chi è andata").click();
  await sendRow.getByText(at("due")).waitFor();
  check("«Invii»: «A chi è andata» elenca le persone", /Mario Rossi · /.test(await sendRow.innerText()));

  // ---------- 3. Modulo delle prenotazioni: con la spunta entra con il consenso, senza no
  const { days } = bookableDays();
  const D = days.filter((d, i) => i >= 1 && d.state === "open" && d.slots.length >= 2);
  check("ci sono giorni prenotabili per la prova del modulo", D.length >= 2, days.map((d) => d.state).join(" "));
  const req = async (over) => postRequest({ day: D[0].day, time: D[0].slots[0], people: 2, name: "Prova C Rubrica", phone: randomPhone(), email: "", contact: "whatsapp", note: "", allergies: false, source: "menu", event: "", privacy: true, sito: "", t: await formStamp(), ...over });
  let r = await req({ name: "Prova C Rubrica Sì", news: true, newsEmail: at("cliente-wa").toUpperCase() });
  check("modulo, WhatsApp + spunta + email: richiesta ok", r.json?.ok === true, JSON.stringify(r.json));
  check("modulo: in rubrica con «chiesto», dal sito, nome e telefono", /^Prova C Rubrica Sì\|sito\|chiesto\|0\|f\|f\|\+?\d+/.test(contact(at("cliente-wa"))), contact(at("cliente-wa")));
  check("modulo: nel gruppo «Clienti dal sito»", groupsOf(at("cliente-wa")) === "Clienti dal sito");
  check("modulo: data e testo della casella nel consenso", DB(`select "consentNote" from "MailContact" where email=${q(at("cliente-wa"))}`).includes("Voglio ricevere via email le novità e gli eventi dell'Angolo del Vino"));
  r = await req({ name: "Prova C Rubrica Mail", time: D[0].slots[1], contact: "email", email: at("cliente-mail"), news: true });
  check("modulo, risposta per email + spunta: usa quella email", r.json?.ok === true && /^Prova C Rubrica Mail\|sito\|chiesto/.test(contact(at("cliente-mail"))), `${contact(at("cliente-mail"))} ${JSON.stringify(r.json)}`);
  r = await req({ name: "Prova C Rubrica No", day: D[1].day, time: D[1].slots[1], contact: "email", email: at("cliente-no") });
  check("modulo senza spunta: la prenotazione sì, la rubrica no", r.json?.ok === true && contact(at("cliente-no")) === "");
  r = await req({ name: "Prova C Rubrica Vuota", day: D[1].day, time: D[1].slots[1], news: true, newsEmail: "" });
  check("modulo, spunta senza email (WhatsApp): errore sul campo, niente salvato", r.json?.ok === false && r.json?.field === "newsEmail" && DB(`select count(*) from "BookingRequest" where name='Prova C Rubrica Vuota'`) === "0", JSON.stringify(r.json));

  // Il modulo vero, sul telefono: casella spenta all'inizio, campo email solo con WhatsApp.
  {
    const ctx = await newContext(b, "phone", { extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` } });
    const m = await ctx.newPage();
    m.setDefaultTimeout(30000);
    await m.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 180000 });
    await hideDev(m);
    await m.getByRole("radio", { name: "2 persone", exact: true }).click();
    await m.locator(`[data-day="${D[1].day}"]`).click();
    await m.getByRole("radiogroup", { name: "Ora" }).getByRole("radio", { name: D[1].slots[0], exact: true }).click();
    await m.getByLabel("Nome", { exact: true }).fill("Prova C Rubrica Modulo");
    await m.getByLabel("Telefono", { exact: true }).fill("333 1234567");
    const box = m.getByRole("checkbox", { name: "Voglio ricevere via email le novità e gli eventi dell'Angolo del Vino" });
    check("modulo: la casella delle novità c'è ed è spenta", (await box.count()) === 1 && !(await box.isChecked()));
    await m.getByRole("checkbox", { name: /informativa sulla privacy/ }).check();
    await box.check();
    check("modulo, WhatsApp: con la spunta compare «La tua email per le novità»", await m.getByLabel("La tua email per le novità").isVisible());
    await m.getByLabel("La tua email per le novità").fill(at("modulo"));
    await m.locator("#campo-novita").scrollIntoViewIfNeeded();
    await shot(m, "prenota-novita-whatsapp", false);
    check("modulo, telefono: niente scorrimento di lato", await noSideScroll(m));
    await m.getByRole("radio", { name: "Email", exact: true }).click();
    check("modulo, risposta per email: il campo a parte sparisce", (await m.getByLabel("La tua email per le novità").count()) === 0);
    await m.getByLabel("Email", { exact: true }).fill(at("modulo"));
    await m.locator("#campo-novita").scrollIntoViewIfNeeded();
    check("modulo, email: dice a che indirizzo arrivano", (await m.locator("#campo-novita").innerText()).includes(`Le mandiamo a ${at("modulo")}`));
    await shot(m, "prenota-novita-email", false);
    await m.getByRole("radio", { name: "WhatsApp", exact: true }).click();
    coolDown();
    await m.waitForTimeout(3500); // il modulo non si invia prima di qualche secondo (contro i programmi)
    await m.getByRole("button", { name: "Invia la richiesta" }).click();
    await m.waitForURL(/\/menu\/prenota\/r\//, { timeout: 30000 }).catch(async () => console.log("modulo:", (await m.locator('[role="alert"]').allInnerTexts()).join(" | ")));
    check("modulo vero: inviato, il cliente è in rubrica", /^Prova C Rubrica Modulo\|sito\|chiesto/.test(contact(at("modulo"))), contact(at("modulo")));
    await m.goto(`${BASE}/menu/prenota/privacy`, { waitUntil: "networkidle" });
    check("informativa: le novità solo con la spunta, ci si cancella quando si vuole", /Le novità per email, solo se le chiedi/i.test(await m.locator("main").innerText()) && /Non voglio più ricevere queste email/.test(await m.locator("main").innerText()));
    await ctx.close();
  }

  // ---------- 4. Importare: .vcf dal telefono
  DB(`insert into "MailOptOut"(email, source) values (${q(at("via"))}, 'link') on conflict do nothing`);
  await open(p);
  await p.getByRole("button", { name: "Importa" }).click();
  const imp = dialog(p, "Importa contatti");
  check("importa: spiega come esportare dal telefono (chiuso)", (await imp.getByText("Come esportare i contatti dal telefono").count()) === 1 && !(await imp.getByText("Salva su File").isVisible()));
  check("importa: niente «Scegli dalla rubrica del telefono» fuori da Android", (await imp.getByRole("button", { name: /Scegli dalla rubrica del telefono/ }).count()) === 0);
  await imp.locator('input[type="file"]').setInputFiles({ name: "contatti.vcf", mimeType: "text/vcard", buffer: Buffer.from(VCF) });
  const counts = imp.getByTestId("anteprima-conti");
  await counts.waitFor();
  const vcfCounts = await counts.innerText();
  check("anteprima .vcf: «2 nuovi · 1 già in rubrica · 1 senza email valida · 1 non vuole più email»", vcfCounts === "2 nuovi · 1 già in rubrica · 1 senza email valida · 1 non vuole più email", vcfCounts);
  check("anteprima: nome diverso da confermare («Mario Rossi» → «Dott. Mario Rossi»)", /già in rubrica con un nome diverso/.test(await imp.innerText()) && /«Mario Rossi» → «Dott\. Mario Rossi»/.test(await imp.innerText()));
  check("anteprima: più email, si può scegliere", /1 contatto ha più di un'email/.test(await imp.innerText()));
  check("anteprima: «Importa» spento senza il motivo", await imp.getByRole("button", { name: "Importa 2 contatti" }).isDisabled());
  await imp.getByText(/più di un'email/).click();
  await imp.getByRole("radio", { name: at("ambrogio-casa") }).check();
  await imp.getByRole("radio", { name: "Sono clienti o contatti già avuti" }).check();
  await imp.locator("#importa-gruppo-nuovo").fill("Prova R Telefono");
  await imp.getByRole("button", { name: "Crea", exact: true }).click();
  await imp.getByRole("button", { name: "Prova R Telefono", pressed: true }).waitFor();
  await shot(p, "importa-anteprima-vcf", false);
  await imp.getByRole("button", { name: "Importa 2 contatti" }).click();
  await toast(p, /2 contatti aggiunti/).waitFor();
  check("vcf: Nicolò entrato, dal telefono, con telefono e gruppo", /^Nicolò Bàrberi\|telefono\|cliente\|0\|f\|f\|\+39 333 765 4321$/.test(contact(at("nicolo"))) && groupsOf(at("nicolo")) === "Prova R Telefono", contact(at("nicolo")));
  check("vcf: l'email scelta tra due", contact(at("ambrogio-casa")).startsWith("Enoteca Sant’Ambrogio|") && contact(at("santambrogio")) === "");
  check("vcf: nome già presente non sovrascritto senza conferma", contact(at("uno")).startsWith("Mario Rossi|") && groupsOf(at("uno")) === "Prova R Telefono");
  check("vcf: chi non vuole più email non entra", contact(at("via")) === "");

  // CSV: la vecchia lista di Brevo con la colonna «Gruppo»; poi di nuovo (doppioni).
  await p.getByRole("button", { name: "Importa" }).click();
  await imp.locator('input[type="file"]').setInputFiles({ name: "lista-brevo.csv", mimeType: "text/csv", buffer: Buffer.from(BREVO) });
  await counts.waitFor();
  check("anteprima CSV Brevo: «3 nuovi»", (await counts.innerText()) === "3 nuovi", await counts.innerText());
  check("anteprima CSV Brevo: «Nuovo gruppo: Prova R Aziende · 3» e «Prova R Storici · 1»", /Nuovo gruppo: Prova R Aziende\s*· 3/.test(await imp.innerText()) && /Nuovo gruppo: Prova R Storici\s*· 1/.test(await imp.innerText()));
  await imp.getByRole("radio", { name: "Altro motivo" }).check();
  await shot(p, "importa-anteprima-brevo", false);
  await imp.getByRole("button", { name: "Importa 3 contatti" }).click();
  await toast(p, /3 contatti aggiunti/).waitFor();
  check("CSV: gruppi del file creati e assegnati", groupsOf(at("studio")) === "Prova R Aziende,Prova R Storici" && groupsOf(at("cantina")) === "Prova R Aziende" && contact(at("cantina")).startsWith("Cantina Rossi S.r.l.|file|altro|"));
  await p.getByRole("button", { name: "Importa" }).click();
  await imp.locator('input[type="file"]').setInputFiles({ name: "lista-brevo.csv", mimeType: "text/csv", buffer: Buffer.from(BREVO) });
  await counts.waitFor();
  check("di nuovo lo stesso file: «0 nuovi · 3 già in rubrica», «Aggiorna 3 contatti»", (await counts.innerText()) === "0 nuovi · 3 già in rubrica" && (await imp.getByRole("button", { name: "Aggiorna 3 contatti" }).count()) === 1, await counts.innerText());
  await imp.getByRole("button", { name: "Indietro" }).click();
  await imp.getByRole("button", { name: "Incolla un elenco" }).click();
  await imp.locator("#importa-incolla").fill(`Laura Neri <${at("laura")}>, ${at("UNO")}; nonunamail`);
  await imp.getByRole("button", { name: "Avanti" }).click();
  check("incollato: «1 nuovo · 1 già in rubrica»", (await counts.innerText()) === "1 nuovo · 1 già in rubrica", await counts.innerText());
  await imp.getByRole("radio", { name: "Hanno chiesto di riceverle" }).check();
  await imp.getByRole("button", { name: "Importa 1 contatto" }).click();
  await toast(p, /1 contatto aggiunto/).waitFor();
  check("incollato: Laura entrata, «da un elenco incollato»", contact(at("laura")).startsWith("Laura Neri|incollato|chiesto|"));

  // ---------- 5. Chi non vuole più email: segnato, non si sceglie
  DB(`insert into "MailOptOut"(email, source) values (${q(at("due"))}, 'link') on conflict do nothing`);
  await open(p);
  await search(p, at("due"));
  check("rubrica: «Non vuole più email» accanto al contatto", /Non vuole più email/.test(await p.locator('ul[aria-label="Contatti"]').innerText()));
  await p.locator("#rubrica-stato").selectOption("no");
  await search(p, DOMAIN);
  const outRows = await p.locator('ul[aria-label="Contatti"] > li').count();
  check("filtro «Non vogliono più email»: solo lui", outRows === 1, String(outRows));
  await p.locator("#rubrica-stato").selectOption("tutti");

  // ---------- 6. Ricerca, ordine, filtro per gruppo
  await search(p, "nicolo barberi");
  check("ricerca senza accenti: «nicolo barberi» trova «Nicolò Bàrberi»", (await p.locator('ul[aria-label="Contatti"] > li').count()) === 1 && /Nicolò Bàrberi/.test(await p.locator('ul[aria-label="Contatti"]').innerText()));
  await search(p, "333 765");
  check("ricerca per telefono (cifre)", /Nicolò Bàrberi/.test(await p.locator('ul[aria-label="Contatti"]').innerText()));
  await search(p, "nessuno-così-xyz");
  check("ricerca senza risultati: lo dice, con «Togli i filtri»", /Nessun contatto per «nessuno-così-xyz»/.test(await text(p)) && (await p.getByRole("button", { name: "Togli i filtri" }).count()) === 1);
  await p.getByRole("button", { name: "Togli i filtri" }).click();
  await search(p, DOMAIN);
  await p.locator("#rubrica-ordine").selectOption("ultima");
  const firstByMail = await p.locator('ul[aria-label="Contatti"] > li').first().innerText();
  check("ordine «Ultima mail»: in cima chi l'ha ricevuta (Mario Rossi)", /Mario Rossi/.test(firstByMail), firstByMail);
  await p.locator("#rubrica-ordine").selectOption("recenti");
  const firstNew = await p.locator('ul[aria-label="Contatti"] > li').first().innerText();
  check("ordine «Aggiunti da poco»: in cima l'ultimo importato (Laura Neri)", /Laura Neri/.test(firstNew), firstNew);
  await p.locator("#rubrica-ordine").selectOption("nome");
  const aziende = DB(`select id from "MailGroup" where name='Prova R Aziende'`);
  await p.locator("#rubrica-gruppo").selectOption(aziende);
  check("filtro per gruppo: 3 in «Prova R Aziende»", (await p.locator('ul[aria-label="Contatti"] > li').count()) === 3);

  // ---------- 7. Gruppi: aggiungi e togli a più contatti, rinomina, colore, elimina
  await p.getByRole("checkbox", { name: "Seleziona tutti (3)" }).check();
  check("scelti: barra con «Scrivi a questi (3)»", (await p.getByRole("button", { name: "Scrivi a questi (3)" }).count()) === 1);
  await shot(p, "rubrica-scelti-computer", false);
  await p.getByRole("button", { name: "Aggiungi a un gruppo" }).click();
  const add = dialog(p, "Aggiungi a un gruppo");
  await add.locator("#gruppo-nuovo-scelti").fill("Prova R Giovedì");
  await add.getByRole("button", { name: "Crea e aggiungi" }).click();
  await toast(p, /3 contatti aggiunti al nuovo gruppo «Prova R Giovedì»/).waitFor();
  check("aggiungi a un gruppo (nuovo): 3 dentro", DB(`select count(*) from "MailContactGroup" cg join "MailGroup" g on g.id=cg."groupId" where g.name='Prova R Giovedì'`) === "3");
  await p.getByRole("button", { name: "Togli dal gruppo" }).click();
  await dialog(p, "Togli dal gruppo").getByRole("button", { name: /Prova R Storici/ }).click();
  await toast(p, /1 contatto tolto da «Prova R Storici»/).waitFor();
  check("togli dal gruppo: Studio Bianchi esce da «Storici», resta in rubrica", groupsOf(at("studio")) === "Prova R Aziende,Prova R Giovedì" && contact(at("studio")) !== "");
  await p.getByRole("button", { name: "Togli la scelta" }).click();
  await p.getByRole("button", { name: "Gruppi", exact: true }).click();
  const gs = dialog(p, "Gruppi");
  await gs.getByRole("button", { name: "Modifica il gruppo Prova R Giovedì" }).click();
  await gs.locator('input[id^="gruppo-nome-"]').fill("Prova R Amici del giovedì");
  await gs.getByRole("radio", { name: "Verde" }).check({ force: true });
  await shot(p, "gruppi", false);
  await gs.getByRole("button", { name: "Salva" }).click();
  await toast(p, /Gruppo salvato/).waitFor();
  check("gruppo rinominato e colorato", DB(`select name||'|'||color from "MailGroup" where name like 'Prova R Amici%'`) === "Prova R Amici del giovedì|verde");
  await gs.getByRole("button", { name: "Modifica il gruppo Prova R Storici" }).click();
  await gs.getByRole("button", { name: "Elimina il gruppo" }).click();
  check("elimina gruppo: dice che i contatti restano", /contatt(o resta|i restano) in rubrica|Il gruppo è vuoto/.test(await p.getByRole("alertdialog").innerText()));
  await p.getByRole("alertdialog").getByRole("button", { name: "Elimina il gruppo" }).click();
  await toast(p, /Gruppo «Prova R Storici» eliminato/).waitFor();
  check("gruppo eliminato, contatti al loro posto", DB(`select count(*) from "MailGroup" where name='Prova R Storici'`) === "0" && contact(at("studio")) !== "");
  await gs.getByRole("button", { name: "Chiudi" }).click();

  // ---------- 8. «Scrivi a questi» e «Dalla rubrica» al passo 1
  await open(p);
  await search(p, DOMAIN);
  await p.getByRole("checkbox", { name: "Scegli Nicolò Bàrberi" }).check();
  await p.getByRole("checkbox", { name: `Scegli ${at("due")}` }).check();
  check("scelto anche chi non vuole più email: «Scrivi a questi (1)» e lo dice", (await p.getByRole("button", { name: "Scrivi a questi (1)" }).count()) === 1 && /1 non vuole più email/.test(await text(p)));
  await p.getByRole("button", { name: "Scrivi a questi (1)" }).click();
  check("«Scrivi a questi»: si passa a «Scrivi», «Dalla rubrica», 1 pronto", (await p.getByRole("tab", { name: /Scrivi/ }).getAttribute("aria-selected")) === "true" && (await p.getByRole("radio", { name: /Dalla rubrica/ }).isChecked()) && /1\s+destinatario pronto/.test(await text(p)));
  await p.locator("#mail-rubrica-cerca").fill(DOMAIN);
  const outBox = p.getByRole("checkbox", { name: `${at("due")} (non vuole più email)` });
  check("«Dalla rubrica»: chi non vuole più email è spento", (await outBox.count()) === 1 && (await outBox.isDisabled()));
  await p.locator("#mail-rubrica-gruppo").selectOption(aziende);
  await p.getByRole("button", { name: "Seleziona tutti (3)" }).click();
  check("«Dalla rubrica»: gruppo + «Seleziona tutti (3)» → 4 scelte", /4 persone scelte/.test(await text(p)) && /4\s+destinatari pronti/.test(await text(p)));
  await p.locator("#mail-rubrica-gruppo").selectOption("");
  await p.getByRole("checkbox", { name: "Solo chi hai scelto" }).check();
  check("«Solo chi hai scelto»: 4 righe", (await p.getByRole("list", { name: "Contatti della rubrica" }).locator(":scope > li").count()) === 4);
  await p.getByRole("checkbox", { name: "Solo chi hai scelto" }).uncheck();
  await shot(p, "passo1-dalla-rubrica-computer", false);
  await sendFromStep1(p, `Prova rubrica scelti ${RUN}`, "Altro motivo");
  check("invio dalla rubrica: mail contate (Nicolò 1, Cantina 1), nessun nuovo contatto", contact(at("nicolo")).split("|")[3] === "1" && contact(at("cantina")).split("|")[3] === "1" && contact(at("nicolo")).split("|")[2] === "cliente");
  await p.getByRole("button", { name: "Nuovo invio" }).click();
  check("dopo l'invio la scelta si azzera", /Scegli almeno una persona per andare avanti/.test(await text(p)));

  // ---------- 9. Nuovo contatto, modifica, eliminazione con «Annulla»
  await open(p);
  await p.getByRole("button", { name: "+ Nuovo contatto" }).click();
  const nc = dialog(p, "Nuovo contatto");
  await nc.locator("#contatto-nome").fill("Prova Nuova");
  await nc.locator("#contatto-email").fill(at("UNO"));
  await nc.getByRole("radio", { name: "È un cliente o un contatto già avuto" }).check();
  await nc.getByRole("button", { name: "Aggiungi alla rubrica" }).click();
  await nc.getByRole("alert").waitFor();
  check("nuovo contatto con un'email già presente: lo dice", /è già in rubrica \(«Mario Rossi»\)/.test(await nc.innerText()), await nc.getByRole("alert").innerText());
  await nc.locator("#contatto-email").fill(` ${at("Nuova")} `);
  await nc.locator("#contatto-telefono").fill("055 123456");
  await nc.getByRole("button", { name: /Prova R Aziende/ }).click();
  await nc.locator("#contatto-note").fill("Preferisce i rossi");
  await shot(p, "contatto-nuovo", false);
  await nc.getByRole("button", { name: "Aggiungi alla rubrica" }).click();
  await toast(p, /Contatto aggiunto alla rubrica/).waitFor();
  check("nuovo contatto: email pulita, «scritto a mano», gruppo", contact(at("nuova")) === "Prova Nuova|mano|cliente|0|f|f|055 123456" && groupsOf(at("nuova")) === "Prova R Aziende", contact(at("nuova")));
  await search(p, "preferisce rossi");
  await p.getByRole("button", { name: "Apri Prova Nuova" }).click();
  const ed = dialog(p, "Prova Nuova");
  check("scheda: da dove viene, mail ricevute, motivo", /scritto a mano/.test(await ed.innerText()) && /Mail ricevute\s*nessuna/.test(await ed.innerText()) && /Segnato a mano da Andrea/.test(await ed.innerText()));
  await ed.locator("#contatto-nome").fill("Prova Nuova Modificata");
  await ed.getByRole("button", { name: "Salva" }).click();
  await toast(p, /Contatto salvato/).waitFor();
  check("modifica salvata", contact(at("nuova")).startsWith("Prova Nuova Modificata|"));
  await search(p, "prova nuova");
  await p.getByRole("checkbox", { name: "Scegli Prova Nuova Modificata" }).check();
  await p.getByRole("button", { name: "Elimina", exact: true }).click();
  check("elimina: chiede conferma", (await p.getByRole("alertdialog", { name: "Eliminare Prova Nuova Modificata?" }).count()) === 1);
  await p.getByRole("alertdialog").getByRole("button", { name: "Elimina" }).click();
  const undo = toast(p, /Contatto eliminato/);
  await undo.waitFor();
  check("eliminato (si può ancora rimettere)", contact(at("nuova")).endsWith("|t|055 123456") && (await p.getByRole("button", { name: "Apri Prova Nuova Modificata" }).count()) === 0);
  await undo.getByRole("button", { name: "Annulla" }).click();
  await toast(p, /Contatto rimesso in rubrica/).waitFor();
  check("«Annulla»: torna in rubrica con i suoi gruppi", contact(at("nuova")).endsWith("|f|055 123456") && groupsOf(at("nuova")) === "Prova R Aziende" && (await p.getByRole("button", { name: "Apri Prova Nuova Modificata" }).count()) === 1);

  // ---------- 10. «Elimina e non scrivergli più» (cancellazione dei dati)
  await search(p, "mario rossi");
  await p.getByRole("button", { name: "Apri Mario Rossi" }).click();
  const mr = dialog(p, "Mario Rossi");
  check("scheda: «ultima» mail e numero di mail", /Mail ricevute\s*1, l'ultima il/.test(await mr.innerText()));
  await shot(p, "contatto-scheda", false);
  await mr.getByRole("button", { name: "Elimina e non scrivergli più" }).click();
  check("cancellazione dei dati: spiega cosa resta e che non si annulla", /Resta solo l'indirizzo tra chi non vuole più email/.test(await p.getByRole("alertdialog").innerText()) && /Non si può annullare/.test(await p.getByRole("alertdialog").innerText()));
  await p.getByRole("alertdialog").getByRole("button", { name: "Cancella i dati" }).click();
  await toast(p, /Dati cancellati/).waitFor();
  check("cancellazione: contatto, gruppi e storico via; resta il «non scrivergli più»", contact(at("uno")) === "" && DB(`select count(*) from "MailSendRecipient" where email=${q(at("uno"))}`) === "0" && DB(`select source from "MailOptOut" where email=${q(at("uno"))}`) === "cancellazione");
  await p.getByRole("button", { name: "Importa" }).click();
  await imp.locator('input[type="file"]').setInputFiles({ name: "contatti.vcf", mimeType: "text/vcard", buffer: Buffer.from(VCF) });
  await counts.waitFor();
  check("reimportando il .vcf, chi ha chiesto la cancellazione non torna", /2 non vogliono più email/.test(await counts.innerText()), await counts.innerText());
  await imp.getByRole("button", { name: "Chiudi" }).click();

  // ---------- 11. Scarica in Excel e CSV
  await open(p);
  await search(p, DOMAIN);
  await p.getByRole("button", { name: "Scarica" }).click();
  const ex = dialog(p, "Scarica la rubrica");
  check("scarica: dice cosa scarica (con i filtri)", /contatti che vedi con i filtri/.test(await ex.innerText()));
  let [dl] = await Promise.all([p.waitForEvent("download"), ex.getByRole("button", { name: "Excel (.xlsx)" }).click()]);
  const xlsx = unzipSync(readFileSync(await dl.path()));
  const sheet = strFromU8(xlsx["xl/worksheets/sheet1.xml"]);
  check("Excel: un vero .xlsx con titoli e contatti", /^rubrica-angolo-del-vino-\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename()) && sheet.includes("Nome o azienda") && sheet.includes(at("nicolo")) && sheet.includes("Nicolò Bàrberi"));
  await p.getByRole("button", { name: "Scarica" }).click();
  [dl] = await Promise.all([p.waitForEvent("download"), ex.getByRole("button", { name: /CSV/ }).click()]);
  const csv = readFileSync(await dl.path(), "utf8");
  check("CSV: punto e virgola, accenti, chi non vuole più email segnato", csv.startsWith("\uFEFFNome o azienda;Email;") && csv.includes(`Nicolò Bàrberi;${at("nicolo")}`) && /Non vuole più email \(dal/.test(csv));
  await p.context().close();

  // ---------- 12. Foto: telefono e computer, chiaro e scuro
  for (const [label, w, h, theme] of [["telefono-chiaro", 390, 844, "light"], ["telefono-scuro", 390, 844, "dark"], ["computer-chiaro", 1440, 900, "light"], ["computer-scuro", 1440, 900, "dark"], ["tablet-chiaro", 768, 1024, "light"]]) {
    const s = await page(w, h, theme);
    await open(s);
    await search(s, DOMAIN);
    check(`${label}: rubrica senza scorrimento di lato`, await noSideScroll(s));
    await shot(s, `rubrica-${label}`, false);
    if (w === 390) {
      const sizes = await s.evaluate(() =>
        [...document.querySelectorAll('#mail-pannello-rubrica button, #mail-pannello-rubrica label:has(> input[type="checkbox"]), #mail-pannello-rubrica select, #mail-pannello-rubrica input[type="search"]')]
          .filter((el) => el.getClientRects().length)
          .map((el) => el.getBoundingClientRect())
          .map((r) => Math.round(Math.min(r.width, r.height))),
      );
      check(`${label}: tocchi da almeno 44 px`, sizes.length > 10 && sizes.every((x) => x >= 44), sizes.filter((x) => x < 44).join(","));
      await s.getByRole("checkbox", { name: "Scegli Nicolò Bàrberi" }).check();
      await s.getByRole("checkbox", { name: "Scegli Fattoria Verdi" }).check();
      check(`${label}: barra dei scelti senza scorrimento di lato`, await noSideScroll(s));
      await shot(s, `rubrica-${label}-scelti`, false);
      await s.getByRole("button", { name: "Togli la scelta" }).click();
      await s.getByRole("button", { name: "Apri Nicolò Bàrberi" }).click();
      check(`${label}: scheda del contatto senza scorrimento di lato`, await noSideScroll(s));
      await shot(s, `contatto-${label}`, false);
      await dialog(s, "Nicolò Bàrberi").getByRole("button", { name: "Chiudi" }).click();
      await s.getByRole("button", { name: "Importa" }).click();
      await dialog(s, "Importa contatti").getByText("Come esportare i contatti dal telefono").click();
      await shot(s, `importa-${label}`, false);
      await dialog(s, "Importa contatti").locator('input[type="file"]').setInputFiles({ name: "contatti.vcf", mimeType: "text/vcard", buffer: Buffer.from(VCF) });
      await dialog(s, "Importa contatti").getByTestId("anteprima-conti").waitFor();
      check(`${label}: anteprima dell'importazione senza scorrimento di lato`, await noSideScroll(s));
      await shot(s, `importa-anteprima-${label}`, false);
      await dialog(s, "Importa contatti").getByRole("button", { name: "Chiudi" }).click();
      await s.getByRole("tab", { name: /Scrivi/ }).click();
      await pickMode(s, "Dalla rubrica");
      await s.locator("#mail-rubrica-cerca").fill(DOMAIN);
      check(`${label}: «Dalla rubrica» senza scorrimento di lato`, await noSideScroll(s));
      await shot(s, `passo1-dalla-rubrica-${label}`);
    }
    await s.context().close();
  }

  // ---------- 13. 5.000 contatti: si apre, si cerca, si sceglie, in fretta
  DB(`insert into "MailContact"(id, email, name, phone, source, consent, "updatedAt", "createdAt", "lastSentAt", "sentCount")
      select 'p5k'||i, 'persona'||i||'@prova-rubrica-5k.it', (array['Mario','Laura','Nicolò','Giulia','Andrea','Chiara'])[1+i%6]||' '||(array['Rossi','Bianchi','Bàrberi','Conti','Verdi','Neri','Galli'])[1+i%7]||' '||i,
             case when i%3=0 then '+39 333 '||lpad(i::text, 7, '0') end, 'file', 'cliente', now(), now() - (i||' minutes')::interval,
             case when i%2=0 then now() - (i||' hours')::interval end, i%5
      from generate_series(1, 5000) i`);
  const gk = DB(`select id from "MailGroup" where name='Prova R Aziende'`);
  DB(`insert into "MailContactGroup"("contactId","groupId") select 'p5k'||i, '${gk}' from generate_series(1, 5000, 3) i`);
  const big = await page(1440, 900);
  const t0 = Date.now();
  await open(big);
  const tOpen = Date.now() - t0;
  const timing = await big.evaluate(() => {
    const e = performance.getEntriesByType("resource").find((x) => x.name.includes("/mail/contatti"));
    return e ? { ms: Math.round(e.duration), kb: Math.round((e.transferSize || e.encodedBodySize) / 1024), raw: Math.round(e.decodedBodySize / 1024) } : null;
  });
  const gz = Math.round(gzipSync(await big.evaluate(() => fetch("/mail/contatti").then((r) => r.text()))).length / 1024);
  check(`5.000: la rubrica si apre (${tOpen} ms in tutto; dati ${timing?.ms} ms, ${timing?.raw} kB, compressi ${gz} kB)`, tOpen < 15000 && /5\.0\d\d contatti/.test(await text(big)), JSON.stringify(timing));
  const ts = Date.now();
  await big.locator("#rubrica-cerca").fill("nicolo barberi 4958");
  await big.getByRole("button", { name: "Apri Nicolò Bàrberi 4958" }).waitFor();
  const tSearch = Date.now() - ts;
  check(`5.000: ricerca senza accenti in ${tSearch} ms`, tSearch < 1500 && (await big.locator('ul[aria-label="Contatti"] > li').count()) === 1);
  const tsh = Date.now();
  await big.locator("#rubrica-cerca").fill("333 0004");
  await big.locator('ul[aria-label="Contatti"] > li').first().waitFor();
  check(`5.000: ricerca per telefono in ${Date.now() - tsh} ms`, /persona4\d{2}5?@|persona4/.test(await big.locator('ul[aria-label="Contatti"]').innerText()));
  await big.locator("#rubrica-cerca").fill("prova-rubrica-5k");
  const tsel = Date.now();
  await big.getByRole("checkbox", { name: "Seleziona tutti (5.000)" }).check();
  await big.getByRole("button", { name: "Scrivi a questi (5.000)" }).waitFor();
  check(`5.000: «Seleziona tutti» in ${Date.now() - tsel} ms`, true);
  check("5.000: solo i primi 100 disegnati, poi «Mostra altri»", (await big.locator('ul[aria-label="Contatti"] > li').count()) === 100 && (await big.getByRole("button", { name: /Mostra altri \(4\.900 ancora\)/ }).count()) === 1);
  const tw = Date.now();
  await big.getByRole("button", { name: "Scrivi a questi (5.000)" }).click();
  await big.getByText(/5\.000 persone scelte/).waitFor();
  check(`5.000: «Scrivi a questi» porta 5.000 scelti al passo 1 in ${Date.now() - tw} ms`, /5000\s+destinatari pronti/.test(await text(big)));
  check("5.000: oltre la quota del giorno, lo dice", /Riduci la lista/.test(await text(big)));
  const tsort = Date.now();
  await big.getByRole("tab", { name: /Rubrica/ }).click();
  await big.locator("#rubrica-ordine").selectOption("ultima");
  await big.waitForTimeout(50);
  check(`5.000: riordina per ultima mail in ${Date.now() - tsort} ms`, /Chiara|Andrea|Mario|Laura|Nicolò|Giulia/.test(await big.locator('ul[aria-label="Contatti"] > li').first().innerText()));
  await big.context().close();
  DB(`delete from "MailContact" where email like '%@prova-rubrica-5k.it'`);
  check("5.000: tolti", DB(`select count(*) from "MailContact" where email like '%@prova-rubrica-5k.it'`) === "0");
} catch (e) {
  check("errore inatteso", false, e?.stack?.split("\n").slice(0, 3).join(" ") ?? String(e));
} finally {
  restoreAll();
  await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
