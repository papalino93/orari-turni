"use client";

import { useRef, useState } from "react";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { useBackdropClose } from "@/lib/use-backdrop-close";
import { UnsavedBar, useUnsavedGuard } from "@/components/unsaved-guard";

// Foglio a comparsa: dal basso su telefono, finestra centrata (e più larga su
// schermo grande) su tablet e computer. Niente pannello laterale stretto: la
// pagina dietro è velata e non serve tenerla in vista, e i moduli lunghi si
// leggono meglio al centro. Scorre sul contenitore esterno e centra su quello interno — lo
// stesso schema degli altri modali dell'app, così un contenuto più alto dello
// schermo resta sempre raggiungibile (incluso "Chiudi").
export function Sheet({
  title,
  onClose,
  children,
  wide = false,
  dirty,
  onSave,
}: {
  title: string;
  // Schede con tabelle (prezzi): più larghe sul computer.
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  // Chi sa con esattezza se c'è qualcosa da salvare (es. «Tabella prezzi», che resta aperta
  // dopo «Salva tutto») lo dice qui; altrimenti le modifiche si riconoscono da sole.
  dirty?: boolean;
  // «Salva» dal riquadro di conferma per le schede senza modulo (es. «Salva tutto»).
  onSave?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const guard = useUnsavedGuard(onClose, dirty === undefined ? undefined : () => dirty, dialogRef);
  // «Salva» dal riquadro di conferma: invia il modulo della scheda, se ce n'è uno.
  const [hasForm, setHasForm] = useState(false);
  const requestClose = () => {
    setHasForm(Boolean(dialogRef.current?.querySelector("form")));
    guard.requestClose();
  };
  useEscapeToClose(guard.asking ? guard.stay : requestClose);

  const backdrop = useBackdropClose(requestClose);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/60 backdrop-blur-sm" {...backdrop}>
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          {...guard.trackProps}
          className={`w-full rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6 ${wide ? "max-w-lg lg:max-w-3xl" : "max-w-lg lg:max-w-xl"}`}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-base font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={requestClose}
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
      {guard.asking && (
        <UnsavedBar
          onStay={guard.stay}
          onDiscard={onClose}
          onSave={
            onSave
              ? () => {
                  guard.stay();
                  onSave();
                }
              : hasForm
              ? () => {
                  guard.stay();
                  dialogRef.current?.querySelector("form")?.requestSubmit();
                }
              : undefined
          }
        />
      )}
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
