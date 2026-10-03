import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getMenuEditor } from "@/lib/guard";

// «Guida» nella gestione del menù: il PDF per chi gestisce il menù (non è pubblico).
// Il file si rigenera con scripts/guida (vedi scripts/guida/LEGGIMI.md) a ogni
// miglioramento della gestione; next.config.ts lo include nel pacchetto online.
export async function GET(request: Request) {
  const editor = await getMenuEditor();
  if (!editor) return NextResponse.redirect(new URL("/login", request.url));
  const file = await readFile(path.join(process.cwd(), "docs/guida/Guida-gestione-menu.pdf"));
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Guida gestione menu - Angolo del Vino.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
