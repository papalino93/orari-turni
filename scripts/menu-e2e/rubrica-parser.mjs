// Rubrica della pagina Mail: lettura dei contatti da importare (funzioni pure, niente browser né
// database). vCard di iPhone, Android (2.1 «quoted-printable») e Google, righe spezzate, più email,
// accenti; CSV di Google Contatti e Outlook (inglese e italiano); elenco incollato; confronto con
// la rubrica (nuovi, già presenti, nome diverso, cancellati, doppioni, senza email).
// Uso: npx tsx scripts/menu-e2e/rubrica-parser.mjs
const I = await import("../../src/lib/contact-import.ts");
const R = await import("../../src/lib/mail-rubrica.ts");

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok || extra === "" ? "" : " — " + extra}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (x) => JSON.stringify(x);

// ---------- iPhone (vCard 3.0): più contatti, «item1.», tipo «pref», foto spezzata su più righe,
// virgola protetta nell'azienda, contatto senza email, righe con CRLF.
const iphone = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//Apple Inc.//iPhone OS 17.0//EN",
  "N:Rossi;Mario;;Dott.;",
  "FN:Dott. Mario Rossi",
  "ORG:Rossi\\, Vini & C.;",
  "item1.EMAIL;type=INTERNET;type=HOME:mario@casa.it",
  "item2.EMAIL;type=INTERNET;type=WORK;type=pref:Mario.Rossi@RossiVini.it",
  "item1.X-ABLabel:_$!<Home>!$_",
  "TEL;type=CELL;type=VOICE;type=pref:+39 333 123 4567",
  "TEL;type=HOME;type=VOICE:055 123456",
  "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAA",
  " ZKADAAQAAAABAAAAZAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAZABkAwEiAAIRAQMRAf/E",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Bianchi;Nicolò;;;",
  "FN:Nicolò Bianchi",
  "EMAIL;type=INTERNET;type=HOME:nicolo.bianchi@esempio.it",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:;;;;",
  "FN:Enoteca Sant’Ambrogio",
  "ORG:Enoteca Sant’Ambrogio;",
  "EMAIL;type=INTERNET;type=WORK:info@santambrogio.it",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Verdi;Giuseppe;;;",
  "FN:Giuseppe Verdi",
  "TEL;type=CELL:+39 347 000 1111",
  "END:VCARD",
].join("\r\n");
{
  const r = I.parseVcf(iphone);
  check("iPhone: 3 contatti con email, 1 senza", r.rows.length === 3 && eq(r.noEmail, ["Giuseppe Verdi"]), show(r));
  check("iPhone: nome dal campo FN", r.rows[0].name === "Dott. Mario Rossi", r.rows[0].name);
  check("iPhone: più email, prima quella preferita (pref) e in minuscolo", eq(r.rows[0].emails, ["mario.rossi@rossivini.it", "mario@casa.it"]), show(r.rows[0].emails));
  check("iPhone: telefono preferito", r.rows[0].phone === "+39 333 123 4567", r.rows[0].phone);
  check("iPhone: accenti in UTF-8", r.rows[1].name === "Nicolò Bianchi", r.rows[1].name);
  check("iPhone: azienda senza nome di persona", r.rows[2].name === "Enoteca Sant’Ambrogio" && r.rows[2].emails[0] === "info@santambrogio.it");
  check("iPhone: la foto non entra da nessuna parte", !show(r).includes("9j"));
}

