"use client";

import { useEffect, useRef, useState } from "react";

// Finestre con un modulo: se si è cambiato qualcosa, uscire (clic fuori, Esc,
// la X o «Annulla», ma anche chiudere o ricaricare la pagina) non butta via le modifiche in silenzio. Compare invece «Hai modifiche non
// salvate» con Salva / Esci senza salvare. Senza modifiche si chiude come sempre.
//
// Le modifiche si riconoscono da sole: si è toccato qualcosa e il contenuto dei campi
// (testi, numeri, elenchi, spunte) è diverso da quando la finestra si è aperta. Scegliere
// soltanto il tipo di una voce (es. «Testo / Voce con prezzo / Avviso») non conta, e nemmeno
// scrivere qualcosa e poi rimetterlo com'era. Chi conosce meglio il proprio stato può passare
// `isDirty`.
function formSnapshot(root: HTMLElement | null): string {
  if (!root) return "";
  const parts: string[] = [];
  root.querySelectorAll<HTMLElement>("input, textarea, select, [role=switch], [role=checkbox], [aria-pressed]").forEach((el) => {
    if (el instanceof HTMLInputElement) {
      if (el.type === "radio") return;
      parts.push(el.type === "checkbox" ? `c:${el.checked}` : el.type === "file" ? `f:${el.files?.length ?? 0}` : `v:${el.value}`);
    } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      parts.push(`v:${el.value}`);
    } else {
      parts.push(`a:${el.getAttribute("aria-checked") ?? el.getAttribute("aria-pressed")}`);
    }
  });
  return parts.join("\u0001");
}

export function useUnsavedGuard(onClose: () => void, isDirty?: () => boolean, watch?: React.RefObject<HTMLElement | null>) {
  const touched = useRef(false);
  const initial = useRef<string | null>(null);
  const [asking, setAsking] = useState(false);
  const dirty = () => {
    if (isDirty) return isDirty();
    if (!touched.current) return false;
    // Con la finestra da osservare conta solo se il contenuto dei campi è cambiato davvero.
    return watch?.current ? formSnapshot(watch.current) !== initial.current : true;
  };
  // Il contenuto di partenza si fotografa appena la finestra è disegnata.
  useEffect(() => {
    const id = setTimeout(() => {
      initial.current = formSnapshot(watch?.current ?? null);
    }, 0);
    return () => clearTimeout(id);
  }, [watch]);
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
        {/* Sul telefono uno sotto l'altro, a tutta larghezza, con «Salva» per primo e «Esci senza salvare» in fondo. */}
        <div className="mt-3 grid gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            className="order-last min-h-11 rounded-full border border-border px-3.5 text-sm font-medium text-foreground-muted hover:border-danger hover:text-danger sm:order-first sm:min-h-10 sm:text-xs"
          >
            Esci senza salvare
          </button>
          <button
            type="button"
            onClick={onStay}
            className="min-h-11 rounded-full border border-border px-3.5 text-sm font-medium text-foreground hover:border-accent sm:min-h-10 sm:text-xs"
          >
            Continua a modificare
          </button>
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              className="order-first min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover sm:order-last sm:min-h-10 sm:text-xs"
            >
              Salva
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
