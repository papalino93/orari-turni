"use client";

import { useEffect, useRef, useState } from "react";

// Finestre con un modulo: se si è cambiato qualcosa, uscire (clic fuori, Esc,
// la X o «Annulla», ma anche chiudere o ricaricare la pagina) non butta via le modifiche in silenzio. Compare invece «Hai modifiche non
// salvate» con Salva / Esci senza salvare. Senza modifiche si chiude come sempre.
//
// Le modifiche si riconoscono da sole (si scrive in un campo, si sceglie da un
// elenco, si tocca una scelta tipo «Turno / Riposo» o una spunta); chi conosce
// meglio il proprio stato può passare `isDirty`.
export function useUnsavedGuard(onClose: () => void, isDirty?: () => boolean) {
  const touched = useRef(false);
  const [asking, setAsking] = useState(false);
  const dirty = () => (isDirty ? isDirty() : touched.current);
  const mark = () => {
    touched.current = true;
  };
  // Chiudere la scheda del browser o ricaricare con modifiche a metà: avviso del browser.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  return {
    asking,
    stay: () => setAsking(false),
    // Da usare al posto di onClose per sfondo, Esc, X e «Annulla».
    requestClose: () => (dirty() ? setAsking(true) : onClose()),
    // Da mettere sul riquadro della finestra.
    trackProps: {
      onInputCapture: mark,
      onChangeCapture: mark,
      onClickCapture: (e: React.MouseEvent) => {
        const el = e.target as Element | null;
        if (el?.closest?.('[role="radio"],[role="switch"],[role="checkbox"],[aria-pressed]')) mark();
      },
    },
  };
}

export function UnsavedBar({ onStay, onDiscard, onSave }: { onStay: () => void; onDiscard: () => void; onSave?: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-[70] flex justify-center px-4">
      <div
        role="alertdialog"
        aria-label="Modifiche non salvate"
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-gold/40 bg-surface p-4 shadow-2xl"
      >
        <p className="text-sm font-semibold text-foreground">Hai modifiche non salvate</p>
        <p className="mt-0.5 text-xs text-foreground-muted">Se esci adesso, quello che hai cambiato va perso.</p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger"
          >
            Esci senza salvare
          </button>
          <button type="button" onClick={onStay} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground hover:border-accent">
            Continua a modificare
          </button>
          {onSave && (
            <button type="button" onClick={onSave} className="min-h-10 rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground hover:bg-accent-hover">
              Salva
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