// ---------- Android (vCard 2.1): quoted-printable con accenti e righe spezzate da «=», nome solo in N,
// parametri senza «TYPE=», CHARSET.
const android = [
  "BEGIN:VCARD",
  "VERSION:2.1",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ferr=C3=A0;Ilari=C3=A0;;;",
  "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ilari=C3=A0 Ferr=C3=A0 della Societ=C3=A0 Agricola Pod=",
  "ere San Niccol=C3=B2",
  "TEL;CELL;PREF:3331112222",
  "EMAIL;HOME:ilaria@podere.it",
  "EMAIL;WORK;PREF:vendite@podere.it",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:2.1",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:L=C3=B2;Fran=C3=A7ois;;;",
  "EMAIL;INTERNET:francois@lo.fr",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:2.1",
  "N;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:Pell=E8;Andr=E8;;;",
  "EMAIL:andre@pelle.it",
  "END:VCARD",
].join("\n");
{
  const r = I.parseVcf(android);
  check("Android: 3 contatti", r.rows.length === 3, show(r));
  check("Android: quoted-printable, UTF-8 e riga spezzata da «=»", r.rows[0].name === "Ilarià Ferrà della Società Agricola Podere San Niccolò", r.rows[0].name);
  check("Android: email preferita prima (PREF senza TYPE=)", eq(r.rows[0].emails, ["vendite@podere.it", "ilaria@podere.it"]), show(r.rows[0].emails));
  check("Android: nome da N (Nome Cognome) se manca FN", r.rows[1].name === "François Lò", r.rows[1].name);
  check("Android: CHARSET=ISO-8859-1", r.rows[2].name === "Andrè Pellè", r.rows[2].name);
  check("Android: telefono (cellulare sempre «+39 333 111 2222»)", r.rows[0].phone === "+39 333 111 2222", r.rows[0].phone);
}

// ---------- Google Contatti (.vcf 3.0) con righe spezzate (RFC 6350) e vCard 4.0 con PREF=1.
const google = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:Anna Maria Cecchi de' Rossi della Gherard",
  " esca",
  "N:Cecchi de' Rossi;Anna Maria;;;",
  "EMAIL;TYPE=INTERNET;TYPE=HOME:anna@cecchi.it",
  "EMAIL;TYPE=INTERNET:anna.cecchi@lavoro",
  " .it",
  "CATEGORIES:myContacts",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Studio Lenzi",
  "EMAIL;TYPE=work:segreteria@studiolenzi.it",
  "EMAIL;PREF=1:lenzi@studiolenzi.it",
  "TEL;VALUE=uri;TYPE=cell:tel:+39-055-111222",
  "END:VCARD",
].join("\r\n");
{
  const r = I.parseVcf(google);
  check("Google .vcf: righe spezzate rimesse insieme (nome)", r.rows[0].name === "Anna Maria Cecchi de' Rossi della Gherardesca", r.rows[0].name);
  check("Google .vcf: righe spezzate rimesse insieme (email)", eq(r.rows[0].emails, ["anna@cecchi.it", "anna.cecchi@lavoro.it"]), show(r.rows[0].emails));
  check("vCard 4.0: PREF=1 prima, telefono «tel:»", r.rows[1].emails[0] === "lenzi@studiolenzi.it" && r.rows[1].phone === "+39-055-111222", show(r.rows[1]));
}

// ---------- Google Contatti CSV (formato nuovo, più email in una casella con « ::: »)
const googleCsv = [
  "First Name,Middle Name,Last Name,Phonetic First Name,Nickname,File As,E-mail 1 - Label,E-mail 1 - Value,E-mail 2 - Label,E-mail 2 - Value,Phone 1 - Label,Phone 1 - Value,Organization Name,Notes",
  'Mario,,Rossi,,,,* Home,mario@casa.it ::: mario@lavoro.it,Work,MARIO@ROSSI.IT,Mobile,+39 333 1234567,Rossi Vini,"nota con, virgola',
  'su due righe"',
  ",,,,,,* Work,info@trattoria.it,,,,,Trattoria da Gino,",
  "Lucia,,Neri,,,,,,,,Mobile,+39 340 9999999,,",
].join("\n");
{
  const r = I.parseCsvContacts(googleCsv);
  check("Google CSV: riconosciuto", r.format === "google", r.format);
  check("Google CSV: 2 con email, 1 senza", r.rows.length === 2 && eq(r.noEmail, ["Lucia Neri"]), show(r));
  check("Google CSV: « ::: » e più colonne di email", eq(r.rows[0].emails, ["mario@casa.it", "mario@lavoro.it", "mario@rossi.it"]), show(r.rows[0].emails));
  check("Google CSV: nome e cognome, telefono", r.rows[0].name === "Mario Rossi" && r.rows[0].phone === "+39 333 123 4567", show(r.rows[0]));
  check("Google CSV: solo azienda → nome dell'azienda", r.rows[1].name === "Trattoria da Gino", r.rows[1].name);
}

