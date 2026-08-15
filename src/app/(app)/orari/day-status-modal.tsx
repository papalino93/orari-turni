"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { useToast, runWithToast } from "@/components/toast";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { closeDay, reopenDay } from "./actions";

type Status = "OPEN" | "CLOSED";

export function DayStatusModal({
  dateKey,
  isClosed,
  shiftCount,
  onClose,
}: {
  dateKey: string;
  isClosed: boolean;
  /** Turni già presenti in questa giornata (0 se nessuno). */
  shiftCount: number;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>(isClosed ? "CLOSED" : "OPEN");
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const date = parseDateKey(dateKey);
  useEscapeToClose(onClose, !pending);

  function applyClose(removeShifts: boolean) {
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => closeDay(dateKey, { removeShifts }),
        "Locale impostato come chiuso",
      );
      if (result !== null) {
        router.refresh();
        onClose();
      }
    });
  }

  function applyReopen() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => reopenDay(dateKey), "Locale riaperto");
      if (result !== null) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    // Vedi lo stesso commento in pdf-export-modal.tsx: scroll sul contenitore
    // esterno, centratura su quello interno.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
        <div
          onClick={(e) => e.stopPropagation()}
          // Vedi lo stesso commento in shared.tsx: area sicura del telefono
          // sul bordo inferiore, solo su mobile.
          className="w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
        >
        <div className="mb-4">
          <p className="text-xs text-foreground-muted">
            {dayLabel(date, true)} {formatDayMonth(date)}
          </p>
          <h2 className="text-base font-semibold text-foreground">Stato giornata</h2>
        </div>

        {isClosed ? (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-medium text-foreground">
              <span aria-hidden>🔒</span> Locale chiuso
            </div>
            <p className="mb-4 text-sm text-foreground-muted">
              Riaprendo la giornata torna disponibile la normale pianificazione dei turni.
              {shiftCount > 0 &&
                ` I ${shiftCount} turni inseriti prima della chiusura sono stati conservati e torneranno visibili.`}
            </p>
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
                onClick={applyReopen}
                disabled={pending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
              >
                {pending ? "Riapro…" : "Riapri giornata"}
              </button>
            </div>
          </div>
        ) : confirmingClose ? (
          <div>
            <p className="mb-4 text-sm text-foreground-muted">
              Il locale sarà chiuso per tutta la giornata. I turni di questa giornata non saranno disponibili.
              {shiftCount > 0 && (
                <>
                  {" "}
                  Sono già presenti <strong className="text-foreground">{shiftCount} turni</strong> in questa
                  giornata: scegli cosa farne.
                </>
              )}
            </p>
            <div className="flex flex-col gap-2">
              {shiftCount > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => applyClose(false)}
                    disabled={pending}
                    className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                  >
                    Chiudi e conserva i turni come bozza
                  </button>
                  <button
                    type="button"
                    onClick={() => applyClose(true)}
                    disabled={pending}
                    className="rounded-lg border border-danger/40 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
                  >
                    Chiudi e rimuovi i turni
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => applyClose(false)}
                  disabled={pending}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? "Chiudo…" : "Conferma chiusura"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmingClose(false)}
                disabled={pending}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex flex-col gap-2">
              <StatusOption label="Aperto" description="Normale pianificazione dei turni" active={status === "OPEN"} onClick={() => setStatus("OPEN")} />
              <StatusOption
                label="Locale chiuso"
                description="Nessun turno per l'intera giornata"
                active={status === "CLOSED"}
                onClick={() => setStatus("CLOSED")}
              />
            </div>
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
                onClick={() => (status === "CLOSED" ? setConfirmingClose(true) : onClose())}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
              >
                Continua
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function StatusOption({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
        active ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          active ? "border-accent" : "border-border"
        }`}
        aria-hidden
      >
        {active && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-foreground-muted">{description}</span>
      </span>
    </button>
  );
}
