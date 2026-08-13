"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-detection per evitare mismatch di idratazione: il tema reale (letto da localStorage via script) può differire da quello di partenza lato server
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-7 w-[52px]" />;

  const isDark = theme === "dark";

  // Prima era una singola icona (sole quando il tema ERA scuro, per
  // indicare "premi per passare al chiaro"): un'icona sola cambia
  // significato a seconda di cosa rappresenta — lo stato attuale o
  // l'azione — e non è ovvio quale delle due sia senza leggere il tooltip
  // (invisibile al tocco). L'interruttore classico (pillola con pomello
  // che scorre fra un sole e una luna, come su qualunque altra app) mostra
  // sempre entrambi gli stati possibili: si legge a colpo d'occhio dove sta
  // il pomello ora, senza dover interpretare nulla.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Passa al tema chiaro" : "Passa al tema scuro"}
      title={isDark ? "Tema chiaro" : "Tema scuro"}
      className="relative flex h-7 w-[52px] shrink-0 items-center rounded-full border border-brand-band-border bg-black/25 transition-colors"
    >
      <SunIcon className="pointer-events-none absolute left-[7px] top-1/2 -translate-y-1/2 text-brand-band-foreground" />
      <MoonIcon className="pointer-events-none absolute right-[7px] top-1/2 -translate-y-1/2 text-brand-band-foreground" />
      <span
        aria-hidden
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-band-foreground text-brand-band shadow transition-transform duration-200 ${
          isDark ? "translate-x-[27px]" : "translate-x-[3px]"
        }`}
      >
        {isDark ? <MoonIcon solid /> : <SunIcon solid />}
      </span>
    </button>
  );
}

function SunIcon({ className, solid }: { className?: string; solid?: boolean }) {
  const size = solid ? 13 : 10;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.6 1.6M17.47 17.47l1.6 1.6M2 12h2.5M19.5 12H22M6.53 17.47l-1.6 1.6M19.07 4.93l-1.6 1.6" />
    </svg>
  );
}

function MoonIcon({ className, solid }: { className?: string; solid?: boolean }) {
  const size = solid ? 13 : 10;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
