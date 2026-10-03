"use client";

import { useEffect } from "react";
import { STAFF_DEVICE_KEY } from "@/app/(public)/menu/stats";

// Chi entra nell'app (titolare, dipendenti) segna il proprio browser: da lì in
// poi le statistiche del menù non contano le sue aperture, anche a sessione scaduta.
export function StaffDeviceMark() {
  useEffect(() => {
    try {
      localStorage.setItem(STAFF_DEVICE_KEY, "1");
    } catch {
      // memoria del browser non disponibile: resta il controllo del server
    }
  }, []);
  return null;
}
