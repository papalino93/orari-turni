// Le email delle prenotazioni (transazionali): stessa veste delle mail della sezione Mail (logo bordeaux,
// scheda bianca su crema, tabelle per Outlook), con il riepilogo in evidenza e i pulsanti «Vedi la tua
// prenotazione», «Aggiungi al calendario», «Annulla». Funzioni pure (nessun database): le usa il servizio
// e lo script di anteprima (scripts/menu-e2e/anteprima-mail-prenotazione.mjs).
//
// Niente elementi da newsletter: niente «Non voglio più ricevere», niente List-Unsubscribe. Sono mail di
// servizio e devono restare nella posta «Principale» di Gmail. Il testo semplice resta quello di sempre
// (customerMessage): qui cambia solo l'HTML.

import { escapeHtml, oneLine } from "@/lib/mail-text";
import { dayLong, peopleText } from "@/lib/booking/rules";
import { VENUE_NAME, type MessageInput, type MessageKind } from "@/lib/booking/messages";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const WINE = "#6B1020";
const INK = "#2b1a1c";
const MUTED = "#7a6f68";
const CREAM = "#f4efe7";
const GOLD = "#c9a96e";

export type BookingMailVenue = { address: string; phone: string };

export type BookingMailInput = {
  kind: MessageKind;
  // Il testo semplice già pronto (customerMessage): l'HTML ne mostra i paragrafi, senza gli indirizzi.
  text: string;
  subject: string;
  m: MessageInput & { code?: string | null; peopleUnknown?: boolean };
  origin: string;
  // «Aggiungi al calendario» (solo confermate con l'ora): /menu/prenota/r/<token>/calendario.
  calendarUrl?: string | null;
  // Si può ancora annullare dalla pagina della prenotazione?
  canCancel?: boolean;
  venue: BookingMailVenue;
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Lo stato in cima al riepilogo, con il suo colore.
const BADGE: Record<MessageKind, { text: string; fg: string; bg: string }> = {
  received: { text: "In attesa di conferma", fg: "#7a5a12", bg: "#fbf1d9" },
  confirmed: { text: "Prenotazione confermata", fg: "#1d6b3f", bg: "#e3f3e8" },
  proposed: { text: "Ti proponiamo un altro orario", fg: "#7a5a12", bg: "#fbf1d9" },
  declined: { text: "Siamo al completo", fg: "#8a2740", bg: "#f8e6ea" },
  cancelledByVenue: { text: "Prenotazione annullata", fg: "#8a2740", bg: "#f8e6ea" },
  cancelledByCustomer: { text: "Annullata come ci hai chiesto", fg: "#5b5048", bg: "#efe9e2" },
};

function button(href: string, label: string, primary: boolean): string {
  const style = primary
    ? `display:block;padding:14px 20px;background:${WINE};color:#ffffff;border:1px solid ${WINE};border-radius:999px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;text-align:center;text-decoration:none`
    : `display:block;padding:13px 20px;background:#ffffff;color:${WINE};border:1px solid #d9c9b8;border-radius:999px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;text-align:center;text-decoration:none`;
  // Una riga per pulsante, larga quanto la scheda: si tocca bene sul telefono e regge in Outlook.
  return (
    `<tr><td style="padding:0 0 10px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${primary ? WINE : "#ffffff"}" style="border-radius:999px">` +
    `<a href="${escapeHtml(href)}" target="_blank" style="${style}">${escapeHtml(label)}</a>` +
    `</td></tr></table></td></tr>`
  );
}

function summary(input: BookingMailInput): string {
  const { kind, m } = input;
  const badge = BADGE[kind];
  const proposed = kind === "proposed" && m.proposedTime;
  const rows: [string, string][] = [
    ["Giorno", cap(dayLong(m.day))],
    ["Ora", proposed ? `${m.proposedTime}` : m.time || "da definire"],
    ...(proposed ? ([["Avevi chiesto", m.time]] as [string, string][]) : []),
    ["Persone", m.people > 0 && !m.peopleUnknown ? peopleText(m.people) : "da definire"],
    ["A nome di", m.name],
  ];
  const cell = (label: string, value: string, last: boolean) =>
    `<tr>` +
    `<td style="padding:9px 0;${last ? "" : "border-bottom:1px solid #eadfce;"}font-family:${FONT};font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>` +
    `<td align="right" style="padding:9px 0 9px 12px;${last ? "" : "border-bottom:1px solid #eadfce;"}font-family:${FONT};font-size:15px;font-weight:600;color:${INK}">${escapeHtml(value)}</td>` +
    `</tr>`;
  // Niente codice della prenotazione: al telefono bastano nome e giorno (decisione del titolare).
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;background:#faf6f0;border:1px solid #eadfce;border-radius:14px">` +
    `<tr><td style="padding:16px 18px 14px">` +
    `<span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${badge.bg};color:${badge.fg};font-family:${FONT};font-size:12.5px;font-weight:700">${escapeHtml(badge.text)}</span>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">` +
    rows.map(([l, v], i) => cell(l, v, i === rows.length - 1)).join("") +
    `</table></td></tr></table>`
  );
}

