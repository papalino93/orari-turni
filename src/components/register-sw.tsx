"use client";

import { useEffect } from "react";

// Registra il service worker "vuoto" (vedi public/sw.js) — solo per
// abilitare il suggerimento automatico "Installa app" di Chrome su Android.
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // non critico: l'app funziona comunque, resta solo meno probabile
        // il suggerimento automatico di installazione su Android
      });
    }
  }, []);

  return null;
}
