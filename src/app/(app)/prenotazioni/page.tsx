import Link from "next/link";
import { headers } from "next/headers";
import { getBookingManager } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { loadVenue } from "@/lib/menu";
import { mailConfigured } from "@/lib/mail";
import { bookingStats, listBookings, loadBookingSettings, siteOrigin, statusPath } from "@/lib/booking/service";
import { pushPublicKey } from "@/lib/booking/push";
import { BookingsView } from "./bookings-view";
import type { BookingItem } from "./types";

export const metadata = { title: "Prenotazioni" };

// Richieste di tavolo dal sito. Il Proxy lascia arrivare qui ogni login (non conosce i permessi):
// decide la pagina, con il permesso letto dal database a ogni apertura.
export default async function PrenotazioniPage() {
  const manager = await getBookingManager();
  if (!manager) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface px-5 py-6 text-center">
        <p className="text-3xl" aria-hidden>
          🔒
        </p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">Prenotazioni</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Non hai il permesso di gestire le prenotazioni. Se ti serve, chiedilo al titolare: lo può dare da «Dipendenti».
        </p>
        <Link
          href="/mie-ore"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          Torna alle mie ore
        </Link>
      </div>
    );
  }

  const now = new Date();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = siteOrigin(host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : null);
  const [settings, list, stats, venue, subs] = await Promise.all([
    loadBookingSettings(),
    listBookings(now),
    bookingStats(now),
    loadVenue(),
    prisma.pushSubscription.findMany({
      where: manager.employeeId ? { employeeId: manager.employeeId } : { username: manager.username },
      select: { endpoint: true },
    }),
  ]);

  const rows: BookingItem[] = list.rows.map((b) => ({
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
    createdAt: b.createdAt.getTime(),
    statusUrl: `${origin}${statusPath(b.id)}`,
    log: b.log.map((l) => ({ at: l.at.getTime(), actor: l.actor, kind: l.kind, message: l.message })),
  }));

  return (
    <BookingsView
      now={now.getTime()}
      today={list.today}
      rows={rows}
      fullDays={list.fullDays.map((d) => d.day)}
      settings={settings}
      hours={venue.hours}
      stats={stats}
      isOwner={manager.role === "ADMIN"}
      mailReady={mailConfigured()}
      push={{ publicKey: pushPublicKey(), myEndpoints: subs.map((s) => s.endpoint) }}
      googleLink={`${origin}/prenota?da=google`}
    />
  );
}
