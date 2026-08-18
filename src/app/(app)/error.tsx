"use client";

import { useEffect } from "react";
import Link from "next/link";

// Senza un error boundary qui, qualunque eccezione non gestita in una pagina
// (es. i crash su parametri URL malformati corretti altrove, o un bug futuro
// non ancora previsto) faceva arrivare l'utente alla pagina di errore
// generica di Next.js — fuori dall'identità visiva dell'app e senza un modo
// semplice per tornare a una pagina funzionante. Questo boundary copre tutte
// le pagine sotto AppShell (che resta montato: la navigazione non sparisce).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">Qualcosa è andato storto</h1>
      <p className="text-sm text-foreground-muted">
        Si è verificato un errore imprevisto in questa pagina. Riprova, oppure torna agli Orari.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          Riprova
        </button>
        <Link
          href="/orari"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          Vai a Orari
        </Link>
      </div>
    </div>
  );
}
