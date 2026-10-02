"use client";

import { useEscapeToClose } from "@/lib/use-escape-to-close";

// Foglio a comparsa: dal basso su telefono, finestra centrata su tablet,
// pannello laterale su schermo largo (dove c'è spazio e la lista dietro resta
// in vista). Scorre sul contenitore esterno e centra su quello interno — lo
// stesso schema degli altri modali dell'app, così un contenuto più alto dello
// schermo resta sempre raggiungibile (incluso "Chiudi").
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEscapeToClose(onClose);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4 lg:items-stretch lg:justify-end lg:p-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5 lg:max-w-md lg:rounded-none lg:rounded-l-2xl"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-base font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-2 hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-accent sm:text-sm";

// Campi data: stesso aspetto degli altri, ma senza che il testo si tagli o si
// sposti (su iOS/Android l'input date ha misure sue) quando la colonna è stretta.
export const dateInputClass = `${inputClass} min-w-0 appearance-none px-2.5 text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0`;

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-foreground-muted/80">{hint}</span>}
    </label>
  );
}
