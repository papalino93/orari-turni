// Risposte da mandare su WhatsApp (funzione pura, anche nei componenti client).
//
// Le risposte su WhatsApp partono solo dal telefono del locale o dal titolare: chi risponde da un
// altro telefono conferma/propone/rifiuta, e il messaggio resta «da mandare» finché qualcuno lo
// apre in WhatsApp (WHATSAPP_OPENED) o lo segna come già mandato (WHATSAPP_DONE).

import type { MessageKind } from "@/lib/booking/messages";
import { isIncomplete, whatsappReachable } from "@/lib/booking/rules";

type LogLike = { at: Date | number | string; actor: string; kind: string; message: string | null };
type BookingLike = {
  status: string;
  contact: string;
  phone: string | null;
  cancelledBy: string | null;
  startsAt: Date | number | string;
  proposedStartsAt?: Date | number | string | null;
  // Ora o persone ancora da definire: la conferma non si manda (avrebbe un orario inventato).
  timeUnknown?: boolean | null;
  peopleUnknown?: boolean | null;
  log: LogLike[];
};

const RESPONSES: Record<string, MessageKind> = {
  CONFIRMED: "confirmed",
  // «Il cliente ha detto sì» segnato da chi lavora: gli si manda la conferma con il link della sua pagina.
  ACCEPTED: "confirmed",
  PROPOSED: "proposed",
  DECLINED: "declined",
  CANCELLED: "cancelledByVenue",
  // Agenda: «Da mandare dal telefono del locale» dopo aver segnato o modificato una prenotazione.
  WA_QUEUED: "confirmed",
};

const ms = (v: Date | number | string) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());

// Il messaggio da mandare per l'ultima risposta del locale, oppure null se non serve (già aperto in
// WhatsApp o segnato, email partita a chi l'aveva scelta, risposta superata, orario già passato).
export function whatsappPending(b: BookingLike, now: number): MessageKind | null {
  // Fisso o senza telefono: su WhatsApp non arriva niente, non c'è nulla da mandare (si chiama il cliente).
  if (!whatsappReachable(b.phone)) return null;
  const log = [...b.log].sort((x, y) => ms(x.at) - ms(y.at));
  let last: { at: number; kind: MessageKind; logKind: string } | null = null;
  for (const l of log) {
    const kind = RESPONSES[l.kind];
    if (kind && l.actor !== "cliente" && l.actor !== "sistema") last = { at: ms(l.at), kind, logKind: l.kind };
  }
  if (!last) return null;
  if (last.kind === "confirmed" && isIncomplete(b)) return null;
  // La risposta deve essere ancora quella valida: se poi il cliente ha accettato/annullato, il messaggio non serve più.
  const stillValid =
    ((last.logKind === "CONFIRMED" || last.logKind === "ACCEPTED" || last.logKind === "WA_QUEUED") && b.status === "CONFIRMED") ||
    (last.logKind === "PROPOSED" && b.status === "PROPOSED") ||
    (last.logKind === "DECLINED" && b.status === "DECLINED" && b.cancelledBy !== "cliente") ||
    (last.logKind === "CANCELLED" && b.status === "CANCELLED" && b.cancelledBy === "locale");
  if (!stillValid) return null;
  const after = log.filter((l) => ms(l.at) >= last.at);
  // Mandata: «Mandato» (WHATSAPP_DONE). Un «WhatsApp aperto» di prima del lucchetto (senza messaggio)
  // vale ancora come mandato; adesso aprire vuol dire solo «in invio» finché non si tocca «Mandato».
  if (after.some((l) => l.kind === "WHATSAPP_DONE" || (l.kind === "WHATSAPP_OPENED" && !l.message))) return null;
  if (b.contact === "email" && after.some((l) => l.kind === "MAIL_OK" && (l.message ?? "").startsWith("Email al cliente"))) return null;
  // Orario già passato: un messaggio adesso non serve più a nessuno.
  const when = b.status === "PROPOSED" && b.proposedStartsAt ? ms(b.proposedStartsAt) : ms(b.startsAt);
  if (when < now) return null;
  return last.kind;
}

// L'ultimo «Mandato» per la risposta di adesso (o, senza risposte, dalla creazione): chi e quando.
export function lastSent(b: Pick<BookingLike, "log">): { by: string; at: number } | null {
  const log = [...b.log].sort((x, y) => ms(x.at) - ms(y.at));
  let from = 0;
  for (const l of log) if (RESPONSES[l.kind] && l.actor !== "cliente" && l.actor !== "sistema") from = ms(l.at);
  const sent = log.filter((l) => ms(l.at) >= from && (l.kind === "WHATSAPP_DONE" || (l.kind === "WHATSAPP_OPENED" && !l.message)));
  const x = sent[sent.length - 1];
  return x ? { by: x.actor, at: ms(x.at) } : null;
}

// Il lucchetto «In invio da …» vale 5 minuti senza «Mandato».
export const CLAIM_MINUTES = 5;
export function activeClaim(b: { waClaimBy?: string | null; waClaimAt?: Date | number | string | null }, now: number): { by: string; at: number } | null {
  if (!b.waClaimBy || !b.waClaimAt) return null;
  const at = ms(b.waClaimAt);
  return now - at < CLAIM_MINUTES * 60000 ? { by: b.waClaimBy, at } : null;
}
