import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { businessDayKey } from "@/lib/menu-format";
import { prisma } from "@/lib/prisma";

// Una pagina del menù speciale caricato (PDF trasformato in immagine, o foto).
// Pubblica come la locandina, solo se l'evento non è eliminato, né nascosto, né ancora da
// pubblicare (prima di «Mostra dal»): in questi due casi la vede solo chi ha fatto l'accesso
// (l'anteprima nella gestione). L'id cambia a ogni caricamento, quindi la cache può essere lunghissima.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const page = await prisma.menuPromoPage.findUnique({
    where: { id },
    select: { data: true, promo: { select: { slug: true, deletedAt: true, hidden: true, showFrom: true } } },
  });
  if (!page || page.promo.slug !== slug || page.promo.deletedAt) {
    return new Response("Non trovata", { status: 404 });
  }
  const restricted = page.promo.hidden || businessDayKey() < page.promo.showFrom;
  if (restricted) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new Response("Non trovata", { status: 404 });
  }
  return new Response(new Uint8Array(page.data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": restricted ? "private, no-store" : "public, max-age=31536000, immutable" },
  });
}
