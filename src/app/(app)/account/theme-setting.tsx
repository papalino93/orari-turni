"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";

export function ThemeSetting() {
  const { theme, auto, setTheme, followSystem } = useTheme();
  const [mounted, setMounted] = useState(false);
  // «Automatico»: nessuna scelta salvata, segue il telefono o il computer (prima, scelto una volta
  // Chiaro o Scuro, non si poteva più tornare indietro).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-detection per evitare mismatch di idratazione: il tema reale può differire da quello di partenza lato server
    setMounted(true);
  }, []);
  const opt = (on: boolean) => `min-h-10 rounded-full px-3.5 text-sm font-medium transition-colors ${on ? "bg-surface text-foreground" : "text-foreground-muted"}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">Aspetto</p>
        <p className="text-xs text-foreground-muted">«Automatico» segue il telefono o il computer.</p>
      </div>
      {mounted && (
        <div className="flex shrink-0 gap-1 rounded-full border border-border bg-surface-2 p-1">
          <button type="button" onClick={followSystem} aria-pressed={auto} title="Come il telefono o il computer" className={opt(auto)}>
            Automatico
          </button>
          <button type="button" onClick={() => setTheme("light")} aria-pressed={!auto && theme === "light"} className={opt(!auto && theme === "light")}>
            Chiaro
          </button>
          <button type="button" onClick={() => setTheme("dark")} aria-pressed={!auto && theme === "dark"} className={opt(!auto && theme === "dark")}>
            Scuro
          </button>
        </div>
      )}
    </div>
  );
}
