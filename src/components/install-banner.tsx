"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const DISMISSED_KEY = "install-banner-dismissed";

// Versione "leggera", per titolare/consulente: comparsa una volta sola dopo
// il primo accesso, poi resta comunque raggiungibile da Account → "Installa
// l'app sul telefono", quindi chiuderla non la fa sparire per sempre, solo
// dalla vista. Per un login da dipendente il richiamo è più insistente —
// vedi EmployeeInstallPrompt qui sotto, mostrato al posto di questa.
export function InstallBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alreadyStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dipende da localStorage/matchMedia, non disponibili al primo render lato server
    setVisible(!alreadyStandalone && !dismissed);
  }, []);

  if (!visible || pathname === "/installa") return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-sm">
      <span aria-hidden className="text-base">📲</span>
      <p className="flex-1 text-foreground-muted">
        Aggiungi l&apos;app alla schermata Home del telefono: si apre più in fretta, come un&apos;app vera.{" "}
        <Link href="/installa" className="font-medium text-accent hover:text-accent-hover">
          Scopri come
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Chiudi"
        className="shrink-0 text-foreground-muted hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

const EMPLOYEE_DISMISSED_KEY = "employee-install-prompt-dismissed";

// Per un login da dipendente il richiamo è volutamente più forte: un
// pannello a schermo intero invece di una riga discreta, senza una crocetta
// per chiuderlo d'istinto (solo due scelte esplicite), e soprattutto
// sessionStorage invece di localStorage — "più tardi" vale per questa
// sessione, non per sempre: ricompare al prossimo accesso finché l'app non
// risulta davvero installata. Non è un blocco vero (si può sempre
// proseguire), ma il più vicino a "quasi obbligato" che si può fare senza
// impedire a qualcuno di lavorare se per qualche motivo non può installarla.
export function EmployeeInstallPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alreadyStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const dismissedThisSession = sessionStorage.getItem(EMPLOYEE_DISMISSED_KEY) === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dipende da sessionStorage/matchMedia, non disponibili al primo render lato server
    setVisible(!alreadyStandalone && !dismissedThisSession);
  }, []);

  if (!visible || pathname === "/installa") return null;

  function dismissForSession() {
    sessionStorage.setItem(EMPLOYEE_DISMISSED_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- icona statica, non serve l'ottimizzazione di next/image */}
        <img src="/icons/icon-192.png" alt="" width={64} height={64} className="mx-auto mb-4 rounded-2xl" />
        <h2 className="text-base font-semibold text-foreground">Installa l&apos;app sul telefono</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          Per ricevere gli orari e i promemoria delle ore in modo affidabile, aggiungi l&apos;app alla schermata
          Home — bastano una decina di secondi, ti mostriamo tutti i passaggi.
        </p>
        <Link
          href="/installa"
          onClick={dismissForSession}
          className="mt-5 block w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Installa ora
        </Link>
        <button
          type="button"
          onClick={dismissForSession}
          className="mt-3 text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          Ricordamelo più tardi
        </button>
      </div>
    </div>
  );
}
