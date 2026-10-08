import path from "node:path";
import { NextResponse } from "next/server";
import { getMenuEditor } from "@/lib/guard";
import { serveFile } from "@/lib/serve-file";

// «Guida (video)» nella gestione del menù: la guida animata (MP4 verticale) per chi gestisce
// il menù (non è pubblica). Si rigenera con scripts/guida/genera-video.sh a ogni miglioramento
// della gestione; next.config.ts lo include nel pacchetto online. Il telefono (iPhone in
// particolare) chiede il video a pezzi: serve il supporto a «Range», altrimenti non parte.
export async function GET(request: Request) {
  const editor = await getMenuEditor();
  if (!editor) return NextResponse.redirect(new URL("/login", request.url));
  return serveFile(request, path.join(process.cwd(), "docs/guida/Guida-gestione-menu.mp4"), {
    contentType: "video/mp4",
    filename: "Guida gestione menu - Angolo del Vino.mp4",
  });
}
