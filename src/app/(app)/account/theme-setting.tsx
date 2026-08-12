"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";

export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-detection per evitare mismatch di idratazione: il tema reale può differire da quello di partenza lato server
    setMounted(true);
  }, []);

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">Aspetto</p>
        <p className="text-xs text-foreground-muted">Scuro di default, puoi passare a chiaro quando vuoi.</p>
      </div>
      {mounted && (
        <div className="flex gap-1 rounded-full border border-border bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              theme === "dark" ? "bg-surface text-foreground" : "text-foreground-muted"
            }`}
          >
            Scuro
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              theme === "light" ? "bg-surface text-foreground" : "text-foreground-muted"
            }`}
          >
            Chiaro
          </button>
        </div>
      )}
    </div>
  );
}
