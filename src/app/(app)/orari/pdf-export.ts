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
  drawFooter,
  drawGenericTable,
  drawHeader,
  drawLockIcon,
  drawSectionTitle,
  ensureSpace,
  newLandscapeDoc,
  truncate,
} from "@/lib/pdf";

type JsPDF = import("jspdf").jsPDF;

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

  const doc = await newLandscapeDoc();
  let y = drawHeader(doc, "Orario settimanale", formatWeekRange(weekStart));

  // Un solo documento, un solo scopo: il programma di chi lavora quando,
  // pensato per essere stampato e appeso — non un misto tra orario e
  // riepilogo ore. Il riepilogo ore per dipendente (utile solo al
  // titolare, non a chi lavora in sala) vive già altrove: nell'export del
  // singolo dipendente e nel riepilogo ore mensile.
  //
  // Mattina sopra, pomeriggio sotto, a piena larghezza — non affiancate:
  // se la somma delle due tabelle non ci sta su una pagina sola (oltre una
  // decina di dipendenti), drawPeriodTable ridisegna l'intestazione in
  // cima alla pagina successiva invece di lasciare righe senza contesto.
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

type CellStyle = { text: string; color: readonly [number, number, number]; bold: boolean; kind: string };

function cellText(kind: string, text: string): CellStyle {
  // Niente emoji nel testo: i font standard di jsPDF (Helvetica e affini)
  // coprono solo la codifica WinAnsi e non hanno il glifo del lucchetto —
  // passarlo a doc.text() non stampa un carattere mancante ma un blocco di
  // caratteri a caso, E falsa la larghezza misurata dal testo (usata da
  // truncate()), facendo sconfinare la cella nelle colonne vicine. Il
  // lucchetto vero è disegnato a parte con drawLockIcon (vettoriale).
  if (kind === "CHIUSO") return { text: "CHIUSO", color: WINE, bold: true, kind };
  if (kind === "TURNO") return { text, color: TEXT, bold: false, kind };
  if (kind === "NON_PIANIFICATO") return { text: "—", color: [194, 183, 180], bold: false, kind };
  if (kind === "FERIE") return { text, color: WINE, bold: true, kind };
  if (kind === "PERMESSO") return { text, color: GOLD, bold: true, kind };
  if (kind === "MALATTIA") return { text, color: DANGER, bold: true, kind };
  return { text, color: MUTED, bold: false, kind }; // RIPOSO
}

function drawPeriodTable(
  doc: JsPDF,
  opts: {
    title: string;
    days: Date[];
    dateKeys: string[];
    rows: Employee[];
    startY: number;
    cell: (emp: Employee, dateKey: string) => CellStyle;
  },
): number {
  // Più stretto dell'originale "TITOLARE" per esteso: "TIT." basta a farsi
  // capire e lascia più respiro alle colonne dei giorni.
  const nameColW = 50;
  const dayColW = (CONTENT_W - nameColW) / 7;
  const headerH = 10;
  const rowH = 9;
  let y = opts.startY;

  // Intestazione (fascia + giorni): estratta in una funzione perché va
  // ridisegnata anche in cima a ogni pagina successiva, se la tabella non
  // ci sta tutta su una — con più di una decina di dipendenti mattina e
  // pomeriggio insieme possono superare una pagina sola, e senza questo chi
  // guarda una pagina di continuazione non saprebbe più quale colonna
  // corrisponde a quale giorno.
  function drawTableHeader(yy: number): number {
    doc.setFillColor(...WINE);
    doc.rect(MARGIN, yy, CONTENT_W, headerH, "F");
    doc.setTextColor(253, 242, 244);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(opts.title.toUpperCase(), MARGIN + 3, yy + headerH / 2 + 1.2, { baseline: "middle" });
    opts.days.forEach((d, i) => {
      const x = MARGIN + nameColW + i * dayColW;
      doc.text(dayLabel(d), x + dayColW / 2, yy + headerH / 2 - 1, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(formatDayMonth(d), x + dayColW / 2, yy + headerH / 2 + 3, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
    });
    return yy + headerH;
  }

  y = ensureSpace(doc, y, headerH + rowH);
  y = drawTableHeader(y);
  let tableTop = opts.startY;
  // Bordi disegnati "a blocchi": uno per ogni pagina su cui la tabella
  // finisce, invece di un unico rettangolo che assumerebbe (sbagliando)
  // che stia tutta sulla stessa pagina.
  const borderBlocks: { top: number; bottom: number }[] = [];

  opts.rows.forEach((emp, i) => {
    const pageBefore = doc.getNumberOfPages();
    const yBeforeBreakCheck = y;
    y = ensureSpace(doc, y, rowH);
    if (doc.getNumberOfPages() !== pageBefore) {
      // Interruzione di pagina nel mezzo della tabella: si chiude il
      // rettangolo del blocco precedente usando la y di prima della rottura
      // (non quella già resettata in cima alla nuova pagina), poi si
      // ridisegna l'intestazione sulla pagina nuova.
      borderBlocks.push({ top: tableTop, bottom: yBeforeBreakCheck });
      y = drawTableHeader(y);
      tableTop = MARGIN;
    }
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    const isOwner = emp.role === "OWNER";
    const displayName = truncate(doc, emp.name, nameColW - (isOwner ? 9 : 6));
    doc.text(displayName, MARGIN + 3, y + rowH / 2 + 1, { baseline: "middle" });
    if (isOwner) {
      // Un'etichetta leggibile ("TITOLARE" abbreviato), non solo un pallino:
      // un dipendente che apre il PDF deve poter capire chi è il titolare
      // senza una legenda a parte. doc.getTextWidth va misurato subito,
      // mentre il font è ancora quello con cui è stato disegnato il nome.
      const nameW = doc.getTextWidth(displayName);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...GOLD);
      doc.text("TIT.", MARGIN + 3 + nameW + 2, y + rowH / 2 + 1, { baseline: "middle" });
      doc.setFontSize(8.5);
    }

    opts.dateKeys.forEach((dateKey, di) => {
      const x = MARGIN + nameColW + di * dayColW;
      const { text, color, bold, kind } = opts.cell(emp, dateKey);
      if (kind === "CHIUSO") {
        drawLockIcon(doc, x + dayColW / 2, y + rowH / 2 - 2, 3.4, color);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(...color);
        doc.text(text, x + dayColW / 2, y + rowH / 2 + 2.6, { align: "center" });
        return;
      }
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

  borderBlocks.push({ top: tableTop, bottom: y });
  const currentPage = doc.getNumberOfPages();
  borderBlocks.forEach((block, bi) => {
    // Ogni blocco vive sulla propria pagina: l'ultimo su quella corrente,
    // i precedenti risalendo — doc.setPage per disegnare sulla pagina giusta.
    const pageOffset = borderBlocks.length - 1 - bi;
    doc.setPage(currentPage - pageOffset);
    doc.setDrawColor(230, 220, 218);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, block.top, CONTENT_W, block.bottom - block.top);
    // Una linea verticale tra ogni giorno: senza, gli orari di giorni
    // consecutivi (es. giovedì e venerdì) si leggono come se fossero
    // appiccicati l'uno all'altro.
    for (let i = 0; i <= opts.dateKeys.length; i++) {
      const x = MARGIN + nameColW + i * dayColW;
      doc.line(x, block.top, x, block.bottom);
    }
  });
  doc.setPage(currentPage);

  return y;
}
