"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExportCard } from "./export-card";
import { shareOrDownloadFile } from "@/lib/share-file";
import { useToast } from "@/components/toast";
import { ExportChoiceButtons } from "@/components/export-choice-buttons";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
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
  useEscapeToClose(() => setOpen(false), open);

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
        // Vedi lo stesso commento in pdf-export-modal.tsx: lo scroll vive sul
        // contenitore esterno, non su quello che centra il contenuto —
        // altrimenti, se l'anteprima è più alta dello schermo, la parte che
        // sporge sopra il centro (incluso "Chiudi") diventa irraggiungibile.
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          {/* Bottom-sheet su mobile (come gli altri modali dell'app), non un
              box sempre centrato: su un telefono con Home Indicator gestuale
              i pulsanti Immagine/PDF in fondo altrimenti finiscono a ridosso
              del bordo, senza lo stesso margine di sicurezza già applicato
              ovunque nel resto dell'app. */}
          <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-full rounded-t-2xl border border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Anteprima orario</p>
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-foreground-muted hover:text-foreground">
                  Chiudi
                </button>
              </div>

              <div className="relative max-w-full rounded-xl">
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
                {/* Vedi lo stesso commento in pdf-export-modal.tsx: solo una
                    sfumatura, l'anteprima è statica prima del download. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-surface to-transparent"
                />
              </div>

              <div className="mt-4">
                <ExportChoiceButtons downloading={downloading} onImage={downloadImage} onPdf={downloadPdf} />
              </div>
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
