import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

// Serve un file del pacchetto (guida PDF, guida video) a pezzi: il telefono (iPhone in particolare)
// chiede i file grandi con «Range», e il PDF o il video partono prima di essere scaricati per intero.
// Il file arriva in streaming, senza caricarlo tutto in memoria, e il browser lo tiene qualche minuto
// (private: mai in una cache condivisa; il file cambia solo con un nuovo rilascio).
export async function serveFile(request: Request, file: string, { contentType, filename }: { contentType: string; filename: string }) {
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
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
