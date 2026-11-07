"use client";

import { useEffect, useState } from "react";
import { promoNow, promoStatus } from "@/lib/menu-format";

type Props = { showFrom: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; dayKey: string };

// Bollino sulla scheda di «In evidenza»: «In corso» solo dentro l'orario dell'evento, prima
// «Stasera dalle 21:00». Si calcola sull'orologio del telefono (la pagina è in cache), come
// «Aperto ora» in copertina; finché non è calcolato, per gli eventi con orario non compare nulla.
export function PromoBadge({ dayKey, ...promo }: Props) {
  const [state, setState] = useState<{ live: boolean; from: string | null }>(() =>
    promo.startTime ? { live: false, from: null } : { live: promoStatus(promo, dayKey) === "live", from: null },
  );
  const { showFrom, startDate, endDate, startTime, endTime } = promo;

  useEffect(() => {
    const update = () => {
      const now = promoNow({ showFrom, startDate, endDate, startTime, endTime });
      setState((prev) => {
        const next = { live: now.status === "live", from: now.todayFrom };
        return prev.live === next.live && prev.from === next.from ? prev : next;
      });
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [showFrom, startDate, endDate, startTime, endTime]);

  if (!state.live && !state.from) return null;
  const evening = state.from !== null && state.from >= "17:00";
  return (
    <span className="menu-sans self-start rounded-full bg-[#6B1020] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#F4EEE3]">
      {state.live ? "In corso" : `${evening ? "Stasera" : "Oggi"} dalle ${state.from}`}
    </span>
  );
}