// ---------- Outlook CSV (inglese) e Outlook in italiano (punto e virgola)
const outlookCsv = [
  '"First Name","Middle Name","Last Name","Title","Company","E-mail Address","E-mail Type","E-mail Display Name","E-mail 2 Address","Business Phone","Mobile Phone"',
  '"Giulia","","Conti","","Conti Srl","giulia@conti.it","SMTP","Giulia Conti (giulia@conti.it)","g.conti@gmail.com","055 1234","339 7654321"',
].join("\r\n");
const outlookIt = [
  "Nome;Secondo nome;Cognome;Società;Indirizzo posta elettronica;Tipo posta elettronica;Nome visualizzato posta elettronica;Cellulare",
  "Piero;;Bàrberi;;piero@barberi.it;SMTP;Piero Bàrberi (piero@barberi.it);333 0000000",
].join("\n");
{
  const r = I.parseCsvContacts(outlookCsv);
  check("Outlook CSV: riconosciuto", r.format === "outlook", r.format);
  check("Outlook CSV: nome, due email (non quella «Display Name»), cellulare prima", r.rows[0].name === "Giulia Conti" && eq(r.rows[0].emails, ["giulia@conti.it", "g.conti@gmail.com"]) && r.rows[0].phone === "+39 339 765 4321", show(r.rows[0]));
  const it = I.parseCsvContacts(outlookIt);
  check("Outlook in italiano (;)", it.format === "outlook" && it.rows[0].name === "Piero Bàrberi" && eq(it.rows[0].emails, ["piero@barberi.it"]) && it.rows[0].phone === "+39 333 000 0000", show(it));
}

// ---------- Il file di esempio della pagina Mail e quello scaricato dalla rubrica
{
  const r = I.parseCsvContacts("\uFEFFemail;nome\nmario.rossi@esempio.it;Dott. Rossi\nlaura.bianchi@esempio.it;Laura\n");
  check("file di esempio (email;nome)", r.rows.length === 2 && r.rows[0].name === "Dott. Rossi", show(r));
  const own = I.parseCsvContacts('\uFEFFNome o azienda;Email;Telefono;Gruppi;Note;Stato;Ultima mail\n"Rossi, Mario";mario@rossi.it;333 1;Aziende;;Può ricevere;3 nov 2026\n');
  check("file scaricato dalla rubrica: si reimporta", own.rows.length === 1 && own.rows[0].name === "Rossi, Mario" && own.rows[0].phone === "333 1", show(own));
  const bare = I.parseCsvContacts("a@uno.it\nb@due.it\nnon-una-mail\n");
  check("una email per riga, senza titoli", bare.rows.length === 2 && eq(bare.noEmail, ["non-una-mail"]), show(bare));
}

