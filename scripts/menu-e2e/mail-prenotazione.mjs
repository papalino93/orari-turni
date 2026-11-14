// Prova della veste HTML delle email delle prenotazioni (funzione pura, niente database né browser).
// Uso: npx tsx scripts/menu-e2e/mail-prenotazione.mjs
import { check, finish } from "./prenota-lib.mjs";

const { customerMessage, customerSubject } = await import("@/lib/booking/messages");
const { bookingMailHtml, staffMailHtml } = await import("@/lib/booking/mail-html");

const origin = "https://esempio.it";
const statusUrl = `${origin}/menu/prenota/r/tok`;
const venue = { address: "Via dei Rossi 53/C, 50018 Scandicci FI", phone: "331 210 2464" };
const m = { name: "Giulia Rossi", day: "2026-11-21", time: "20:30", people: 4, proposedTime: "21:30", statusUrl, allergies: false, address: venue.address, bookUrl: `${origin}/prenota`, code: "K7P2QX" };
const make = (kind, over = {}) => {
  const mm = { ...m, ...over };
  const text = customerMessage(kind, mm);
  return { text, html: bookingMailHtml({ kind, text, subject: customerSubject(kind, mm), m: mm, origin, calendarUrl: kind === "confirmed" && mm.time ? `${statusUrl}/calendario` : null, canCancel: kind === "received" || kind === "confirmed", venue }) };
};

const c = make("confirmed");
check("conferma: logo dal sito", c.html.includes(`src="${origin}/menu/logo-mail.png"`));
check("conferma: impaginato a tabelle (Outlook) su fondo crema", /<table role="presentation"/.test(c.html) && c.html.includes("#f4efe7"));
check("conferma: riepilogo con giorno, ora, persone, nome, senza codice", ["Sabato 21 novembre", "20:30", "4 persone", "Giulia Rossi", "Prenotazione confermata"].every((t) => c.html.includes(t)) && !c.html.includes("K7P2QX"));
check("conferma: pulsanti «Vedi la tua prenotazione», «Aggiungi al calendario», «Annulla»", c.html.includes(`href="${statusUrl}"`) && c.html.includes(">Vedi la tua prenotazione<") && c.html.includes(`href="${statusUrl}/calendario"`) && c.html.includes(">Aggiungi al calendario<") && c.html.includes(`href="${statusUrl}#annulla"`) && c.html.includes(">Annulla<"));
check("conferma: indirizzo e telefono del locale in fondo", c.html.includes("Via dei Rossi 53/C") && c.html.includes('href="tel:+393312102464"'));
check("conferma: «salvalo in rubrica» con il numero WhatsApp del locale", c.html.includes("Ti scriviamo dal numero WhatsApp dell&#39;enoteca, 331 210 2464: salvalo in rubrica.") || c.html.includes("Ti scriviamo dal numero WhatsApp dell'enoteca, 331 210 2464: salvalo in rubrica."));
check("niente elementi da newsletter (disiscrizione, informativa della lista)", !/Non voglio più ricevere|disiscri|unsubscribe/i.test(c.html));
check("l'indirizzo della pagina non compare scritto per intero nel testo (è un pulsante)", !c.html.includes(`>${statusUrl}<`) && !c.html.replace(/href="[^"]*"/g, "").includes(statusUrl));
check("il testo semplice resta quello di sempre (con l'indirizzo)", c.text === customerMessage("confirmed", m) && c.text.includes(statusUrl));
const noTime = make("confirmed", { time: "" });
check("conferma senza ora: «da definire», niente «Aggiungi al calendario»", noTime.html.includes("da definire") && !noTime.html.includes("Aggiungi al calendario"));
const r = make("received");
check("richiesta ricevuta: «In attesa di conferma», «Vedi la tua richiesta» e «Annulla la richiesta»", r.html.includes("In attesa di conferma") && r.html.includes(">Vedi la tua richiesta<") && r.html.includes(">Annulla la richiesta<"));
check("richiesta ricevuta: «non è ancora una prenotazione confermata» resta nel testo", r.html.includes("non è ancora una prenotazione confermata"));
const p = make("proposed");
check("altro orario: «21:30», «Avevi chiesto 20:30» e pulsante per rispondere", p.html.includes(">21:30<") && p.html.includes("Avevi chiesto") && p.html.includes("Rispondi: va bene alle 21:30?"));
const d = make("declined");
check("al completo: «Chiedi un altro giorno» verso il modulo, niente «Annulla»", d.html.includes(`href="${origin}/prenota"`) && d.html.includes(">Chiedi un altro giorno<") && !d.html.includes("#annulla"));
const x = make("cancelledByCustomer", { wasConfirmed: true });
check("annullata dal cliente: niente «Annulla», «Prenota un altro giorno»", !x.html.includes("#annulla") && x.html.includes("Prenota un altro giorno"));
const evil = make("confirmed", { name: "<script>x</script>" });
check("nomi scritti dal cliente: sempre come testo (niente HTML)", !evil.html.includes("<script>") && evil.html.includes("&lt;script&gt;"));
const s = staffMailHtml({ title: "Nuova richiesta di prenotazione", body: "sabato 21 novembre alle 20:30 · 4 persone · Rossi", url: `${origin}/prenotazioni?r=x`, origin, venue });
check("avviso al personale: stessa cornice e «Apri le richieste»", s.includes("logo-mail.png") && s.includes(">Apri le richieste<") && s.includes(`${origin}/prenotazioni?r=x`));
process.exit(finish());
