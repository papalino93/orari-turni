import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getMenuEditor } from "@/lib/guard";

// «Guida (video)» nella gestione del menù: la guida animata (MP4 verticale) per chi gestisce
// il menù (non è pubblica). Si rigenera con scripts/guida/genera-video.sh a ogni miglioramento
// della gestione; next.config.ts lo include nel pacchetto online. Il telefono (iPhone in
// particolare) chiede il video a pezzi: serve il supporto a «Range», altrimenti non parte.
export async function GET(request: Request) {
  const editor = await getMenuEditor();
  if (!editor) return NextResponse.redirect(new URL("/login", request.url));
  const file = path.join(process.cwd(), "docs/guida/Guida-gestione-menu.mp4");
  const { size } = await stat(file);

  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
    } else {
      start = Math.max(0, size - Number(range[2]));
    }
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    status = 206;
  }

  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      "Content-Disposition": 'inline; filename="Guida gestione menu - Angolo del Vino.mp4"',
      "Cache-Control": "private, no-store",
    },
  });
}
