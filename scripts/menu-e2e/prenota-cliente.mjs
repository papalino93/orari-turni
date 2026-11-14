// Prenotazioni online, parte del cliente (E2E sul server di prova, telefono): modulo «Chiedi un
// tavolo» (persone, giorno, ora, invio, pagina di stato), errori accanto ai campi, gruppo grande,
// trappola e tempo minimo, troppi invii, senza rete, evento, funzione spenta (404 / anteprima del
// titolare), /prenota?da=google, intestazioni della pagina di stato, statistiche del menù.
// Uso: node scripts/menu-e2e/prenota-cliente.mjs   (SHOTS=<cartella> per le foto)
import {
  BASE,
  onInterrupt,
  ADMIN_PW,
  SHOTS,
  check,
  finish,
  DB,
  q,
  snapshotBookingSetting,
  restoreBookingSetting,
  setBookingSetting,
  cleanBookings,
  bookableDays,
  formStamp,
  postRequest,
  launch,
  newContext,
  login,
  randomIp,
  randomPhone,
  coolDown,
} from "./prenota-lib.mjs";

const savedSetting = snapshotBookingSetting();
onInterrupt(() => {
  cleanBookings();
  restoreBookingSetting(savedSetting);
});
cleanBookings();
setBookingSetting({ enabled: true });
const { days } = bookableDays();
// Come la pagina: per il cliente «oggi» è la data del calendario; tra mezzanotte e le 5 la serata
// appena finita (giorno commerciale di ieri) non si mostra, a meno che sia ancora prenotabile.
const calToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shown = days.filter((d) => d.day >= calToday || d.state === "open");
// Giorni con orari, da domani in poi (oggi gli orari dipendono dall'ora in cui si lancia la prova).
const open = days.filter((d, i) => i >= 1 && d.state === "open" && d.slots.length >= 3);
const D1 = open[0];
const D2 = open[1];
const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/prenota-${name}.png`, fullPage: true });
const rowsBy = (where) => DB(`select count(*) from "BookingRequest" where ${where}`);
// Un evento in corso o nei prossimi giorni (lo slug cambia quando si rifanno i dati di prova).
const EVENT_SLUG = DB(`select slug from "MenuPromo" where kind='EVENT' and hidden=false and "deletedAt" is null and "endDate" >= to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD') order by "startDate" limit 1`);
const body = (over = {}) => ({ day: D1.day, time: D1.slots[0], people: 2, name: "Prova C Api", phone: randomPhone(), email: "", contact: "whatsapp", note: "", allergies: false, source: "menu", event: "", privacy: true, sito: "", ...over });

