"use client";

// Vero PDF vettoriale per l'orario di un singolo dipendente — stessa base di
// disegno dell'export settimanale in /orari (vedi lib/pdf.ts), non uno
// screenshot.

import { dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { DAY_KIND_LABEL, leaveTypeToKind, type LeaveType } from "@/lib/schedule";
import {
  CONTENT_W,
  DANGER,
  GOLD,
  MARGIN,
  MUTED,
  ROW_ALT,
  TEXT,
  WINE,
  col,
  drawFooter,
  drawHeader,
  ensureSpace,
  initials,
  loadPhotoDataUrl,
  newLandscapeDoc,
  truncate,
} from "@/lib/pdf";
import { blockHours } from "@/lib/week";

type RangeBlock = { dateKey: string; startTime: string; endTime: string };
type RangeLeave = { dateKey: string; type: LeaveType; quantity: number };
type RangeClosure = { dateKey: string; reason: string | null };

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
  let y = drawHeader(doc, `Orario di ${employeeName}`, rangeLabel);

  const photo = photoVersion ? await loadPhotoDataUrl(employeeId, photoVersion) : null;
  const badgeSize = 12;
  if (photo) {
    try {
      doc.addImage(photo, "JPEG", CONTENT_W + MARGIN - badgeSize, MARGIN, badgeSize, badgeSize);
    } catch {
      // ignora
    }
  }
  if (jobTitle) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(jobTitle, CONTENT_W + MARGIN, MARGIN + 18, { align: "right" });
  }

  const closedSet = new Set(closures.map((c) => c.dateKey));
  const nameColW = 44;
  const timeColW = 130;
  const hoursColW = CONTENT_W - nameColW - timeColW;
  const rowH = 8.5;
  const headerH = 9;

  y = ensureSpace(doc, y, headerH + rowH);
  doc.setFillColor(...WINE);
  doc.rect(MARGIN, y, CONTENT_W, headerH, "F");
  doc.setTextColor(253, 242, 244);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DATA", MARGIN + 4, y + headerH / 2 + 1, { baseline: "middle" });
  doc.text("ORARIO", MARGIN + nameColW + 4, y + headerH / 2 + 1, { baseline: "middle" });
  doc.text("ORE", MARGIN + nameColW + timeColW + hoursColW / 2, y + headerH / 2 + 1, { align: "center", baseline: "middle" });
  y += headerH;
  const tableTop = y - headerH;
  const pagesBeforeRows = doc.getNumberOfPages();

  let totalHours = 0;

  dateKeys.forEach((dateKey, i) => {
    y = ensureSpace(doc, y, rowH);
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    }
    const date = parseDateKey(dateKey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(`${dayLabel(date)} ${formatDayMonth(date)}`, MARGIN + 4, y + rowH / 2 + 1, { baseline: "middle" });

    const closed = closedSet.has(dateKey);
    const dayBlocks = blocks.filter((b) => b.dateKey === dateKey).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const leave = leaveEntries.find((l) => l.dateKey === dateKey);
    const hours = closed ? 0 : dayBlocks.reduce((sum, b) => sum + blockHours(b), 0);
    totalHours += hours;

    if (closed) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...WINE);
      doc.text("🔒 LOCALE CHIUSO", MARGIN + nameColW + 4, y + rowH / 2 + 1, { baseline: "middle" });
    } else if (leave) {
      const kind = leaveTypeToKind(leave.type);
      const color = col(kind === "FERIE" ? WINE : kind === "PERMESSO" ? GOLD : kind === "MALATTIA" ? DANGER : MUTED);
      const label = kind === "PERMESSO" ? `Permesso ${leave.quantity}h` : DAY_KIND_LABEL[kind];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...color);
      doc.text(label, MARGIN + nameColW + 4, y + rowH / 2 + 1, { baseline: "middle" });
    } else if (dayBlocks.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT);
      const text = dayBlocks.map((b) => `${b.startTime}–${b.endTime}`).join("   ");
      doc.text(truncate(doc, text, timeColW - 8), MARGIN + nameColW + 4, y + rowH / 2 + 1, { baseline: "middle" });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Non pianificato", MARGIN + nameColW + 4, y + rowH / 2 + 1, { baseline: "middle" });
    }

    if (hours > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT);
      doc.text(`${Math.round(hours * 100) / 100}h`, MARGIN + nameColW + timeColW + hoursColW / 2, y + rowH / 2 + 1, {
        align: "center",
        baseline: "middle",
      });
    }
    y += rowH;
  });

  // Il bordo attorno alla tabella ha senso solo se non c'è stata
  // un'interruzione di pagina in mezzo: altrimenti le coordinate non
  // corrisponderebbero più alle righe realmente disegnate.
  if (doc.getNumberOfPages() === pagesBeforeRows) {
    doc.setDrawColor(230, 220, 218);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, tableTop, CONTENT_W, y - tableTop);
  }

  y += 3;
  y = ensureSpace(doc, y, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WINE);
  doc.text(`Totale ore: ${Math.round(totalHours * 100) / 100}h`, CONTENT_W + MARGIN, y + 4, { align: "right" });

  if (!photo) {
    const cx = CONTENT_W + MARGIN - badgeSize / 2;
    const cy = MARGIN + badgeSize / 2;
    doc.setFillColor(241, 226, 224);
    doc.circle(cx, cy, badgeSize / 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...WINE);
    doc.text(initials(employeeName), cx, cy + 1, { align: "center", baseline: "middle" });
  }

  drawFooter(doc);
  doc.save(`orario-${employeeName.replace(/\s+/g, "-").toLowerCase()}-${dateKeys[0]}_${dateKeys[dateKeys.length - 1]}.pdf`);
}
