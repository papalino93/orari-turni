"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const DISMISSED_KEY = "install-banner-dismissed";

// Comparso una volta sola dopo il primo accesso — poi resta comunque
// raggiungibile da Account → "Installa l'app sul telefono" (vedi
// account/page.tsx), quindi chiuderlo non lo fa sparire per sempre, solo
// dalla vista.
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
