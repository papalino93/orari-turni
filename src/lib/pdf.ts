"use client";

// Primitive di disegno condivise tra l'export PDF dell'orario settimanale
// (/orari) e l'export PDF del singolo dipendente (/dipendenti): stesso
// impaginato A4 orizzontale, bianco, senza aree rosse estese e senza
// evidenziare "oggi" — un vero PDF vettoriale, non uno screenshot.

import { LOGO_DATA_URI } from "@/lib/logo-data-uri";

export const PAGE_W = 297;
export const PAGE_H = 210;
export const MARGIN = 12;
export const CONTENT_W = PAGE_W - MARGIN * 2;

export const WINE = [138, 39, 64] as const;
export const WINE_DARK = [92, 23, 40] as const;
export const GOLD = [147, 112, 31] as const;
export const DANGER = [194, 59, 51] as const;
export const TEXT = [33, 28, 30] as const;
export const MUTED = [107, 100, 104] as const;
export const LINE = [230, 220, 218] as const;
export const ROW_ALT = [251, 241, 239] as const;

// jsPDF's setFillColor/setTextColor/setDrawColor take three loose numbers,
// so spreading a color picked by a ternary (`cond ? WINE : TEXT`) hits a
// TypeScript limitation: the ternary's type becomes a union of two tuples,
// and a union of tuples can't be spread into a fixed-arity call. Routing the
// ternary through this identity function gives TypeScript a single target
// tuple type to check both branches against, so the union never forms.
export function col(c: readonly [number, number, number]): readonly [number, number, number] {
  return c;
}

// jsPDF's built-in fonts (Helvetica & friends, the standard 14 PDF fonts)
// only cover WinAnsi encoding — no emoji. Passing "🔒" to doc.text() doesn't
// just print a missing-glyph box: it silently produces a garbled run of
// unrelated WinAnsi characters, AND throws off getTextWidth() for that
// string (used by truncate() below), which was making "chiuso" cells
// overflow into neighbouring columns instead of getting cut short. A small
// vector padlock — a stroked arc with its bottom half covered by a filled
// body rect — sidesteps the font entirely and looks the same as the web/CSS
// emoji at a glance.
export function drawLockIcon(doc: JsPDF, cx: number, cy: number, size: number, color: readonly [number, number, number]) {
  const bodyW = size * 0.62;
  const bodyH = size * 0.46;
  const bodyY = cy - bodyH / 2;

  const shackleRX = bodyW * 0.34;
  const shackleRY = size * 0.28;

  doc.setDrawColor(...color);
  doc.setLineWidth(size * 0.11);
  doc.ellipse(cx, bodyY, shackleRX, shackleRY, "S");

  doc.setFillColor(...color);
  doc.roundedRect(cx - bodyW / 2, bodyY, bodyW, bodyH, size * 0.06, size * 0.06, "F");
}

type JsPDF = import("jspdf").jsPDF;

// La foto profilo va disegnata circolare, come ovunque nell'app (avatar
// tondi via CSS `rounded-full`) — un'immagine quadrata accanto a iniziali
// tonde stonerebbe. jsPDF non ha un parametro "circular" su addImage: si
// definisce un cerchio come path senza riempimento/tratto, lo si imposta
// come area di ritaglio, si disegna l'immagine dentro, poi si ripristina lo
// stato grafico per non ritagliare anche quel che segue.
export function drawCircularImage(doc: JsPDF, dataUrl: string, x: number, y: number, size: number, format: "JPEG" | "PNG" = "JPEG") {
  doc.saveGraphicsState();
  doc.circle(x + size / 2, y + size / 2, size / 2, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(dataUrl, format, x, y, size, size);
  doc.restoreGraphicsState();
}

// Un rettangolo pieno con solo gli angoli superiori arrotondati — l'header
// di una tabella "a card" (come sul web) invece di un blocco squadrato.
// Trucco: si disegna il roundedRect completo, poi si sovrappone un
// rettangolo pieno che copre esattamente la metà inferiore, squadrando
// quella e lasciando arrotondata solo la parte alta.
export function drawTopRoundedRect(
  doc: JsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: readonly [number, number, number],
) {
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, h, r, r, "F");
  doc.rect(x, y + h / 2, w, h / 2, "F");
}

export async function newLandscapeDoc(): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
}

