// Prenotazioni, AGENDA DIGITALE (E2E sul server di prova + regole del servizio):
// - «+ Nuova prenotazione» del personale (tutti i campi, senza telefono «di persona», giorno chiuso e
//   orario fuori apertura con «Segna lo stesso»), «Manda la conferma su WhatsApp» (wa.me con il testo
//   e il link della pagina del cliente);
// - modifica (a mano e online) con la cronologia «Modificata da …»;
// - scheda «Agenda» (frecce, «Oggi», scelta della data, ordine per ora, totali online + a mano, stampa),
//   «Stasera» e «Prossimi giorni» con le prenotazioni a mano, «Numeri» con «Segnate a mano»;
// - dipendente con il permesso (dal suo telefono: niente WhatsApp, «Da mandare dal telefono del locale»)
//   e senza; funzione spenta (titolare in prova, dipendenti no);
// - due modifiche insieme e modifica di una prenotazione annullata nel frattempo (anche sul servizio,
//   in modo deterministico); telefono stretto (390 e 360 px).
// Dati di prova: nomi «Prova Agenda …», telefoni 300 005 xxxx; tutto si cancella alla fine (anche se la
// prova viene interrotta); impostazione «bookings» e permessi dei dipendenti tornano come erano.
// Uso: node scripts/menu-e2e/prenota-agenda.mjs   (SHOTS=<cartella> per le foto)
//      (la parte del servizio la lancia da sola con `npx tsx … --servizio`)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  BASE,
  onInterrupt,
  ADMIN_PW,
  EMP_PW,
  SHOTS,
  check,
  results,
  finish,
  DB,
  q,
  loadEnvLocal,
  snapshotBookingSetting,
  restoreBookingSetting,
  snapshotPermissions,
  restorePermissions,
  bookableDays,
  formStamp,
  postRequest,
  launch,
  newContext,
  login,
  wait,
  waitServer,
  waitOtherTests,
  cleanAgenda,
  agendaPhone,
} from "./prenota-lib.mjs";

// ---------- Testi dell'interfaccia (da AGENDA-UI.md)
const L = {
  tab: "Agenda",
  newBtn: "+ Nuova prenotazione",
  newTitle: "Nuova prenotazione",
  editTitle: "Modifica la prenotazione",
  allergies: "Qualcuno ha allergie o intolleranze",
  sourceGroup: "Da dove arriva",
  srcPhone: "Telefono",
  srcWa: "WhatsApp",
  srcPerson: "Di persona",
  save: "Segna in agenda",
  saved: "✓ Segnata in agenda",
  waConfirm: "Manda la conferma su WhatsApp",
  waConfirmEdit: "Manda la conferma aggiornata su WhatsApp",
  waLater: "Da mandare dal telefono del locale",
  waLaterDone: /La manda il telefono del locale/,
  done: "Fatto",
  warnConfirm: "Segna lo stesso",
  edit: "Modifica",
  editSave: "Salva le modifiche",
  editSaved: "✓ Modifiche salvate",
  editedLog: (who) => `Modificata da ${who}`,
  prevDay: "Giorno prima",
  nextDay: "Giorno dopo",
  today: "Oggi",
  pickDay: "Scegli la data",
  print: "Stampa il giorno",
  printArea: "#agenda-stampa",
};

