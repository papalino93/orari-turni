import Link from "next/link";
import { headers } from "next/headers";
import { getBookingManager } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { loadVenue } from "@/lib/menu";
import { mailConfigured } from "@/lib/mail";
import { bookingStats, listBookings, loadBookingSettings, siteOrigin } from "@/lib/booking/service";
import { menuSuggestions } from "@/lib/booking/agenda-server";
import { effectiveMode, venueDeviceExists, venueWho, whatsappRole, whoChoices, VENUE_LABEL } from "@/lib/booking/venue";
import { pushPublicKey } from "@/lib/booking/push";
import { BookingsView, type PageLink } from "./bookings-view";
import { toBookingItem } from "./items";
import type { BookingItem } from "./types";

export const metadata = { title: "Prenotazioni" };

// Richieste di tavolo dal sito. Il Proxy lascia arrivare qui ogni login (non conosce i permessi):
// decide la pagina, con il permesso letto dal database a ogni apertura.
type Params = { r?: string | string[]; richieste?: string | string[]; vista?: string | string[]; tab?: string | string[]; apri?: string | string[] };

// Dove portare chi arriva da un link (widget, notifica, segnalibro), anche con i vecchi ?tab=… delle schede:
// «Da gestire» → pannello Richieste, «Stasera» → Giorno di oggi, «Prossimi giorni» → Settimana,
// «Archivio» → Cerca, «Numeri» → Numeri.
function pageLink(p: Params): PageLink | null {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tab = one(p.tab);
  const vista = one(p.vista);
  const apri = one(p.apri);
  if (one(p.richieste) === "1" || tab === "todo" || apri === "richieste") return { panel: "richieste" };
  if (tab === "archive" || apri === "cerca") return { panel: "cerca" };
  if (tab === "numbers" || apri === "numeri") return { panel: "numeri" };
  if (apri === "impostazioni") return { panel: "impostazioni" };
  if (apri === "avvisi") return { panel: "avvisi" };
  if (tab === "tonight" || vista === "oggi") return { view: "day", today: true };
  if (tab === "next" || vista === "settimana") return { view: "week" };
  if (vista === "mese") return { view: "month" };
  if (vista === "giorno") return { view: "day" };
  if (tab === "agenda") return { view: undefined };
  return null;
}

export default async function PrenotazioniPage({ searchParams }: { searchParams: Promise<Params> }) {
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

  // Agenda spenta: la prova la fa solo il titolare (ai dipendenti resta nascosta).
  const settings = await loadBookingSettings();
  if (manager.role !== "ADMIN" && !settings.agendaEnabled) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface px-5 py-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Prenotazioni</h1>
        <p className="mt-2 text-sm text-foreground-muted">L&apos;agenda delle prenotazioni non è ancora accesa: per ora la prova solo il titolare.</p>
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
  const params = await searchParams;
  const { r } = params;
  const link = pageLink(params);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = siteOrigin(host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : null);
  const [list, stats, venue, subs, menus, venueExists, who] = await Promise.all([
    listBookings(now),
    bookingStats(now),
    loadVenue(),
    prisma.pushSubscription.findMany({
      where: manager.employeeId ? { employeeId: manager.employeeId } : { username: manager.username },
      select: { endpoint: true, localPhone: true },
    }),
    menuSuggestions(),
    venueDeviceExists(),
    venueWho(manager),
  ]);
  const waMode = effectiveMode(settings, venueExists);
  // Sul telefono enoteca: chi lo sta usando («Chi sei?»), con prima chi è in turno oggi.
  const venueDevice = manager.venueDevice
    ? { who: who?.name ?? null, choices: await whoChoices(list.today), label: VENUE_LABEL }
    : null;

  const rows: BookingItem[] = list.rows.map((b) => toBookingItem(b, origin));

  return (
    <BookingsView
      now={now.getTime()}
      today={list.today}
      rows={rows}
      fullDays={list.fullDays.map((d) => d.day)}
      settings={settings}
      hours={venue.hours}
      menus={menus}
      wa={{ role: whatsappRole(manager, waMode), mode: waMode, me: who ? `${who.name} (${VENUE_LABEL})` : manager.venueDevice ? null : manager.name, venueDevice: Boolean(manager.venueDevice), venueExists }}
      venueDevice={venueDevice}
      phoneUA={/iPhone|Android.+Mobile|Mobile Safari/i.test(h.get("user-agent") ?? "")}
      stats={stats}
      isOwner={manager.role === "ADMIN"}
      mailReady={mailConfigured()}
      push={{ publicKey: pushPublicKey(), myEndpoints: subs.map((s) => s.endpoint), localPhoneEndpoints: subs.filter((s) => s.localPhone).map((s) => s.endpoint) }}
      preview={process.env.VERCEL_ENV === "preview"}
      googleLink={`${origin}/prenota?da=google`}
      openRequest={typeof r === "string" && /^[a-z0-9_]{10,40}$/i.test(r) ? r : null}
      link={link}
    />
  );
}
