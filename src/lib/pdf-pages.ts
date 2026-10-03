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

async function openPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

async function renderPage(doc: PdfDoc, n: number): Promise<PageImage> {
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
  return { blob: await canvasToJpeg(canvas), width: canvas.width, height: canvas.height };
}

export async function pdfPageCount(file: File): Promise<number> {
  return (await openPdf(file)).numPages;
}

export async function pdfToJpegs(file: File, maxPages: number, onPage?: (n: number, total: number) => void): Promise<PageImage[]> {
  const doc = await openPdf(file);
  if (doc.numPages > maxPages) throw new Error(`Il PDF ha ${doc.numPages} pagine: al massimo ${maxPages}.`);
  const out: PageImage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onPage?.(n, doc.numPages);
    out.push(await renderPage(doc, n));
  }
  return out;
}

// Locandina in PDF: si usa la prima pagina. `pages` dice quante ne aveva il file.
export async function pdfFirstPage(file: File): Promise<PageImage & { pages: number }> {
  const doc = await openPdf(file);
  return { ...(await renderPage(doc, 1)), pages: doc.numPages };
}
