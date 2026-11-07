"use client";

import { useEffect } from "react";
import Link from "next/link";
import { actionErrorKind } from "@/components/toast";

// Senza un error boundary qui, qualunque eccezione non gestita in una pagina
// (es. i crash su parametri URL malformati corretti altrove, o un bug futuro
// non ancora previsto) faceva arrivare l'utente alla pagina di errore
// generica di Next.js — fuori dall'identità visiva dell'app e senza un modo
// semplice per tornare a una pagina funzionante. Questo boundary copre tutte
// le pagine sotto AppShell (che resta montato: la navigazione non sparisce).
//
// Vale per tutti (titolare e dipendenti): niente «Orari» nel testo, e «Torna
// all'inizio» porta a "/", che il Proxy manda alla prima sezione di ognuno.
// Senza rete, o con il sito aggiornato mentre la pagina era aperta, lo dice
// chiaramente invece di parlare di un errore imprevisto.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  const kind = actionErrorKind(error);
  const title = kind === "offline" ? "Connessione assente" : kind === "updated" ? "Il sito è stato aggiornato" : "Qualcosa è andato storto";
  const text =
    kind === "offline"
      ? "Controlla la rete, poi premi «Riprova»."
      : kind === "updated"
        ? "Ricarica la pagina per usare la versione nuova."
        : "Si è verificato un errore imprevisto in questa pagina. Riprova, oppure torna all'inizio.";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-foreground-muted">{text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => (kind === "updated" ? window.location.reload() : retry())}
          className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          {kind === "updated" ? "Ricarica" : "Riprova"}
        </button>
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          Torna all&apos;inizio
        </Link>
      </div>
    </div>
  );
}
