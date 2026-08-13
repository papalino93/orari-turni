"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast, runWithToast } from "@/components/toast";
import { clearWeekData } from "./actions";

export function ClearWeekButton({ weekStartKey }: { weekStartKey: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function confirmClear() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => clearWeekData(weekStartKey), "Settimana svuotata");
      if (result !== null) {
        router.refresh();
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger"
      >
        Svuota settimana
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !pending && setOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-foreground">Svuotare questa settimana?</h2>
            <p className="mt-2 text-sm text-foreground-muted">
              Verranno eliminati tutti i turni, ferie, permessi e riposi inseriti in questa settimana, per tutti i
              dipendenti. Le giornate impostate come chiuse non vengono toccate. Azione irreversibile.
            </p>
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
                onClick={confirmClear}
                disabled={pending}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Elimino…" : "Sì, svuota"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