// I paragrafi del testo, senza le frasi con gli indirizzi (diventano pulsanti): «Qui vedi sempre a che
// punto è: https://…» → sopra i pulsanti, senza l'indirizzo.
function splitText(text: string, urls: string[]): { body: string[]; lead: string[] } {
  const body: string[] = [];
  const lead: string[] = [];
  for (const p of text.trim().split(/\n{2,}/)) {
    const url = urls.find((u) => u && p.includes(u));
    if (url) {
      const rest = p.replace(url, "").trim().replace(/[:\s]+$/, "");
      if (rest) lead.push(rest.endsWith(".") ? rest : `${rest}.`);
    } else body.push(p);
  }
  return { body, lead };
}

function frame(subject: string, origin: string, inner: string, footer: string, preheader = ""): string {
  const logo = `${origin.replace(/\/$/, "")}/menu/logo-mail.png`;
  return (
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${CREAM}">` +
    // Riga nascosta: l'anteprima nella casella di posta (la prima frase, non il testo del logo).
    (preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CREAM};font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>` : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px">` +
    `<tr><td align="center" style="padding:28px 28px 8px">` +
    `<img src="${escapeHtml(logo)}" alt="${escapeHtml(VENUE_NAME)}" width="170" style="display:block;width:170px;max-width:60%;height:auto;border:0;color:${WINE};font-family:${SERIF};font-size:20px">` +
    `<div style="width:56px;height:1px;background:${GOLD};margin:18px auto 0;line-height:1px;font-size:0">&nbsp;</div>` +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px 30px;color:${INK};font-family:${FONT};font-size:16px;line-height:1.6">` +
    inner +
    footer +
    `</td></tr></table>` +
    `</td></tr></table></body></html>`
  );
}

function venueFooter(venue: BookingMailVenue, note: string | null): string {
  const address = oneLine(venue.address);
  const maps = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
  const digits = venue.phone.replace(/[^\d+]/g, "");
  const tel = digits ? `tel:${digits.startsWith("+") ? digits : `+39${digits}`}` : "";
  const quiet = `color:${MUTED};text-decoration:none`;
  const row = (inner: string, extra = "") => `<p style="margin:0 0 3px;${extra}">${inner}</p>`;
  const nowrap = (inner: string) => `<span style="white-space:nowrap">${inner}</span>`;
  return (
    `<div style="margin-top:26px;padding-top:18px;border-top:1px solid #eae3d8;font-size:12.5px;line-height:1.6;color:${MUTED}">` +
    (note ? row(escapeHtml(note), `margin:0 0 12px;padding:10px 12px;background:#f3f8f4;border-radius:10px;color:#2f5a3f;font-size:13px`) : "") +
    row(escapeHtml(VENUE_NAME), "font-weight:600;color:#4a3f3a") +
    (address ? row(nowrap(`<a href="${escapeHtml(maps)}" style="${quiet}">${escapeHtml(address)}</a>`)) : "") +
    (tel ? row(nowrap(`<a href="${escapeHtml(tel)}" style="${quiet}">Tel. ${escapeHtml(venue.phone)}</a>`)) : "") +
    row("Ti scriviamo per la tua prenotazione: è un messaggio di servizio.", "margin-top:10px") +
    `</div>`
  );
}

