"use client";

import { useEffect, useState } from "react";

// «Vista larga», solo da computer: le pagine usano tutta la larghezza dello schermo
// e lasciano meno spazio vuoto ai lati. Si ricorda sul dispositivo (come il tema).
export function WideToggle() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo stato vero è sull'<html> (impostato dallo script iniziale): si legge solo dopo il montaggio
    setWide(document.documentElement.getAttribute("data-wide") === "1");
  }, []);

  if (wide === null) return <div className="hidden h-11 w-11 lg:block" />;

  function toggle() {
    const next = !wide;
    setWide(next);
    if (next) document.documentElement.setAttribute("data-wide", "1");
    else document.documentElement.removeAttribute("data-wide");
    try {
      localStorage.setItem("wide", next ? "1" : "0");
    } catch {}
  }

  return (
    <button
      type="button"
      aria-pressed={wide}
      onClick={toggle}
      aria-label={wide ? "Torna alla vista normale" : "Vista larga: usa tutto lo schermo"}
      title={wide ? "Vista normale" : "Vista larga"}
      className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors lg:flex ${
        wide
          ? "border-brand-band-foreground bg-brand-band-foreground/15 text-brand-band-foreground"
          : "border-brand-band-border text-brand-band-foreground-muted hover:text-brand-band-foreground"
      }`}
    >
      {wide ? <CollapseIcon /> : <ExpandIcon />}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}
