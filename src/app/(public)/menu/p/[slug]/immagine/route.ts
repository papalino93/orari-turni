import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Locandina di una pagina promozionale. Pubblica (come /menu), ma solo se la
// pagina non è eliminata né nascosta. L'indirizzo porta ?v=<versione>, quindi la
// cache può essere lunghissima: una nuova foto cambia indirizzo.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const promo = await prisma.menuPromo.findUnique({
    where: { slug },
    select: { deletedAt: true, hidden: true, image: { select: { data: true, mimeType: true } } },
  });
  if (!promo || promo.deletedAt || !promo.image) return new Response("Non trovata", { status: 404 });
  // Nascosta: i clienti non la vedono, chi ha fatto l'accesso sì (la gestione mostra la locandina
  // anche degli eventi nascosti o in archivio). Mai in una cache condivisa.
  if (promo.hidden) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new Response("Non trovata", { status: 404 });
  }
  return new Response(new Uint8Array(promo.image.data), {
    headers: {
      "Content-Type": promo.image.mimeType,
      "Cache-Control": promo.hidden ? "private, no-store" : "public, max-age=31536000, immutable",
    },
  });
}