// Il file sorgente (public/logo.png) è largo e basso — 733×210px, rapporto
// ~3.49:1 — perché è una scritta corsiva, non un'icona quadrata. addImage()
// non mantiene le proporzioni da solo: passargli un riquadro quadrato o
// quasi-quadrato lo schiaccia e lo stira, ed è esattamente quello che
// rendeva il logo "brutto" nei PDF. Questa funzione calcola l'altezza
// corretta a partire dalla larghezza voluta, per restare fedele all'originale.
export const LOGO_ASPECT = 733 / 210;

export function drawLogo(doc: JsPDF, x: number, y: number, targetW: number): number {
  const h = targetW / LOGO_ASPECT;
  try {
    doc.addImage(LOGO_DATA_URI, "PNG", x, y, targetW, h);
  } catch {
    // se il logo non è caricabile il PDF resta comunque leggibile
  }
  return h;
}

export function drawHeader(doc: JsPDF, title: string, subtitle: string): number {
  // Niente più la scritta "L'ANGOLO DEL VINO" per esteso accanto al logo:
  // il logo è già quella scritta, in corsivo — ripeterla in stampatello
  // era ridondante. Lo spazio liberato va a un logo più grande e a
  // titolo/sottotitolo del documento, allineati verticalmente al centro.
  const logoW = 42;
  const logoH = drawLogo(doc, MARGIN, MARGIN, logoW);
  const textX = MARGIN + logoW + 8;

  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, textX, MARGIN + logoH / 2 - 0.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, textX, MARGIN + logoH / 2 + 6);

  doc.setDrawColor(...WINE);
  doc.setLineWidth(0.6);
  const dividerY = MARGIN + logoH + 6;
  doc.line(MARGIN, dividerY, PAGE_W - MARGIN, dividerY);

  return dividerY + 6;
}

export function drawSectionTitle(doc: JsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...WINE_DARK);
  doc.text(text.toUpperCase(), MARGIN, y);
  return y + 6;
}

export function drawFooter(doc: JsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const generated = `Generato il ${new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
    doc.text(generated, PAGE_W - MARGIN, PAGE_H - 6, { align: "right" });
    if (pageCount > 1) doc.text(`${i}/${pageCount}`, MARGIN, PAGE_H - 6);
  }
}

export function ensureSpace(doc: JsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 14) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

export function truncate(doc: JsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(s + "…") > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function drawGenericTable(
  doc: JsPDF,
  opts: { startY: number; colWidths: number[]; header: string[]; rows: string[][]; highlightLastCol?: boolean },
): number {
  let y = opts.startY;
  const headerH = 9;
  const rowH = 8;
  y = ensureSpace(doc, y, headerH + rowH);

  doc.setFillColor(...WINE);
  doc.rect(MARGIN, y, CONTENT_W, headerH, "F");
  doc.setTextColor(253, 242, 244);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  let x = MARGIN;
  opts.header.forEach((h, i) => {
    doc.text(h, i === 0 ? x + 3 : x + opts.colWidths[i] / 2, y + headerH / 2 + 1.2, {
      align: i === 0 ? "left" : "center",
      baseline: "middle",
    });
    x += opts.colWidths[i];
  });
  y += headerH;
  const tableTop = opts.startY;
  const pagesBeforeRows = doc.getNumberOfPages();

  opts.rows.forEach((row, ri) => {
    y = ensureSpace(doc, y, rowH);
    if (ri % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    }
    x = MARGIN;
    row.forEach((cell, ci) => {
      const isLast = ci === row.length - 1;
      doc.setFont("helvetica", ci === 0 ? "bold" : "normal");
      doc.setFontSize(8);
      doc.setTextColor(...col(isLast && opts.highlightLastCol ? WINE : TEXT));
      doc.text(truncate(doc, cell, opts.colWidths[ci] - 4), ci === 0 ? x + 3 : x + opts.colWidths[ci] / 2, y + rowH / 2 + 1, {
        align: ci === 0 ? "left" : "center",
        baseline: "middle",
      });
      x += opts.colWidths[ci];
    });
    y += rowH;
  });

  // Il bordo ha senso solo se non c'è stata un'interruzione di pagina nel
  // mezzo: altrimenti le coordinate non corrisponderebbero più alle righe
  // realmente disegnate su questa pagina.
  if (doc.getNumberOfPages() === pagesBeforeRows) {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, tableTop, CONTENT_W, y - tableTop);
  }

  return y;
}

export async function loadPhotoDataUrl(employeeId: string, photoVersion: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/employee-photo/${employeeId}?v=${photoVersion}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
