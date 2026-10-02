"use client";

import { useEffect, useState } from "react";

// «Abbinalo con»: il tocco sul riquadro sotto un piatto porta al vino e lo
// illumina; in basso resta «Torna a …» per tornare al piatto. Senza JavaScript
// il riquadro è un normale link all'ancora del vino.
// Porta la voce al centro dello schermo e la illumina; restituisce dove arriverà
// lo scorrimento (null se la voce non c'è).
function reveal(id: string): number | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  const landing = scrollY + box.top + box.height / 2 - innerHeight / 2;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("menu-found");
  void el.offsetWidth;
  el.classList.add("menu-found");
  return landing;
}

export function PairingBack() {
  const [from, setFrom] = useState<{ id: string; name: string; landing: number } | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const link = (e.target as Element | null)?.closest?.("a[data-pair-from]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const target = link.getAttribute("href")?.slice(1);
      const landing = target ? reveal(target) : null;
      if (landing === null) return;
      e.preventDefault();
      setFrom({ id: link.dataset.pairFrom ?? "", name: link.dataset.pairName ?? "", landing });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Se il cliente scorre lontano dal vino, il «Torna a …» non serve più. Si
  // comincia a controllare solo dopo l'arrivo sul vino (lo scorrimento è animato).
  useEffect(() => {
    if (!from) return;
    let arrived = false;
    const onScroll = () => {
      const distance = Math.abs(scrollY - from.landing);
      if (!arrived) arrived = distance < innerHeight * 0.5;
      else if (distance > innerHeight * 1.5) setFrom(null);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [from]);

  if (!from) return null;
  return (
    <button
      type="button"
      onClick={() => {
        reveal(`v-${from.id}`);
        setFrom(null);
      }}
      className="menu-sans fixed bottom-[max(22px,env(safe-area-inset-bottom))] left-5 z-20 flex min-h-11 max-w-[calc(100%-104px)] items-center gap-2 rounded-full border border-[#C9A96E]/70 bg-[#6B1020] px-4 text-[13px] text-[#F4EEE3] shadow-lg"
    >
      <span aria-hidden>←</span>
      <span className="truncate">Torna a «{from.name}»</span>
    </button>
  );
}
