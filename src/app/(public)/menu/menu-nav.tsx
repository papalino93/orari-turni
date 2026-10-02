"use client";

import { useEffect, useRef, useState } from "react";
import { MenuSearch, type SearchItem } from "./menu-search";

type Chip = { id: string; label: string };

const TEXT_KEY = "menu-text-large";

// Barra delle sezioni fissa in alto: evidenzia la sezione in vista mentre si
// scorre e tiene visibile il chip attivo quando la barra non entra tutta. A
// destra, due strumenti discreti: ricerca e testo più grande. Più «Torna su».
export function MenuNav({ chips, items }: { chips: Chip[]; items: SearchItem[] }) {
  const [active, setActive] = useState(chips[0]?.id ?? "");
  const [searching, setSearching] = useState(false);
  const [large, setLarge] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > window.innerHeight * 1.2);
      let current = chips[0]?.id ?? "";
      for (const chip of chips) {
        const el = document.getElementById(chip.id);
        if (el && el.getBoundingClientRect().top < 120) current = chip.id;
      }
      // In fondo alla pagina l'ultima sezione può essere troppo corta per
      // arrivare in alto: si considera comunque quella in vista.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      if (atBottom && chips.length) current = chips[chips.length - 1].id;
      if (current === activeRef.current) return;
      activeRef.current = current;
      setActive(current);
      const nav = navRef.current;
      const el = nav?.querySelector<HTMLElement>(`[data-chip="${current}"]`);
      if (nav && el) nav.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [chips]);

  // Testo grande: scelta ricordata su questo telefono.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEXT_KEY) === "1";
      document.documentElement.toggleAttribute("data-menu-large", saved);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura una tantum del dato salvato nel browser
      setLarge(saved);
    } catch {
      // Memoria del browser non disponibile: il testo resta normale.
    }
  }, []);

  function toggleLarge() {
    const next = !large;
    setLarge(next);
    document.documentElement.toggleAttribute("data-menu-large", next);
    try {
      localStorage.setItem(TEXT_KEY, next ? "1" : "0");
    } catch {
      // Niente memoria: vale solo per questa visita.
    }
  }

  const tool =
    "menu-sans flex h-12 min-w-11 flex-none items-center justify-center bg-[#F4EEE3] px-3 text-[#5B605A] transition-colors hover:text-[#6B1020]";

  return (
    <>
      <div className="sticky top-0 z-10 flex border-b bg-[#F4EEE3]">
        <div className="relative flex min-w-0 flex-1">
        <nav
          ref={navRef}
          aria-label="Sezioni del menù"
          className="flex min-w-0 flex-1 gap-[22px] overflow-x-auto px-[22px] [justify-content:safe_center] [scrollbar-width:none]"
        >
          {chips.map((chip) => {
            const isActive = chip.id === active;
            return (
              <a
                key={chip.id}
                href={`#${chip.id}`}
                data-chip={chip.id}
                data-stat-k="section"
                data-stat-l={chip.label}
                aria-current={isActive ? "true" : undefined}
                className={`menu-sans flex min-h-12 flex-none items-center whitespace-nowrap border-b pb-[15px] pt-[17px] text-xs font-medium uppercase tracking-[0.16em] no-underline transition-colors ${
                  isActive ? "menu-chip-active !text-[#6B1020]" : "menu-chip-idle !text-[#5B605A]"
                }`}
              >
                {chip.label}
              </a>
            );
          })}
        </nav>
        {/* Sfumatura a destra: fa capire che la barra delle sezioni scorre. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#F4EEE3] to-transparent" />
        </div>
        <button type="button" onClick={toggleLarge} aria-pressed={large} aria-label="Testo più grande" title="Testo più grande" className={`${tool} text-[15px] font-medium`}>
          <span aria-hidden>
            A<span className="text-[11px]">A</span>
          </span>
        </button>
        <button type="button" onClick={() => setSearching(true)} aria-label="Cerca nel menù" title="Cerca" className={`${tool} pr-4`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
        </button>
      </div>
      {searching && <MenuSearch items={items} onClose={() => setSearching(false)} />}
      {showTop && !searching && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Torna su"
          className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-5 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-[#C9A96E]/70 bg-[#6B1020] shadow-lg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F4EEE3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </>
  );
}
