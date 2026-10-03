"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Miniatura che si ingrandisce con un clic (locandine, foto della copertina).
// Si chiude con un altro clic, con ✕ o con Esc; Esc chiude solo l'ingrandimento,
// non la scheda che c'è sotto.
export function ZoomableImage({ src, className, label = "Ingrandisci la foto" }: { src: string; className: string; label?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} title={label} className="shrink-0 cursor-zoom-in rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- anteprima di una foto caricata o appena scelta */}
        <img src={src} alt="" className={className} />
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Foto ingrandita"
            className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- foto ingrandita */}
            <img src={src} alt="" className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl" />
            <button
              type="button"
              aria-label="Chiudi"
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
