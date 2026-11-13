"use client";

// Pannello «Richieste» (a destra sul computer, dal basso su telefono e tablet) e il menù «⋯».

import { useEffect, useId, useRef, useState } from "react";
import { useBackdropClose } from "@/lib/use-backdrop-close";
import { DotsIcon } from "./lists";

export function SidePanel({ title, subtitle, onClose, children, testId }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; testId?: string }) {
  const backdrop = useBackdropClose(onClose);
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Esc chiude il pannello solo se non c'è un foglio aperto sopra (una prenotazione aperta dal pannello).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll("[role=dialog], [role=alertdialog]");
      if (dialogs[dialogs.length - 1] === ref.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    // Il fuoco va nel pannello (lettori di schermo e tastiera), e torna dov'era alla chiusura.
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] lg:bg-black/25" {...backdrop}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl border border-border bg-background shadow-2xl outline-none motion-safe:animate-[panel-up_220ms_ease-out] lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[440px] lg:rounded-none lg:rounded-l-3xl lg:motion-safe:animate-[panel-left_220ms_ease-out]"
      >
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border lg:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-3 lg:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-foreground-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-2 hover:text-foreground"
          >
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

export type MenuItem =
  | { kind?: "item"; label: string; hint?: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; testId?: string }
  | { kind: "link"; label: string; hint?: string; icon?: React.ReactNode; href: string; external?: boolean }
  | { kind: "header"; node: React.ReactNode }
  | { kind: "separator" };

// Il pulsante «⋯» con il suo menù a tendina (si chiude con Esc, toccando fuori o scegliendo).
export function MoreMenu({ label, items, align = "right", small = false }: { label: string; items: MenuItem[]; align?: "right" | "left"; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // La prima voce prende il fuoco (frecce su e giù per muoversi).
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
  }
  const row = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";
  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex shrink-0 items-center justify-center rounded-full bg-surface text-foreground ring-1 ring-inset ring-border hover:ring-accent ${small ? "h-10 w-10" : "h-11 w-11"} ${open ? "ring-accent" : ""}`}
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`absolute top-[calc(100%+0.4rem)] z-40 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-raised)] motion-safe:animate-[menu-in_140ms_ease-out] ${align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
        >
          {items.map((it, i) => {
            if (it.kind === "separator") return <div key={i} role="separator" className="mx-2 my-1 h-px bg-border" />;
            if (it.kind === "header") return <div key={i}>{it.node}</div>;
            const body = (
              <>
                {it.icon && <span className="flex w-5 shrink-0 justify-center text-foreground-muted">{it.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${"danger" in it && it.danger ? "text-danger" : ""}`}>{it.label}</span>
                  {it.hint && <span className="block text-xs text-foreground-muted">{it.hint}</span>}
                </span>
              </>
            );
            if (it.kind === "link")
              return (
                <a key={i} role="menuitem" href={it.href} target={it.external ? "_blank" : undefined} rel={it.external ? "noopener noreferrer" : undefined} onClick={() => setOpen(false)} className={row}>
                  {body}
                  {it.external && <span aria-hidden className="text-foreground-muted">↗</span>}
                </a>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                data-testid={it.testId}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={row}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
