"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  daysInMonth,
  formatMonthYear,
  formatWeekRange,
  parseDateKey,
  startOfWeek,
  toDateKey,
  todayKey,
} from "@/lib/week";
import { useToast } from "@/components/toast";
import { ExportChoiceButtons } from "@/components/export-choice-buttons";
import { shareOrDownloadFile } from "@/lib/share-file";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { getEmployeeScheduleRange } from "./actions";
import { RangeCard } from "./range-card";

type RangeType = "week" | "month" | "custom";

export function PdfExportModal({
  employeeId,
  employeeName,
  jobTitle,
  photoVersion,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  jobTitle: string | null;
  photoVersion: string | null;
  onClose: () => void;
}) {
  const [rangeType, setRangeType] = useState<RangeType>("week");
  // todayKey() e non toDateKey(new Date()): quest'ultima legge il giorno in
  // UTC anche nel browser, sbagliando data/settimana di default nella
  // finestra tra mezzanotte UTC e quella italiana.
  const [anchor, setAnchor] = useState(() => todayKey());
  const [customFrom, setCustomFrom] = useState(() => toDateKey(startOfWeek(parseDateKey(todayKey()))));
  const [customTo, setCustomTo] = useState(() => toDateKey(addDays(startOfWeek(parseDateKey(todayKey())), 6)));
  type ScheduleData = {
    blocks: { dateKey: string; startTime: string; endTime: string }[];
    leaveEntries: { dateKey: string; type: string; quantity: number }[];
    closures: { dateKey: string; reason: string | null }[];
  };
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"image" | "pdf" | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEscapeToClose(onClose);

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
    return { fromKey: customFrom, toKey: customTo, dateKeys: days, rangeLabel: `${customFrom} – ${customTo}` };
  }, [rangeType, anchor, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avvia lo spinner quando cambiano i parametri di fetch, pattern standard data-fetching
    setLoading(true);
    setError(null);
    getEmployeeScheduleRange(employeeId, fromKey, toKey).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId, fromKey, toKey]);

  async function downloadImage() {
    if (!cardRef.current) return;
    setDownloading("image");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(cardRef.current, { pixelRatio: 2 });
      if (!blob) throw new Error("vuoto");
      const file = new File(
        [blob],
        `orario-${employeeName.replace(/\s+/g, "-").toLowerCase()}-${fromKey}_${toKey}.png`,
        { type: "image/png" },
      );
      const outcome = await shareOrDownloadFile(file);
      if (outcome === "downloaded-whatsapp-web") {
        toast.showSuccess("Immagine scaricata — trascinala nella chat su WhatsApp Web per condividerla");
      }
    } catch {
      toast.showError("Impossibile generare l'immagine. Riprova.");
    } finally {
      setDownloading(null);
    }
  }

  async function downloadPdf() {
    if (!data) return;
    setDownloading("pdf");
    try {
      const { exportEmployeeRangePdf } = await import("./pdf-export");
      await exportEmployeeRangePdf({
        employeeId,
        employeeName,
        jobTitle,
        photoVersion,
        rangeLabel,
        dateKeys,
        blocks: data.blocks,
        leaveEntries: data.leaveEntries as { dateKey: string; type: "FERIE" | "PERMESSO" | "LIBERO" | "MALATTIA"; quantity: number }[],
        closures: data.closures,
      });
    } catch {
      toast.showError("Impossibile generare il PDF. Riprova.");
    } finally {
      setDownloading(null);
    }
  }

  function stepAnchor(direction: 1 | -1) {
    const anchorDate = new Date(`${anchor}T00:00:00.000Z`);
    const next = rangeType === "week" ? addDays(anchorDate, direction * 7) : addMonths(anchorDate, direction);
    setAnchor(toDateKey(next));
  }

  return (
    // Lo scroll vive qui, non sull'elemento che centra il contenuto: centrare
    // con "items-center" E scorrere sullo stesso elemento non vanno d'accordo
    // in CSS — se il contenuto (l'anteprima dell'orario) supera l'altezza
    // dello schermo, la parte che sporge sopra il centro diventa
    // irraggiungibile, "Chiudi" compreso, perché la centratura sposta l'inizio
    // del contenuto a un offset negativo che lo scroll non può mai coprire.
    // "min-h-full" sull'involucro che centra tiene la struttura identica
    // quando il contenuto ci sta, e la fa scorrere per intero quando no.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={onClose}>
      {/* Bottom-sheet su mobile + margine per l'area sicura (Home Indicator),
          come gli altri modali dell'app — questo restava sempre centrato,
          l'unica incoerenza su un modale spesso più alto dello schermo su
          mobile (anteprima + selettore periodo). */}
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-full rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
        >
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
                aria-label="Periodo precedente"
              >
                ‹
              </button>
              <span className="min-w-[9rem] text-center text-xs text-foreground-muted">{rangeLabel}</span>
              <button
                type="button"
                onClick={() => stepAnchor(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
                aria-label="Periodo successivo"
              >
                ›
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  // Come nel selettore di chiusura periodo: se "Da" supera
                  // "A", si sposta anche "A" invece di lasciare un intervallo
                  // invertito che il server rifiuterebbe solo dopo il fetch.
                  if (e.target.value > customTo) setCustomTo(e.target.value);
                }}
                aria-label="Da"
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
              />
              <span className="text-foreground-muted">–</span>
              <input
                type="date"
                min={customFrom}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="A"
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        <div className="relative max-w-full rounded-xl">
          <div className="max-w-full overflow-auto rounded-xl" style={{ maxHeight: "55vh" }}>
            {loading || !data ? (
              <div className="flex h-40 w-full items-center justify-center text-sm text-foreground-muted">
                {error ? <span className="text-danger">{error}</span> : "Caricamento…"}
              </div>
            ) : (
              <div ref={cardRef}>
                <RangeCard
                  employeeId={employeeId}
                  employeeName={employeeName}
                  photoVersion={photoVersion}
                  jobTitle={jobTitle}
                  rangeLabel={rangeLabel}
                  dateKeys={dateKeys}
                  blocks={data.blocks}
                  leaveEntries={data.leaveEntries as { dateKey: string; type: "FERIE" | "PERMESSO" | "LIBERO" | "MALATTIA"; quantity: number }[]}
                  closures={data.closures}
                />
              </div>
            )}
          </div>
          {/* L'anteprima (formato A4, ~700px) è quasi sempre più larga del
              modal su schermi stretti: una sfumatura basta a segnalare che
              scorre, senza bisogno di altro — è un'anteprima statica prima
              del download, non un controllo interattivo da poter tagliare
              per errore come nella toolbar. */}
          {data && !loading && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-surface to-transparent"
            />
          )}
        </div>

        <div className="mt-4">
          <ExportChoiceButtons downloading={downloading} disabled={loading || !data} onImage={downloadImage} onPdf={downloadPdf} />
        </div>
        </div>
      </div>
    </div>
  );
}
