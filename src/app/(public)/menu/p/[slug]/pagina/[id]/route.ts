import { prisma } from "@/lib/prisma";

// Una pagina del menù speciale caricato (PDF trasformato in immagine, o foto).
// Pubblica come la locandina, solo se l'evento non è eliminato né nascosto.
// L'id cambia a ogni caricamento, quindi la cache può essere lunghissima.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const page = await prisma.menuPromoPage.findUnique({
    where: { id },
    select: { data: true, promo: { select: { slug: true, deletedAt: true, hidden: true } } },
  });
  if (!page || page.promo.slug !== slug || page.promo.deletedAt || page.promo.hidden) {
    return new Response("Non trovata", { status: 404 });
  }
  return new Response(new Uint8Array(page.data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
