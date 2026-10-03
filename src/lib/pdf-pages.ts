// Trasforma un PDF in immagini JPEG delle sue pagine, nel browser (pdf.js): sul
// server arrivano solo pagine leggere, come per le locandine. Solo browser.

export type PageImage = { blob: Blob; width: number; height: number };

const MAX_BYTES = 850 * 1024;
const TARGET_WIDTH = 1400;

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("Una pagina è troppo pesante anche ridotta.");
}

export async function pdfPageCount(file: File): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return doc.numPages;
}

export async function pdfToJpegs(file: File, maxPages: number, onPage?: (n: number, total: number) => void): Promise<PageImage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (doc.numPages > maxPages) throw new Error(`Il PDF ha ${doc.numPages} pagine: al massimo ${maxPages}.`);
  const out: PageImage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onPage?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, TARGET_WIDTH / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Impossibile leggere il PDF.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({ blob: await canvasToJpeg(canvas), width: canvas.width, height: canvas.height });
  }
  return out;
}
