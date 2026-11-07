"use client";

import { useEffect } from "react";

// «A+» del menù (testo più grande): la scelta salvata vale anche qui, anche aprendo il link
// direttamente (da Google o dal messaggio). Vedi menu-nav.tsx e menu.css (.menu-prenota).
const TEXT_KEY = "menu-text-large";

export function LargeText() {
  useEffect(() => {
    try {
      document.documentElement.toggleAttribute("data-menu-large", localStorage.getItem(TEXT_KEY) === "1");
    } catch {
      // Memoria del browser non disponibile: il testo resta normale.
    }
  }, []);
  return null;
}
