import { mapsHref, telHref, weeklyRows, whatsappHref, type Contacts, type Hours } from "@/lib/menu-venue";

// Orari e contatti a piè di pagina: ogni pulsante compare solo se il dato c'è.
export function VenueInfo({ hours, contacts }: { hours: Hours; contacts: Contacts }) {
  const tel = contacts.phone ? telHref(contacts.phone) : null;
  const wa = contacts.phone ? whatsappHref(contacts.phone, contacts.whatsappMessage) : null;
  const maps = mapsHref(contacts.address);
  const buttons = [
    tel && { href: tel, label: "Chiama", external: false },
    wa && { href: wa, label: "WhatsApp", external: true },
    maps && { href: maps, label: "Come arrivare", external: true },
    contacts.review && { href: contacts.review, label: "Lascia una recensione", external: true },
    contacts.instagram && { href: contacts.instagram, label: "Instagram", external: true },
  ].filter((b): b is { href: string; label: string; external: boolean } => Boolean(b));
  const rows = weeklyRows(hours);
  const hasHours = rows.some((r) => r.text !== "Chiuso");
  if (buttons.length === 0 && !hasHours) return null;

  return (
    <section aria-label="Orari e contatti" className="flex w-full max-w-[420px] flex-col items-center gap-6">
      {hasHours && (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="menu-sans text-[10px] uppercase tracking-[0.34em] text-[#E9DCC4]">Orari</div>
          <dl className="m-0 grid w-full grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[15px]">
            {rows.map((row) => (
              <div key={row.days} className="contents">
                <dt className="menu-sans self-baseline text-[12px] uppercase tracking-[0.14em] text-[#E9DCC4]/80">{row.days}</dt>
                <dd className="m-0 self-baseline text-right text-[#F4EEE3]">{row.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {buttons.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2.5">
          {buttons.map((b) => (
            <a
              key={b.label}
              href={b.href}
              {...(b.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="menu-sans flex min-h-11 items-center rounded-full border border-[#C9A96E]/60 px-4 text-[11px] font-medium uppercase tracking-[0.16em] !text-[#F4EEE3] no-underline"
            >
              {b.label}
            </a>
          ))}
        </div>
      )}
      {contacts.address && <div className="text-center text-[14px] italic text-[#E9DCC4]/80">{contacts.address}</div>}
    </section>
  );
}
