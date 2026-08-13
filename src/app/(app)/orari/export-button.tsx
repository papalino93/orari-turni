"use client";

import { useRef, useState } from "react";
import { ExportCard } from "./export-card";
import { shareOrDownloadFile } from "@/lib/share-file";
import { useToast } from "@/components/toast";
import type { Block, Closure, Employee, Leave } from "@/lib/schedule";

export function ExportButton({
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
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<"image" | "pdf" | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  async function downloadImage() {
    if (!cardRef.current) return;
    setDownloading("image");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(cardRef.current, { pixelRatio: 2 });
      if (!blob) throw new Error("vuoto");
      const file = new File([blob], `orari-${weekStartKey}${employeeFilter ? `-${employeeFilter}` : ""}.png`, {
        type: "image/png",
      });
      await shareOrDownloadFile(file);
    } catch {
      toast.showError("Impossibile generare l'immagine. Riprova.");
    } finally {
      setDownloading(null);
    }
  }

  async function downloadPdf() {
    setDownloading("pdf");
    try {
      const { exportScheduleWeekPdf } = await import("./pdf-export");
      await exportScheduleWeekPdf({ weekStartKey, employees, blocks, leaveEntries, closures, employeeFilter });
    } catch {
      toast.showError("Impossibile generare il PDF. Riprova.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
      >
        Esporta
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-full rounded-2xl border border-border bg-surface p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Anteprima orario</p>
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-foreground-muted hover:text-foreground">
                Chiudi
              </button>
            </div>

            <div className="max-w-full overflow-auto rounded-xl" style={{ maxHeight: "60vh" }}>
              <ExportCard
                ref={cardRef}
                weekStartKey={weekStartKey}
                employees={employees}
                blocks={blocks}
                leaveEntries={leaveEntries}
                closures={closures}
                employeeFilter={employeeFilter}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={downloadImage}
                disabled={downloading !== null}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent disabled:opacity-60"
              >
                {downloading === "image" ? "Preparazione…" : "📤 Esporta immagine (WhatsApp)"}
              </button>
              <button
                type="button"
                onClick={downloadPdf}
                disabled={downloading !== null}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
              >
                {downloading === "pdf" ? "Preparazione…" : "📄 Esporta PDF (A4)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