// «Ti scriviamo dal numero WhatsApp dell'enoteca, 331 210 2464: salvalo in rubrica.»
export function whatsappNumberNote(phone: string): string | null {
  return phone.trim() ? `Ti scriviamo dal numero WhatsApp dell'enoteca, ${phone.trim()}: salvalo in rubrica.` : null;
}

export function bookingMailHtml(input: BookingMailInput): string {
  const { kind, m } = input;
  const status = m.statusUrl;
  const book = m.bookUrl ?? "";
  const { body, lead } = splitText(input.text, [status, book]);
  const paragraphs = body.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  // La firma («A presto, L'Angolo del Vino») va dopo il riepilogo e i pulsanti.
  const sign = paragraphs.length > 1 ? paragraphs.pop()! : "";

  const buttons: string[] = [];
  if (kind === "received") {
    buttons.push(button(status, "Vedi la tua richiesta", true));
    if (input.canCancel !== false) buttons.push(button(`${status}#annulla`, "Annulla la richiesta", false));
  } else if (kind === "confirmed") {
    buttons.push(button(status, "Vedi la tua prenotazione", true));
    if (input.calendarUrl) buttons.push(button(input.calendarUrl, "Aggiungi al calendario", false));
    if (input.canCancel !== false) buttons.push(button(`${status}#annulla`, "Annulla", false));
  } else if (kind === "proposed") {
    buttons.push(button(status, `Rispondi: va bene alle ${m.proposedTime ?? ""}?`.replace(/ alle \?$/, "?"), true));
  } else if (kind === "declined" || kind === "cancelledByVenue") {
    if (book) buttons.push(button(book, "Chiedi un altro giorno", true));
  } else if (kind === "cancelledByCustomer") {
    if (book) buttons.push(button(book, "Prenota un altro giorno", false));
  }
  const leadHtml = lead.length ? `<p style="margin:0 0 12px;font-size:14.5px;color:${MUTED}">${lead.map(escapeHtml).join(" ")}</p>` : "";
  const buttonsHtml = buttons.length ? `${leadHtml}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">${buttons.join("")}</table>` : leadHtml;
  const note = kind === "received" || kind === "confirmed" || kind === "proposed" ? whatsappNumberNote(input.venue.phone) : null;
  return frame(input.subject, input.origin, paragraphs.join("") + summary(input) + buttonsHtml + sign, venueFooter(input.venue, note), oneLine(body[0] ?? "").slice(0, 140));
}

// Avviso al personale (nuova richiesta, annullata dal cliente…): stessa cornice, più semplice.
export function staffMailHtml(input: { title: string; body: string; url: string; origin: string; venue: BookingMailVenue }): string {
  const inner =
    `<p style="margin:0 0 6px;font-family:${FONT};font-size:12.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${WINE}">${escapeHtml(input.title)}</p>` +
    `<p style="margin:0 0 20px;font-family:${SERIF};font-size:20px;line-height:1.4;color:${INK}">${escapeHtml(cap(input.body))}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${button(input.url, "Apri le richieste", true)}</table>`;
  const footer = `<div style="margin-top:22px;padding-top:14px;border-top:1px solid #eae3d8;font-size:12.5px;color:${MUTED}">Avviso automatico delle prenotazioni di ${escapeHtml(VENUE_NAME)}.</div>`;
  return frame(input.title, input.origin, inner, footer, input.body.slice(0, 140));
}
