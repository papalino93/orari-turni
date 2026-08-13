"use client";

import { useState } from "react";
import { formatMonthYear } from "@/lib/week";
import { useToast } from "@/components/toast";
import type { Block, Closure, Employee } from "@/lib/schedule";

export function SummaryExportButton({
  monthDateKey,
  employees,
  blocks,
  closures,
}: {
  monthDateKey: string;
  employees: Employee[];
  blocks: Block[];
  closures: Closure[];
}) {
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  async function downloadPdf() {
    setDownloading(true);
    try {
      const { exportMonthSummaryPdf } = await import("./pdf-export");
      const monthDate = new Date(`${monthDateKey}T00:00:00.000Z`);
      await exportMonthSummaryPdf({
        monthDateKey,
        monthLabel: formatMonthYear(monthDate),
        employees,
        blocks,
        closures,
      });
    } catch {
      toast.showError("Impossibile generare il PDF. Riprova.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={downloadPdf}
      disabled={downloading}
      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-60"
    >
      {downloading ? "Preparazione…" : "📄 Riepilogo PDF"}
    </button>
  );
}
