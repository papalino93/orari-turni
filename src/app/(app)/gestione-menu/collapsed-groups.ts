"use client";

import { useSyncExternalStore } from "react";

// Gruppi chiusi nella gestione (es. «Champagne», «Metodo classico»): una comodità
// di chi usa quel telefono o computer, quindi resta solo nel suo browser.
const KEY = "gestione-menu:gruppi-chiusi";
const EVENT = "gestione-menu:gruppi-chiusi";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, [...ids].join(","));
  } catch {
    // Senza memoria del browser (es. navigazione privata) il gruppo si chiude lo stesso finché resti sulla pagina.
  }
  memory = [...ids].join(",");
  window.dispatchEvent(new Event(EVENT));
}

// Copia in memoria: vale anche quando localStorage non si può usare.
let memory: string | null = null;

export function useCollapsedGroups() {
  // Sul server (e al primo disegno) tutti i gruppi sono aperti.
  const raw = useSyncExternalStore(subscribe, () => memory ?? read(), () => "");
  const closed = new Set(raw ? raw.split(",") : []);
  return {
    isClosed: (id: string) => closed.has(id),
    toggle: (id: string) => {
      const next = new Set(closed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(next);
    },
    setMany: (ids: string[], close: boolean) => {
      const next = new Set(closed);
      for (const id of ids) {
        if (close) next.add(id);
        else next.delete(id);
      }
      write(next);
    },
  };
}
