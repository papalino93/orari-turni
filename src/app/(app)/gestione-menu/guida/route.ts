import path from "node:path";
import { NextResponse } from "next/server";
import { getMenuEditor } from "@/lib/guard";
import { serveFile } from "@/lib/serve-file";

// «Guida» nella gestione del menù: il PDF per chi gestisce il menù (non è pubblico).
// Il file si rigenera con scripts/guida (vedi scripts/guida/LEGGIMI.md) a ogni
// miglioramento della gestione; next.config.ts lo include nel pacchetto online.
// Va servito a pezzi (Range) e in streaming: sul telefono il PDF si apre subito invece di aspettare tutto il file.
export async function GET(request: Request) {
  const editor = await getMenuEditor();
  if (!editor) return NextResponse.redirect(new URL("/login", request.url));
  return serveFile(request, path.join(process.cwd(), "docs/guida/Guida-gestione-menu.pdf"), {
    contentType: "application/pdf",
    filename: "Guida gestione menu - Angolo del Vino.pdf",
  });
}
