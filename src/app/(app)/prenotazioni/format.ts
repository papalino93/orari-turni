// Testi e link della pagina Prenotazioni (funzioni pure, per i componenti client).

import { addDays, businessDay, dayShort, STATUS_LABEL, viewStatus, whatsappReachable, type BookingView } from "@/lib/booking/rules";
import { customerMessage, type MessageKind } from "@/lib/booking/messages";
import { whatsappHref } from "@/lib/menu-venue";
import type { BookingItem } from "./types";

// Lo stesso testo che il servizio scrive nella cronologia (service.ts, CUSTOMER_TOLD_US): qui non si
// può importare il servizio, che usa il database.
const CUSTOMER_TOLD_US = "Ci ha avvisato il cliente";

export function viewOf(b: BookingItem, now: number): BookingView {
  return viewStatus({ status: b.status, startsAt: new Date(b.startsAt), proposedStartsAt: b.proposedStartsAt ? new Date(b.proposedStartsAt) : null }, new Date(now));
}

export const statusLabel = (v: BookingView) => STATUS_LABEL[v];

// Da dove arriva, breve, per le righe dell'agenda: «Telefono · Marta», «Online».
export function originShort(b: Pick<BookingItem, "manual" | "source" | "createdBy">): string {
  if (!b.manual) return "Online";
  const where = b.source === "whatsapp" ? "WhatsApp" : b.source === "persona" ? "Di persona" : b.source === "librone" ? "Dal librone" : "Telefono";
  return b.createdBy ? `${where} · ${b.createdBy}` : where;
}

// La conferma è già partita (WhatsApp aperto, segnata come mandata, email)?
export function confirmationSent(b: Pick<BookingItem, "log">): boolean {
  return b.log.some((l) => l.kind === "WHATSAPP_OPENED" || l.kind === "WHATSAPP_DONE" || (l.kind === "MAIL_OK" && (l.message ?? "").startsWith("Email al cliente")));
}

// «Oggi», «Domani» oppure «Sab 14 nov».
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Oggi";
  if (day === addDays(today, 1)) return "Domani";
  if (day === addDays(today, -1)) return "Ieri";
  return dayShort(day);
}

const CLOCK = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const clock = (ms: number) => CLOCK.format(new Date(ms));

// «oggi alle 18:42», «ieri alle 21:10», «Sab 14 nov alle 12:05».
export function whenText(ms: number, today: string): string {
  const d = businessDay(new Date(ms));
  const day = d === today ? "oggi" : d === addDays(today, -1) ? "ieri" : dayShort(d);
  return `${day} alle ${clock(ms)}`;
}

