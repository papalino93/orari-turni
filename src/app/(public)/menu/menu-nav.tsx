"use client";

import { useEffect, useRef, useState } from "react";

type Chip = { id: string; label: string };

// Barra delle sezioni fissa in alto: evidenzia la sezione in vista mentre si
// scorre e tiene visibile il chip attivo quando la barra non entra tutta.
export function MenuNav({ chips }: { chips: Chip[] }) {
  const [active, setActive] = useState(chips[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    function onScroll() {
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

  return (
    <nav
      ref={navRef}
      aria-label="Sezioni del menù"
      className="sticky top-0 z-10 flex gap-[22px] overflow-x-auto border-b bg-[#F4EEE3] px-[22px] [justify-content:safe_center] [scrollbar-width:none]"
    >
      {chips.map((chip) => {
        const isActive = chip.id === active;
        return (
          <a
            key={chip.id}
            href={`#${chip.id}`}
            data-chip={chip.id}
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
  );
}
