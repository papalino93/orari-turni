import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadVenue } from "@/lib/menu";
import { mailConfigured } from "@/lib/mail";
import { rangesFor, telHref, whatsappHref } from "@/lib/menu-venue";
import { prisma } from "@/lib/prisma";
import { bookingDays, loadBookingSettings } from "@/lib/booking/service";
import { businessDay, dayLong, dayRelative, normalizeSource, romeInstant } from "@/lib/booking/rules";
import { formatPromoDates } from "@/lib/menu-format";
import { MenuFooter } from "../venue-footer";
import { Ornament } from "../ornament";
import { formStamp, isOwner } from "./server-utils";
import { PrenotaHeader, PreviewBand } from "./ui";
import { LargeText } from "./large-text";
import { BookingForm, type FormDay } from "./booking-form";

// Sempre fresca: giorni, orari e chiusure cambiano, e la funzione spenta va nascosta subito.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chiedi un tavolo — L'Angolo del Vino",
  description: "Chiedi un tavolo all'Angolo del Vino: scegli giorno, ora e persone, ti rispondiamo noi.",
  robots: { index: false, follow: false },
};

type Search = { evento?: string | string[]; da?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PrenotaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [settings, owner, venue, sp] = await Promise.all([loadBookingSettings(), isOwner(), loadVenue(), searchParams]);
  // Spenta: per i clienti la pagina non esiste; il titolare la vede in anteprima.
  if (!settings.enabled && !owner) notFound();

  const now = new Date();
  const slug = one(sp.evento).slice(0, 120);
  const [days, event] = await Promise.all([
    bookingDays(settings, now),
    slug
      ? prisma.menuPromo.findFirst({
          where: { slug, kind: "EVENT", hidden: false, deletedAt: null },
          select: { slug: true, title: true, startDate: true, endDate: true, startTime: true },
        })
      : null,
  ]);
  const today = businessDay(now);

  // Fine dell'ultima apertura del giorno: dopo, «Oggi» è «Chiuso» (non più «Chiamaci»).
  const closeAt = (day: string): number | null => {
    const ends = rangesFor(venue.hours, day).map((r) => {
      const [oh, om] = r.open.split(":").map(Number);
      const [ch, cm] = r.close.split(":").map(Number);
      const open = oh * 60 + om;
      const close = ch * 60 + cm;
      return romeInstant(day, close <= open ? close + 1440 : close).getTime();
    });
    return ends.length ? Math.max(...ends) : null;
  };
  const formDays: FormDay[] = days.map((d) => {
    const end = d.availability.state === "open" || d.availability.state === "noSlots" ? closeAt(d.day) : null;
    const over = d.availability.state === "noSlots" && end !== null && end <= now.getTime();
    return {
      day: d.day,
      label: d.label,
      relative: d.day === today ? "Oggi" : dayRelative(d.day, now) === "domani" ? "Domani" : null,
      long: dayRelative(d.day, now),
      full: dayLong(d.day),
      state: over ? "closed" : d.availability.state,
      reason: d.availability.state === "open" ? null : d.availability.reason,
      slots: d.availability.slots.map((s) => ({ time: s.time, at: s.startsAt.getTime() })),
      closeAt: end,
      events: d.events,
    };
  });

  const { contacts } = venue;
  const tel = contacts.phone ? telHref(contacts.phone) : null;
  const wa = contacts.phone ? whatsappHref(contacts.phone, contacts.whatsappMessage) : null;
  const groupWa = contacts.phone
    ? whatsappHref(contacts.phone, `Ciao! Siamo un gruppo di più di ${settings.maxPeople} persone e vorremmo prenotare un tavolo. Siamo in`)
    : null;
  const source = slug && event ? "evento" : normalizeSource(one(sp.da));

  return (
    <>
      {!settings.enabled && (
        <PreviewBand>
          <strong className="font-medium">Anteprima:</strong> le prenotazioni online sono spente, i clienti non vedono questa pagina. Le
          richieste che mandi da qui sono di prova e non avvisano nessuno.
        </PreviewBand>
      )}
      <PrenotaHeader />
      <LargeText />
      <main className="menu-prenota mx-auto max-w-[600px] px-6 pb-[72px] pt-9 [color-scheme:light]">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">{event ? "Evento" : "Prenotazioni"}</div>
          <h1 className="menu-serif m-0 mb-2 text-balance text-[40px] font-medium leading-[1.05] text-[#6B1020]">
            {event ? event.title : "Chiedi un tavolo"}
          </h1>
          {event && (
            <div className="menu-sans -mt-1 mb-1 text-[13px] font-medium uppercase tracking-[0.14em] text-[#4A504B]">
              {formatPromoDates(event.startDate, event.endDate)}
              {event.startTime ? ` · dalle ${event.startTime}` : ""}
            </div>
          )}
          <Ornament color="#9C7A45" />
          <p className="m-0 mt-3 max-w-[440px] text-balance text-[16.5px] italic leading-normal text-[#3F4540]">
            {event ? "Chiedi un tavolo per la serata: scegli" : "Scegli"} persone, giorno e ora. Ti rispondiamo noi per confermare.
          </p>
        </div>

        <BookingForm
          days={formDays}
          maxPeople={settings.maxPeople}
          leadMinutes={settings.leadMinutes}
          serverNow={now.getTime()}
          mailOn={mailConfigured()}
          stamp={formStamp(now.getTime())}
          source={source}
          event={event ? { slug: event.slug, title: event.title, startTime: event.startTime } : null}
          tel={tel}
          wa={wa}
          groupWa={groupWa}
          address={contacts.address}
          phone={contacts.phone}
        />
      </main>
      <MenuFooter hours={venue.hours} contacts={contacts} hideBooking />
    </>
  );
}
