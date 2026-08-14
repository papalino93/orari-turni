"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast, runWithToast } from "@/components/toast";
import { closeDateRange } from "./actions";

// Chiudere giorno per giorno va benissimo per un imprevisto isolato, ma per
// un periodo vero — ferie del locale, ristrutturazione — costringeva a
// ripetere lo stesso gesto una volta per ogni giorno. Questo fa la stessa
// cosa di closeDay ma su un intervallo intero in un colpo solo.
export function ClosureRangeModal({ defaultKey, onClose }: { defaultKey: string; onClose: () => void }) {
  const [fromKey, setFromKey] = useState(defaultKey);
  const [toKey, setToKey] = useState(defaultKey);
  const [reason, setReason] = useState("");
  const [removeShifts, setRemoveShifts] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function submit() {
    // Cancellare i turni di tutti su un intervallo è irreversibile: qui serve
    // un secondo passaggio, come già per la chiusura del singolo giorno.
    if (removeShifts && !confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => closeDateRange(fromKey, toKey, { removeShifts, reason }),
        "Periodo chiuso",
      );
      if (result !== null) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => !pending && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl"
      >
        <h2 className="text-base font-semibold text-foreground">Chiudi un periodo</h2>
        <p className="mt-1 mb-4 text-xs text-foreground-muted">
          Es. ferie del locale o ristrutturazione — chiude tutti i giorni dell&apos;intervallo insieme, invece di uno
          alla volta.
        </p>

        <div className="mb-3 flex items-center gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-foreground-muted">Da</span>
            <input
              type="date"
              value={fromKey}
              onChange={(e) => {
                setFromKey(e.target.value);
                if (e.target.value > toKey) setToKey(e.target.value);
              }}
              className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-foreground-muted">A</span>
            <input
              type="date"
              min={fromKey}
              value={toKey}
              onChange={(e) => setToKey(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (facoltativo) — es. Ferragosto"
          className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="mb-5 flex items-start gap-2 text-xs text-foreground-muted">
          <input
            type="checkbox"
            checked={removeShifts}
            onChange={(e) => {
              setRemoveShifts(e.target.checked);
              setConfirmingRemove(false);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          Rimuovi anche i turni già inseriti in questo periodo — altrimenti restano conservati come bozza e tornano
          visibili se in seguito riapri quei giorni.
        </label>

        {confirmingRemove && (
          <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
            I turni già inseriti in questo periodo verranno eliminati per tutti i dipendenti, senza possibilità di
            recuperarli. Togli la spunta qui sopra se vuoi solo chiudere il locale conservandoli.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              confirmingRemove
                ? "bg-danger text-white hover:opacity-90"
                : "bg-accent text-accent-foreground hover:bg-accent-hover"
            }`}
          >
            {pending ? "Chiudo…" : confirmingRemove ? "Sì, elimina i turni" : "Chiudi periodo"}
          </button>
        </div>
      </div>
    </div>
  );
}
