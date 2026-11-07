// Risposte da mandare su WhatsApp (funzione pura, anche nei componenti client).
//
// Le risposte su WhatsApp partono solo dal telefono del locale o dal titolare: chi risponde da un
// altro telefono conferma/propone/rifiuta, e il messaggio resta «da mandare» finché qualcuno lo
// apre in WhatsApp (WHATSAPP_OPENED) o lo segna come già mandato (WHATSAPP_DONE).

import type { MessageKind } from "@/lib/booking/messages";

type LogLike = { at: Date | number | string; actor: string; kind: string; message: string | null };
type BookingLike = {
  status: string;
  contact: string;
  cancelledBy: string | null;
  startsAt: Date | number | string;
  proposedStartsAt?: Date | number | string | null;
  log: LogLike[];
};

const RESPONSES: Record<string, MessageKind> = {
  CONFIRMED: "confirmed",
  PROPOSED: "proposed",
  DECLINED: "declined",
  CANCELLED: "cancelledByVenue",
};

const ms = (v: Date | number | string) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());

// Il messaggio da mandare per l'ultima risposta del locale, oppure null se non serve (già aperto in
// WhatsApp o segnato, email partita a chi l'aveva scelta, risposta superata, orario già passato).
export function whatsappPending(b: BookingLike, now: number): MessageKind | null {
  const log = [...b.log].sort((x, y) => ms(x.at) - ms(y.at));
  let last: { at: number; kind: MessageKind; logKind: string } | null = null;
  for (const l of log) {
    const kind = RESPONSES[l.kind];
    if (kind && l.actor !== "cliente" && l.actor !== "sistema") last = { at: ms(l.at), kind, logKind: l.kind };
  }
  if (!last) return null;
  // La risposta deve essere ancora quella valida: se poi il cliente ha accettato/annullato, il messaggio non serve più.
  const stillValid =
    (last.logKind === "CONFIRMED" && b.status === "CONFIRMED") ||
    (last.logKind === "PROPOSED" && b.status === "PROPOSED") ||
    (last.logKind === "DECLINED" && b.status === "DECLINED" && b.cancelledBy !== "cliente") ||
    (last.logKind === "CANCELLED" && b.status === "CANCELLED" && b.cancelledBy === "locale");
  if (!stillValid) return null;
  const after = log.filter((l) => ms(l.at) >= last.at);
  if (after.some((l) => l.kind === "WHATSAPP_OPENED" || l.kind === "WHATSAPP_DONE")) return null;
  if (b.contact === "email" && after.some((l) => l.kind === "MAIL_OK" && (l.message ?? "").startsWith("Email al cliente"))) return null;
  // Orario già passato: un messaggio adesso non serve più a nessuno.
  const when = b.status === "PROPOSED" && b.proposedStartsAt ? ms(b.proposedStartsAt) : ms(b.startsAt);
  if (when < now) return null;
  return last.kind;
}
