// Solo server (usa il servizio delle prenotazioni).
import { statusPath } from "@/lib/booking/service";
import type { prisma } from "@/lib/prisma";
import type { BookingItem } from "./types";

type FullRow = Awaited<ReturnType<typeof prisma.bookingRequest.findFirstOrThrow>> & {
  promo: { title: string } | null;
  log: { at: Date; actor: string; kind: string; message: string | null }[];
};

// Una prenotazione del database come la vede la pagina (date in millisecondi).
export function toBookingItem(b: FullRow, origin: string): BookingItem {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    day: b.day,
    time: b.time,
    startsAt: b.startsAt.getTime(),
    people: b.people,
    name: b.name,
    phone: b.phone,
    email: b.email,
    contact: b.contact,
    note: b.note,
    allergies: b.allergies,
    source: b.source,
    promoTitle: b.promo?.title ?? null,
    proposedTime: b.proposedTime,
    proposedStartsAt: b.proposedStartsAt?.getTime() ?? null,
    staffMessage: b.staffMessage,
    handledAt: b.handledAt?.getTime() ?? null,
    handledBy: b.handledBy,
    cancelledBy: b.cancelledBy,
    arrivedAt: b.arrivedAt?.getTime() ?? null,
    noShowAt: b.noShowAt?.getTime() ?? null,
    isTest: b.isTest,
    table: b.table,
    createdBy: b.createdBy,
    manual: b.manual,
    timeUnknown: b.timeUnknown,
    peopleUnknown: b.peopleUnknown,
    menu: b.menu,
    createdAt: b.createdAt.getTime(),
    updatedAt: b.updatedAt.getTime(),
    statusUrl: `${origin}${statusPath(b.id)}`,
    log: b.log.map((l) => ({ at: l.at.getTime(), actor: l.actor, kind: l.kind, message: l.message })),
  };
}