// =====================================================================================================
// Parte 1 — il servizio (npx tsx … --servizio): regole e concorrenza, senza browser, deterministica.
// =====================================================================================================
if (process.argv.includes("--servizio")) {
  loadEnvLocal();
  process.env.MAIL_PROVIDER = "log";
  process.env.PUSH_PROVIDER = "log";
  delete process.env.VERCEL_ENV;
  if (!/\/orari_test(\?|$)/.test(process.env.DATABASE_URL || "")) {
    console.error("DATABASE_URL non è il database di prova orari_test: mi fermo.");
    process.exit(2);
  }
  const S = await import("@/lib/booking/service");
  const R = await import("@/lib/booking/rules");
  const { whatsappPending } = await import("@/lib/booking/whatsapp-queue");
  const { prisma } = await import("@/lib/prisma");
  const [D1, D2, D3] = JSON.parse(process.argv[process.argv.indexOf("--servizio") + 1]);
  const who = { name: "Prova Agenda Servizio" };
  const base = (over = {}) => ({ day: D1, time: "20:00", people: 2, name: "Prova Agenda S", phone: agendaPhone(9001), table: "", note: "", allergies: false, source: "telefono", ...over });
  const P = (n) => "39" + agendaPhone(n).replace(/\D/g, "");
  try {
    // Errori di campo
    const e1 = await S.createManualBooking(base({ source: "sms" }), who, null);
    check("servizio: senza «da dove arriva» valido → errore sul campo", !e1.ok && e1.field === "source", JSON.stringify(e1));
    const e2 = await S.createManualBooking(base({ phone: "", name: "Prova Agenda S senza tel" }), who, null);
    check("servizio: «Telefono» senza numero → «Scrivi il telefono…»", !e2.ok && e2.field === "phone" && /Scrivi il telefono/.test(e2.error), JSON.stringify(e2));
    const e3 = await S.createManualBooking(base({ phone: "", source: "persona", name: "Prova Agenda S di persona" }), who, null);
    check("servizio: «Di persona» senza numero → salvata, telefono vuoto, niente WhatsApp", e3.ok && e3.booking.phone === "" && e3.whatsappHref === null, JSON.stringify(e3).slice(0, 160));
    const e4 = await S.createManualBooking(base({ name: "X" }), who, null);
    check("servizio: nome di una lettera → «Scrivi il nome.»", !e4.ok && e4.field === "name");
    const e5 = await S.createManualBooking(base({ people: 0 }), who, null);
    const e5b = await S.createManualBooking(base({ people: 61 }), who, null);
    const e5c = await S.createManualBooking(base({ people: 2.5 }), who, null);
    check("servizio: persone 0, 61, 2,5 → errore «Persone…»", [e5, e5b, e5c].every((r) => !r.ok && r.field === "people"));
    const e6 = await S.createManualBooking(base({ day: R.addDays(R.businessDay(new Date()), -1) }), who, null);
    check("servizio: giorno passato → «Quel giorno è già passato…»", !e6.ok && e6.field === "day" && /già passato/.test(e6.error), JSON.stringify(e6));
    const e7 = await S.createManualBooking(base({ day: "2026-02-30" }), who, null);
    check("servizio: data inesistente (30 febbraio) → errore sul giorno", !e7.ok && e7.field === "day", JSON.stringify(e7));
    const e8 = await S.createManualBooking(base({ time: "24:00" }), who, null);
    check("servizio: ora 24:00 → errore sull'ora", !e8.ok && e8.field === "time", JSON.stringify(e8));
    const e9 = await S.createManualBooking(base({ phone: "abc", name: "Prova Agenda S tel strano" }), who, null);
    check("servizio: telefono con lettere → errore sul telefono, senza «il tuo»", !e9.ok && e9.field === "phone" && !/il tuo/.test(e9.error), JSON.stringify(e9));

    // Giorno chiuso / fuori orario: domanda, poi con force si salva
    await prisma.closureDay.create({ data: { id: "prova_agenda_srv", date: new Date(`${D3}T00:00:00Z`), reason: "Prova Agenda motivo", createdBy: "Prova Agenda" } });
    const c1 = await S.createManualBooking(base({ day: D3, name: "Prova Agenda S chiuso", phone: agendaPhone(9002) }), who, null);
    check("servizio: giorno chiuso → domanda «Quel giorno risulta chiuso (motivo): segnarla lo stesso?»", !c1.ok && c1.ask === "Quel giorno risulta chiuso (Prova Agenda motivo): segnarla lo stesso?", JSON.stringify(c1));
    const c2 = await S.createManualBooking(base({ day: D3, name: "Prova Agenda S chiuso", phone: agendaPhone(9002), force: true }), who, null);
    check("servizio: giorno chiuso + «Segna lo stesso» → salvata", c2.ok && c2.booking.day === D3);
    await prisma.closureDay.delete({ where: { id: "prova_agenda_srv" } });
    const o1 = await S.createManualBooking(base({ time: "11:00", name: "Prova Agenda S presto", phone: agendaPhone(9003) }), who, null);
    check("servizio: ora fuori apertura → «Alle 11:00 il locale risulta chiuso: segnarla lo stesso?»", !o1.ok && o1.ask === "Alle 11:00 il locale risulta chiuso: segnarla lo stesso?", JSON.stringify(o1));
    const o2 = await S.createManualBooking(base({ time: "00:30", name: "Prova Agenda S notte", phone: agendaPhone(9004), force: true }), who, null);
    check("servizio: 00:30 (dopo mezzanotte) → stesso giorno commerciale, alle 00:30 del giorno dopo", o2.ok && o2.booking.startsAt.getTime() === R.romeInstant(D1, 24 * 60 + 30).getTime(), o2.ok ? o2.booking.startsAt.toISOString() : JSON.stringify(o2));

    // Creazione: confermata, a mano, chi l'ha presa, cronologia, link di conferma
    const ok = await S.createManualBooking(base({ name: "Prova Agenda S tutto", phone: agendaPhone(9005), people: 4, table: "5", note: "nota", allergies: true, source: "whatsapp" }), who, "http://localhost:3100");
    const okLog = ok.ok ? await prisma.bookingLog.findMany({ where: { requestId: ok.booking.id } }) : [];
    check("servizio: creata CONFIRMED, manual, createdBy e handledBy = chi l'ha segnata", ok.ok && ok.booking.status === "CONFIRMED" && ok.booking.manual && ok.booking.createdBy === who.name && ok.booking.handledBy === who.name && ok.booking.table === "5" && ok.booking.source === "whatsapp");
    check("servizio: cronologia CREATED a nome di chi l'ha segnata («WhatsApp»)", okLog.length === 1 && okLog[0].kind === "CREATED" && okLog[0].actor === who.name && okLog[0].message === "WhatsApp", JSON.stringify(okLog.map((l) => [l.kind, l.actor, l.message])));
    const href = decodeURIComponent(ok.ok ? ok.whatsappHref ?? "" : "");
    check("servizio: WhatsApp di conferma al numero, con la pagina del cliente", href.startsWith(`https://wa.me/${P(9005)}?text=`) && href.includes("/menu/prenota/r/"), href.slice(0, 80));
    const tw = await S.createManualBooking(base({ name: "Prova Agenda S tutto", phone: agendaPhone(9005), people: 4, table: "5", note: "nota", allergies: true, source: "whatsapp" }), who, null);
    check("servizio: doppio tocco su «Segna in agenda» → la stessa prenotazione, non due", tw.ok && ok.ok && tw.booking.id === ok.booking.id && (await prisma.bookingRequest.count({ where: { name: "Prova Agenda S tutto" } })) === 1);
    check("servizio: appena segnata non è nella lista «Da mandare su WhatsApp»", ok.ok && whatsappPending({ ...ok.booking, log: okLog }, Date.now()) === null);
    const qd = await S.queueConfirmation(ok.booking.id, { name: "Prova Agenda Marta" });
    const qLog = await prisma.bookingLog.findMany({ where: { requestId: ok.booking.id } });
    check("servizio: «Da mandare dal telefono del locale» → nella lista, con il messaggio di conferma", qd.ok && whatsappPending({ ...ok.booking, log: qLog }, Date.now()) === "confirmed");
    const qn = await S.queueConfirmation(e3.booking.id, who);
    check("servizio: senza telefono non si mette in lista (messaggio chiaro)", !qn.ok && /Manca il telefono/.test(qn.error));
    // Un numero fisso si può lasciare, ma la conferma su WhatsApp va solo a un cellulare.
    const fx = await S.createManualBooking(base({ name: "Prova Agenda S fisso", phone: "02 1234567" }), who, null);
    check("servizio: numero fisso accettato", fx.ok && fx.booking.phone === "39021234567", JSON.stringify(fx).slice(0, 120));
    check("servizio: numero fisso → niente «Manda la conferma su WhatsApp» (wa.me a un fisso non arriva)", fx.ok && fx.whatsappHref === null, fx.ok ? fx.whatsappHref?.slice(0, 40) : "");
    // Cellulare estero con prefisso che inizia per 3 (Francia 33, Spagna 34): il messaggio va a quel numero, non a +39 33….
    const fr = await S.createManualBooking(base({ name: "Prova Agenda S Francia", phone: "+33 6 12 34 56 78" }), who, null);
    check("servizio: cellulare francese +33 → wa.me/33612345678 (non +39 33…)", fr.ok && (fr.whatsappHref ?? "").startsWith("https://wa.me/33612345678?"), fr.ok ? fr.whatsappHref?.slice(0, 40) : JSON.stringify(fr));
    const qf = fx.ok ? await S.queueConfirmation(fx.booking.id, who) : { ok: true };
    check("servizio: numero fisso → non entra nella lista «Da mandare su WhatsApp»", !qf.ok, JSON.stringify(qf));
    // (3) Fisso o senza telefono: nessuna voce «da mandare» anche se in cronologia c'è una risposta del locale.
    const fakeQueued = [{ at: new Date(), actor: "Prova Agenda Marta", kind: "WA_QUEUED", message: null }];
    const fakeCancel = [{ at: new Date(), actor: "Prova Agenda Marta", kind: "CANCELLED", message: null }];
    check(
      "servizio: (3) fisso o senza telefono → mai nella lista «Da mandare su WhatsApp» (conferma o annullo)",
      fx.ok && e3.ok &&
        whatsappPending({ ...fx.booking, log: fakeQueued }, Date.now()) === null &&
        whatsappPending({ ...e3.booking, log: fakeQueued }, Date.now()) === null &&
        whatsappPending({ ...fx.booking, status: "CANCELLED", cancelledBy: "locale", log: fakeCancel }, Date.now()) === null &&
        whatsappPending({ ...ok.booking, log: fakeQueued }, Date.now()) === "confirmed",
    );
    // (10) «Da mandare dal telefono del locale» toccato due volte: una sola voce in cronologia.
    const qd2 = await S.queueConfirmation(ok.booking.id, { name: "Prova Agenda Marta" });
    const queuedN = await prisma.bookingLog.count({ where: { requestId: ok.booking.id, kind: "WA_QUEUED" } });
    check("servizio: (10) conferma già in coda e non mandata → niente seconda voce in cronologia", qd2.ok && queuedN === 1, `${queuedN} voci`);

    // (4) Orario già passato da più di mezz'ora: domanda come per i giorni chiusi (se adesso si può provare).
    {
      const nowD = new Date();
      const pastAt = new Date(nowD.getTime() - 2 * 3600000);
      const today = R.businessDay(nowD);
      if (R.businessDay(pastAt) === today) {
        const pp = R.romeParts(pastAt);
        const t = `${String(Math.floor(pp.minutes / 60)).padStart(2, "0")}:${String(pp.minutes % 60).padStart(2, "0")}`;
        const when = today === R.romeParts(nowD).dateKey ? "di oggi" : `di ${R.dayLong(today)}`;
        const p1 = await S.createManualBooking(base({ day: today, time: t, name: "Prova Agenda S passata", phone: agendaPhone(9009) }), who, null);
        check(`servizio: (4) ora già passata → «Le ${t} ${when} sono già passate: segnarla lo stesso?»`, !p1.ok && p1.ask === `Le ${t} ${when} sono già passate: segnarla lo stesso?`, JSON.stringify(p1));
        const p2 = await S.createManualBooking(base({ day: today, time: t, name: "Prova Agenda S passata", phone: agendaPhone(9009), force: true }), who, null);
        check("servizio: (4) …con «Segna lo stesso» si salva", p2.ok);
        const p3 = p2.ok ? await S.updateBooking(p2.booking.id, base({ day: today, time: t, name: "Prova Agenda S passata", phone: agendaPhone(9009), table: "9" }), R.editVersion(p2.booking), who, null) : { ok: false };
        check("servizio: (4) modificare il tavolo di una già passata (stessa ora) → nessuna domanda", p3.ok, JSON.stringify(p3).slice(0, 160));
      } else {
        check("servizio: (4) ora già passata (saltata: tra le 5 e le 7 del mattino non c'è un'ora passata di oggi)", true);
      }
    }

    // Modifica
    const before = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: ok.booking.id } });
    const u1 = await S.updateBooking(before.id, { ...base({ name: before.name, phone: agendaPhone(9005), people: 6, time: "21:00", table: "dehors", note: "nota", allergies: true }) }, R.editVersion(before), { name: "Prova Agenda Andrea" }, null);
    const uLog = await prisma.bookingLog.findFirst({ where: { requestId: before.id, kind: "UPDATED" } });
    check("servizio: modifica ora, persone, tavolo → salvata", u1.ok && u1.booking.time === "21:00" && u1.booking.people === 6 && u1.booking.table === "dehors" && u1.booking.startsAt.getTime() === R.romeInstant(D1, 21 * 60).getTime());
    check("servizio: cronologia UPDATED «ora 20:00 → 21:00, persone 4 → 6, tavolo 5 → dehors»", uLog?.actor === "Prova Agenda Andrea" && uLog.message === "ora 20:00 → 21:00, persone 4 → 6, tavolo 5 → dehors", uLog?.message);
    const u2 = await S.updateBooking(before.id, base({ name: before.name, phone: agendaPhone(9005), people: 3 }), R.editVersion(before), { name: "Prova Agenda Marta" }, null);
    check(
      "servizio: (1) modifica con dati vecchi → «Nel frattempo l'ha modificata Prova Agenda Andrea: qui sotto ci sono i dati aggiornati. Rifai la tua modifica e salva.»",
      !u2.ok && u2.error === "Nel frattempo l'ha modificata Prova Agenda Andrea: qui sotto ci sono i dati aggiornati. Rifai la tua modifica e salva.",
      JSON.stringify(u2).slice(0, 200),
    );
    check("servizio: (1) …con i dati di adesso (6 persone alle 21:00, dehors) da ricaricare nel modulo", !u2.ok && u2.conflict?.people === 6 && u2.conflict?.time === "21:00" && u2.conflict?.table === "dehors");
    const u2b = !u2.ok && u2.conflict ? await S.updateBooking(before.id, base({ name: before.name, phone: agendaPhone(9005), people: 3, time: "21:00", table: "dehors", note: "nota", allergies: true }), R.editVersion(u2.conflict), { name: "Prova Agenda Marta" }, null) : { ok: false };
    check("servizio: (1) …rifatta sui dati nuovi → salvata", u2b.ok && u2b.booking.people === 3 && u2b.booking.table === "dehors", JSON.stringify(u2b).slice(0, 160));

    // (2) «Arrivati»/«Non venuti» non fanno fallire una «Modifica» aperta
    {
      const open = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: before.id } });
      const vOpen = R.editVersion(open);
      await S.markArrival(open.id, { name: "Prova Agenda Marta" }, null);
      const ua = await S.updateBooking(open.id, base({ name: open.name, phone: agendaPhone(9005), people: 4, time: "21:00", table: "dehors", note: "nota", allergies: true }), vOpen, { name: "Prova Agenda Andrea" }, null);
      check("servizio: (2) «Arrivati» segnato mentre un altro modifica → la modifica si salva lo stesso", ua.ok && ua.booking.people === 4, JSON.stringify(ua).slice(0, 160));
    }

    // Due modifiche nello stesso istante, con la stessa versione: una sola passa, niente misto
    const fresh = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: before.id } });
    const v = R.editVersion(fresh);
    const [ra, rb] = await Promise.all([
      S.updateBooking(fresh.id, base({ name: fresh.name, phone: agendaPhone(9005), people: 5, time: "19:00", table: "A", note: "nota", allergies: true }), v, { name: "Prova Agenda A" }, null),
      S.updateBooking(fresh.id, base({ name: fresh.name, phone: agendaPhone(9005), people: 7, time: "19:30", table: "B", note: "nota", allergies: true }), v, { name: "Prova Agenda B" }, null),
    ]);
    const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: fresh.id } });
    const pair = `${after.people}|${after.time}|${after.table}`;
    check("servizio: due modifiche insieme → una sola riuscita", [ra, rb].filter((r) => r.ok).length === 1, JSON.stringify([ra.ok || ra.error, rb.ok || rb.error]));
    check("servizio: …il database ha l'una o l'altra per intero", pair === "5|19:00|A" || pair === "7|19:30|B", pair);
    const loser = ra.ok ? rb : ra;
    check("servizio: …l'altra riceve «Nel frattempo l'ha modificata Prova Agenda …: qui sotto ci sono i dati aggiornati…» con i dati del vincitore", !loser.ok && /^Nel frattempo l'ha modificata Prova Agenda [AB]: qui sotto ci sono i dati aggiornati\. Rifai la tua modifica e salva\.$/.test(loser.error) && loser.conflict?.people === after.people, loser.error);
    // Senza versione (null) l'ultima vince, ma sempre per intero
    const [na, nb] = await Promise.all([
      S.updateBooking(fresh.id, base({ name: fresh.name, phone: agendaPhone(9005), people: 2, time: "18:00", table: "C", note: "nota", allergies: true }), null, { name: "Prova Agenda A" }, null),
      S.updateBooking(fresh.id, base({ name: fresh.name, phone: agendaPhone(9005), people: 3, time: "18:30", table: "D", note: "nota", allergies: true }), null, { name: "Prova Agenda B" }, null),
    ]);
    const after2 = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: fresh.id } });
    const pair2 = `${after2.people}|${after2.time}|${after2.table}`;
    check("servizio: senza versione, insieme → niente misto nel database", (pair2 === "2|18:00|C" || pair2 === "3|18:30|D") && (na.ok || nb.ok), pair2);

    // Annullata nel frattempo
    const cur = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: fresh.id } });
    await S.cancelForCustomer(cur.id, { name: "Prova Agenda Marta" }, null);
    const x = await S.updateBooking(cur.id, base({ name: cur.name, phone: agendaPhone(9005), people: 9 }), R.editVersion(cur), { name: "Prova Agenda A" }, null);
    const x2 = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: cur.id } });
    check("servizio: (5) modifica di una annullata nel frattempo → «Nel frattempo è stata annullata: non si può più modificare.» e niente cambia", !x.ok && x.gone === true && x.error === "Nel frattempo è stata annullata: non si può più modificare." && x2.status === "CANCELLED" && x2.people === cur.people, JSON.stringify(x));

    // Prenotazione online: si modifica allo stesso modo (il telefono resta obbligatorio)
    const onl = await prisma.bookingRequest.create({
      data: { code: "PAG" + Math.random().toString(36).slice(2, 8).toUpperCase(), tokenHash: "prova_agenda_" + Math.random(), status: "CONFIRMED", day: D2, time: "19:00", startsAt: R.romeInstant(D2, 19 * 60), people: 2, name: "Prova Agenda S online", phone: P(9006), source: "menu" },
    });
    const ou = await S.updateBooking(onl.id, base({ day: D2, name: onl.name, phone: agendaPhone(9006), people: 3, time: "20:00", table: "7" }), R.editVersion(onl), who, null);
    check("servizio: modifica di una online → salvata, resta online (manual=false)", ou.ok && ou.booking.manual === false && ou.booking.people === 3 && ou.booking.table === "7");
    const ou2 = await S.updateBooking(onl.id, base({ day: D2, name: onl.name, phone: "", people: 3, time: "20:00", table: "7" }), null, who, null);
    check("servizio: a una online non si può togliere il telefono", !ou2.ok && ou2.field === "phone", JSON.stringify(ou2));
    const nothing = await S.updateBooking(onl.id, base({ day: D2, name: onl.name, phone: agendaPhone(9006), people: 3, time: "20:00", table: "7" }), null, who, null);
    check("servizio: (11) «Salva le modifiche» senza cambiare nulla → «Nessuna modifica» (unchanged), niente riga nuova in cronologia", nothing.ok && nothing.unchanged === true && (await prisma.bookingLog.count({ where: { requestId: onl.id, kind: "UPDATED" } })) === 1);
    const pend = await prisma.bookingRequest.create({
      data: { code: "PAG" + Math.random().toString(36).slice(2, 8).toUpperCase(), tokenHash: "prova_agenda_" + Math.random(), status: "PENDING", day: D2, time: "19:00", startsAt: R.romeInstant(D2, 19 * 60), people: 2, name: "Prova Agenda S in attesa", phone: P(9007), source: "menu" },
    });
    const pu = await S.updateBooking(pend.id, base({ day: D2, name: pend.name, phone: agendaPhone(9007), people: 4 }), null, who, null);
    check("servizio: una richiesta ancora da confermare non si modifica", !pu.ok && /solo le prenotazioni confermate/.test(pu.error));

    // L'agenda di un giorno (come la scheda): ordine per ora (00:30 dopo le 21:00), totali online + a mano
    const agRows = await prisma.bookingRequest.findMany({ where: { day: D1, status: "CONFIRMED" }, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }] });
    const times = agRows.map((r) => r.time);
    const idx = (t) => times.indexOf(t);
    check("servizio: agenda del giorno in ordine di ora (00:30 in fondo, dopo mezzanotte)", idx("00:30") === times.length - 1, times.join(","));
    const agT = R.agendaTotals(agRows);
    check("servizio: totali dell'agenda = somma delle confermate (online + a mano)", agT.people === agRows.reduce((s, r) => s + r.people, 0) && agT.tables === agRows.length);
    check("servizio: (13) «Tavolo 5» davanti solo ai numeri («dehors», «Sala grande» così)", R.tableText("5") === "Tavolo 5" && R.tableText("dehors") === "dehors" && R.tableText("Sala grande") === "Sala grande");
    check("servizio: (4) etichette dei giorni di notte: «Sab 7 nov (stanotte)» / «Dom 8 nov»; di sera «Oggi»/«Domani»",
      JSON.stringify(R.quickDayLabels("2026-11-07", R.romeInstant("2026-11-07", 24 * 60 + 30))) === JSON.stringify({ today: "Sab 7 nov (stanotte)", tomorrow: "Dom 8 nov" }) &&
        JSON.stringify(R.quickDayLabels("2026-11-07", R.romeInstant("2026-11-07", 21 * 60))) === JSON.stringify({ today: "Oggi", tomorrow: "Domani" }));
    check("servizio: agendaTotals «1 persona · 1 tavolo» / «5 persone · 2 tavoli»", R.agendaTotals([{ people: 1 }]).text === "1 persona · 1 tavolo" && R.agendaTotals([{ people: 2 }, { people: 3 }]).text === "5 persone · 2 tavoli", R.agendaTotals([{ people: 1 }]).text);

    // Numeri: online e a mano separate
    const st = await S.bookingStats();
    const manualDb = await prisma.bookingRequest.count({ where: { isTest: false, manual: true, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } } });
    check("servizio: «Numeri» conta a parte le segnate a mano", st.manual.total === manualDb, `${st.manual.total} vs ${manualDb}`);

    // Funzione spenta: le prenotazioni a mano sono prove
    const saved = await S.loadBookingSettings();
    await S.saveBookingSettings({ ...saved, enabled: false });
    const off = await S.createManualBooking(base({ name: "Prova Agenda S spenta", phone: agendaPhone(9008) }), who, null);
    await S.saveBookingSettings(saved);
    check("servizio: funzione spenta → prenotazione segnata come prova (isTest)", off.ok && off.booking.isTest === true);
    // Un cliente non può dichiararsi «telefono» o «di persona»
    check("servizio: un cliente online non può dire di arrivare «di persona»", R.normalizeSource("persona") === "altro" && R.normalizeSource("telefono") === "altro" && R.normalizeSource("google") === "google");
  } catch (e) {
    check("servizio: la prova è arrivata in fondo", false, e?.stack ?? String(e));
  } finally {
    await prisma.closureDay.deleteMany({ where: { reason: { startsWith: "Prova Agenda" } } }).catch(() => {});
    await prisma.bookingRequest.deleteMany({ where: { OR: [{ name: { startsWith: "Prova Agenda" } }, { phone: { startsWith: "39300005" } }] } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log("__RESULTS__" + JSON.stringify(results));
  process.exit(0);
}

// =====================================================================================================
// Parte 2 — il sito, da browser
// =====================================================================================================
await waitServer();
await waitOtherTests();
const savedSetting = snapshotBookingSetting();
const savedPerms = snapshotPermissions();
const baseSetting = (() => {
  try {
    return JSON.parse(savedSetting ?? "{}");
  } catch {
    return {};
  }
})();
const setSetting = (over) =>
  DB(`insert into "MenuSetting" (id, value) values ('bookings', ${q(JSON.stringify({ firstTime: "17:00", lastBeforeClose: 60, step: 30, maxPeople: 10, leadMinutes: 60, daysAhead: 30, notifyEmail: "", capacityHint: 0, ...baseSetting, ...over }))}) on conflict (id) do update set value=excluded.value`);
const restoreAll = () => {
  cleanAgenda();
  restoreBookingSetting(savedSetting);
  restorePermissions(savedPerms);
};
onInterrupt(restoreAll);
cleanAgenda();
setSetting({ enabled: true });

const emp = (u) => {
  const [id, name] = DB(`select id||'|'||name from "Employee" where username='${u}'`).split("|");
  return { id, name, username: u };
};
const MARTA = emp("marta");
const SARA = emp("sara");
const ADMIN_NAME = DB(`select name from "User" where username='andrea'`);
// Il database di prova è condiviso: un'altra prova che finisce può rimettere permessi e impostazione
// come li aveva trovati. Prima di ogni parte si rimettono quelli che servono qui.
const ensure = (enabled = true) => {
  DB(`update "Employee" set "canManageBookings"=true where id='${MARTA.id}'`);
  DB(`update "Employee" set "canManageBookings"=false where id='${SARA.id}'`);
  setSetting({ enabled });
};
ensure();

const { days } = bookableDays();
const TODAY = days[0].day;
const open = days.filter((d, i) => i >= 1 && d.state === "open" && d.slots.length >= 4);
const D1 = open[0]; // giorno dell'agenda «piena» (online + a mano)
const D2 = open[1]; // Marta, concorrenza
const D3 = open[2]; // giorno che la prova chiude (ClosureDay «Prova Agenda»)
const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/agenda-${name}.png`, fullPage: true });
const row = (id) => DB(`select status||'|'||time||'|'||people||'|'||coalesce("tableLabel",'')||'|'||coalesce(note,'') from "BookingRequest" where id=${q(id)}`);
const byName = (name) => DB(`select id from "BookingRequest" where name=${q(name)} order by "createdAt" desc limit 1`);
const logs = (id) => DB(`select kind||':'||actor||':'||coalesce(message,'') from "BookingLog" where "requestId"=${q(id)} order by at`).split("\n").filter(Boolean);
const waitDb = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(250);
  }
  return fn();
};
let phoneN = 0;
const nextPhone = () => agendaPhone(++phoneN); // «300 005 00xx»
const intl = (p) => "39" + p.replace(/\D/g, "");
const dmy = (day) => day; // i campi data accettano YYYY-MM-DD con fill()
const peopleWord = (n) => `${n} ${String(n) === "1" ? "persona" : "persone"}`;

// Una richiesta online vera (dalla route pubblica), poi confermata come farebbe il locale.
async function online(name, day, time, people = 2) {
  const phone = nextPhone();
  const r = await postRequest({ day: day.day, time, people, name, phone, email: "", contact: "whatsapp", note: "", allergies: false, source: "menu", event: "", privacy: true, sito: "", t: await formStamp() });
  if (!r.json?.ok) throw new Error(`richiesta online «${name}» non creata: ${JSON.stringify(r.json)}`);
  const id = byName(name);
  DB(`update "BookingRequest" set status='CONFIRMED', "handledBy"='Prova Agenda', "handledAt"=now() where id='${id}'`);
  return id;
}

// ---------- Parte 1 lanciata con tsx (stesso database di prova)
try {
  const out = execFileSync("npx", ["tsx", fileURLToPath(import.meta.url), "--servizio", JSON.stringify([D1.day, D2.day, D3.day])], { cwd: ROOT, env: process.env, timeout: 300000 }).toString();
  const line = out.split("\n").find((l) => l.startsWith("__RESULTS__"));
  for (const l of out.split("\n")) if (/^(OK  |FAIL)/.test(l)) console.log(l);
  for (const r of JSON.parse(line.slice("__RESULTS__".length))) results.push(r);
} catch (e) {
  check("servizio: le prove del servizio sono partite", false, String(e?.stdout ?? e).slice(-800));
}

let browser;
const pages = {}; // per la foto in caso di errore
try {
  check("ci sono tre giorni prenotabili per la prova", !!D1 && !!D2 && !!D3, JSON.stringify(days.slice(0, 5).map((d) => d.state)));
  browser = await launch();

  const session = async (user, pw, kind = "phone", extra = {}) => {
    const ctx = await newContext(browser, kind, extra);
    await ctx.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\/.*/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp</title>ok" }));
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.errs = [];
    p.on("pageerror", (e) => p.errs.push(e.message));
    // «Vuoi lasciare la pagina?» (modifiche non salvate): si accetta, la prova va avanti.
    p.on("dialog", (d) => d.accept().catch(() => {}));
    await login(p, user, pw);
    return { ctx, p };
  };
  const goList = async (p) => {
    await p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    const later = p.getByRole("button", { name: "Non ora" });
    if (await later.count()) await later.first().click();
  };
  const tab = (p, label) => p.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
  const agenda = (p) => p.getByRole("region", { name: L.tab, exact: true });
  const panel = (p) => p.getByRole("tabpanel");
  // Apre la scheda «Agenda» sul giorno voluto (con «Scegli la data»).
  const goAgenda = async (p, day = null) => {
    await goList(p);
    await tab(p, L.tab);
    await agenda(p).waitFor();
    if (day) {
      await agenda(p).getByLabel(L.pickDay).fill(dmy(day));
      await p.waitForTimeout(700);
    }
  };
  const bodyText = (p) => p.locator("body").innerText();
  const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const agendaRow = (p, name) => agenda(p).getByRole("listitem").filter({ hasText: name }).first();

  // Campi comuni a «Nuova prenotazione» e «Modifica la prenotazione».
  async function fillFields(d, f) {
    if (f.source) await d.getByRole("radiogroup", { name: L.sourceGroup }).getByRole("radio", { name: f.source, exact: true }).click();
    if (f.name !== undefined) await d.getByRole("textbox", { name: /^Nome/ }).fill(f.name);
    if (f.phone !== undefined) await d.getByRole("textbox", { name: /^Telefono/ }).fill(f.phone);
    if (f.people !== undefined) {
      const r = d.getByRole("radio", { name: String(f.people), exact: true });
      if (f.people <= 8 && (await r.count())) await r.click();
      else await d.getByLabel("Altro numero di persone").fill(String(f.people));
    }
    if (f.day !== undefined) await d.getByLabel("Giorno", { exact: true }).fill(dmy(f.day));
    if (f.time !== undefined) {
      const r = d.getByRole("radio", { name: f.time, exact: true });
      if (await r.count()) await r.click();
      else await d.getByLabel("Un altro orario").fill(f.time);
    }
    if (f.table !== undefined) await d.getByRole("textbox", { name: /^Tavolo/ }).fill(f.table);
    if (f.note !== undefined) await d.getByRole("textbox", { name: /^Nota/ }).fill(f.note);
    if (f.allergies !== undefined) await d.getByRole("checkbox", { name: L.allergies }).setChecked(f.allergies);
  }
  async function fillNew(p, f) {
    await p.getByRole("button", { name: L.newBtn }).first().click();
    const d = p.getByRole("dialog", { name: L.newTitle });
    await d.waitFor();
    await fillFields(d, f);
    return d;
  }
  // Salva; se compare la domanda (giorno chiuso, fuori orario) la legge e, se `confirm`, «Segna lo stesso».
  async function saveIn(p, d, button, savedText, { confirm = true } = {}) {
    await d.getByRole("button", { name: button, exact: true }).click();
    const warn = p.getByRole("alertdialog");
    const outcome = await Promise.race([
      warn.waitFor({ timeout: 15000 }).then(() => "warn"),
      d.getByText(savedText).first().waitFor({ timeout: 15000 }).then(() => "saved"),
    ]).catch(() => "none");
    let warnText = "";
    if (outcome === "warn") {
      warnText = (await warn.innerText()).replace(/\s+/g, " ");
      if (confirm) {
        await warn.getByRole("button", { name: L.warnConfirm }).click();
        await d.getByText(savedText).first().waitFor({ timeout: 15000 }).catch(() => {});
      }
    }
    return { outcome, warnText };
  }
  const saveNew = (p, d, o) => saveIn(p, d, L.save, L.saved, o);
  // Chiude fogli e finestre aperte; se il modulo ha modifiche non salvate, «Esci senza salvare».
  const closeAll = async (p) => {
    for (let i = 0; i < 5; i++) {
      const leave = p.getByRole("button", { name: "Esci senza salvare" });
      if (await leave.count()) {
        await leave.first().click();
        await p.waitForTimeout(300);
        continue;
      }
      if (!(await p.getByRole("dialog").count()) && !(await p.getByRole("alertdialog").count())) return;
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
  };
  const closeSheet = async (p, d) => {
    const done = d.getByRole("button", { name: L.done, exact: true });
    if (await done.count()) await done.click();
    await p.waitForTimeout(300);
    await closeAll(p);
  };
  // Apre il foglio di una prenotazione dall'agenda e poi «Modifica».
  async function openBooking(p, name, day) {
    await goAgenda(p, day);
    const r = agendaRow(p, name);
    const b = r.getByRole("button");
    if (await b.count()) await b.first().click();
    else await r.click();
    const s = p.getByRole("dialog", { name: new RegExp(name) });
    await s.waitFor();
    return s;
  }
  async function openEdit(p, name, day, f) {
    const s = await openBooking(p, name, day);
    await s.getByRole("button", { name: L.edit, exact: true }).click();
    const e = p.getByRole("dialog", { name: L.editTitle });
    await e.waitFor();
    await fillFields(e, f);
    return e;
  }

  // ================= Titolare, da telefono =================
  const admin = await session("andrea", ADMIN_PW, "phone");
  const A = admin.p;
  pages.titolare = A;
  await goList(A);
  check("scheda «Agenda» dentro /prenotazioni (titolare)", (await A.getByRole("tab", { name: new RegExp(`^${L.tab}`) }).count()) === 1);
  check("pulsante «+ Nuova prenotazione» in cima", (await A.getByRole("button", { name: L.newBtn }).count()) >= 1);

  // ---- Nuova prenotazione con tutti i campi
  const P1 = nextPhone();
  const n1 = "Prova Agenda Rossi";
  {
    const d = await fillNew(A, { source: L.srcPhone, name: n1, phone: P1, people: 4, day: D1.day, time: "20:00", table: "5", note: "Prova Agenda compleanno", allergies: true });
    await shot(A, "nuova-compilata");
    check("foglio «Nuova prenotazione» a 390 px: niente scorrimento orizzontale", (await overflow(A)) <= 0 && (await d.evaluate((el) => el.scrollWidth - el.clientWidth)) <= 0);
    const { outcome } = await saveNew(A, d);
    check("nuova prenotazione: «✓ Segnata in agenda» senza domande (giorno aperto, ora dentro l'apertura)", outcome === "saved", outcome);
    const id = byName(n1);
    const dbRow = DB(`select status||'|'||manual||'|'||coalesce("createdBy",'')||'|'||phone||'|'||people||'|'||day||'|'||time||'|'||coalesce("tableLabel",'')||'|'||coalesce(note,'')||'|'||allergies||'|'||coalesce(source,'')||'|'||"isTest" from "BookingRequest" where id=${q(id)}`);
    check(`nel database: CONFIRMED, a mano, segnata da ${ADMIN_NAME}, con tutti i campi`, dbRow === `CONFIRMED|true|${ADMIN_NAME}|${intl(P1)}|4|${D1.day}|20:00|5|Prova Agenda compleanno|true|telefono|false`, dbRow);
    const lg = logs(id);
    check("cronologia: creata a nome di chi l'ha segnata («telefono»)", lg.length >= 1 && lg[0] === `CREATED:${ADMIN_NAME}:telefono`, lg.join(" / "));
    const wa = d.getByRole("link", { name: L.waConfirm });
    const href = decodeURIComponent((await wa.getAttribute("href").catch(() => null)) ?? "");
    check("«Manda la conferma su WhatsApp»: wa.me al numero del cliente", href.startsWith(`https://wa.me/${intl(P1)}?text=`), href.slice(0, 50) || "nessun pulsante");
    check("…con il messaggio di conferma e il link della pagina del cliente", /ti aspettiamo/i.test(href) && /\/menu\/prenota\/r\//.test(href), href.slice(0, 260));
    await shot(A, "nuova-salvata");
    // Il link nel messaggio apre la pagina del cliente: confermata, con il suo giorno e la sua ora.
    const statusUrl = href.match(/https?:\/\/\S+\/menu\/prenota\/r\/[\w-]+/)?.[0];
    if (statusUrl) {
      const cctx = await newContext(browser, "phone");
      const C = await cctx.newPage();
      const resp = await C.goto(statusUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle", timeout: 120000 });
      const ct = await C.locator("main").innerText().catch(() => "");
      check("la pagina del cliente (dal link nel messaggio): «Confermata», giorno e ora", resp?.status() === 200 && /Confermata/i.test(ct) && ct.includes("20:00"), `${resp?.status()} ${ct.replace(/\s+/g, " ").slice(0, 160)}`);
      await shot(C, "pagina-cliente");
      await cctx.close();
    } else check("la pagina del cliente (dal link nel messaggio)", false, "nessun link nel messaggio");
    if (await wa.count()) {
      const [pop] = await Promise.all([admin.ctx.waitForEvent("page"), wa.click()]);
      await pop.close();
      check("WhatsApp aperto: segnato nella cronologia", await waitDb(() => logs(id).some((l) => l.startsWith("WHATSAPP_OPENED"))));
    }
    await closeSheet(A, d);
  }

  // ---- Senza telefono, «Di persona»: si salva lo stesso, niente WhatsApp
  const n2 = "Prova Agenda Di persona";
  {
    const d = await fillNew(A, { source: L.srcPerson, name: n2, people: 2, day: D1.day, time: "19:00" });
    const { outcome } = await saveNew(A, d);
    const id = byName(n2);
    check("senza telefono («Di persona»): salvata", outcome === "saved" && !!id, outcome);
    check("…nel database con telefono vuoto e «persona»", DB(`select status||'|'||phone||'|'||coalesce(source,'')||'|'||manual from "BookingRequest" where id=${q(id)}`) === "CONFIRMED||persona|true", DB(`select status||'|'||phone||'|'||coalesce(source,'')||'|'||manual from "BookingRequest" where id=${q(id)}`));
    check("…e né «Manda la conferma su WhatsApp» né «Da mandare dal telefono del locale»", (await d.getByRole("link", { name: L.waConfirm }).count()) === 0 && (await d.getByRole("button", { name: L.waLater }).count()) === 0);
    await closeSheet(A, d);
  }
  // «Telefono» senza numero: errore accanto al campo, niente salvato
  {
    const n = "Prova Agenda Senza numero";
    const d = await fillNew(A, { source: L.srcPhone, name: n, people: 2, day: D1.day, time: "19:30" });
    await d.getByRole("button", { name: L.save, exact: true }).click();
    await A.waitForTimeout(1500);
    check("«Telefono» senza numero: «Scrivi il telefono: serve per la conferma…» e niente salvato", /Scrivi il telefono: serve per la conferma/.test(await d.innerText()) && DB(`select count(*) from "BookingRequest" where name=${q(n)}`) === "0");
    await closeAll(A);
    await A.waitForTimeout(300);
  }

  // ---- Giorno chiuso: domanda, «Segna lo stesso», poi si salva
  DB(`insert into "ClosureDay" (id, date, reason, "createdBy") values ('prova_agenda_chiuso', '${D3.day}', 'Prova Agenda chiuso', 'Prova Agenda') on conflict do nothing`);
  const n3 = "Prova Agenda Giorno chiuso";
  {
    const d = await fillNew(A, { source: L.srcWa, name: n3, phone: nextPhone(), people: 2, day: D3.day, time: "20:00" });
    const first = await saveNew(A, d, { confirm: false });
    check("giorno chiuso: domanda «Quel giorno risulta chiuso (Prova Agenda chiuso): segnarla lo stesso?»", first.outcome === "warn" && first.warnText.includes("Quel giorno risulta chiuso (Prova Agenda chiuso): segnarla lo stesso?"), first.warnText || first.outcome);
    check("…e finché non si conferma non si salva", DB(`select count(*) from "BookingRequest" where name=${q(n3)}`) === "0");
    await shot(A, "avviso-giorno-chiuso");
    if (first.outcome === "warn") {
      await A.getByRole("alertdialog").getByRole("button", { name: L.warnConfirm }).click();
      check("giorno chiuso: dopo «Segna lo stesso» è salvata (confermata)", await waitDb(() => DB(`select status from "BookingRequest" where name=${q(n3)}`) === "CONFIRMED"));
    }
    await closeSheet(A, d);
  }
  // ---- Ora fuori apertura (e «Annulla» nella domanda non salva)
  const n4 = "Prova Agenda Fuori orario";
  {
    const d = await fillNew(A, { source: L.srcPhone, name: n4, phone: nextPhone(), people: 3, day: D1.day, time: "11:00" });
    const first = await saveNew(A, d, { confirm: false });
    check("ora fuori apertura: «Alle 11:00 il locale risulta chiuso: segnarla lo stesso?»", first.outcome === "warn" && first.warnText.includes("Alle 11:00 il locale risulta chiuso: segnarla lo stesso?"), first.warnText || first.outcome);
    if (first.outcome === "warn") {
      await A.getByRole("alertdialog").getByRole("button", { name: "Annulla", exact: true }).click();
      await A.waitForTimeout(600);
      check("…«Annulla»: niente salvato, il foglio resta aperto con i dati", DB(`select count(*) from "BookingRequest" where name=${q(n4)}`) === "0" && (await d.getByRole("textbox", { name: /^Nome/ }).inputValue()) === n4);
      await saveNew(A, d);
      check("…«Segna lo stesso»: salvata alle 11:00", await waitDb(() => DB(`select status||'|'||time from "BookingRequest" where name=${q(n4)}`) === "CONFIRMED|11:00"));
    }
    await closeSheet(A, d);
  }

  // ---- Agenda del giorno D1: online + a mano, ordine per ora, totali
  ensure();
  const onId = await online("Prova Agenda Online", D1, D1.slots[2], 3);
  await goAgenda(A, D1.day);
  const agTxt = await agenda(A).innerText();
  const expected = DB(`select name from "BookingRequest" where day='${D1.day}' and status='CONFIRMED' order by "startsAt", "createdAt"`).split("\n").filter(Boolean);
  const pos = expected.map((n) => agTxt.indexOf(n));
  check(`Agenda ${D1.day}: tutte le confermate del giorno (online + a mano)`, expected.length >= 4 && pos.every((x) => x >= 0), `${expected.join(", ")} / ${pos.join(",")}`);
  check("Agenda: in ordine di ora", pos.every((x, i) => i === 0 || x > pos[i - 1]), pos.join(","));
  // Il database è condiviso con altre prove che girano insieme: il totale deve tornare con le righe
  // mostrate (somma delle persone, una riga = un tavolo) e con il database di quel momento.
  // Le annullate (barrate) e le prove non contano nei totali.
  const uiRows = (await agenda(A).getByRole("list").first().getByRole("listitem").allInnerTexts()).filter((t) => !/Annullata|Di prova/.test(t));
  const uiPeople = uiRows.reduce((sum, t) => sum + Number(t.match(/(\d+)\s*pers\./)?.[1] ?? 0), 0);
  const [ppl, tables] = DB(`select coalesce(sum(people),0)||'|'||count(*) from "BookingRequest" where day='${D1.day}' and status='CONFIRMED' and not "isTest"`).split("|");
  const totTxt = agTxt.match(/\d+ person[ae] · \d+ tavol[io]/)?.[0] ?? "";
  check(`Agenda: totale del giorno = somma delle righe (${uiPeople} persone · ${uiRows.length} tavoli)`, totTxt === `${uiPeople} persone · ${uiRows.length} tavoli`, totTxt);
  check(`Agenda: …e uguale al database (${ppl} persone · ${tables} tavoli, online + a mano)`, totTxt === `${ppl} persone · ${tables} tavoli` || DB(`select count(*) from "BookingRequest" where day='${D1.day}' and status='CONFIRMED' and name not like 'Prova Agenda%'`) !== "0", `${totTxt} (altre prove in corso: ${DB(`select count(*) from "BookingRequest" where day='${D1.day}' and status='CONFIRMED' and name not like 'Prova Agenda%'`)})`);
  const r1 = await agendaRow(A, n1).innerText();
  check("Agenda: riga con ora, «4 pers.», «Tavolo 5», nota, «⚠ Allergie», «Telefono · …»", /20:00/.test(r1) && /4 pers\./.test(r1) && /Tavolo 5/.test(r1) && /Prova Agenda compleanno/.test(r1) && /⚠ Allergie/.test(r1) && /Telefono · /.test(r1), r1.replace(/\n/g, " "));
  check("Agenda: la online dice «Online»", /Online/.test(await agendaRow(A, "Prova Agenda Online").innerText()));
  check("Agenda a 390 px: niente scorrimento orizzontale", (await overflow(A)) <= 0, String(await overflow(A)));
  await shot(A, "agenda-giorno");

  // Frecce, «Oggi», titolo del giorno
  // Titolo su due righe: «Oggi» piccolo sopra, la data sotto → «Oggi · sabato 7 novembre».
  const title = async () => {
    const lines = (await agenda(A).innerText()).split("\n").map((l) => l.trim());
    const i = lines.findIndex((l) => /(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica) \d+/i.test(l));
    if (i < 0) return "";
    return /^(Oggi|Domani|Ieri)$/.test(lines[i - 1] ?? "") ? `${lines[i - 1]} · ${lines[i]}` : lines[i];
  };
  const t0 = await title();
  await agenda(A).getByRole("button", { name: L.nextDay }).click();
  await A.waitForTimeout(600);
  const t1 = await title();
  await agenda(A).getByRole("button", { name: L.prevDay }).click();
  await A.waitForTimeout(600);
  const t2 = await title();
  check("frecce: «Giorno dopo» cambia giorno, «Giorno prima» torna", t1 !== t0 && t2 === t0 && (await agenda(A).innerText()).includes(n1), `${t0} → ${t1} → ${t2}`);
  check("«Oggi» c'è quando non si è su oggi", (await agenda(A).getByRole("button", { name: L.today, exact: true }).count()) === 1);
  await agenda(A).getByRole("button", { name: L.today, exact: true }).click();
  await A.waitForTimeout(600);
  check("«Oggi»: torna a oggi («Oggi · …») e il pulsante sparisce", (await title()).startsWith("Oggi · ") && (await agenda(A).getByRole("button", { name: L.today, exact: true }).count()) === 0, await title());
  check("D1 non è oggi: in agenda di oggi non c'è «Prova Agenda Rossi»", !(await agenda(A).innerText()).includes(n1));

  // Stampa: righe sì, pulsanti no
  await goAgenda(A, D1.day);
  check("pulsante «Stampa il giorno»", (await agenda(A).getByRole("button", { name: L.print }).count()) === 1);
  await A.emulateMedia({ media: "print" });
  const printed = await A.evaluate((sel) => {
    const vis = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };
    const area = document.querySelector(sel);
    return {
      area: !!area && vis(area),
      text: area ? area.innerText : "",
      head: area ? [...area.querySelectorAll("th")].map((t) => t.textContent.trim()) : [],
      rows: area ? area.querySelectorAll("tbody tr").length : 0,
      buttons: [...document.querySelectorAll("button, [role=tab], nav a, header a")].filter(vis).map((b) => b.textContent.trim() || b.getAttribute("aria-label")).slice(0, 10),
      dialogs: [...document.querySelectorAll("[role=dialog]")].filter(vis).length,
    };
  }, L.printArea);
  check("stampa: si vede la tabella del giorno (#agenda-stampa)", printed.area && printed.rows === expected.length, `${printed.rows} righe, attese ${expected.length}`);
  check("stampa: colonne Ora, Pers., Nome, Tavolo, Telefono, Nota, Presa da", ["Ora", "Pers.", "Nome", "Tavolo", "Telefono", "Nota", "Presa da"].every((h) => printed.head.includes(h)), printed.head.join(","));
  check("stampa: tutti i nomi del giorno", expected.every((n) => printed.text.includes(n)));
  check("stampa: niente pulsanti, schede o menù", printed.buttons.length === 0, printed.buttons.join(" | "));
  if (SHOTS) await A.pdf?.({ path: `${SHOTS}/agenda-stampa.pdf` }).catch(() => {});
  await shot(A, "stampa");
  await A.emulateMedia({ media: "screen" });

  // «+ Segna in questo giorno»: giorno già scelto
  {
    await agenda(A).getByRole("button", { name: "+ Segna in questo giorno" }).click();
    const d = A.getByRole("dialog", { name: L.newTitle });
    await d.waitFor();
    check("«+ Segna in questo giorno»: «Nuova prenotazione» con il giorno già scelto", (await d.getByLabel("Giorno", { exact: true }).inputValue()) === D1.day, await d.getByLabel("Giorno", { exact: true }).inputValue());
    await closeAll(A);
    await A.waitForTimeout(300);
  }

  // ---- «Stasera» e totali con una prenotazione a mano per oggi
  const n5 = "Prova Agenda Stasera";
  {
    const d = await fillNew(A, { source: L.srcPhone, name: n5, phone: nextPhone(), people: 5, day: TODAY, time: "23:30" });
    await saveNew(A, d); // per oggi può arrivare la domanda «fuori orario»: si conferma
    check("per oggi: salvata", await waitDb(() => DB(`select status from "BookingRequest" where name=${q(n5)}`) === "CONFIRMED"));
    await closeSheet(A, d);
  }
  await goList(A);
  await tab(A, "Stasera");
  const tonight = await panel(A).innerText();
  const [tp, tt] = DB(`select coalesce(sum(people),0)||'|'||count(*) from "BookingRequest" where day='${TODAY}' and status='CONFIRMED' and not "isTest"`).split("|");
  check("«Stasera»: c'è la prenotazione a mano di oggi", tonight.includes(n5));
  check(`«Stasera»: «Stasera · ${tp} persone prenotate · ${tt} tavol…» (contano anche quelle a mano)`, tonight.includes(`Stasera · ${tp} persone prenotate · ${tt} tavol`), tonight.split("\n").slice(0, 2).join(" ") + ` [db ${tp}|${tt} oggi=${TODAY}: ${DB(`select day||' '||time||' '||people from "BookingRequest" where name=${q(n5)}`)}]`);
  check("«Stasera»: niente più «online» nel totale", !/persone prenotate online/.test(tonight));
  await shot(A, "stasera");
  await tab(A, "Da gestire");
  check("«Da gestire»: le prenotazioni a mano non ci sono (sono già confermate)", !(await panel(A).innerText()).includes(n1) && !(await panel(A).innerText()).includes(n2));
  await tab(A, "Prossimi giorni");
  const nextTxt = await panel(A).innerText();
  check("«Prossimi giorni»: ci sono le prenotazioni a mano", nextTxt.includes(n1), nextTxt.slice(0, 300).replace(/\n/g, " "));
  await tab(A, "Numeri");
  const numTxt = await panel(A).innerText();
  check("«Numeri»: riquadri «Richieste online» e «Segnate a mano»", /Richieste online/i.test(numTxt) && /Segnate a mano/i.test(numTxt), numTxt.slice(0, 300).replace(/\n/g, " "));

  // ---- Modifica: a mano e online
  ensure();
  {
    const id = byName(n1);
    const e = await openEdit(A, n1, D1.day, { time: "21:00", people: 6, table: "dehors" });
    check("«Modifica la prenotazione»: senza «Da dove arriva»", (await e.getByRole("radiogroup", { name: L.sourceGroup }).count()) === 0);
    await shot(A, "modifica");
    const r = await saveIn(A, e, L.editSave, L.editSaved);
    check("modifica (a mano): «✓ Modifiche salvate»", r.outcome === "saved", r.outcome + " " + r.warnText);
    check("modifica (a mano): ora, persone e tavolo nel database", await waitDb(() => row(id).startsWith("CONFIRMED|21:00|6|dehors")), row(id));
    check("modifica: cronologia UPDATED di chi ha modificato, con il dettaglio", logs(id).some((l) => l === `UPDATED:${ADMIN_NAME}:ora 20:00 → 21:00, persone 4 → 6, tavolo 5 → dehors`), logs(id).join(" / "));
    check("…«Manda la conferma aggiornata su WhatsApp»", (await e.getByRole("link", { name: L.waConfirmEdit }).count()) === 1);
    await closeSheet(A, e);
    const s = await openBooking(A, n1, D1.day);
    await s.getByText("Cronologia").click();
    const st = await s.innerText();
    check(`…nel foglio «${L.editedLog(ADMIN_NAME)}» e «ora 20:00 → 21:00, persone 4 → 6»`, st.includes(L.editedLog(ADMIN_NAME)) && st.includes("ora 20:00 → 21:00, persone 4 → 6"));
    check("…e «Segnata da … (telefono)», «Tavolo», «Al telefono · segnata da …»", st.includes(`Segnata da ${ADMIN_NAME} (telefono)`) && /Tavolo/i.test(st) && st.includes(`Al telefono · segnata da ${ADMIN_NAME}`), st.replace(/\s+/g, " ").slice(0, 900));
    await closeAll(A);
  }
  {
    const s0 = await openBooking(A, n2, D1.day);
    check("senza telefono: nel foglio «Telefono» = «Non lasciato»", /Non lasciato/.test(await s0.innerText()));
    await closeAll(A);
  }
  {
    const newT = D1.slots[3];
    const e = await openEdit(A, "Prova Agenda Online", D1.day, { time: newT, people: 4, table: "12" });
    const r = await saveIn(A, e, L.editSave, L.editSaved);
    check("modifica (online): salvata", r.outcome === "saved", r.outcome);
    check("modifica (online): ora, persone e tavolo nel database, resta online", await waitDb(() => row(onId).startsWith(`CONFIRMED|${newT}|4|12`)) && DB(`select manual from "BookingRequest" where id='${onId}'`) === "f", row(onId));
    check("modifica (online): «Modificata da …» nella cronologia", logs(onId).some((l) => l.startsWith(`UPDATED:${ADMIN_NAME}:`)), logs(onId).join(" / "));
    await closeSheet(A, e);
  }

  // ================= Marta, con il permesso, dal suo telefono =================
  ensure();
  const marta = await session("marta", EMP_PW, "phone");
  const M = marta.p;
  pages.marta = M;
  await goList(M);
  check("Marta (permesso): scheda «Agenda» e «+ Nuova prenotazione»", (await M.getByRole("tab", { name: new RegExp(`^${L.tab}`) }).count()) === 1 && (await M.getByRole("button", { name: L.newBtn }).count()) >= 1);
  const n6 = "Prova Agenda Marta";
  {
    const d = await fillNew(M, { source: L.srcWa, name: n6, phone: nextPhone(), people: 2, day: D2.day, time: D2.slots[1] });
    const { outcome } = await saveNew(M, d);
    const id = byName(n6);
    check("Marta segna una prenotazione (createdBy Marta)", outcome === "saved" && DB(`select status||'|'||coalesce("createdBy",'')||'|'||manual from "BookingRequest" where id=${q(id)}`) === `CONFIRMED|${MARTA.name}|true`, DB(`select status||'|'||coalesce("createdBy",'') from "BookingRequest" where id=${q(id)}`));
    check("Marta (non dal telefono del locale): niente «Manda la conferma su WhatsApp»", (await d.getByRole("link", { name: L.waConfirm }).count()) === 0);
    const later = d.getByRole("button", { name: L.waLater });
    check("Marta: c'è «Da mandare dal telefono del locale»", (await later.count()) === 1);
    await shot(M, "marta-salvata");
    if (await later.count()) {
      await later.click();
      await d.getByText(L.waLaterDone).waitFor({ timeout: 10000 }).catch(() => {});
      check("…«✓ La manda il telefono del locale…» e WA_QUEUED nella cronologia", L.waLaterDone.test(await d.innerText()) && (await waitDb(() => logs(id).some((l) => l.startsWith(`WA_QUEUED:${MARTA.name}`)))));
      await goList(A);
      const list = await A.getByRole("region", { name: /Da mandare su WhatsApp/ }).innerText().catch(() => "");
      check("…e la conferma entra nella lista «Da mandare su WhatsApp» del titolare", list.includes(n6), list.slice(0, 200));
      const waRound = A.getByRole("region", { name: /Da mandare su WhatsApp/ }).getByRole("link", { name: `Manda su WhatsApp a ${n6}` });
      const h = decodeURIComponent((await waRound.getAttribute("href").catch(() => null)) ?? "");
      check("…con il messaggio di conferma pronto", /ti aspettiamo/i.test(h) && /\/menu\/prenota\/r\//.test(h), h.slice(0, 120));
    }
    await closeSheet(M, d);
  }
  {
    const id = byName(n6);
    const e = await openEdit(M, n6, D2.day, { people: 3, table: "2" });
    const r = await saveIn(M, e, L.editSave, L.editSaved);
    check("Marta modifica: persone e tavolo salvati", r.outcome === "saved" && (await waitDb(() => /^CONFIRMED\|[^|]+\|3\|2\|/.test(row(id)))), row(id));
    check(`…cronologia UPDATED di ${MARTA.name}`, logs(id).some((l) => l.startsWith(`UPDATED:${MARTA.name}:`)), logs(id).join(" / "));
    check("…dopo la modifica, per Marta niente WhatsApp ma «Da mandare dal telefono del locale»", (await e.getByRole("link", { name: L.waConfirmEdit }).count()) === 0 && (await e.getByRole("button", { name: L.waLater }).count()) === 1);
    await closeSheet(M, e);
  }

  // ================= Marta sul «telefono del locale»: lì la conferma su WhatsApp parte =================
  {
    const local = await session("marta", EMP_PW, "phone");
    await local.ctx.addInitScript(() => {
      try {
        localStorage.setItem("prenotazioni-telefono-locale", "1");
      } catch {}
    });
    const n = "Prova Agenda Telefono locale";
    await goList(local.p);
    const d = await fillNew(local.p, { source: L.srcPhone, name: n, phone: nextPhone(), people: 2, day: D2.day, time: D2.slots[2] });
    await saveNew(local.p, d);
    check("Marta dal telefono del locale: «Manda la conferma su WhatsApp» (e non «Da mandare dal telefono del locale»)", (await d.getByRole("link", { name: L.waConfirm }).count()) === 1 && (await d.getByRole("button", { name: L.waLater }).count()) === 0);
    await local.ctx.close();
  }

  // ================= Due modifiche insieme (titolare e Marta) =================
  ensure();
  {
    const n7 = "Prova Agenda Insieme";
    const id = await online(n7, D2, D2.slots[0], 2);
    const eA = await openEdit(A, n7, D2.day, { people: 5, table: "A" });
    const eM = await openEdit(M, n7, D2.day, { people: 7, table: "M" });
    await Promise.all([eA.getByRole("button", { name: L.editSave, exact: true }).click(), eM.getByRole("button", { name: L.editSave, exact: true }).click()]);
    await A.waitForTimeout(3000);
    const r = row(id);
    const winA = /^CONFIRMED\|[^|]+\|5\|A\|/.test(r);
    const winM = /^CONFIRMED\|[^|]+\|7\|M\|/.test(r);
    check("insieme: il database ha una delle due modifiche per intero (niente misto)", winA || winM, r);
    const [winP, loseP, winner] = winA ? [A, M, ADMIN_NAME] : [M, A, MARTA.name];
    check("insieme: chi ha vinto legge «✓ Modifiche salvate»", (await bodyText(winP)).includes(L.editSaved));
    const lt = await bodyText(loseP);
    const conflictText = `Nel frattempo l'ha modificata ${winner}: qui sotto ci sono i dati aggiornati. Rifai la tua modifica e salva.`;
    check(`(1) insieme: l'altro legge «${conflictText}»`, lt.includes(conflictText), lt.match(/Nel frattempo[^\n]*/)?.[0] ?? "nessun messaggio");
    check("insieme: una sola modifica in cronologia", logs(id).filter((l) => l.startsWith("UPDATED")).length === 1, logs(id).join(" / "));
    // (1) Il modulo dell'altro ora ha i dati di chi ha vinto (persone e tavolo), non i suoi.
    const eLose = loseP.getByRole("dialog", { name: L.editTitle });
    const [wPeople, wTable] = winA ? ["5", "A"] : ["7", "M"];
    const loseChecked = await eLose.getByRole("radio", { name: wPeople, exact: true }).getAttribute("aria-checked").catch(() => null);
    const loseTable = await eLose.getByRole("textbox", { name: /^Tavolo/ }).inputValue().catch(() => "");
    check(`(1) …nel suo modulo ora ci sono i dati aggiornati (${wPeople} persone, tavolo ${wTable})`, loseChecked === "true" && loseTable === wTable, `${loseChecked} ${loseTable}`);
    await shot(loseP, "insieme-perso");
    // …rifà la sua modifica sui dati nuovi e salva: ora passa.
    await eLose.getByRole("textbox", { name: /^Tavolo/ }).fill("R");
    const again = await saveIn(loseP, eLose, L.editSave, L.editSaved);
    check("(1) …rifatta e salvata: «✓ Modifiche salvate» e tavolo R nel database", again.outcome === "saved" && (await waitDb(() => row(id).split("|")[3] === "R")), `${again.outcome} ${row(id)}`);
    await closeAll(A);
    await closeAll(M);

    // Annullata nel frattempo (dal cliente): la modifica si rifiuta con un messaggio chiaro
    // (2) Prima: «Arrivati» segnato da un altro mentre la modifica è aperta (cambia updatedAt): si salva lo stesso.
    const eA1 = await openEdit(A, n7, D2.day, { people: 6 });
    DB(`update "BookingRequest" set "arrivedAt"=now(), "updatedAt"=now() where id='${id}'`);
    const ar = await saveIn(A, eA1, L.editSave, L.editSaved);
    check("(2) «Arrivati» segnato da un altro mentre la modifica è aperta → «✓ Modifiche salvate» lo stesso", ar.outcome === "saved" && (await waitDb(() => row(id).split("|")[2] === "6")), `${ar.outcome} ${row(id)}`);
    DB(`update "BookingRequest" set "arrivedAt"=null where id='${id}'`);
    await closeAll(A);
    const before = row(id);
    const eA2 = await openEdit(A, n7, D2.day, { people: 9 });
    DB(`update "BookingRequest" set status='CANCELLED', "cancelledBy"='cliente', "updatedAt"=now() where id='${id}'`);
    await eA2.getByRole("button", { name: L.editSave, exact: true }).click();
    await A.waitForTimeout(2000);
    check("modifica di una annullata nel frattempo: rifiutata (database invariato)", row(id) === before.replace(/^CONFIRMED/, "CANCELLED"), row(id));
    const goneTxt = await bodyText(A);
    const goneMsg = "Nel frattempo è stata annullata: non si può più modificare.";
    check(`(5) …al posto del modulo «${goneMsg}», una volta sola`, goneTxt.split(goneMsg).length === 2, goneTxt.match(/Nel frattempo[^\n]*/g)?.join(" | "));
    const eGone = A.getByRole("dialog", { name: L.editTitle });
    check("(5) …e solo «Chiudi» (niente campi né «Salva le modifiche»)", (await eGone.getByRole("button", { name: "Chiudi", exact: true }).count()) >= 1 && (await eGone.getByRole("button", { name: L.editSave }).count()) === 0 && (await eGone.getByRole("textbox").count()) === 0);
    await shot(A, "modifica-annullata");
    await closeAll(A);
  }

  // ================= (3) Fisso / senza telefono: annullo senza messaggi, niente «da mandare» =================
  ensure();
  {
    const n9 = "Prova Agenda Fisso";
    const d = await fillNew(A, { source: L.srcPhone, name: n9, phone: "02 1234567", people: 2, day: D2.day, time: D2.slots[1] });
    const r = await saveNew(A, d);
    check("(3) prenotazione a mano con un fisso: salvata", r.outcome === "saved", r.outcome + " " + r.warnText);
    await closeSheet(A, d);
    const id = byName(n9);
    const s9 = await openBooking(A, n9, D2.day);
    await s9.getByRole("button", { name: "Annulla la prenotazione" }).click();
    const us = s9.getByRole("button", { name: "Annulliamo noi (avvisa tu il cliente)" });
    check("(3) fisso: «Annulliamo noi (avvisa tu il cliente)» (non «il cliente riceve le scuse»)", (await us.count()) === 1 && (await s9.getByRole("button", { name: /il cliente riceve le scuse/ }).count()) === 0);
    await us.click();
    check("(3) …sotto «Il cliente non riceve messaggi: chiamalo tu.» e niente messaggio da scrivere", (await s9.innerText()).includes("Il cliente non riceve messaggi: chiamalo tu.") && (await s9.getByRole("textbox").count()) === 0);
    const yes = s9.getByRole("button", { name: "Sì, annulla", exact: true });
    check("(3) …conferma «Sì, annulla»", (await yes.count()) === 1);
    await yes.click();
    check("(3) …annullata nel database", await waitDb(() => DB(`select status from "BookingRequest" where id=${q(id)}`) === "CANCELLED"));
    await shot(A, "fisso-annullata");
    await closeAll(A);
    await goList(A);
    await tab(A, "Da gestire");
    check("(3) …e non compare tra «Da mandare su WhatsApp»", !(await panel(A).innerText()).includes(n9));
    // (16) In agenda resta in fondo al giorno, barrata, con «Annullata», fuori dai totali.
    await goAgenda(A, D2.day);
    const items = await agenda(A).getByRole("list").first().getByRole("listitem").allInnerTexts();
    const k = items.findIndex((t) => t.includes(n9));
    check("(16) agenda: l'annullata è in fondo al giorno con «Annullata»", k === items.length - 1 && /Annullata/.test(items[k] ?? ""), items.map((t) => t.split("\n")[0]).join(" | "));
    const deco = await agendaRow(A, n9).evaluate((el) => [...el.querySelectorAll("*")].some((x) => getComputedStyle(x).textDecorationLine.includes("line-through")));
    check("(16) …barrata", deco);
    const tot = (await agenda(A).innerText()).match(/\d+ person[ae] · \d+ tavol[io]/)?.[0] ?? "";
    const [p2, t2] = DB(`select coalesce(sum(people),0)||'|'||count(*) from "BookingRequest" where day='${D2.day}' and status='CONFIRMED' and not "isTest"`).split("|");
    check(`(16) …fuori dai totali (${p2} persone · ${t2} tavoli)`, tot === `${peopleWord(p2)} · ${t2} ${t2 === "1" ? "tavolo" : "tavoli"}` || DB(`select count(*) from "BookingRequest" where day='${D2.day}' and status='CONFIRMED' and name not like 'Prova Agenda%'`) !== "0", tot);
  }

  // ================= (4) Ora già passata e giorni di notte =================
  ensure();
  {
    const romeNow = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const nowMin = Number(romeNow.slice(0, 2)) * 60 + Number(romeNow.slice(3));
    const night = nowMin < 5 * 60;
    const d = await fillNew(A, { source: L.srcPhone, name: "Prova Agenda Passata", phone: nextPhone(), people: 2 });
    const btns = await d.getByRole("button", { pressed: true }).or(d.getByRole("button", { pressed: false })).allInnerTexts();
    if (night) check("(4) di notte: niente «Oggi»/«Domani» ma la data («… (stanotte)» e il giorno dopo)", btns.some((t) => /^\w{3} \d+ \w{3} \(stanotte\)$/.test(t)) && !btns.includes("Oggi") && !btns.includes("Domani"), btns.join(" | "));
    else check("(4) di giorno: «Oggi» e «Domani»", btns.includes("Oggi") && btns.includes("Domani"), btns.join(" | "));
    // Un'ora di due ore fa, se è ancora «oggi» (dalle 7 in poi, o di notte dopo le 2).
    const pastMin = nowMin - 120;
    const sameDay = night ? pastMin >= 0 || pastMin + 1440 >= 5 * 60 : pastMin >= 5 * 60;
    if (sameDay) {
      const m = (pastMin + 1440) % 1440;
      const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      await d.getByLabel("Giorno", { exact: true }).fill(TODAY);
      await d.getByLabel("Un altro orario").fill(t);
      const r = await saveNew(A, d, { confirm: false });
      check(`(4) ora già passata (${t}): domanda «Le ${t} … sono già passate: segnarla lo stesso?»`, r.outcome === "warn" && new RegExp(`Le ${t} di (oggi|[^ ]+ \\d+ [^ ]+) sono già passate: segnarla lo stesso\\?`).test(r.warnText), r.warnText);
      await A.getByRole("alertdialog").getByRole("button", { name: "Annulla" }).click().catch(() => {});
      check("(4) …con «Annulla» non si salva", DB(`select count(*) from "BookingRequest" where name='Prova Agenda Passata'`) === "0");
      await shot(A, "ora-passata");
    } else check("(4) ora già passata: saltata (prima delle 7 non c'è un'ora di due ore fa nello stesso giorno)", true);
    await closeAll(A);
  }

  // ================= Telefono stretto (360 px) =================
  ensure();
  {
    const narrow = await session("andrea", ADMIN_PW, "phone", { viewport: { width: 360, height: 760 } });
    const N = narrow.p;
    await goAgenda(N, D1.day);
    check("360 px: scheda «Agenda» senza scorrimento orizzontale", (await overflow(N)) <= 0, String(await overflow(N)));
    const rowsOut = await agenda(N).evaluate((el) => [...el.querySelectorAll("li, button, a")].filter((x) => x.getBoundingClientRect().right > window.innerWidth + 1).length);
    check("360 px: nessuna riga o pulsante dell'agenda esce dallo schermo", rowsOut === 0, String(rowsOut));
    await shot(N, "360-agenda");
    await N.getByRole("button", { name: L.newBtn }).first().click();
    const d = N.getByRole("dialog", { name: L.newTitle });
    await d.waitFor();
    const out = await d.evaluate((el) => ({ sw: el.scrollWidth - el.clientWidth, outside: [...el.querySelectorAll("input, button, textarea, label")].filter((x) => x.getBoundingClientRect().right > window.innerWidth + 1).length }));
    check("360 px: foglio «Nuova prenotazione» senza scorrimento orizzontale né campi fuori", (await overflow(N)) <= 0 && out.sw <= 0 && out.outside === 0, JSON.stringify(out));
    await shot(N, "360-nuova");
    await narrow.ctx.close();
  }

  // ================= Sara, senza permesso =================
  ensure();
  {
    const sara = await session("sara", EMP_PW, "phone");
    await sara.p.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    const t = await bodyText(sara.p);
    check("Sara (senza permesso): niente agenda, niente «+ Nuova prenotazione», nessun nome", /Non hai il permesso/.test(t) && !/Prova Agenda/.test(t) && (await sara.p.getByRole("button", { name: L.newBtn }).count()) === 0 && (await sara.p.getByRole("tab", { name: new RegExp(`^${L.tab}`) }).count()) === 0);
    await sara.ctx.close();
  }

  // ================= Funzione spenta =================
  ensure(false);
  {
    const n8 = "Prova Agenda Spenta";
    await goList(A);
    check("spenta: il titolare vede l'agenda (in prova)", (await A.getByRole("tab", { name: new RegExp(`^${L.tab}`) }).count()) === 1 && (await A.getByRole("button", { name: L.newBtn }).count()) >= 1);
    const d = await fillNew(A, { source: L.srcPhone, name: n8, phone: nextPhone(), people: 2, day: D2.day, time: D2.slots[2] });
    await saveNew(A, d);
    check("spenta: la prenotazione del titolare è salvata come prova", await waitDb(() => DB(`select status||'|'||"isTest" from "BookingRequest" where name=${q(n8)}`) === "CONFIRMED|true"), DB(`select status||'|'||"isTest" from "BookingRequest" where name=${q(n8)}`));
    await closeSheet(A, d);
    await goList(A);
    await tab(A, L.tab);
    await agenda(A).getByLabel(L.pickDay).fill(D2.day);
    await A.waitForTimeout(600);
    check("spenta: in agenda la prova si riconosce («Di prova»)", /Di prova/.test(await agendaRow(A, n8).innerText().catch(() => "")));
    ensure(false);
    await M.goto(`${BASE}/prenotazioni`, { waitUntil: "networkidle", timeout: 180000 });
    const mt = await bodyText(M);
    check("spenta: Marta (anche con il permesso) non vede l'agenda né i nomi", (await M.getByRole("tab", { name: new RegExp(`^${L.tab}`) }).count()) === 0 && (await M.getByRole("button", { name: L.newBtn }).count()) === 0 && !/Prova Agenda/.test(mt), mt.slice(0, 200).replace(/\n/g, " "));
    await shot(M, "spenta-marta");
  }
  setSetting({ enabled: true });

  check("nessun errore JavaScript (titolare)", A.errs.length === 0, A.errs.join(" | "));
  check("nessun errore JavaScript (Marta)", M.errs.length === 0, M.errs.join(" | "));
  await marta.ctx.close();
  await admin.ctx.close();
} catch (e) {
  check("la prova è arrivata in fondo", false, e?.stack ?? String(e));
  if (SHOTS) for (const [k, p] of Object.entries(pages)) await p?.screenshot({ path: `${SHOTS}/agenda-errore-${k}.png`, fullPage: true }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  restoreAll();
}
check("pulizia: nessuna prenotazione «Prova Agenda» o 300 005 rimasta", DB(`select count(*) from "BookingRequest" where name like 'Prova Agenda%' or phone like '39300005%' or phone like '+39300005%'`) === "0");
check("pulizia: nessuna giornata chiusa di prova", DB(`select count(*) from "ClosureDay" where reason like 'Prova Agenda%'`) === "0");
check("pulizia: impostazione «bookings» come prima", snapshotBookingSetting() === savedSetting);
check("pulizia: permessi dei dipendenti come prima", JSON.stringify(snapshotPermissions()) === JSON.stringify(savedPerms));
process.exit(finish());
