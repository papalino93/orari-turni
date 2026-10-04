import { loadVenue } from "@/lib/menu";
import { promoIcs } from "@/lib/menu-ics";
import { prisma } from "@/lib/prisma";

// «Aggiungi al calendario» di un evento: file .ics che il telefono apre nel suo
// calendario. Come la pagina dell'evento: solo se non è eliminato né nascosto.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const promo = await prisma.menuPromo.findUnique({ where: { slug } });
  if (!promo || promo.deletedAt || promo.hidden || promo.kind !== "EVENT") {
    return new Response("Non trovato", { status: 404 });
  }
  const venue = await loadVenue();
  const url = new URL(`/menu/p/${promo.slug}`, request.url).toString();
  const body = promoIcs(promo, { address: venue.contacts.address, url });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${promo.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
