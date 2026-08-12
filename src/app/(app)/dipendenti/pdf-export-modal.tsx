"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  daysInMonth,
  formatMonthYear,
  formatWeekRange,
  startOfWeek,
  toDateKey,
} from "@/lib/week";
import { getEmployeeScheduleRange } from "./actions";
import { RangeCard } from "./range-card";

type RangeType = "week" | "month" | "custom";

export function PdfExportModal({
  employeeId,
  employeeName,
  jobTitle,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  jobTitle: string | null;
  onClose: () => void;
}) {
  const [rangeType, setRangeType] = useState<RangeType>("week");
  const [anchor, setAnchor] = useState(() => toDateKey(new Date()));
  const [customFrom, setCustomFrom] = useState(() => toDateKey(startOfWeek(new Date())));
  const [customTo, setCustomTo] = useState(() => toDateKey(addDays(startOfWeek(new Date()), 6)));
  const [data, setData] = useState<Awaited<ReturnType<typeof getEmployeeScheduleRange>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const { fromKey, toKey, dateKeys, rangeLabel } = useMemo(() => {
    const anchorDate = new Date(`${anchor}T00:00:00.000Z`);
    if (rangeType === "week") {
      const start = startOfWeek(anchorDate);
      const days = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(start, i)));
      return { fromKey: days[0], toKey: days[6], dateKeys: days, rangeLabel: formatWeekRange(start) };
    }
    if (rangeType === "month") {
      const days = daysInMonth(anchorDate).map(toDateKey);
      return { fromKey: days[0], toKey: days[days.length - 1], dateKeys: days, rangeLabel: formatMonthYear(anchorDate) };
    }
    const days: string[] = [];
    let cursor = new Date(`${customFrom}T00:00:00.000Z`);
    const end = new Date(`${customTo}T00:00:00.000Z`);
    while (cursor <= end && days.length < 366) {
      days.push(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return {
      fromKey: customFrom,
      toKey: customTo,
      dateKeys: days,
      rangeLabel: `${customFrom} – ${customTo}`,
    };
  }, [rangeType, anchor, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avvia lo spinner quando cambiano i parametri di fetch, pattern standard data-fetching
    setLoading(true);
    getEmployeeScheduleRange(employeeId, fromKey, toKey).then((res) => {
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId, fromKey, toKey]);

  async function downloadPdf() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Impossibile generare l'immagine"));
        img.src = dataUrl;
      });

      const pdf = new jsPDF({ unit: "px", format: [img.width, img.height] });
      pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
      pdf.save(`orario-${employeeName.replace(/\s+/g, "-").toLowerCase()}-${fromKey}_${toKey}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  function stepAnchor(direction: 1 | -1) {
    const anchorDate = new Date(`${anchor}T00:00:00.000Z`);
    const next = rangeType === "week" ? addDays(anchorDate, direction * 7) : addMonths(anchorDate, direction);
    setAnchor(toDateKey(next));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-w-full rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Esporta orario — {employeeName}</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground-muted hover:text-foreground">
            Chiudi
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-border bg-surface-2 p-1">
            {(["week", "month", "custom"] as RangeType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setRangeType(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  rangeType === t ? "bg-surface text-foreground" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {t === "week" ? "Settimana" : t === "month" ? "Mese" : "Personalizzato"}
              </button>
            ))}
          </div>

          {rangeType !== "custom" ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepAnchor(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
              >
                ‹
              </button>
              <span className="min-w-[9rem] text-center text-xs text-foreground-muted">{rangeLabel}</span>
              <button
                type="button"
                onClick={() => stepAnchor(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
              >
                ›
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
              />
              <span className="text-foreground-muted">–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        <div className="max-w-full overflow-auto rounded-xl" style={{ maxHeight: "55vh" }}>
          {loading || !data ? (
            <div className="flex h-40 w-full items-center justify-center text-sm text-foreground-muted">Caricamento…</div>
          ) : (
            <RangeCard
              ref={cardRef}
              employeeName={employeeName}
              jobTitle={jobTitle}
              rangeLabel={rangeLabel}
              dateKeys={dateKeys}
              blocks={data.blocks}
              leaveEntries={data.leaveEntries}
            />
          )}
        </div>

        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloading || loading}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {downloading ? "Preparazione…" : "Scarica PDF"}
        </button>
      </div>
    </div>
  );
}
