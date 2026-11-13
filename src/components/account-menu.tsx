"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";

// Da tablet e computer: a destra della barra un solo pulsante col nome, che apre Impostazioni,
// tema, vista larga ed Esci. Prima erano cinque pulsanti in fila e con sei voci del menù il nome
// finiva tagliato («Accesso consul…»). Sul telefono la barra resta com'era.
export function AccountMenu({ userName, isAdmin, settingsActive, onSignOut }: { userName: string; isAdmin: boolean; settingsActive: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { theme, setTheme } = useTheme();
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo stato vero della vista larga è sull'<html>
    setWide(document.documentElement.getAttribute("data-wide") === "1");
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
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
  const itemBase = "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm hover:bg-surface-2";
  const item = `${itemBase} text-foreground`;

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account di ${userName}`}
        title={userName}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-11 items-center gap-2 rounded-full border border-brand-band-border pl-1 pr-2.5 transition-colors hover:text-brand-band-foreground ${
          open || settingsActive ? "bg-brand-band-active text-brand-band-foreground" : "text-brand-band-foreground-muted"
        }`}
      >
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-band-foreground/15 text-xs font-semibold text-brand-band-foreground">
          {initials}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm xl:block">{userName}</span>
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-2xl border border-border bg-surface p-2 text-foreground shadow-xl">
          <p className="truncate px-3 pb-2 pt-1.5 text-xs text-foreground-muted">
            Entrato come <span className="font-medium text-foreground">{userName}</span>
          </p>
          {isAdmin && (
            <Link href="/account" onClick={() => setOpen(false)} className={item}>
              <span className="flex items-center gap-2.5">
                <GearIcon /> Impostazioni
              </span>
              <span aria-hidden className="text-foreground-muted">›</span>
            </Link>
          )}
          <button type="button" role="switch" aria-checked={isDark} onClick={() => setTheme(isDark ? "light" : "dark")} className={item}>
            <span className="flex items-center gap-2.5">
              <MoonIcon /> Tema scuro
            </span>
            <Switch on={isDark} />
          </button>
          <button type="button" role="switch" aria-checked={wide} onClick={toggleWide} className={`${item} max-lg:hidden`}>
            <span className="flex items-center gap-2.5">
              <WideIcon /> Vista larga
            </span>
            <Switch on={wide} />
          </button>
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
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} />
    </span>
  );
}

const icon = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function GearIcon() {
  return (
    <svg {...icon}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
