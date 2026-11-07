import { Ornament } from "./ornament";
import { mapsHref, telHref, whatsappHref, type Contacts, type Hours } from "@/lib/menu-venue";
import { businessDayKey } from "@/lib/menu-format";
import { VenueHours } from "./venue-hours";

// Orari e contatti a piè di pagina: ogni pulsante compare solo se il dato c'è.
// Si aprono nella stessa scheda: con «indietro» il cliente torna sempre al menù (in una
// scheda nuova, ad esempio dopo la recensione su Google, «indietro» non porta da nessuna parte).
export function VenueInfo({ hours, contacts }: { hours: Hours; contacts: Contacts }) {
  const tel = contacts.phone ? telHref(contacts.phone) : null;
  const wa = contacts.phone ? whatsappHref(contacts.phone, contacts.whatsappMessage) : null;
  const maps = mapsHref(contacts.address);
  const buttons = [
    tel && { href: tel, label: "Chiama" },
    wa && { href: wa, label: "WhatsApp" },
    maps && { href: maps, label: "Come arrivare" },
    contacts.review && { href: contacts.review, label: "Lascia una recensione" },
    contacts.instagram && { href: contacts.instagram, label: "Instagram" },
  ].filter((b): b is { href: string; label: string } => Boolean(b));
  const hasHours = hours.weekly.some((r) => r.length > 0) || hours.exceptions.length > 0;
  if (buttons.length === 0 && !hasHours) return null;

  return (
    <section aria-label="Orari e contatti" className="flex w-full max-w-[420px] flex-col items-center gap-6">
      {hasHours && <VenueHours hours={hours} dayKey={businessDayKey()} />}
      {buttons.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2.5">
          {buttons.map((b) => (
            <a
              key={b.label}
              href={b.href}
              data-stat-k="contact"
              data-stat-l={b.label}
              className="menu-sans flex min-h-11 items-center rounded-full border border-[#C9A96E]/60 px-4 text-[11px] font-medium uppercase tracking-[0.16em] !text-[#F4EEE3] no-underline"
            >
              {b.label}
            </a>
          ))}
        </div>
      )}
      {contacts.address && <div className="text-center text-[14px] italic text-[#F4EEE3]/90">{contacts.address}</div>}
    </section>
  );
}

// Piè di pagina bordeaux, uguale nel menù, negli allergeni e nelle pagine degli eventi:
// logo, orari e contatti (prima le altre pagine avevano solo l'ornamento e sembravano rotte).
export function MenuFooter({ hours, contacts, children }: { hours: Hours; contacts: Contacts; children?: React.ReactNode }) {
  return (
    <footer className="flex flex-col items-center gap-[18px] bg-[#6B1020] px-5 pb-[60px] pt-14 text-[#F4EEE3]">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtri CSS */}
      <img src="/menu/logo.png" alt="L’Angolo del Vino" className="h-auto w-[200px] [filter:invert(1)_sepia(0.25)]" />
      <Ornament color="#C9A96E" />
      <div className="menu-sans text-[10px] uppercase tracking-[0.4em] text-[#E9DCC4]">Enoteca</div>
      <VenueInfo hours={hours} contacts={contacts} />
      {children}
    </footer>
  );
}
