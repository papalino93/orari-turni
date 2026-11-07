// Testi e link della pagina Prenotazioni (funzioni pure, per i componenti client).

import { addDays, businessDay, dayShort, STATUS_LABEL, viewStatus, type BookingView } from "@/lib/booking/rules";
import { customerMessage, type MessageKind } from "@/lib/booking/messages";
import { whatsappHref } from "@/lib/menu-venue";
import type { BookingItem } from "./types";

export function viewOf(b: BookingItem, now: number): BookingView {
  return viewStatus({ status: b.status, startsAt: new Date(b.startsAt), proposedStartsAt: b.proposedStartsAt ? new Date(b.proposedStartsAt) : null }, new Date(now));
}

export const statusLabel = (v: BookingView) => STATUS_LABEL[v];

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
  return whatsappHref(
    b.phone,
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
  received: "Richiesta ricevuta",
  confirmed: "Conferma",
  proposed: "Proposta di un altro orario",
  declined: "Siamo al completo",
  cancelledByVenue: "Annullamento",
  cancelledByCustomer: "Annullamento",
};

// Una riga della cronologia in italiano: titolo e, se c'è, un dettaglio sotto.
export function logText(l: BookingItem["log"][number]): { text: string; detail: string | null; tone: "normal" | "ok" | "warn" } {
  const who = l.actor;
  const msg = l.message;
  switch (l.kind) {
    case "CREATED":
      return { text: msg === "Richiesta di prova" ? "Richiesta di prova arrivata (non avvisa nessuno)" : "Richiesta arrivata dal sito", detail: null, tone: "normal" };
    case "CONFIRMED":
      return { text: `Confermata da ${who}`, detail: msg ? `«${msg}»` : null, tone: "ok" };
    case "PROPOSED":
      return { text: `${who} ha proposto un altro orario`, detail: msg, tone: "normal" };
    case "DECLINED":
      return { text: `${who} ha risposto: siamo al completo`, detail: msg ? `«${msg}»` : null, tone: "normal" };
    case "CANCELLED":
      return who === "cliente" ? { text: "Annullata dal cliente", detail: null, tone: "warn" } : { text: `Annullata da ${who}`, detail: msg ? `«${msg}»` : null, tone: "warn" };
    case "ACCEPTED":
      return { text: "Il cliente ha accettato il nuovo orario", detail: msg, tone: "ok" };
    case "REFUSED":
      return { text: "Il cliente non può al nuovo orario", detail: msg, tone: "warn" };
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
      return { text: msg ?? "Notifica inviata", detail: null, tone: "normal" };
    case "PUSH_FAIL":
      return { text: msg ?? "Notifica non partita", detail: null, tone: "warn" };
    case "WHATSAPP_OPENED":
      return { text: `${who} ha aperto WhatsApp per mandare la risposta`, detail: null, tone: "normal" };
    case "WHATSAPP_DONE":
      return { text: `${who} ha segnato la risposta su WhatsApp come già mandata`, detail: null, tone: "normal" };
    default:
      return { text: msg ?? l.kind, detail: null, tone: "normal" };
  }
}
