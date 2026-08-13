"use client";

// Vero PDF vettoriale (non uno screenshot): jsPDF disegna testo e tabelle
// direttamente, niente rasterizzazione via html-to-image. A4 orizzontale,
// bianco, senza nessuna evidenziazione di "oggi" e senza aree rosse estese —
// solo i toni del brand usati con misura.

import { addDays, dayLabel, formatDayMonth, formatWeekRange, parseDateKey } from "@/lib/week";
import {
  buildSchedule,
  entryForPeriod,
  entryLabel,
  formatHours,
  PERIOD_LABEL,
  PERIODS,
  type Block,
  type Closure,
  type Employee,
  type Leave,
} from "@/lib/schedule";
import { orderEmployees } from "./shared";
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
  drawGenericTable,
  drawHeader,
  drawSectionTitle,
  ensureSpace,
  initials,
  loadPhotoDataUrl,
  newLandscapeDoc,
  truncate,
} from "@/lib/pdf";

type JsPDF = import("jspdf").jsPDF;
type PhotoMap = Map<string, string>;

export async function exportScheduleWeekPdf({
  weekStartKey,
  employees,
  blocks,
  leaveEntries,
  closures,
  employeeFilter,
}: {
  weekStartKey: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  closures: Closure[];
  employeeFilter?: string;
}) {
  const weekStart = parseDateKey(weekStartKey);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateKeys = days.map((d) => d.toISOString().slice(0, 10));
  const allOrdered = orderEmployees(employees);
  const rows = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

  const schedule = buildSchedule({ dateKeys, employees: rows, blocks, leaveEntries, closures });
  const photos = await loadPhotos(rows);

  const doc = await newLandscapeDoc();
  let y = drawHeader(doc, "Orario settimanale", formatWeekRange(weekStart));

  y = drawSectionTitle(doc, "Programmazione per fascia oraria", y);
  for (const period of PERIODS) {
    y = drawPeriodTable(doc, {
      title: PERIOD_LABEL[period],
      days,
      dateKeys,
      rows,
      startY: y,
      cell: (emp, dateKey) => {
        const closed = schedule.isClosed(dateKey);
        const entry = closed ? schedule.entry(emp.id, dateKey) : entryForPeriod(schedule.entry(emp.id, dateKey), period);
        return cellText(
          entry.kind,
          entry.kind === "TURNO" ? entry.blocks.map((b) => `${b.startTime}–${b.endTime}`).join("\n") : entryLabel(entry),
        );
      },
    });
    y += 4;
  }

  y += 4;
  if (y > 150) {
    doc.addPage();
    y = MARGIN;
  }
  y = drawSectionTitle(doc, "Riepilogo dipendenti", y);
  drawEmployeeSummaries(doc, { days, dateKeys, rows, schedule, photos, startY: y });

  drawFooter(doc);

  const suffix = employeeFilter ? `-${employeeFilter}` : "";
  doc.save(`orario-${weekStartKey}${suffix}.pdf`);
}

