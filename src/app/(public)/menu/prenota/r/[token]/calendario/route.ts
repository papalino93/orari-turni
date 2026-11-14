import { loadVenue } from "@/lib/menu";
import { promoIcs } from "@/lib/menu-ics";
import { addDays, fmtMin, peopleText } from "@/lib/booking/rules";
import { findByToken } from "@/lib/booking/service";

// «Aggiungi al calendario» di una prenotazione confermata: file .ics che il telefono apre nel suo calendario.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await findByToken(token);
  // Con l'ora ancora da definire non c'è un appuntamento da mettere in calendario.
  if (!b || b.status !== "CONFIRMED" || b.timeUnknown) return new Response("Non trovato", { status: 404, headers: { "Cache-Control": "no-store" } });
  const venue = await loadVenue();
  // Le ore prima delle 5 sono dopo mezzanotte: nel calendario vanno il giorno dopo.
  const date = Number(b.time.slice(0, 2)) < 5 ? addDays(b.day, 1) : b.day;
  const url = new URL(`/menu/prenota/r/${token}`, request.url).toString();
  const body = promoIcs(
    {
      slug: `prenotazione-${b.code.toLowerCase()}`,
      title: b.peopleUnknown ? "Tavolo" : `Tavolo per ${b.people}`,
      body: `Prenotazione confermata${b.peopleUnknown ? "" : `: ${peopleText(b.people)}`}, a nome ${b.name}.`,
      startDate: date,
      endDate: date,
      startTime: b.time,
      // Due ore di tavolo (senza, il calendario lo terrebbe occupato fino a mezzanotte).
      endTime: fmtMin(Number(b.time.slice(0, 2)) * 60 + Number(b.time.slice(3, 5)) + 120),
    },
    { address: venue.contacts.address, url },
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="prenotazione-${b.code.toLowerCase()}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