// «12 min», «1 h 20 min», «3 h».
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h >= 48) return `${Math.floor(h / 24)} giorni`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// «+39 333 123 4567» dal numero salvato («393331234567»).
export function phoneDisplay(phone: string): string {
  if (!phone) return "Non lasciato";
  if (phone.startsWith("39")) {
    const n = phone.slice(2);
    if (n.startsWith("3") && n.length === 10) return `+39 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
    return `+39 ${n.slice(0, 3)} ${n.slice(3)}`;
  }
  return `+${phone}`;
}
export const telLink = (phone: string) => `tel:+${phone}`;
export const chatLink = (phone: string) => `https://wa.me/${phone}`;

// Il messaggio WhatsApp già scritto per la risposta del locale (lo stesso che prepara il server).
export function replyHref(b: BookingItem, kind: MessageKind): string | null {
  if (!whatsappReachable(b.phone)) return null;
  // Numero salvato già internazionale: con il «+» un francese «33…» non diventa «39 33…».
  return whatsappHref(
    `+${b.phone}`,
    customerMessage(kind, {
      name: b.name,
      day: b.day,
      time: b.time,
      people: b.people,
      proposedTime: b.proposedTime,
      staffMessage: b.staffMessage,
      statusUrl: b.statusUrl,
      allergies: b.allergies,
    }),
  );
}

export const REPLY_LABEL: Record<MessageKind, string> = {
  received: "Messaggio: richiesta ricevuta",
  confirmed: "Messaggio di conferma",
  proposed: "Messaggio: un altro orario",
  declined: "Messaggio: siamo al completo",
  cancelledByVenue: "Messaggio di annullamento",
  cancelledByCustomer: "Messaggio di annullamento",
};

// Più corte, per le righe della lista «Da mandare su WhatsApp».
export const REPLY_SHORT: Record<MessageKind, string> = {
  received: "Richiesta ricevuta",
  confirmed: "Conferma",
  proposed: "Altro orario",
  declined: "Al completo",
  cancelledByVenue: "Annullamento",
  cancelledByCustomer: "Annullamento",
};

// Da dove arriva la richiesta, detto come una frase: «da Google», «dal menù», «dall'evento «…»».
export function sourceText(source: string | null, promoTitle: string | null): string {
  if (source === "telefono") return "al telefono";
  if (source === "whatsapp") return "su WhatsApp";
  if (source === "persona") return "di persona";
  if (source === "librone") return "dal librone";
  if (source === "evento" || promoTitle) return promoTitle ? `dall'evento «${promoTitle}»` : "da un evento";
  if (source === "google") return "da Google";
  if (source === "instagram") return "da Instagram";
  if (source === "facebook") return "da Facebook";
  if (source === "menu") return "dal menù";
  return "dal link diretto";
}

// Una riga della cronologia in italiano: titolo e, se c'è, un dettaglio sotto.
export function logText(l: BookingItem["log"][number]): { text: string; detail: string | null; tone: "normal" | "ok" | "warn" } {
  const who = l.actor;
  const msg = l.message;
  switch (l.kind) {
    case "CREATED":
      // Segnata a mano in agenda: «Segnata da Marta (telefono)».
      if (who !== "cliente") return { text: `Segnata da ${who} (${(msg ?? "a mano").replace(" · di prova", "")})`, detail: msg?.includes("di prova") ? "Di prova: le prenotazioni online sono spente" : null, tone: "ok" };
      return { text: msg === "Richiesta di prova" ? "Richiesta di prova arrivata (non avvisa nessuno)" : "Richiesta arrivata dal sito", detail: null, tone: "normal" };
    case "CONFIRMED":
      return { text: `Confermata da ${who}`, detail: msg ? `«${msg}»` : null, tone: "ok" };
    case "PROPOSED":
      return { text: `${who} ha proposto un altro orario`, detail: msg, tone: "normal" };
    case "DECLINED":
      return { text: `${who} ha risposto: siamo al completo`, detail: msg ? `«${msg}»` : null, tone: "normal" };
    case "CANCELLED":
      if (who === "cliente") return { text: "Annullata dal cliente", detail: null, tone: "warn" };
      if (msg === CUSTOMER_TOLD_US) return { text: `Annullata da ${who}: ci ha avvisato il cliente`, detail: null, tone: "warn" };
      return { text: `Annullata da ${who}`, detail: msg ? `«${msg}»` : null, tone: "warn" };
    case "ACCEPTED": {
      if (who === "cliente") return { text: "Il cliente ha accettato il nuovo orario", detail: msg, tone: "ok" };
      const t = msg?.match(/\d{2}:\d{2}/)?.[0];
      return { text: `Confermata da ${who} per il cliente${t ? ` (alle ${t})` : ""}`, detail: null, tone: "ok" };
    }
    case "REFUSED": {
      if (who === "cliente") return { text: "Il cliente non può al nuovo orario", detail: msg, tone: "warn" };
      const t = msg?.match(/\d{2}:\d{2}/)?.[0];
      return { text: `Il cliente ha detto no${t ? ` alle ${t}` : ""} (segnato da ${who})`, detail: null, tone: "warn" };
    }
    case "ARRIVED":
      return { text: `${who} li ha segnati come arrivati`, detail: null, tone: "ok" };
    case "NOSHOW":
      return { text: `${who} li ha segnati come non venuti`, detail: null, tone: "warn" };
    case "ARRIVAL_CLEARED":
      return { text: `${who} ha tolto il segno arrivati/non venuti`, detail: null, tone: "normal" };
    case "REOPENED":
      return { text: `Riaperta da ${who}`, detail: null, tone: "normal" };
    case "MAIL_OK":
      return { text: msg ?? "Email inviata", detail: null, tone: "ok" };
    case "MAIL_FAIL":
      // Il motivo tecnico resta nel database: qui basta sapere che non è partita.
      return { text: (msg ?? "Email non partita").split(":")[0], detail: null, tone: "warn" };
    case "PUSH_OK":
      return { text: (msg ?? "Avviso inviato").replace(/^Notifica a/, "Avviso a"), detail: null, tone: "normal" };
    case "PUSH_FAIL":
      return { text: (msg ?? "Avviso non partito").replace("notifiche non partite", "avvisi non partiti"), detail: null, tone: "warn" };
    case "WHATSAPP_OPENED":
      return { text: `${who} ha aperto WhatsApp per mandare la risposta`, detail: null, tone: "normal" };
    case "UPDATED":
      return { text: `Modificata da ${who}`, detail: msg, tone: "normal" };
    case "WA_QUEUED":
      return { text: `${who} l'ha messa tra i messaggi da mandare su WhatsApp`, detail: null, tone: "normal" };
    case "WHATSAPP_DONE":
      return { text: `${who} ha segnato la risposta su WhatsApp come già mandata`, detail: null, tone: "normal" };
    default:
      return { text: msg ?? l.kind, detail: null, tone: "normal" };
  }
}
