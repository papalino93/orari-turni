"use client";

import { useRef, useState } from "react";
import { SummaryExportCard } from "./summary-export-card";
import type { Block, Employee } from "./shared";

export function SummaryExportButton({
  monthDateKey,
  employees,
  blocks,
}: {
  monthDateKey: string;
  employees: Employee[];
  blocks: Block[];
}) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

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
      pdf.save(`riepilogo-ore-${monthDateKey}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
      >
        Riepilogo PDF
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-full rounded-2xl border border-border bg-surface p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                Riepilogo ore di tutto il personale — pronto per il download
              </p>
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-foreground-muted hover:text-foreground">
                Chiudi
              </button>
            </div>

            <div className="max-w-full overflow-auto rounded-xl" style={{ maxHeight: "60vh" }}>
              <SummaryExportCard ref={cardRef} monthDateKey={monthDateKey} employees={employees} blocks={blocks} />
            </div>

            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloading}
              className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
            >
              {downloading ? "Preparazione…" : "Scarica PDF"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
