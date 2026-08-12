"use client";

import { useRef, useState } from "react";
import { ExportCard } from "./export-card";
import type { Block, Employee, Leave } from "./shared";

export function ExportButton({
  weekStartKey,
  employees,
  blocks,
  leaveEntries,
  employeeFilter,
}: {
  weekStartKey: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  employeeFilter?: string;
}) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  async function download() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `orari-${weekStartKey}${employeeFilter ? `-${employeeFilter}` : ""}.png`;
      link.href = dataUrl;
      link.click();
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
        Esporta
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-full rounded-2xl border border-border bg-surface p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                Anteprima — pronta da scaricare e condividere su WhatsApp
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-foreground-muted hover:text-foreground"
              >
                Chiudi
              </button>
            </div>

            <div className="max-w-full overflow-auto rounded-xl" style={{ maxHeight: "60vh" }}>
              <div style={{ transform: "scale(0.75)", transformOrigin: "top left", width: 800 * 0.75 }}>
                <ExportCard
                  ref={cardRef}
                  weekStartKey={weekStartKey}
                  employees={employees}
                  blocks={blocks}
                  leaveEntries={leaveEntries}
                  employeeFilter={employeeFilter}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
            >
              {downloading ? "Preparazione…" : "Scarica immagine PNG"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
