"use client";

import { useEffect } from "react";

// Schermata d'errore del menù dei clienti: con i colori e i caratteri del menù (è dentro
// .menu-root, vedi layout.tsx), invece della pagina inglese predefinita o di quella
// della gestione. Il cliente al tavolo deve solo poter riprovare.
export default function MenuError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[menu-error]", error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <p className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#7A5A22]">L&apos;Angolo del Vino</p>
      <h1 className="menu-serif mt-4 text-[34px] font-medium leading-tight text-[#6B1020]">Qualcosa non ha funzionato</h1>
      <p className="mt-3 max-w-[340px] text-[16px] leading-normal text-[#3F4540]">
        Il menù non si è caricato. Controlla la connessione e riprova.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="menu-sans mt-8 inline-flex min-h-12 items-center rounded-full bg-[#6B1020] px-7 text-[12px] font-medium uppercase tracking-[0.2em] text-[#F4EEE3]"
      >
        Riprova
      </button>
    </main>
  );
}
