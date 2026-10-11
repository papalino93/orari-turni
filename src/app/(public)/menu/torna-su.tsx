"use client";

import { useEffect, useRef, useState } from "react";

// «Torna su» per le pagine lunghe senza la barra delle sezioni (la pagina di un evento con il suo menù):
// compare solo mentre si risale, dopo aver letto un bel po', e porta in cima con un tocco.
export function TornaSu() {
  const [show, setShow] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      const goingUp = y < lastY.current - 4;
      const goingDown = y > lastY.current + 4;
      if (goingUp || goingDown) lastY.current = y;
      if (y <= window.innerHeight * 0.9 || goingDown) setShow(false);
      else if (goingUp) setShow(true);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
      aria-label="Torna su"
      className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-5 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-[#C9A96E]/70 bg-[#6B1020] shadow-lg"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F4EEE3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
}
