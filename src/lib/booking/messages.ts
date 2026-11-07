// Testi delle prenotazioni: messaggi al cliente (WhatsApp o email) e avvisi al personale.
// Funzioni pure. Tono del menù: si dà del tu, frasi brevi, firma «L'Angolo del Vino».

import { dayLong, peopleText } from "@/lib/booking/rules";

export const VENUE_NAME = "L'Angolo del Vino";

export type MessageKind = "received" | "confirmed" | "proposed" | "declined" | "cancelledByVenue" | "cancelledByCustomer";

export type MessageInput = {
  name: string;
  day: string;
  time: string;
  people: number;
  proposedTime?: string | null;
  staffMessage?: string | null;
  statusUrl: string;
  allergies?: boolean;
};

const first = (name: string) => name.trim().split(/\s+/)[0] || name.trim();

// Testo semplice, uguale per WhatsApp e per il corpo della mail.
export function customerMessage(kind: MessageKind, m: MessageInput): string {
  const when = `${dayLong(m.day)} alle ${m.time}`;
  const extra = m.staffMessage?.trim() ? `\n\n${m.staffMessage.trim()}` : "";
  const ciao = `Ciao ${first(m.name)},`;
  switch (kind) {
    case "received":
      return `${ciao} abbiamo ricevuto la tua richiesta per ${when}, ${peopleText(m.people)}. Non è ancora confermata: ti rispondiamo noi appena possibile.\n\nQui vedi sempre a che punto è: ${m.statusUrl}\n\n${VENUE_NAME}`;
    case "confirmed":
      return `${ciao} ti aspettiamo ${when}, tavolo per ${m.people}.${m.allergies ? " Abbiamo preso nota delle allergie: ne parliamo al tavolo." : ""}${extra}\n\nSe cambia qualcosa, puoi annullare da qui: ${m.statusUrl}\n\nA presto, ${VENUE_NAME}`;
    case "proposed":
      return `${ciao} ${dayLong(m.day)} alle ${m.time} siamo pieni. Ti va bene alle ${m.proposedTime}?${extra}\n\nTocca qui per dirci sì o no: ${m.statusUrl}\n\n${VENUE_NAME}`;
    case "declined":
      return `${ciao} ci dispiace: ${when} siamo al completo.${extra}\n\nSperiamo di vederti presto! ${VENUE_NAME}`;
    case "cancelledByVenue":
      return `${ciao} purtroppo dobbiamo annullare il tavolo di ${when}.${extra}\n\nCi scusiamo davvero. ${VENUE_NAME}`;
    case "cancelledByCustomer":
      return `${ciao} abbiamo annullato la tua prenotazione di ${when}. Grazie per averci avvisato!\n\n${VENUE_NAME}`;
  }
}

export function customerSubject(kind: MessageKind, m: MessageInput): string {
  const when = `${dayLong(m.day)} alle ${m.time}`;
  switch (kind) {
    case "received":
      return `Richiesta ricevuta: ${when} (non ancora confermata)`;
    case "confirmed":
      return `Prenotazione confermata: ${when}`;
    case "proposed":
      return `Ti va bene alle ${m.proposedTime}?`;
    case "declined":
      return `Siamo al completo ${dayLong(m.day)}`;
    case "cancelledByVenue":
    case "cancelledByCustomer":
      return `Prenotazione annullata: ${when}`;
  }
}

// Avviso al personale (notifica e mail): «Nuova richiesta · Sab 14 nov · 20:30 · 4 persone · Rossi».
export function staffAlert(m: { name: string; day: string; time: string; people: number; allergies: boolean; note?: string | null }): {
  title: string;
  body: string;
} {
  return {
    title: "Nuova richiesta di prenotazione",
    body: `${dayLong(m.day)} alle ${m.time} · ${peopleText(m.people)} · ${m.name}${m.allergies ? " · allergie" : ""}${m.note ? ` · «${m.note.slice(0, 60)}»` : ""}`,
  };
}
