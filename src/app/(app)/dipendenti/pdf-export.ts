"use client";

// PDF vettoriale per l'orario di un singolo dipendente. Non una tabella
// burocratica a tutta larghezza: una card centrata sulla pagina — stessa
// composizione dell'anteprima a schermo (logo, foto accanto al nome,
// sottotitolo, tabella con angoli arrotondati) — perché è quello il
// documento che le persone giudicano "bello" o no, non una griglia piena
// di spazio vuoto.

import { dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { leaveLabelFor, leaveTypeToKind, type LeaveType } from "@/lib/schedule";
import {
  DANGER,
  GOLD,
  LINE,
  MARGIN,
  MUTED,
  PAGE_W,
  ROW_ALT,
  TEXT,
  WINE,
  WINE_DARK,
  col,
  drawCircularImage,
  drawFooter,
  drawLockIcon,
  drawLogo,
  drawTopRoundedRect,
  ensureSpace,
  initials,
  LOGO_ASPECT,
  loadPhotoDataUrl,
  newLandscapeDoc,
  truncate,
} from "@/lib/pdf";
import { blockHours } from "@/lib/week";

type RangeBlock = { dateKey: string; startTime: string; endTime: string };
type RangeLeave = { dateKey: string; type: LeaveType; quantity: number };
type RangeClosure = { dateKey: string; reason: string | null };

const CARD_W = 190;
const CARD_X = (PAGE_W - CARD_W) / 2;

export async function exportEmployeeRangePdf({
  employeeId,
  employeeName,
  jobTitle,
  photoVersion,
  rangeLabel,
  dateKeys,
  blocks,
  leaveEntries,
  closures,
}: {
  employeeId: string;
  employeeName: string;
  jobTitle: string | null;
  photoVersion: string | null;
  rangeLabel: string;
  dateKeys: string[];
  blocks: RangeBlock[];
  leaveEntries: RangeLeave[];
  closures: RangeClosure[];
}) {
  const doc = await newLandscapeDoc();
  const photo = photoVersion ? await loadPhotoDataUrl(employeeId, photoVersion) : null;
  const contentTop = MARGIN;
  let y = contentTop;

  // --- Header: logo + foto/iniziali + nome, raggruppati come sull'anteprima ---
  const avatarSize = 16;
  const logoW = 28;
  // Il logo è largo e basso (vedi drawLogo in lib/pdf.ts): lo si centra
  // verticalmente sull'altezza dell'avatar invece di allinearlo in alto,
  // altrimenti la scritta corsiva galleggia isolata sopra la foto.
  const logoH = logoW / LOGO_ASPECT;
  drawLogo(doc, CARD_X, y + (avatarSize - logoH) / 2, logoW);

  const avatarX = CARD_X + logoW + 10;
  const avatarY = y;
  if (photo) {
    try {
      drawCircularImage(doc, photo, avatarX, avatarY, avatarSize);
    } catch {
      drawAvatarFallback(doc, avatarX, avatarY, avatarSize, employeeName);
    }
  } else {
    drawAvatarFallback(doc, avatarX, avatarY, avatarSize, employeeName);
  }

  const textX = avatarX + avatarSize + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...TEXT);
  doc.text(employeeName, textX, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const subtitle = [jobTitle, rangeLabel].filter(Boolean).join("  ·  ");
  doc.text(subtitle, textX, y + 13.5);

  y += avatarSize + 7;

  // Sottile linea a sfumare, stesso tocco del brand usato nell'anteprima e
  // nel PDF settimanale.
  doc.setDrawColor(...WINE);
  doc.setLineWidth(0.6);
  doc.line(CARD_X, y, CARD_X + CARD_W, y);
  y += 7;

  // --- Tabella Data / Orario / Ore, con angoli superiori arrotondati ---
  const dataColW = 40;
  const oreColW = 26;
  const orarioColW = CARD_W - dataColW - oreColW;
  const headerH = 10;
  const rowH = 9;
  const cornerR = 2.5;

  const tableTop = y;
  drawTopRoundedRect(doc, CARD_X, y, CARD_W, headerH, cornerR, WINE);
  doc.setTextColor(253, 242, 244);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("DATA", CARD_X + 5, y + headerH / 2 + 1, { baseline: "middle" });
  doc.text("ORARIO", CARD_X + dataColW + 5, y + headerH / 2 + 1, { baseline: "middle" });
  doc.text("ORE", CARD_X + CARD_W - 5, y + headerH / 2 + 1, { align: "right", baseline: "middle" });
  y += headerH;

  const pagesBeforeRows = doc.getNumberOfPages();
  const closedSet = new Set(closures.map((c) => c.dateKey));
  let totalHours = 0;

  dateKeys.forEach((dateKey, i) => {
    y = ensureSpace(doc, y, rowH);
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(CARD_X, y, CARD_W, rowH, "F");
    }
    const date = parseDateKey(dateKey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    doc.text(`${dayLabel(date)} ${formatDayMonth(date)}`, CARD_X + 5, y + rowH / 2 + 1, { baseline: "middle" });

    const closed = closedSet.has(dateKey);
    const dayBlocks = blocks.filter((b) => b.dateKey === dateKey).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const leave = leaveEntries.find((l) => l.dateKey === dateKey);
    const hours = closed ? 0 : dayBlocks.reduce((sum, b) => sum + blockHours(b), 0);
    totalHours += hours;

    const orarioX = CARD_X + dataColW + 5;
    if (closed) {
      drawLockIcon(doc, orarioX + 1.7, y + rowH / 2, 3.6, WINE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...WINE);
      doc.text("LOCALE CHIUSO", orarioX + 5.5, y + rowH / 2 + 1, { baseline: "middle" });
    } else if (leave) {
      const kind = leaveTypeToKind(leave.type);
      const color = col(kind === "FERIE" ? WINE : kind === "PERMESSO" ? GOLD : kind === "MALATTIA" ? DANGER : MUTED);
      const label = leaveLabelFor(leave.type, leave.quantity);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...color);
      doc.text(label, orarioX, y + rowH / 2 + 1, { baseline: "middle" });
    } else if (dayBlocks.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...TEXT);
      const text = dayBlocks.map((b) => `${b.startTime}–${b.endTime}`).join("   ");
      doc.text(truncate(doc, text, orarioColW - 10), orarioX, y + rowH / 2 + 1, { baseline: "middle" });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text("Non pianificato", orarioX, y + rowH / 2 + 1, { baseline: "middle" });
    }

    if (hours > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...TEXT);
      doc.text(`${Math.round(hours * 100) / 100}h`, CARD_X + CARD_W - 5, y + rowH / 2 + 1, {
        align: "right",
        baseline: "middle",
      });
    }
    y += rowH;
  });

  const tableBottom = y;
  const noPageBreak = doc.getNumberOfPages() === pagesBeforeRows;
  if (noPageBreak) {
    // Nessuna linea verticale interna: la tabella ha solo colonne di testo
    // libero, righe alternate bastano a guidare l'occhio. Solo il bordo
    // esterno.
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(CARD_X, tableTop, CARD_W, tableBottom - tableTop);
  }

  // --- Totale ore: riga propria, coerente con il tfoot dell'anteprima ---
  y += 1.5;
  doc.setFillColor(...WINE_DARK);
  doc.roundedRect(CARD_X, y, CARD_W, 10, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(253, 242, 244);
  doc.text("TOTALE ORE", CARD_X + 5, y + 6.3);
  doc.text(`${Math.round(totalHours * 100) / 100} h`, CARD_X + CARD_W - 5, y + 6.3, { align: "right" });
  y += 10;

  // Cornice leggera attorno all'intera card, solo se il documento sta su
  // una pagina sola: dà l'effetto "scheda" invece di "modulo".
  if (noPageBreak) {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(CARD_X - 6, contentTop - 4, CARD_W + 12, y - contentTop + 8, 4, 4, "S");
  }

  drawFooter(doc);
  doc.save(`orario-${employeeName.replace(/\s+/g, "-").toLowerCase()}-${dateKeys[0]}_${dateKeys[dateKeys.length - 1]}.pdf`);
}

function drawAvatarFallback(doc: import("jspdf").jsPDF, x: number, y: number, size: number, name: string) {
  doc.setFillColor(241, 226, 224);
  doc.circle(x + size / 2, y + size / 2, size / 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 0.42);
  doc.setTextColor(...WINE);
  doc.text(initials(name), x + size / 2, y + size / 2 + 1, { align: "center", baseline: "middle" });
}
