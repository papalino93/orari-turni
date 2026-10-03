"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { romeParts, type StatKind } from "@/lib/menu-stats";

// Dispositivo del personale: segnato quando si apre l'app con l'accesso (vedi
// StaffDeviceMark). Da lì in poi il menù non conta più nulla da quel browser,
// anche se la sessione scade o si apre il menù senza essere entrati.
export const STAFF_DEVICE_KEY = "menu-staff-device";

function isStaffDevice(): boolean {
  try {
    return localStorage.getItem(STAFF_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}

// Statistiche anonime del menù: niente cookie, niente dati personali. Ogni
// evento è solo «cosa» (es. una parola cercata) e, lato server, giorno e ora.
// Non parte dall'«Anteprima» della gestione (il menù è dentro un riquadro) né
// per chi ha fatto l'accesso (lo esclude il server); se le statistiche sono
// spente il server non salva nulla.
export function track(k: StatKind, l?: string | null, t?: string | null) {
  if (typeof window === "undefined" || window.self !== window.top || isStaffDevice()) return;
  const body = JSON.stringify({ k, l: l ?? undefined, t: t ?? undefined });
  try {
    if (navigator.sendBeacon?.("/menu/e", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // si prova con fetch
  }
  void fetch("/menu/e", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
}

// Una visita al giorno per dispositivo: riaprire il menù (anche da un'altra
// scheda o inquadrando di nuovo il QR) lo stesso giorno non conta di nuovo;
// il giorno dopo sì. Resta solo nel browser: al server non arriva nessun codice.
function firstTimeToday(key: string): boolean {
  const today = romeParts().day;
  try {
    if (localStorage.getItem(key) === today) return false;
    localStorage.setItem(key, today);
    return true;
  } catch {
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
    } catch {
      // niente memoria disponibile: si conta
    }
    return true;
  }
}

export function MenuStats() {
  const pathname = usePathname();

  useEffect(() => {
    if (isStaffDevice()) return;
    if (firstTimeToday("menu-stat-open")) track("open", pathname);
    const event = pathname.match(/^\/menu\/p\/([^/]+)/);
    if (event && firstTimeToday(`menu-stat-event-${event[1]}`)) track("event", document.title.split(" — ")[0] || event[1], event[1]);
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
