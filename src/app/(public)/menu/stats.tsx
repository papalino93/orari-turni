"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { StatKind } from "@/lib/menu-stats";

// Statistiche anonime del menù: niente cookie, niente dati personali. Ogni
// evento è solo «cosa» (es. una parola cercata) e, lato server, giorno e ora.
// Non parte dall'«Anteprima» della gestione (il menù è dentro un riquadro) né
// per chi ha fatto l'accesso (lo esclude il server); se le statistiche sono
// spente il server non salva nulla.
export function track(k: StatKind, l?: string | null, t?: string | null) {
  if (typeof window === "undefined" || window.self !== window.top) return;
  const body = JSON.stringify({ k, l: l ?? undefined, t: t ?? undefined });
  try {
    if (navigator.sendBeacon?.("/menu/e", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // si prova con fetch
  }
  void fetch("/menu/e", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
}

// Una visita = una scheda del browser: ricaricare la pagina non conta di nuovo.
function firstTimeInTab(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function MenuStats() {
  const pathname = usePathname();

  useEffect(() => {
    if (firstTimeInTab("menu-stat-open")) track("open", pathname);
    const event = pathname.match(/^\/menu\/p\/([^/]+)/);
    if (event && firstTimeInTab(`menu-stat-event-${event[1]}`)) track("event", document.title.split(" — ")[0] || event[1], event[1]);
  }, [pathname]);

  // Elementi segnati con data-stat-k (sezioni, contatti, abbinamenti, eventi):
  // un solo ascoltatore per tutta la pagina.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest?.("[data-stat-k]");
      if (!(el instanceof HTMLElement)) return;
      const k = el.dataset.statK as StatKind;
      track(k, el.dataset.statL ?? el.textContent?.trim() ?? null, el.dataset.statT ?? null);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
