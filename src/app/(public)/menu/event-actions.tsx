"use client";

import { useState } from "react";

const pill =
  "menu-sans flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#6B1020] px-5 text-[11px] font-medium uppercase tracking-[0.18em] no-underline";

// Sotto il titolo di un evento: «Prenota» (WhatsApp con il messaggio già scritto),
// «Aggiungi al calendario» (file .ics che il telefono apre nel suo calendario) e
// «Condividi» (la condivisione del telefono; dove non c'è, il link si copia).
export function EventActions({ slug, title, bookHref }: { slug: string; title: string; bookHref: string | null }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/menu/p/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} — L'Angolo del Vino`, url });
      } catch {
        // il cliente ha chiuso la condivisione: niente da fare
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copia il link dell'evento:", url);
    }
  }

  return (
    <div className="mt-7 flex flex-col items-center gap-2.5">
      <div className="flex w-full max-w-[300px] flex-col gap-2.5">
        {bookHref && (
          <a href={bookHref} data-stat-k="contact" data-stat-l={`Prenota · ${title}`} className={`${pill} bg-[#6B1020] !text-[#F4EEE3]`}>
            Prenota
          </a>
        )}
        <a href={`/menu/p/${slug}/calendario`} data-stat-k="contact" data-stat-l={`Calendario · ${title}`} className={`${pill} !text-[#6B1020]`}>
          Aggiungi al calendario
        </a>
        <button type="button" onClick={share} data-stat-k="contact" data-stat-l={`Condividi · ${title}`} className={`${pill} bg-transparent text-[#6B1020]`}>
          Condividi
        </button>
      </div>
      <p aria-live="polite" className="menu-sans m-0 min-h-4 text-[12px] text-[#5B605A]">
        {copied ? "Link copiato: incollalo dove vuoi." : ""}
      </p>
    </div>
  );
}
