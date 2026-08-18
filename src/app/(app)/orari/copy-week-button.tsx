"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast, runWithToast } from "@/components/toast";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { copyPreviousWeek } from "./actions";

// La rotazione di un negozio è quasi sempre la stessa di settimana in
// settimana: prima ogni turno andava reinserito casella per casella anche
// quando era identico a sette giorni prima. Questo pulsante ricopia la
// settimana precedente e lascia da sistemare solo le eccezioni.
export function CopyWeekButton({ weekStartKey }: { weekStartKey: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  useEscapeToClose(() => setOpen(false), open && !pending);

  function confirmCopy() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => copyPreviousWeek(weekStartKey), undefined);
      if (!result) return;

      // Tre esiti diversi che vale la pena distinguere, invece di un
      // generico "fatto" che lascia l'utente a chiedersi perché non è
      // cambiato nulla sullo schermo.
      if (result.sourceEmpty) {
        toast.showSuccess("La settimana precedente è vuota: non c'è nulla da ripetere.");
      } else if (result.filledSlots === 0) {
        toast.showSuccess("Questa settimana è già compilata: nessuna casella libera da riempire.");
      } else {
        const extra = result.skippedOccupied > 0 ? " (le caselle già compilate sono state lasciate come stavano)" : "";
        toast.showSuccess(`${result.filledSlots} giornate ricopiate dalla settimana precedente${extra}`);
      }
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ricopia turni e riposi dalla settimana precedente"
        className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
      >
        <RepeatIcon />
        Ripeti settimana
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm"
          onClick={() => !pending && setOpen(false)}
        >
          <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
            >
              <h2 className="text-base font-semibold text-foreground">Ripetere la settimana precedente?</h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Turni e riposi della settimana scorsa vengono ricopiati su questa.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-foreground-muted">
                <li className="flex gap-2">
                  <span aria-hidden className="text-success">
                    ✓
                  </span>
                  <span>Le giornate già compilate qui non vengono toccate.</span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-success">
                    ✓
                  </span>
                  <span>Le giornate di chiusura restano chiuse.</span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden>–</span>
                  <span>Ferie, permessi e malattia non si ricopiano: valgono solo per i giorni in cui sono capitati.</span>
                </li>
              </ul>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={confirmCopy}
                  disabled={pending}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? "Copio…" : "Sì, ripeti"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RepeatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
