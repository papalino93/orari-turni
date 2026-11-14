"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
// followSystem: torna a seguire il telefono o il computer (tema scelto dimenticato).
type ThemeContextValue = { theme: Theme; auto: boolean; setTheme: (t: Theme) => void; followSystem: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);
  // Nessuna scelta salvata: segue il telefono o il computer.
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la scelta salvata si legge solo nel browser
      setAuto(saved !== "light" && saved !== "dark");
    } catch {
      /* niente memoria del browser */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function setTheme(t: Theme) {
    localStorage.setItem("theme", t);
    setThemeState(t);
    setAuto(false);
  }
  function followSystem() {
    localStorage.removeItem("theme");
    setAuto(true);
    setThemeState(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }

  return <ThemeContext.Provider value={{ theme, auto, setTheme, followSystem }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
