"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";

// A destra della barra: tema chiaro/scuro e vista larga (computer) a un tocco, poi il tondino con la
// foto (dalla scheda in Dipendenti) o le iniziali e la freccina: apre «Entrato come…», Impostazioni ed Esci.
// Il nome non sta più nella barra: si guadagna spazio per le voci del menù.
export function AccountMenu({
  userName,
  photoUrl = null,
  isAdmin,
  settingsActive,
  onSignOut,
}: {
  userName: string;
  photoUrl?: string | null;
  isAdmin: boolean;
  settingsActive: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { theme, setTheme } = useTheme();
  const [wide, setWide] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo stato vero della vista larga è sull'<html>
    setWide(document.documentElement.getAttribute("data-wide") === "1");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleWide() {
    const next = !wide;
    setWide(next);
    if (next) document.documentElement.setAttribute("data-wide", "1");
    else document.documentElement.removeAttribute("data-wide");
    try {
      localStorage.setItem("wide", next ? "1" : "0");
    } catch {}
  }

  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const isDark = theme === "dark";
  const itemBase =
    "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm hover:bg-surface-2";
  const item = `${itemBase} text-foreground`;

  const quick =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-band-border text-brand-band-foreground-muted transition-colors hover:text-brand-band-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label="Tema chiaro o scuro"
        title="Tema chiaro o scuro"
        className={quick}
      >
        {/* Le due icone ci sono sempre: il tema lo sa solo il browser, così server e pagina combaciano. */}
        <span className="dark:hidden">
          <MoonIcon />
        </span>
        <span className="hidden dark:inline">
          <SunIcon />
        </span>
      </button>
      <button
        type="button"
        onClick={toggleWide}
        aria-pressed={wide}
        aria-label="Vista larga"
        title={wide ? "Vista normale" : "Vista larga: usa tutto lo schermo"}
        className={`${quick} max-lg:hidden ${wide ? "bg-brand-band-active text-brand-band-foreground" : ""}`}
      >
        <WideIcon />
      </button>
      <div ref={box} className="relative">
        <button
          ref={button}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Account di ${userName}`}
          title={userName}
          onClick={() => setOpen((v) => !v)}
          className={`flex h-11 items-center gap-1.5 rounded-full border border-brand-band-border pl-1 pr-2 transition-colors hover:text-brand-band-foreground ${
            open || settingsActive
              ? "bg-brand-band-active text-brand-band-foreground"
              : "text-brand-band-foreground-muted"
          }`}
        >
          {photoUrl && !photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto piccola già ridotta dal server
            <img
              src={photoUrl}
              alt=""
              onError={() => setPhotoFailed(true)}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-band-foreground/15 text-xs font-semibold text-brand-band-foreground"
            >
              {initials}
            </span>
          )}
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-2xl border border-border bg-surface p-2 text-foreground shadow-xl">
            <p className="truncate px-3 pb-2 pt-1.5 text-xs text-foreground-muted">
              Entrato come{" "}
              <span className="font-medium text-foreground">{userName}</span>
            </p>
            {isAdmin && (
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className={item}
              >
                <span className="flex items-center gap-2.5">
                  <GearIcon /> Impostazioni
                </span>
                <span aria-hidden className="text-foreground-muted">
                  ›
                </span>
              </Link>
            )}
            <div className="my-1.5 border-t border-border" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={`${itemBase} text-danger`}
            >
              <span className="flex items-center gap-2.5">
                <ExitIcon /> Esci
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const icon = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function GearIcon() {
  return (
    <svg {...icon}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg {...icon}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg {...icon}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function WideIcon() {
  return (
    <svg {...icon}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}
function ExitIcon() {
  return (
    <svg {...icon}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