let browser;
try {
  check("ci sono giorni prenotabili nei prossimi giorni", !!D1 && !!D2, days.map((d) => `${d.day}:${d.state}`).join(" "));

  // ================= Senza browser: la route di invio =================
  {
    const t = await formStamp();
    const ok = await postRequest(body({ t, name: "Prova C Api ok" }));
    check("invio diretto con tutto in regola: ok e link alla pagina di stato", ok.status === 200 && ok.json?.ok === true && /^\/menu\/prenota\/r\/[\w-]+$/.test(ok.json.statusPath ?? ""), JSON.stringify(ok.json));
    check("risposta dell'invio mai in cache", /no-store/.test(ok.headers.get("cache-control") ?? ""));

    const trap = await postRequest(body({ t, sito: "http://spam.example", name: "Prova C Trappola" }));
    check("campo trappola pieno: risponde «ok» ma non salva nulla", trap.json?.ok === true && rowsBy(`name='Prova C Trappola'`) === "0", JSON.stringify(trap.json));

    const fast = await postRequest(body({ t: await formStamp(500), name: "Prova C Veloce" }));
    check("inviato dopo mezzo secondo: «Un attimo…», niente salvato", fast.json?.ok === false && /Un attimo/.test(fast.json.error) && rowsBy(`name='Prova C Veloce'`) === "0", JSON.stringify(fast.json));
    const noStamp = await postRequest(body({ t: undefined, name: "Prova C Senza timbro" }));
    check("senza timbro del modulo: «La pagina è vecchia: ricaricala»", noStamp.json?.ok === false && /ricaricala/.test(noStamp.json.error), JSON.stringify(noStamp.json));
    const forged = await postRequest(body({ t: `${Date.now() - 60000}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, name: "Prova C Falso" }));
    check("timbro falso: rifiutato", forged.json?.ok === false && rowsBy(`name='Prova C Falso'`) === "0");

    const foreign = await postRequest(body({ t, name: "Prova C Altro sito" }), { headers: { origin: "https://evil.example" } });
    check("invio da un altro sito (Origin diverso): 403", foreign.status === 403 && rowsBy(`name='Prova C Altro sito'`) === "0");
    const r = await fetch(`${BASE}/menu/prenota/invia`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": randomIp() }, body: JSON.stringify(body({ t, name: "Prova C Senza origin" })) });
    check("invio senza Origin né Sec-Fetch-Site: 403", r.status === 403);
    const bad = await fetch(`${BASE}/menu/prenota/invia`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: "{non json" });
    check("corpo non JSON: errore senza testi tecnici", bad.status === 400 && !/json|syntax|undefined/i.test((await bad.json()).error ?? ""));
    const huge = await postRequest(body({ t, note: "x".repeat(5000), name: "Prova C Enorme" }));
    check("corpo enorme: rifiutato", huge.json?.ok === false && rowsBy(`name='Prova C Enorme'`) === "0");

    // Doppio tocco su «Invia» (o rete che ripete la richiesta): stesso telefono, giorno e ora, stesso indirizzo.
    const twinIp = randomIp();
    const twin = body({ t, name: "Prova C Doppio", phone: randomPhone(), day: D2.day, time: D2.slots[0] });
    const again = await postRequest(twin, { ip: twinIp });
    const again2 = await postRequest(twin, { ip: twinIp });
    check("doppio invio uno dopo l'altro (stesso indirizzo): la stessa richiesta", !!again.json?.statusPath && again.json?.statusPath === again2.json?.statusPath && rowsBy(`name='Prova C Doppio'`) === "1");
    check("doppio invio: la seconda risposta dice che è la stessa richiesta", again.json?.reused === false && again2.json?.reused === true);
    {
      const html = await (await fetch(`${BASE}${again2.json.statusPath}?gia=1`)).text();
      check("pagina di stato con ?gia=1: «l'avevi già mandata»", /già mandata poco fa/.test(html));
    }
    // Chi conosce solo telefono, giorno e ora di qualcun altro non ottiene il suo link.
    const thief = await postRequest(twin);
    check("stessi dati da un altro indirizzo: niente link, «c'è già una richiesta»", thief.json?.ok === false && !thief.json.statusPath && /c'è già una richiesta/.test(thief.json.error ?? "") && thief.json.field === "time", JSON.stringify(thief.json));
    const twin2 = body({ t, name: "Prova C Doppio insieme", phone: randomPhone(), day: D2.day, time: D2.slots[1] });
    const both = await Promise.all([postRequest(twin2, { ip: twinIp }), postRequest(twin2, { ip: twinIp })]);
    check("doppio invio nello stesso istante: una sola richiesta, tutti e due ok", rowsBy(`name='Prova C Doppio insieme'`) === "1" && both.every((x) => x.json?.ok), `richieste salvate: ${rowsBy(`name='Prova C Doppio insieme'`)}`);

    const field = await postRequest(body({ t, name: "P" }));
    check("errore di campo: torna «field: name» con un testo per il cliente", field.json?.ok === false && field.json.field === "name" && field.json.error === "Scrivi il tuo nome.");

    // Troppi invii dallo stesso indirizzo: 10 all'ora.
    const ip = randomIp();
    const res = [];
    for (let i = 0; i < 11; i++) res.push(await postRequest(body({ t, name: `Prova C Ip ${i}`, time: D2.slots[i % D2.slots.length], day: D2.day }), { ip }));
    check("troppi invii dallo stesso telefono/rete: l'undicesimo è fermato", res.slice(0, 10).every((x) => x.json?.ok) && res[10].json?.ok === false && /tante richieste/.test(res[10].json.error), res.map((x) => (x.json?.ok ? "ok" : x.json?.error)).join(" / "));

    // Telefono incompleto: lo dice il server (e lo stesso testo il modulo)
    const short = await postRequest(body({ t, name: "Prova C Corto", phone: "333 12345" }));
    check("telefono incompleto: «un cellulare ha 10 cifre», niente salvato", short.json?.ok === false && short.json.field === "phone" && /incompleto/.test(short.json.error) && rowsBy(`name='Prova C Corto'`) === "0", JSON.stringify(short.json));

    // Pagina di stato: intestazioni e link inventato
    const st = await fetch(`${BASE}${ok.json.statusPath}`, { redirect: "manual" });
    check("pagina di stato: 200", st.status === 200, String(st.status));
    check("pagina di stato: Referrer-Policy no-referrer", st.headers.get("referrer-policy") === "no-referrer", st.headers.get("referrer-policy"));
    // In sviluppo Next scrive «no-cache, must-revalidate» su tutte le pagine (anche /login): in produzione vale no-store.
    check("pagina di stato: mai in cache (no-store, o no-cache del server di sviluppo)", /no-store|no-cache/.test(st.headers.get("cache-control") ?? ""), st.headers.get("cache-control"));
    const html = await st.text();
    check("pagina di stato: noindex", /<meta[^>]+name="robots"[^>]+noindex/i.test(html));
    const fake = await fetch(`${BASE}/menu/prenota/r/${"x".repeat(43)}`);
    check("link inventato: 404", fake.status === 404, String(fake.status));

    // Azioni del cliente dalla route
    const token = ok.json.statusPath.split("/").pop();
    const act = (action, headers = {}) =>
      fetch(`${BASE}/menu/prenota/r/${token}/azione`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, ...headers }, body: JSON.stringify({ action }) }).then(async (x) => ({ status: x.status, json: await x.json().catch(() => null) }));
    const evil = await act("cancel", { origin: "https://evil.example" });
    check("annullo da un altro sito: rifiutato", evil.status === 403 && DB(`select status from "BookingRequest" where name='Prova C Api ok'`) === "PENDING", JSON.stringify(evil));
    const acc = await act("accept");
    check("«accetta» senza proposta: errore chiaro", acc.json?.ok === false && /nessun orario/.test(acc.json.error ?? ""), JSON.stringify(acc));

    // /prenota?da=google → /menu/prenota?da=google
    const red = await fetch(`${BASE}/prenota?da=google`, { redirect: "manual" });
    check("/prenota?da=google: reindirizzamento permanente a /menu/prenota?da=google", [301, 308].includes(red.status) && /\/menu\/prenota\?da=google$/.test(red.headers.get("location") ?? ""), `${red.status} ${red.headers.get("location")}`);
  }

  await browserTests();
} catch (e) {
  check("la prova è arrivata in fondo", false, e?.stack ?? String(e));
} finally {
  await browser?.close();
  cleanBookings();
  restoreBookingSetting(savedSetting);
}
check("pulizia: nessuna richiesta «Prova C» rimasta", rowsBy(`name like 'Prova C%'`) === "0");
check("pulizia: impostazione «bookings» come prima", snapshotBookingSetting() === savedSetting);
process.exit(finish());

// ================= Con il browser, da telefono =================
async function browserTests() {
  browser = await launch();
  const startedAt = DB(`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')`);
  // Ogni «cliente» con un suo indirizzo (il servizio conta 10 richieste all'ora per indirizzo).
  const client = async (extra = {}) => {
    const ctx = await newContext(browser, "phone", { extraHTTPHeaders: { "x-forwarded-for": randomIp() }, ...extra });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.errs = errs;
    return { ctx, p };
  };
  const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const alerts = async (p) => (await p.getByRole("alert").allInnerTexts()).join(" | ");
  const send = (p) => (coolDown(), p.getByRole("button", { name: "Invia la richiesta" }).click());
  const pick = async (p, people, day, time) => {
    if (people) await p.getByRole("radio", { name: `${people} ${people === 1 ? "persona" : "persone"}`, exact: true }).click();
    if (day) await p.locator(`[data-day="${day}"]`).click();
    if (time) await p.getByRole("radiogroup", { name: "Ora" }).getByRole("radio", { name: time, exact: true }).click();
  };
  const fillAll = async (p, { name = "Prova C Cliente", phone = randomPhone(), people = 2, day = D1.day, time = D1.slots[1] } = {}) => {
    await pick(p, people, day, time);
    await p.getByLabel("Nome", { exact: true }).fill(name);
    await p.getByLabel("Telefono", { exact: true }).fill(phone);
    await p.getByRole("checkbox", { name: /Ho letto l.informativa/ }).check();
  };

  // ---------- Funzione spenta: 404 per i clienti, anteprima per il titolare
  setBookingSetting({ enabled: false });
  {
    const { ctx, p } = await client();
    const r = await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    check("spenta: il cliente riceve 404", r.status() === 404, String(r.status()));
    await p.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
    check("spenta: nel menù niente «Chiedi un tavolo»", (await p.getByRole("link", { name: "Chiedi un tavolo" }).count()) === 0);
    const rp = await p.goto(`${BASE}/menu/prenota/privacy`, { waitUntil: "networkidle", timeout: 120000 });
    check("spenta: anche l'informativa è 404 per il cliente", rp.status() === 404, String(rp.status()));
    await p.goto(`${BASE}/menu/p/${EVENT_SLUG}`, { waitUntil: "networkidle", timeout: 120000 });
    const book = await p.getByRole("link", { name: /^Prenota/ }).first().getAttribute("href").catch(() => null);
    check("spenta: «Prenota» dell'evento resta WhatsApp", !book || /wa\.me/.test(book), book);
    await ctx.close();

    const a = await client();
    await login(a.p, "andrea", ADMIN_PW);
    const ra = await a.p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    const txt = await a.p.locator("body").innerText();
    check("spenta: il titolare vede la pagina (200) con la fascia «Anteprima»", ra.status() === 200 && /Anteprima:\s*le prenotazioni online sono spente, i clienti non vedono questa pagina/.test(txt), String(ra.status()));
    await a.p.waitForTimeout(3200);
    await fillAll(a.p, { name: "Prova C Anteprima" });
    await send(a.p);
    await a.p.waitForURL(/\/menu\/prenota\/r\//, { timeout: 30000 }).catch(() => {});
    check("anteprima: la richiesta del titolare è «di prova»", DB(`select "isTest" from "BookingRequest" where name='Prova C Anteprima'`) === "t", `${a.p.url()} ${await alerts(a.p)}`);
    check("anteprima: la pagina di stato lo dice", /Richiesta di prova/.test(await a.p.locator("body").innerText()));
    await shot(a.p, "anteprima-stato");
    const rpa = await a.p.goto(`${BASE}/menu/prenota/privacy`, { waitUntil: "networkidle", timeout: 120000 });
    check("spenta: il titolare vede l'informativa", rpa.status() === 200, String(rpa.status()));
    await a.ctx.close();
  }
  setBookingSetting({ enabled: true });

  // ---------- Il menù porta al modulo
  {
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
    const link = p.getByRole("link", { name: "Chiedi un tavolo" });
    check("accesa: nel menù «Chiedi un tavolo» → /menu/prenota?da=menu", (await link.count()) >= 1 && (await link.first().getAttribute("href")) === "/menu/prenota?da=menu", await link.first().getAttribute("href").catch(() => "assente"));
    await p.goto(`${BASE}/menu/p/${EVENT_SLUG}`, { waitUntil: "networkidle", timeout: 120000 });
    const book = await p.getByRole("link", { name: /^Prenota/ }).first().getAttribute("href").catch(() => null);
    check("accesa: «Prenota» dell'evento apre il modulo con l'evento", (book ?? "").startsWith(`/menu/prenota?evento=${EVENT_SLUG}`), book);
    await ctx.close();
  }

  // ---------- Modulo: errori accanto ai campi, poi invio
  let statusUrl;
  {
    const { ctx, p } = await client();
    const r = await p.goto(`${BASE}/menu/prenota?da=menu`, { waitUntil: "networkidle", timeout: 120000 });
    check("modulo: 200 e titolo «Chiedi un tavolo»", r.status() === 200 && (await p.getByRole("heading", { level: 1 }).innerText()) === "Chiedi un tavolo");
    check("modulo: niente scorrimento orizzontale (iPhone 390)", (await overflow(p)) <= 0);
    await shot(p, "modulo-vuoto");
    check("modulo: persone da 1 a 10 e «Più di 10»", (await p.getByRole("radiogroup", { name: "Quante persone" }).getByRole("radio").count()) === 11 && (await p.getByRole("radio", { name: "Più di 10" }).count()) === 1);
    check("modulo: «Non è ancora una conferma: ti rispondiamo noi.»", /Non è ancora una conferma: ti rispondiamo noi\./.test(await p.locator("main").innerText()));
    await send(p);
    check("errore: «Scegli quante persone.»", /Scegli quante persone\./.test(await alerts(p)), await alerts(p));
    await pick(p, 2);
    check("l'errore sparisce appena si sceglie", !/Scegli quante persone/.test(await alerts(p)));
    await send(p);
    check("errore: «Scegli il giorno.»", /Scegli il giorno\./.test(await alerts(p)));
    // Giorni: i chiusi/al completo non si possono scegliere (e oggi, dopo la chiusura, è «Chiuso»)
    const disabled = await p.locator("[data-day]:disabled").evaluateAll((els) => els.map((e) => e.getAttribute("data-day")));
    const todayOver = /Chiuso/.test(await p.locator(`[data-day="${shown[0].day}"]`).innerText()) && shown[0].state === "noSlots";
    const notOpen = shown.filter((d) => !["open", "noSlots"].includes(d.state) || (todayOver && d.day === shown[0].day)).map((d) => d.day);
    check("dopo mezzanotte la serata finita non compare tra i giorni", days[0].day >= calToday || days[0].state === "open" || (await p.locator(`[data-day="${days[0].day}"]`).count()) === 0);
    check("giorni chiusi o al completo non si possono toccare", disabled.join() === notOpen.join(), `${disabled.length} vs ${notOpen.length}`);
    await pick(p, null, D1.day);
    check("dopo il giorno compaiono i suoi orari", (await p.getByRole("radiogroup", { name: "Ora" }).getByRole("radio").count()) === D1.slots.length);
    await send(p);
    check("errore: «Scegli l'ora.»", /Scegli l'ora\./.test(await alerts(p)));
    await pick(p, null, null, D1.slots[1]);
    await send(p);
    check("errore: «Scrivi il tuo nome.» e il cursore va sul nome", /Scrivi il tuo nome\./.test(await alerts(p)) && (await p.evaluate(() => document.activeElement?.id)) === "campo-name-input");
    await p.getByLabel("Nome", { exact: true }).fill("Prova C Cliente");
    await send(p);
    check("errore: «Scrivi il tuo numero di telefono.»", /Scrivi il tuo numero di telefono\./.test(await alerts(p)), await alerts(p));
    check("telefono: tastiera numerica (inputmode=tel) e autocompletamento", (await p.getByLabel("Telefono", { exact: true }).getAttribute("inputmode")) === "tel" && (await p.getByLabel("Telefono", { exact: true }).getAttribute("autocomplete")) === "tel");
    await p.getByLabel("Telefono", { exact: true }).fill("12");
    await send(p);
    check("errore: numero corto senza prefisso → «scrivilo con il prefisso»", /prefisso/.test(await alerts(p)), await alerts(p));
    await p.getByLabel("Telefono", { exact: true }).fill("333 12345");
    await send(p);
    check("errore: cellulare incompleto → «un cellulare ha 10 cifre» (prima dell'invio)", /incompleto: un cellulare ha 10 cifre/.test(await alerts(p)), await alerts(p));
    await p.getByLabel("Telefono", { exact: true }).fill("055 123456");
    await send(p);
    check("errore: fisso con WhatsApp → «solo su un cellulare»", /solo su un cellulare/.test(await alerts(p)), await alerts(p));
    const phone = randomPhone();
    await p.getByLabel("Telefono", { exact: true }).fill(phone);
    // Email (il server di prova finge di spedire: la scelta c'è)
    const emailChoice = p.getByRole("radio", { name: "Email", exact: true });
    if (await emailChoice.count()) {
      await emailChoice.click();
      await p.getByLabel("Email", { exact: true }).fill("non-una-mail");
      await send(p);
      check("email: «L'indirizzo email non sembra giusto»", /L'indirizzo email non sembra giusto/.test(await alerts(p)));
      await p.getByRole("radio", { name: "WhatsApp", exact: true }).click();
      check("tornando a WhatsApp il campo email sparisce", (await p.getByLabel("Email", { exact: true }).count()) === 0);
    } else check("scelta WhatsApp/Email presente (MAIL_PROVIDER=log)", false);
    // Nota e allergie
    check("note: campo sempre visibile, niente domanda sulle allergie", (await p.getByLabel(/^Note/).count()) === 1 && (await p.getByRole("switch", { name: /allergie/ }).count()) === 0);
    await p.getByLabel(/^Note/).fill("Prova C nota: seggiolone, allergia alle noci");
    check("note: contatore dei caratteri", /44\/300/.test(await p.locator("#campo-note-aiuto").innerText()));
    await send(p);
    check("errore: privacy non spuntata", /spunta la casella/.test(await alerts(p)));
    // Informativa nella finestra, senza perdere i dati
    await p.getByRole("link", { name: "informativa sulla privacy" }).click();
    const dlg = p.getByRole("dialog", { name: "I tuoi dati" });
    check("informativa: si apre in una finestra («I tuoi dati»)", (await dlg.count()) === 1 && /Chi tratta i dati/i.test(await dlg.innerText()));
    await shot(p, "modulo-informativa");
    await dlg.getByRole("button", { name: "Ho capito" }).click();
    check("informativa chiusa: il nome scritto è ancora lì", (await p.getByLabel("Nome", { exact: true }).inputValue()) === "Prova C Cliente");
    await p.getByRole("checkbox", { name: /Ho letto l.informativa/ }).check();
    check("riepilogo sopra al pulsante", new RegExp(`alle ${D1.slots[1]} · 2 persone`).test(await p.locator("main").innerText()));
    await shot(p, "modulo-compilato");
    await send(p);
    await p.waitForURL(/\/menu\/prenota\/r\/[\w-]+$/, { timeout: 30000 });
    statusUrl = p.url();
    const row = DB(`select people||'|'||day||'|'||time||'|'||allergies||'|'||coalesce(note,'')||'|'||source||'|'||contact||'|'||status||'|'||code from "BookingRequest" where name='Prova C Cliente'`);
    check("salvata: 2 persone, giorno e ora scelti, allergie riconosciute dalla nota, nota, dal menù, WhatsApp, in attesa", row.startsWith(`2|${D1.day}|${D1.slots[1]}|true|Prova C nota: seggiolone, allergia alle noci|menu|whatsapp|PENDING|`), row);
    const code = row.split("|").pop();
    const body = await p.locator("main").innerText();
    const readable = phone.replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
    check("pagina di stato: «Richiesta inviata» e il numero per intero da controllare", /Richiesta inviata/.test(body) && body.replace(/\u00a0/g, " ").includes(`Non è ancora confermata: ti rispondiamo su WhatsApp al ${readable}. Il numero è sbagliato? Annulla la richiesta qui sotto e rifalla.`), body.slice(0, 260));
    check("pagina di stato: riepilogo, senza codice", !body.includes(code) && body.includes(D1.slots[1]) && /Sì, ne parliamo al tavolo/.test(body));
    // Per intero, come nel testo in alto: prima era coperto a metà e sembravano due numeri diversi.
    check("pagina di stato: nel riepilogo il telefono per intero, uguale al testo in alto", !/•/.test(await p.locator("main dl").first().innerText()) && (await p.locator("main dl").first().innerText()).replace(/\s+/g, " ").includes(readable));
    check("pagina di stato: «È per stasera» solo per oggi (questa è per un altro giorno)", !/È per stasera/.test(body));
    check("pagina di stato: «Salva o manda il link»", (await p.getByRole("button", { name: "Salva o manda il link" }).count()) === 1);
    check("pagina di stato: «Salva questa pagina…»", /Salva questa pagina: qui vedi sempre a che punto è/.test(body));
    check("pagina di stato: niente scorrimento orizzontale", (await overflow(p)) <= 0);
    await shot(p, "stato-in-attesa");
    // Il cliente annulla
    await p.getByRole("button", { name: "Annulla la richiesta" }).click();
    check("annulla: chiede conferma sul posto", (await p.getByRole("group", { name: "Vuoi annullare la richiesta?" }).count()) === 1);
    check("annulla: in evidenza (e già selezionato) «No, tienila»", (await p.evaluate(() => document.activeElement?.textContent?.trim())) === "No, tienila");
    await p.getByRole("button", { name: "No, tienila" }).click();
    check("«No, tienila»: resta in attesa", DB(`select status from "BookingRequest" where name='Prova C Cliente'`) === "PENDING");
    await p.getByRole("button", { name: "Annulla la richiesta" }).click();
    await p.getByRole("button", { name: "Sì, annulla" }).click();
    await p.getByRole("heading", { name: "Richiesta annullata" }).waitFor({ timeout: 15000 }).catch(() => {});
    check("«Sì, annulla»: annullata dal cliente e la pagina lo dice", DB(`select status||'|'||"cancelledBy" from "BookingRequest" where name='Prova C Cliente'`) === "CANCELLED|cliente" && (await p.getByRole("heading", { name: "Richiesta annullata" }).count()) === 1);
    check("annullata: «Chiedi un altro giorno»", (await p.getByRole("link", { name: "Chiedi un altro giorno" }).count()) === 1);
    check("nessun errore JavaScript nel modulo e nella pagina di stato", p.errs.length === 0, p.errs.join(" | "));
    await ctx.close();
  }

  // ---------- Bozza: ricaricando la pagina quello che si è scritto resta
  {
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    await pick(p, 3, D2.day, D2.slots[0]);
    await p.getByLabel("Nome", { exact: true }).fill("Prova C Bozza");
    await p.reload({ waitUntil: "networkidle" });
    check("bozza: dopo il ricaricamento nome, persone e giorno restano", (await p.getByLabel("Nome", { exact: true }).inputValue()) === "Prova C Bozza" && (await p.getByRole("radio", { name: "3 persone" }).getAttribute("aria-checked")) === "true" && (await p.locator(`[data-day="${D2.day}"]`).getAttribute("aria-checked")) === "true");
    await ctx.close();
  }

  // ---------- Gruppo grande
  {
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    await p.getByRole("radio", { name: "Più di 10" }).click();
    const t = await p.locator("main").innerText();
    check("più di 10: «Per i gruppi ci organizziamo meglio a voce»", /Per i gruppi ci organizziamo meglio a voce/.test(t));
    check("più di 10: Chiama e WhatsApp del locale", /^tel:\+39/.test((await p.getByRole("link", { name: "Chiama" }).first().getAttribute("href")) ?? "") && /wa\.me\/39\d+\?text=.*gruppo/.test((await p.getByRole("link", { name: "WhatsApp" }).first().getAttribute("href")) ?? ""));
    check("più di 10: niente giorno, ora e invio", (await p.getByRole("button", { name: "Invia la richiesta" }).count()) === 0 && (await p.locator("[data-day]").count()) === 0);
    await shot(p, "gruppo");
    await ctx.close();
  }

  // ---------- Senza rete: messaggio chiaro, i dati restano
  {
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(3200);
    await fillAll(p, { name: "Prova C Offline", day: D2.day, time: D2.slots[1] });
    await ctx.setOffline(true);
    await send(p);
    await p.waitForTimeout(800);
    check("senza rete: «Non riesco a inviare: controlla la connessione e riprova»", /Non riesco a inviare: controlla la connessione e riprova/.test(await alerts(p)), await alerts(p));
    check("senza rete: il nome scritto resta e il pulsante si può ripremere", (await p.getByLabel("Nome", { exact: true }).inputValue()) === "Prova C Offline" && (await p.getByRole("button", { name: "Invia la richiesta" }).isEnabled()));
    await ctx.setOffline(false);
    await send(p);
    await p.waitForURL(/\/menu\/prenota\/r\//, { timeout: 30000 }).catch(() => {});
    check("tornata la rete: inviata", rowsBy(`name='Prova C Offline'`) === "1", `${p.url()} ${await alerts(p)}`);
    await ctx.close();
  }

  // ---------- Trappola dal browser
  {
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(3200);
    await fillAll(p, { name: "Prova C Robot", day: D2.day, time: D2.slots[2] });
    await p.locator('input[name="sito"]').evaluate((el) => {
      el.value = "http://spam.example";
    });
    await send(p);
    await p.waitForTimeout(1500);
    check("trappola: il programma legge «Richiesta inviata», ma niente è salvato", /Richiesta inviata/.test(await p.locator("main").innerText()) && rowsBy(`name='Prova C Robot'`) === "0");
    await ctx.close();
  }

  // ---------- Troppi invii dalla stessa rete: il messaggio arriva al cliente
  {
    const ip = randomIp();
    const t = await formStamp();
    for (let i = 0; i < 10; i++) await postRequest(body({ t, name: `Prova C Rete ${i}`, day: D2.day, time: D2.slots[i % D2.slots.length] }), { ip });
    const { ctx, p } = await client({ extraHTTPHeaders: { "x-forwarded-for": ip } });
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(3200);
    await fillAll(p, { name: "Prova C Rete browser", day: D1.day, time: D1.slots[0] });
    await send(p);
    await p.waitForTimeout(1500);
    check("troppi invii: «Hai mandato tante richieste…» sotto il pulsante, nessun salvataggio", /Hai mandato tante richieste/.test(await alerts(p)) && rowsBy(`name='Prova C Rete browser'`) === "0", await alerts(p));
    await ctx.close();
  }

  // ---------- Giorni chiusi e al completo, oggi tardi
  {
    const full = open[2]?.day;
    const closed = open[3]?.day;
    DB(`insert into "BookingClosedDay" (day, reason, "createdBy") values ('${full}', null, 'Prova C') on conflict do nothing`);
    const hadClosure = DB(`select count(*) from "ClosureDay" where date='${closed}'`) !== "0";
    if (!hadClosure) DB(`insert into "ClosureDay" (id, date, reason) values ('prova_c_chiusura', '${closed}', 'Prova C ferie')`);
    setBookingSetting({ enabled: true, leadMinutes: 24 * 60 });
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    const fullCard = p.locator(`[data-day="${full}"]`);
    check("serata chiusa alle richieste: «Completo» e non si tocca", /Completo/.test(await fullCard.innerText()) && (await fullCard.isDisabled()));
    if (!hadClosure) {
      const closedCard = p.locator(`[data-day="${closed}"]`);
      check("giornata chiusa: il motivo e non si tocca", /Prova C ferie/.test(await closedCard.innerText()) && (await closedCard.isDisabled()));
    }
    const todayCard = p.locator(`[data-day="${shown[0].day}"]`);
    // Dopo l'ultima chiusura di oggi la carta dice «Chiuso»; prima, con l'anticipo di 24 ore, «Chiamaci».
    if (/Chiuso/.test(await todayCard.innerText())) {
      check("dopo la chiusura di oggi: «Chiuso» e non si tocca (non «Chiamaci»)", (await todayCard.isDisabled()) && !/Chiamaci/.test(await todayCard.innerText()));
    } else if (shown[0].state === "open" || shown[0].state === "noSlots") {
      check("anticipo 24 h: oggi «Chiamaci»", /Chiamaci/.test(await todayCard.innerText()), await todayCard.innerText());
      await todayCard.click();
      check("oggi: «Per oggi è tardi per prenotare online: chiamaci…» con Chiama", /Per oggi è tardi per prenotare online/.test(await p.locator("main").innerText()) && (await p.getByRole("link", { name: "Chiama" }).count()) >= 1);
      await shot(p, "oggi-tardi");
    }
    // Il server controlla lo stesso: una richiesta per il giorno al completo viene rifiutata.
    const r = await postRequest(body({ t: await formStamp(), day: full, time: "20:00", name: "Prova C Pieno" }));
    check("invio per un giorno al completo: rifiutato con «al completo»", r.json?.ok === false && /al completo/.test(r.json.error));
    DB(`delete from "BookingClosedDay" where "createdBy"='Prova C'`);
    DB(`delete from "ClosureDay" where id='prova_c_chiusura'`);
    setBookingSetting({ enabled: true });
    await ctx.close();
  }

  // ---------- Pausa automatica (troppe richieste) e «per stasera online fino alle…»
  {
    setBookingSetting({ enabled: true, pausedUntil: new Date(Date.now() + 20 * 60000).toISOString() });
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    const main = await p.locator("main").innerText();
    check("pausa automatica: il modulo dice «In questo momento le richieste online sono chiuse: chiamaci» con Chiama", /In questo momento le richieste online sono chiuse: chiamaci/.test(main) && (await p.getByRole("button", { name: "Invia la richiesta" }).count()) === 0 && (await p.getByRole("link", { name: "Chiama" }).count()) >= 1);
    await shot(p, "pausa");
    const r = await postRequest(body({ t: await formStamp(), name: "Prova C Pausa" }), { headers: { "x-no-cooldown": "1" } });
    check("pausa automatica: anche l'invio diretto è rifiutato", r.json?.ok === false && /richieste online sono chiuse/.test(r.json.error ?? ""), JSON.stringify(r.json));
    await ctx.close();
    // Spegnere le richieste online non tocca l'agenda (e viceversa la pagina pubblica sparisce).
    setBookingSetting({ agendaEnabled: true, enabled: false });
    const off = await fetch(`${BASE}/menu/prenota`);
    check("richieste online spente (agenda accesa): la pagina pubblica non c'è (404)", off.status === 404);
    setBookingSetting({ enabled: true, todayUntil: "00:00" });
    const late = await postRequest(body({ t: await formStamp(), name: "Prova C Stasera", day: days[0].day, time: "23:59" }));
    check("«per stasera online fino alle 00:00»: per oggi l'invio è rifiutato", late.json?.ok === false, JSON.stringify(late.json));
    setBookingSetting({ enabled: true });
  }

  // ---------- Evento: giorno (e ora) già scelti
  {
    const ev = days.find((d) => d.state === "open" && d.events.length)?.events[0];
    if (ev) {
      const { ctx, p } = await client();
      await p.goto(`${BASE}/menu/prenota?evento=${ev.slug}&da=evento`, { waitUntil: "networkidle", timeout: 120000 });
      const evDay = days.find((d) => d.state === "open" && d.events.some((e) => e.slug === ev.slug));
      check(`evento: titolo «${ev.title}» in cima`, (await p.getByRole("heading", { level: 1 }).innerText()) === ev.title);
      check("evento: il suo giorno è già scelto", (await p.locator(`[data-day="${evDay.day}"]`).getAttribute("aria-checked")) === "true");
      if (ev.startTime && evDay.slots.includes(ev.startTime)) {
        check(`evento: anche l'ora d'inizio (${ev.startTime})`, (await p.getByRole("radiogroup", { name: "Ora" }).getByRole("radio", { name: ev.startTime, exact: true }).getAttribute("aria-checked")) === "true");
      }
      await p.waitForTimeout(3200);
      await pick(p, 4);
      if (!(ev.startTime && evDay.slots.includes(ev.startTime))) await pick(p, null, null, evDay.slots[0]);
      await p.getByLabel("Nome", { exact: true }).fill("Prova C Evento");
      await p.getByLabel("Telefono", { exact: true }).fill(randomPhone());
      await p.getByRole("checkbox", { name: /Ho letto l.informativa/ }).check();
      await send(p);
      await p.waitForURL(/\/menu\/prenota\/r\//, { timeout: 30000 }).catch(() => {});
      check("evento: salvata «da evento» e collegata all'evento", DB(`select source||'|'||("promoId" is not null) from "BookingRequest" where name='Prova C Evento'`) === "evento|true");
      check("evento: la pagina di stato mostra l'evento", (await p.locator("main").innerText()).includes(ev.title));
      await ctx.close();
    } else check("c'è un evento nei prossimi giorni per provare ?evento=", false, "nessun evento nei prossimi giorni");
  }

  // ---------- Pagina di stato: proposta, conferma, al completo, scaduta, «chiamaci» per oggi
  {
    const make = async (name, over = {}) => {
      const r = await postRequest(body({ t: await formStamp(), name, phone: randomPhone(), ...over }));
      return { id: DB(`select id from "BookingRequest" where name=${q(name)}`), path: r.json?.statusPath };
    };
    const { ctx, p } = await client();
    const prop = await make("Prova C Proposta", { day: D1.day, time: D1.slots[0] });
    const pt = D1.slots[2];
    DB(`update "BookingRequest" set status='PROPOSED', "proposedTime"='${pt}', "proposedStartsAt"=('${D1.day} ${pt}'::timestamp at time zone 'Europe/Rome'), "handledBy"='Prova C Marta', "handledAt"=now(), "staffMessage"='Alle ${D1.slots[0]} siamo pieni' where id='${prop.id}'`);
    await p.goto(`${BASE}${prop.path}`, { waitUntil: "networkidle" });
    check(`proposta: «Ti va bene alle ${pt}?» con il messaggio del locale`, (await p.getByRole("heading", { level: 1 }).innerText()) === `Ti va bene alle ${pt}?` && /Messaggio dal locale/i.test(await p.locator("main").innerText()));
    await shot(p, "stato-proposta");
    await p.getByRole("button", { name: `Sì, va bene alle ${pt}` }).click();
    await p.getByRole("heading", { name: "Ti aspettiamo" }).waitFor({ timeout: 15000 }).catch(() => {});
    check("proposta accettata: «Ti aspettiamo» e confermata al nuovo orario", (await p.getByRole("heading", { name: "Ti aspettiamo" }).count()) === 1 && DB(`select status||'|'||time from "BookingRequest" where id='${prop.id}'`) === `CONFIRMED|${pt}`);
    const cal = await p.getByRole("link", { name: "Aggiungi al calendario" }).getAttribute("href");
    const ics = await fetch(`${BASE}${cal}`);
    const icsText = await ics.text();
    check("confermata: «Aggiungi al calendario» dà un .ics con l'ora giusta", /text\/calendar/.test(ics.headers.get("content-type") ?? "") && icsText.includes("BEGIN:VEVENT") && icsText.includes(`${D1.day.replace(/-/g, "")}T${pt.replace(":", "")}`), icsText.split("BEGIN:VEVENT")[1]?.match(/DTSTART[^\r\n]*/)?.[0]);
    check("confermata: si può ancora annullare («Annulla la prenotazione»)", (await p.getByRole("button", { name: "Annulla la prenotazione" }).count()) === 1);
    await shot(p, "stato-confermata");

    const ref = await make("Prova C Rifiuta", { day: D1.day, time: D1.slots[0] });
    DB(`update "BookingRequest" set status='PROPOSED', "proposedTime"='${pt}', "proposedStartsAt"=('${D1.day} ${pt}'::timestamp at time zone 'Europe/Rome') where id='${ref.id}'`);
    await p.goto(`${BASE}${ref.path}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "No, grazie" }).click();
    await p.waitForTimeout(1500);
    check("proposta rifiutata: chiusa dal cliente, «Va bene, alla prossima»", DB(`select status||'|'||"cancelledBy" from "BookingRequest" where id='${ref.id}'`) === "DECLINED|cliente" && /Va bene, alla prossima/.test(await p.locator("main").innerText()));

    const dec = await make("Prova C Completo", { day: D1.day, time: D1.slots[0] });
    DB(`update "BookingRequest" set status='DECLINED', "handledBy"='Prova C Marta' where id='${dec.id}'`);
    await p.goto(`${BASE}${dec.path}`, { waitUntil: "networkidle" });
    check("al completo: «Ci dispiace, siamo al completo» e «Chiedi un altro giorno»", /Ci dispiace, siamo al completo/.test(await p.locator("main").innerText()) && (await p.getByRole("link", { name: "Chiedi un altro giorno" }).count()) === 1);

    const exp = await make("Prova C Scaduta", { day: D1.day, time: D1.slots[0] });
    DB(`update "BookingRequest" set "startsAt"=now() - interval '3 hours' where id='${exp.id}'`);
    await p.goto(`${BASE}${exp.path}`, { waitUntil: "networkidle" });
    const expText = await p.locator("main").innerText();
    check("scaduta: «Ci dispiace davvero: la tua richiesta è rimasta senza risposta.» con Chiama e «Chiedi un altro giorno»", /Ci dispiace davvero: la tua richiesta è rimasta senza risposta\./.test(expText) && (await p.getByRole("link", { name: "Chiama" }).count()) >= 1 && (await p.getByRole("link", { name: "Chiedi un altro giorno" }).count()) === 1);

    // Per stasera: nei primi 15 minuti «È per stasera», dopo (a meno di 90 minuti) «Non siamo ancora riusciti…»
    const late = await make("Prova C Tardi", { day: D1.day, time: D1.slots[0] });
    DB(`update "BookingRequest" set day='${days[0].day}', "startsAt"=now() + interval '60 minutes' where id='${late.id}'`);
    await p.goto(`${BASE}${late.path}`, { waitUntil: "networkidle" });
    const fresh = await p.locator("main").innerText();
    check("per stasera, appena inviata: «È per stasera · Ti rispondiamo appena possibile…», non ancora «Non siamo riusciti»", /È per stasera/.test(fresh) && /Ti rispondiamo appena possibile\. Se hai fretta, chiamaci/.test(fresh) && !/Non siamo ancora riusciti/.test(fresh));
    DB(`update "BookingRequest" set "createdAt"=now() - interval '20 minutes' where id='${late.id}'`);
    await p.reload({ waitUntil: "networkidle" });
    check("per oggi, in attesa da 20 minuti e a meno di 90 dall'orario: «Non siamo ancora riusciti a risponderti» con Chiama", /Non siamo ancora riusciti a risponderti/.test(await p.locator("main").innerText()) && !/È per stasera/.test(await p.locator("main").innerText()));
    await ctx.close();
  }

  // ---------- Telefono stretto (360) e informativa
  {
    const { ctx, p } = await client({ viewport: { width: 360, height: 740 } });
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    check("telefono stretto (360): niente scorrimento orizzontale", (await overflow(p)) <= 0);
    await p.goto(statusUrl, { waitUntil: "networkidle" });
    check("telefono stretto (360): pagina di stato senza scorrimento orizzontale", (await overflow(p)) <= 0);
    const r = await p.goto(`${BASE}/menu/prenota/privacy`, { waitUntil: "networkidle" });
    const t = await p.locator("main").innerText();
    check("informativa: pagina 200 con titolare, dati, conservazione 6 mesi, diritti", r.status() === 200 && /Chi tratta i dati/i.test(t) && /6 mesi/.test(t) && /I tuoi diritti/i.test(t) && /6\.1\.b/.test(t), t.slice(0, 120));
    check("informativa: nome e telefono servono, «sì» sulle allergie generico, fornitori fuori dall'UE, WhatsApp (Meta)", /Nome e telefono servono: senza, non possiamo risponderti\./.test(t) && /non dice chi né cosa/.test(t) && /fuori dall.Unione europea/.test(t) && /WhatsApp \(Meta\)/.test(t) && /Non vendiamo i tuoi dati/.test(t));
    // Carte dei giorni: a 360 si vede un pezzo della quinta (si capisce che scorrono), testi da 12 px in su
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    const strip = await p.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-day]")];
      const fifth = cards[4]?.getBoundingClientRect();
      const small = cards.flatMap((c) => [...c.querySelectorAll("span")]).filter((el) => el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 12).length;
      return { fifthLeft: fifth ? Math.round(fifth.left) : null, width: window.innerWidth, small };
    });
    check("360: la quinta carta dei giorni si vede in parte", strip.fifthLeft !== null && strip.fifthLeft < strip.width - 20, JSON.stringify(strip));
    check("360: testi delle carte dei giorni almeno 12 px", strip.small === 0, JSON.stringify(strip));
    await ctx.close();
  }

  // ---------- Tablet: due settimane di giorni, poi «Altri giorni»; «A+» del menù; tastiera
  {
    const { ctx, p } = await client({ viewport: { width: 820, height: 1180 }, isMobile: false });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("menu-text-large", "1");
      } catch {}
    });
    await p.goto(`${BASE}/menu/prenota`, { waitUntil: "networkidle", timeout: 120000 });
    const visible = await p.locator("[data-day]:visible").count();
    const total = await p.locator("[data-day]").count();
    check("tablet: prima 14 giorni e «Altri giorni»", visible === Math.min(14, total) && (total <= 14 || (await p.getByRole("button", { name: "Altri giorni" }).count()) === 1), `${visible} su ${total}`);
    if (total > 14) {
      await p.getByRole("button", { name: "Altri giorni" }).click();
      check("tablet: «Altri giorni» mostra tutti i giorni", (await p.locator("[data-day]:visible").count()) === total);
    }
    check("«A+» del menù vale anche qui (testo più grande)", await p.evaluate(() => document.documentElement.hasAttribute("data-menu-large") && getComputedStyle(document.querySelector("main")).zoom === "1.25"));
    // Tastiera: un solo Tab per gruppo, le frecce scelgono
    const tabStops = await p.evaluate(() => [...document.querySelectorAll('[role="radiogroup"][aria-label="Quante persone"] [role="radio"]')].filter((b) => b.tabIndex === 0).length);
    check("tastiera: nel gruppo «Quante persone» un solo pulsante raggiungibile con Tab", tabStops === 1, String(tabStops));
    await p.getByRole("radio", { name: "1 persona", exact: true }).focus();
    await p.keyboard.press("ArrowRight");
    await p.keyboard.press("ArrowRight");
    check("tastiera: con le frecce si sceglie (→ → = 3 persone)", (await p.getByRole("radio", { name: "3 persone" }).getAttribute("aria-checked")) === "true" && (await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "3 persone");
    check("tablet: niente scorrimento orizzontale", (await overflow(p)) <= 0);
    await ctx.close();
  }

  // ---------- Statistiche del menù: le pagine delle prenotazioni non contano
  {
    const { ctx, p } = await client();
    await p.goto(`${BASE}/menu`, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(1200);
    await p.getByRole("link", { name: "Chiedi un tavolo" }).first().click();
    await p.waitForURL(/\/menu\/prenota/);
    await p.waitForTimeout(1500);
    await p.goto(`${BASE}/menu/prenota/privacy`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    const statsOn = /"enabled":true/.test(DB(`select coalesce((select value from "MenuSetting" where id='stats'),'')`));
    const prenota = DB(`select count(*) from "MenuEvent" where at >= '${startedAt}' and (label like '/menu/prenota%' or target like '/menu/prenota%')`);
    const menuOpens = DB(`select count(*) from "MenuEvent" where at >= '${startedAt}' and kind='open' and label='/menu'`);
    check("statistiche: nessun evento dalle pagine /menu/prenota", prenota === "0", `eventi: ${prenota}`);
    if (statsOn) check("statistiche: l'apertura del menù invece conta (controllo)", Number(menuOpens) >= 1, `aperture: ${menuOpens}`);
    // Le aperture finte di questa prova non restano nelle statistiche.
    DB(`delete from "MenuEvent" where at >= '${startedAt}'`);
    await ctx.close();
  }
}