// ---------- Il primo file del titolare: vecchia lista di Brevo, UTF-8 con BOM, punto e virgola,
// «Email;Nome o azienda;Gruppo», più gruppi separati da virgole. E l'esportazione dei contatti di Brevo.
{
  const csv = "\uFEFFEmail;Nome o azienda;Gruppo\r\ninfo@cantina-rossi.it;Cantina Rossi S.r.l.;Aziende\r\nAMMINISTRAZIONE@Bianchi.IT;Studio Bianchi & Associati;Aziende, Clienti storici\r\nlaura@verdi.it;Laura Verdi;\r\nsbagliata.it;Senza Chiocciola;Aziende\r\n";
  const r = I.parseCsvContacts(csv);
  check("lista Brevo «Email;Nome o azienda;Gruppo»: 3 con email, 1 senza", r.rows.length === 3 && r.noEmail.length === 1, show(r));
  check("lista Brevo: nome o azienda e gruppo", r.rows[0].name === "Cantina Rossi S.r.l." && eq(r.rows[0].groups, ["Aziende"]), show(r.rows[0]));
  check("lista Brevo: più gruppi separati da virgole, email in minuscolo", eq(r.rows[1].groups, ["Aziende", "Clienti storici"]) && r.rows[1].emails[0] === "amministrazione@bianchi.it", show(r.rows[1]));
  check("lista Brevo: gruppo vuoto = nessun gruppo", eq(r.rows[2].groups, []));
  const plan = I.planImport(r, {}, new Map(), new Set(), ["clienti STORICI"]);
  check(
    "anteprima: «Nuovo gruppo: Aziende» (2), «Clienti storici» c'è già (maiuscole diverse)",
    eq(plan.fileGroups, [{ name: "Aziende", count: 2, isNew: true }, { name: "Clienti storici", count: 1, isNew: false }]),
    show(plan.fileGroups),
  );
  const many = ["Email;Nome o azienda;Gruppo", ...Array.from({ length: 340 }, (_, i) => `azienda${i}@esempio.it;Azienda ${i} S.p.A.;Aziende`)].join("\n");
  const big = I.planImport(I.parseCsvContacts("\uFEFF" + many), {}, new Map(), new Set(), []);
  check("340 aziende, tutte in «Aziende»", big.counts.nuovo === 340 && big.fileGroups.length === 1 && big.fileGroups[0].count === 340, show(big.counts));
  const brevo = I.parseCsvContacts("EMAIL;NOME;COGNOME;SMS;DOUBLE_OPT-IN;OPT_IN\nmario@rossi.it;Mario;Rossi;393331234567;Yes;\nanna@x.it;;;;;\n");
  check("esportazione contatti di Brevo (EMAIL, NOME, COGNOME, SMS)", brevo.format === "brevo" && brevo.rows[0].name === "Mario Rossi" && brevo.rows[0].phone === "+39 333 123 4567" && brevo.rows[1].name === "", show(brevo));
  const brevoEn = I.parseCsvContacts("EMAIL,FIRSTNAME,LASTNAME,SMS\njo@x.it,Jo,Bloggs,447700900000\n");
  check("esportazione di Brevo in inglese (FIRSTNAME, LASTNAME)", brevoEn.format === "brevo" && brevoEn.rows[0].name === "Jo Bloggs", show(brevoEn));
  const own = I.parseCsvContacts("Nome o azienda;Email;Telefono;Gruppi\nX;x@x.it;;Aziende, Clienti dal sito\n");
  check("file della rubrica: la colonna «Gruppi» si reimporta", eq(own.rows[0].groups, ["Aziende", "Clienti dal sito"]), show(own.rows[0]));
}

// ---------- Elenco incollato
{
  const r = I.parsePasted('Mario Rossi <Mario@Rossi.it>, "Bianchi, Laura" <laura@bianchi.it>; anna@verdi.it');
  check("incollato dal campo «A:» di una mail", eq(r.rows.map((x) => [x.name, x.emails[0]]), [["Mario Rossi", "mario@rossi.it"], ["Bianchi, Laura", "laura@bianchi.it"], ["", "anna@verdi.it"]]), show(r.rows));
  const lines = I.parsePasted("uno@x.it, due@y.it, tre@z.it");
  check("più indirizzi sulla stessa riga = più persone", lines.rows.length === 3, show(lines.rows));
  const semi = I.parsePasted("mario@x.it; Mario\nsbagliata@\nlaura@y.it\tLaura Bianchi\t333 1234567");
  check("righe «email; nome», tabulazioni, telefono, riga sbagliata", semi.rows.length === 2 && semi.rows[1].name === "Laura Bianchi" && semi.rows[1].phone === "+39 333 123 4567" && semi.noEmail.length === 1, show(semi));
}

// ---------- Contact Picker (Android)
{
  const r = I.fromPicker([{ name: ["Zoe"], email: ["ZOE@x.it", "zoe@y.it"], tel: ["+39 1"] }, { name: ["Senza"], email: [] }]);
  check("Contact Picker: email in minuscolo, più email, senza email contati", r.rows.length === 1 && eq(r.rows[0].emails, ["zoe@x.it", "zoe@y.it"]) && eq(r.noEmail, ["Senza"]), show(r));
}

