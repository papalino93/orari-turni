// Anteprima delle email delle prenotazioni: un file HTML (e il testo semplice) per ogni tipo di
// messaggio, più l'avviso al personale, da aprire nel browser o da mandarsi per prova.
// Uso: npx tsx scripts/menu-e2e/anteprima-mail-prenotazione.mjs [cartella]
//      (di partenza: la cartella «mail-prenotazione» nella cartella temporanea indicata da SCRATCH, o ./mail-prenotazione)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { customerMessage, customerSubject } = await import("@/lib/booking/messages");
const { bookingMailHtml, staffMailHtml } = await import("@/lib/booking/mail-html");

const out = process.argv[2] || (process.env.SCRATCH ? join(process.env.SCRATCH, "mail-prenotazione") : "mail-prenotazione");
mkdirSync(out, { recursive: true });
const origin = process.env.ORIGIN || "https://orari-turni.vercel.app";
const venue = { address: "Via dei Rossi 53/C, 50018 Scandicci FI", phone: "331 210 2464" };
const statusUrl = `${origin}/menu/prenota/r/esempio-token`;
const base = {
  name: "Giulia Rossi",
  day: "2026-11-21",
  time: "20:30",
  people: 4,
  proposedTime: "21:30",
  staffMessage: null,
  statusUrl,
  allergies: true,
  address: venue.address,
  bookUrl: `${origin}/prenota`,
  code: "K7P2QX",
};
const kinds = ["received", "confirmed", "proposed", "declined", "cancelledByVenue", "cancelledByCustomer"];
const files = [];
for (const kind of kinds) {
  const m = { ...base, wasConfirmed: kind === "cancelledByCustomer" };
  const text = customerMessage(kind, m);
  const subject = customerSubject(kind, m);
  const html = bookingMailHtml({
    kind,
    text,
    subject,
    m,
    origin,
    calendarUrl: kind === "confirmed" ? `${statusUrl}/calendario` : null,
    canCancel: kind === "received" || kind === "confirmed",
    venue,
  });
  writeFileSync(join(out, `${kind}.html`), html);
  writeFileSync(join(out, `${kind}.txt`), `Oggetto: ${subject} · L'Angolo del Vino\n\n${text}\n`);
  files.push(`${kind}.html`);
}
// Una conferma con l'ora ancora da definire (niente «Aggiungi al calendario»).
{
  const m = { ...base, time: "", allergies: false };
  const text = customerMessage("confirmed", m);
  writeFileSync(join(out, "confirmed-senza-ora.html"), bookingMailHtml({ kind: "confirmed", text, subject: customerSubject("confirmed", m), m, origin, calendarUrl: null, canCancel: true, venue }));
  files.push("confirmed-senza-ora.html");
}
writeFileSync(
  join(out, "personale.html"),
  staffMailHtml({ title: "Nuova richiesta di prenotazione", body: "sabato 21 novembre alle 20:30 · 4 persone · Giulia Rossi · allergie", url: `${origin}/prenotazioni?r=esempio`, origin, venue }),
);
files.push("personale.html");
writeFileSync(join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Email delle prenotazioni</title><body style="font-family:system-ui;padding:24px"><h1>Email delle prenotazioni</h1><ul>${files.map((f) => `<li><a href="${f}">${f}</a></li>`).join("")}</ul></body>`);
console.log(`Scritte ${files.length} anteprime in ${out}`);
