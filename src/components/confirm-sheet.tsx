"use client";

import { useBackdropClose } from "@/lib/use-backdrop-close";
import { useEscapeToClose } from "@/lib/use-escape-to-close";

// Finestra di conferma per le azioni che non devono partire con un tocco per sbaglio
// (inviare il mese, cambiare una password, confermare gli orari…): titolo, spiegazione,
// «Annulla» e il pulsante dell'azione. Sul telefono sale dal basso.
export function ConfirmSheet({
  title,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeToClose(() => !busy && onCancel(), true);
  const backdrop = useBackdropClose(() => !busy && onCancel());
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm" {...backdrop}>
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          role="alertdialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-left shadow-2xl sm:rounded-2xl sm:pb-5"
        >
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <div className="mt-2 space-y-2 text-sm text-foreground-muted">{children}</div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`min-h-11 rounded-lg px-4 text-sm font-medium disabled:opacity-50 ${
                danger ? "bg-danger text-white hover:bg-danger/90" : "bg-accent text-accent-foreground hover:bg-accent-hover"
              }`}
            >
              {busy ? (busyLabel ?? "Un attimo…") : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
