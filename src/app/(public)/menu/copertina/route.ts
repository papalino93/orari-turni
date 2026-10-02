import { prisma } from "@/lib/prisma";

// Foto di copertina personalizzata del menù. Pubblica (come /menu). L'indirizzo
// porta ?v=<versione>: una nuova foto cambia indirizzo, quindi la cache può
// essere lunghissima.
export async function GET() {
  const image = await prisma.menuHeroImage.findUnique({ where: { id: "hero" }, select: { data: true, mimeType: true } });
  if (!image) return new Response("Non trovata", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { "Content-Type": image.mimeType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