// ---------- Confronto con la rubrica
{
  const parsed = I.parseCsvContacts(
    ["email;nome", "nuovo@x.it;Nuovo", "uguale@x.it;Mario Rossi", "vuoto@x.it;Laura", "diverso@x.it;Dott. Bianchi", "via@x.it;Via", "NUOVO@x.it;", "senza-nome@x.it;", ";Solo nome"].join("\n"),
  );
  const existing = new Map([
    ["uguale@x.it", { name: "Mario Rossì" }],
    ["vuoto@x.it", { name: "" }],
    ["diverso@x.it", { name: "Bianchi" }],
    ["senza-nome@x.it", { name: "Qualcuno" }],
  ]);
  const plan = I.planImport(parsed, {}, existing, new Set(["via@x.it"]));
  const c = plan.counts;
  check(
    "confronto: 1 nuovo · 2 uguali · 1 da riempire · 1 nome diverso · 1 non vuole · 1 doppio · 1 senza email",
    c.nuovo === 1 && c.uguale === 2 && c.riempie === 1 && c.diverso === 1 && c.nonvuole === 1 && c.doppi === 1 && c.senzaEmail === 1,
    show(c),
  );
  check("confronto: «Mario Rossi» = «Mario Rossì» (accenti)", plan.items.find((x) => x.email === "uguale@x.it").kind === "uguale");
  const multi = I.parseVcf(iphone);
  const p1 = I.planImport(multi, {}, new Map(), new Set());
  const p2 = I.planImport(multi, { 0: "mario@casa.it" }, new Map(), new Set());
  check("più email: si usa la prima, o quella scelta", p1.multi[0] === 0 && p1.items[0].email === "mario.rossi@rossivini.it" && p2.items[0].email === "mario@casa.it");
}

// ---------- Ricerca senza accenti, telefono per cifre, ordine
{
  const c = { name: "Nicolò Bàrberi", email: "nico@x.it", notes: "cliente del giovedì" };
  const key = R.searchKey(c);
  check("ricerca: «nicolo barberi» trova «Nicolò Bàrberi»", R.matches(key, "", "nicolo barberi"));
  check("ricerca: nelle note, senza accenti", R.matches(key, "", "GIOVEDI"));
  check("ricerca: telefono per cifre («333 12»)", R.matches("", "393331234567", "333 12") && !R.matches("", "393331234567", "444"));
  const base = { email: "", notes: "", phone: "", source: "", consent: "", consentAt: "", consentNote: "", lastSentAt: null, sentCount: 0, groups: [], out: null };
  const list = [
    { ...base, id: "1", name: "", email: "zz@x.it", createdAt: "2026-01-03" },
    { ...base, id: "2", name: "Àlfa", email: "b@x.it", createdAt: "2026-01-01", lastSentAt: "2026-11-01" },
    { ...base, id: "3", name: "alfa", email: "a@x.it", createdAt: "2026-01-02" },
    { ...base, id: "4", name: "Beta", email: "c@x.it", createdAt: "2026-01-04", lastSentAt: "2026-11-05" },
  ];
  const ids = (by) => [...list].sort((a, b) => R.compareContacts(a, b, by)).map((x) => x.id).join("");
  check("ordine per nome (senza accenti, chi non ha nome in fondo)", ids("nome") === "3241", ids("nome"));
  check("ordine per ultima mail", ids("ultima") === "4231", ids("ultima"));
  check("ordine per aggiunti da poco", ids("recenti") === "4132", ids("recenti"));
}

// Telefono in un formato solo: i cellulari italiani «+39 333 111 2222», fissi ed esteri come scritti.
check(
  "tidyPhone: cellulari uguali comunque scritti, fissi ed esteri intatti",
  ["3334445555", "393334445555", "0039 333-444-5555", "+39 333 444 5555", "333 44 45 555"].every((x) => R.tidyPhone(x) === "+39 333 444 5555") &&
    R.tidyPhone("0577 12 34 56") === "0577 12 34 56" &&
    R.tidyPhone("+44 20 7946 0958") === "+44 20 7946 0958" &&
    R.tidyPhone(null) === "",
);

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} ok`);
process.exit(ok === results.length ? 0 : 1);
