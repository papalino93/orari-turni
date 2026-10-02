"use client";

import { useEffect, useState } from "react";
import { openStatus, type Hours, type OpenStatus } from "@/lib/menu-venue";

// «Aperto ora · chiude alle 22:00» / «Chiuso · riapre domani alle 16:30».
// Si calcola sull'orologio del telefono (ora di Roma), non sul server: la
// pagina è in cache, lo stato no. Prima del calcolo lo spazio resta riservato.
export function OpenStatusPill({ hours }: { hours: Hours }) {
  const [status, setStatus] = useState<OpenStatus | null | undefined>(undefined);

  useEffect(() => {
    const update = () => setStatus(openStatus(hours, new Date()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [hours]);

  if (!hours.showStatus) return null;
  return (
    <div className="menu-sans flex min-h-[26px] items-center justify-center" aria-live="polite">
      {status && (
        <span className="inline-flex items-center gap-2 rounded-full border border-[#B8955E]/50 bg-[#26040A]/40 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#F1E8DA]">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.open ? "bg-[#7FC48B]" : "bg-[#D98B8B]"}`} />
          {status.label}
        </span>
      )}
    </div>
  );
}
