"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExportCard } from "./export-card";
import { shareOrDownloadFile } from "@/lib/share-file";
import { useToast } from "@/components/toast";
import { ExportChoiceButtons } from "@/components/export-choice-buttons";
import type { Block, Closure, Employee, Leave } from "@/lib/schedule";
import { setWeekPublished } from "./actions";

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
  const router = useRouter();

  // Esportare la settimana È l'atto che conta come "condivisa": non un
  // interruttore separato da ricordarsi di premere. Se fallisce, il
  // download è comunque riuscito — non blocchiamo l'utente per questo.
  async function markShared() {
    // Esportare il foglio di un solo dipendente non è "aver comunicato l'orario
    // allo staff": marcare la settimana come condivisa farebbe sparire il
    // promemoria anche per tutti gli altri, che non hanno ricevuto niente.
    if (employeeFilter) return;
    try {
      await setWeekPublished(weekStartKey, true);
      router.refresh();
    } catch {
      // silenzioso, non critico
    }
  }

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
      const outcome = await shareOrDownloadFile(file);
      if (outcome === "downloaded-whatsapp-web") {
        toast.showSuccess("Immagine scaricata — trascinala nella chat su WhatsApp Web per condividerla");
      }
      await markShared();
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
      await markShared();
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
        // Prima era un pulsante-pillola come tutti gli altri ("Esporta"), che
        // non comunicava di essere IL modo per far avere l'orario allo
        // staff. Stile pieno + etichetta esplicita + icona di invio: si
        // deve capire a colpo d'occhio, non dedurlo.
        className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
      >
        <SendIcon />
        Invia orari
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

            <div className="mt-4">
              <ExportChoiceButtons downloading={downloading} onImage={downloadImage} onPdf={downloadPdf} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SendIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}