export async function exportMonthSummaryPdf({
  monthDateKey,
  monthLabel,
  employees,
  blocks,
  closures,
}: {
  monthDateKey: string;
  monthLabel: string;
  employees: Employee[];
  blocks: Block[];
  closures: Closure[];
}) {
  const { weekRangesInMonth, toDateKey } = await import("@/lib/week");
  const monthDate = new Date(`${monthDateKey}T00:00:00.000Z`);
  const weeks = weekRangesInMonth(monthDate);
  const rows = orderEmployees(employees).filter((e) => e.role !== "OWNER");

  const monthEnd = toDateKey(weeks[weeks.length - 1].end);
  const allDates: string[] = [];
  let cursor = weeks[0].start;
  while (toDateKey(cursor) <= monthEnd) {
    allDates.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  const schedule = buildSchedule({ dateKeys: allDates, employees: rows, blocks, leaveEntries: [], closures });

  const doc = await newLandscapeDoc();
  let y = drawHeader(doc, "Riepilogo ore — tutto il personale", monthLabel);
  y = drawSectionTitle(doc, "Ore per settimana", y);

  const colW = [70, ...weeks.map(() => (CONTENT_W - 70 - 35) / weeks.length), 35];
  drawGenericTable(doc, {
    startY: y,
    colWidths: colW,
    header: ["Dipendente", ...weeks.map((w) => `${formatDayMonth(w.start)}–${formatDayMonth(w.end)}`), "Totale"],
    rows: rows.map((emp) => [
      emp.name,
      ...weeks.map((w) => formatHours(schedule.hoursInRange(emp.id, toDateKey(w.start), toDateKey(w.end)))),
      formatHours(schedule.employeeHours(emp.id)),
    ]),
    highlightLastCol: true,
  });

  drawFooter(doc);
  doc.save(`riepilogo-ore-${monthDateKey}.pdf`);
}

// --- disegno specifico della griglia orari ----------------------------------

function cellText(kind: string, text: string): { text: string; color: readonly [number, number, number]; bold: boolean } {
  if (kind === "CHIUSO") return { text: "🔒 LOCALE CHIUSO", color: WINE, bold: true };
  if (kind === "TURNO") return { text, color: TEXT, bold: false };
  if (kind === "NON_PIANIFICATO") return { text: "—", color: [194, 183, 180], bold: false };
  if (kind === "FERIE") return { text, color: WINE, bold: true };
  if (kind === "PERMESSO") return { text, color: GOLD, bold: true };
  if (kind === "MALATTIA") return { text, color: DANGER, bold: true };
  return { text, color: MUTED, bold: false }; // RIPOSO
}

function drawPeriodTable(
  doc: JsPDF,
  opts: {
    title: string;
    days: Date[];
    dateKeys: string[];
    rows: Employee[];
    startY: number;
    cell: (emp: Employee, dateKey: string) => { text: string; color: readonly [number, number, number]; bold: boolean };
  },
): number {
  const nameColW = 46;
  const dayColW = (CONTENT_W - nameColW) / 7;
  const headerH = 10;
  const rowH = 9;
  let y = opts.startY;

  y = ensureSpace(doc, y, headerH + rowH);

  doc.setFillColor(...WINE);
  doc.rect(MARGIN, y, CONTENT_W, headerH, "F");
  doc.setTextColor(253, 242, 244);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(opts.title.toUpperCase(), MARGIN + 3, y + headerH / 2 + 1.2, { baseline: "middle" });
  opts.days.forEach((d, i) => {
    const x = MARGIN + nameColW + i * dayColW;
    doc.text(dayLabel(d), x + dayColW / 2, y + headerH / 2 - 1, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(formatDayMonth(d), x + dayColW / 2, y + headerH / 2 + 3, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
  });
  y += headerH;
  const tableTop = opts.startY;
  const pagesBeforeRows = doc.getNumberOfPages();

  opts.rows.forEach((emp, i) => {
    y = ensureSpace(doc, y, rowH);
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    const isOwner = emp.role === "OWNER";
    const displayName = truncate(doc, emp.name, nameColW - (isOwner ? 12 : 6));
    doc.text(displayName, MARGIN + 3, y + rowH / 2 + 1, { baseline: "middle" });
    if (isOwner) {
      doc.setTextColor(...GOLD);
      doc.text("★", MARGIN + 3 + doc.getTextWidth(displayName) + 1.5, y + rowH / 2 + 1, { baseline: "middle" });
      doc.setTextColor(...TEXT);
    }

    opts.dateKeys.forEach((dateKey, di) => {
      const x = MARGIN + nameColW + di * dayColW;
      const { text, color, bold } = opts.cell(emp, dateKey);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(text.length > 11 ? 6.5 : 7.5);
      doc.setTextColor(...color);
      const lines = text.split("\n");
      const lineH = 3.2;
      const totalH = lines.length * lineH;
      lines.forEach((line, li) => {
        doc.text(truncate(doc, line, dayColW - 2), x + dayColW / 2, y + rowH / 2 - totalH / 2 + li * lineH + 2, {
          align: "center",
        });
      });
    });
    y += rowH;
  });

  // Come per la tabella dipendenti: il bordo ha senso solo senza interruzioni
  // di pagina nel mezzo.
  if (doc.getNumberOfPages() === pagesBeforeRows) {
    doc.setDrawColor(230, 220, 218);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, tableTop, CONTENT_W, y - tableTop);
    // Una linea verticale tra ogni giorno: senza, gli orari di giorni
    // consecutivi (es. giovedì e venerdì) si leggono come se fossero
    // appiccicati l'uno all'altro.
    for (let i = 0; i <= opts.dateKeys.length; i++) {
      const x = MARGIN + nameColW + i * dayColW;
      doc.line(x, tableTop, x, y);
    }
  }

  return y;
}

function drawEmployeeSummaries(
  doc: JsPDF,
  opts: {
    days: Date[];
    dateKeys: string[];
    rows: Employee[];
    schedule: ReturnType<typeof buildSchedule>;
    photos: PhotoMap;
    startY: number;
  },
): number {
  let y = opts.startY;
  const rowH = 9;
  const photoSize = 8;
  const headerH = 8;

  for (const emp of opts.rows) {
    y = ensureSpace(doc, y, headerH + rowH + 4);

    const photo = opts.photos.get(emp.id);
    if (photo) {
      try {
        doc.addImage(photo, "JPEG", MARGIN, y, photoSize, photoSize);
      } catch {
        // ignora, resta lo spazio bianco
      }
    } else {
      doc.setFillColor(...col(emp.role === "OWNER" ? [233, 213, 165] : [241, 226, 224]));
      doc.circle(MARGIN + photoSize / 2, y + photoSize / 2, photoSize / 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...col(emp.role === "OWNER" ? GOLD : WINE));
      doc.text(initials(emp.name), MARGIN + photoSize / 2, y + photoSize / 2 + 1, { align: "center", baseline: "middle" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT);
    doc.text(emp.name, MARGIN + photoSize + 3, y + 3.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const roleText = [emp.jobTitle, emp.role === "OWNER" ? "Titolare" : null].filter(Boolean).join(" · ");
    doc.text(roleText || " ", MARGIN + photoSize + 3, y + 7.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...WINE);
    doc.text(formatHours(opts.schedule.employeeHours(emp.id)), CONTENT_W + MARGIN, y + 5, { align: "right" });

    y += headerH;

    doc.setFillColor(...ROW_ALT);
    doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    const cellW = CONTENT_W / 7;
    opts.dateKeys.forEach((dateKey, i) => {
      const x = MARGIN + i * cellW;
      const entry = opts.schedule.entry(emp.id, dateKey);
      const label = entry.kind === "CHIUSO" ? "🔒 Chiuso" : entryLabel(entry);
      const { color, bold } = cellText(entry.kind, label);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(dayLabel(opts.days[i]), x + cellW / 2, y + 3.2, { align: "center" });
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(...color);
      doc.text(truncate(doc, label, cellW - 2), x + cellW / 2, y + 6.8, { align: "center" });
    });
    doc.setDrawColor(230, 220, 218);
    doc.setLineWidth(0.15);
    for (let i = 1; i < 7; i++) {
      const x = MARGIN + i * cellW;
      doc.line(x, y, x, y + rowH);
    }
    y += rowH + 4;
  }

  return y;
}

async function loadPhotos(employees: Employee[]): Promise<PhotoMap> {
  const map: PhotoMap = new Map();
  await Promise.all(
    employees
      .filter((e) => e.photoVersion)
      .map(async (e) => {
        const dataUrl = await loadPhotoDataUrl(e.id, e.photoVersion!);
        if (dataUrl) map.set(e.id, dataUrl);
      }),
  );
  return map;
}
