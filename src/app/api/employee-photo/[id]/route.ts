import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Le foto dei dipendenti non sono pubbliche: stessa autenticazione richiesta
// per il resto dell'app, verificata qui perché il middleware da solo non
// basta (vedi lib/guard.ts).
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new NextResponse("Non autorizzato", { status: 401 });

  const { id } = await context.params;
  // Titolare/consulente vedono la foto di chiunque; un dipendente solo la
  // propria. Stesso motivo di role !== "EMPLOYEE" in guard.ts: un token
  // firmato prima dell'Area Dipendenti non ha ancora questo campo ed è per
  // forza titolare/consulente.
  if (session.user.role === "EMPLOYEE" && session.user.employeeId !== id) {
    return new NextResponse("Non autorizzato", { status: 403 });
  }

  const photo = await prisma.employeePhoto.findUnique({ where: { employeeId: id } });
  if (!photo) return new NextResponse("Non trovata", { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      // L'URL include già ?v=<timestamp>: sicuro cacheare a lungo, una foto
      // sostituita cambia versione e quindi URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
