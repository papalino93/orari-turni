"use client";

import type { ReactNode } from "react";
import { n } from "@/lib/mail-rubrica";
import { useMail, type Tab } from "./mail-store";

// Le tre schede della pagina Mail. Tutte restano montate (nascoste quando non servono): passando
// da una all'altra non si perde il messaggio a metà né la ricerca nella rubrica.
export function MailTabs({ scrivi, rubrica, invii }: { scrivi: ReactNode; rubrica: ReactNode; invii: ReactNode }) {
  const { tab, setTab, contactCount } = useMail();
  const tabs: { id: Tab; label: string; hint: string }[] = [
    { id: "scrivi", label: "Scrivi", hint: "Una mail a tante persone" },
    { id: "rubrica", label: "Rubrica", hint: contactCount === 1 ? "1 contatto" : `${n(contactCount)} contatti` },
    { id: "invii", label: "Invii", hint: "Com'è andata" },
  ];
  const panels: Record<Tab, ReactNode> = { scrivi, rubrica, invii };
  return (
    <>
      <div
        role="tablist"
        aria-label="Parti della pagina Mail"
        className="mb-6 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1"
        onKeyDown={(e) => {
          const i = tabs.findIndex((t) => t.id === tab);
          const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
          if (next === null) return;
          e.preventDefault();
          const t = tabs[(next + tabs.length) % tabs.length];
          setTab(t.id);
          document.getElementById(`mail-scheda-${t.id}`)?.focus();
        }}
      >
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              id={`mail-scheda-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`mail-pannello-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center transition-colors ${
                on ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              <span className="text-sm font-semibold leading-tight">{t.label}</span>
              <span className={`mt-0.5 max-w-full truncate text-[11px] leading-tight ${t.id === "rubrica" ? "" : "hidden sm:block"}`}>{t.hint}</span>
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`mail-pannello-${t.id}`} role="tabpanel" aria-labelledby={`mail-scheda-${t.id}`} hidden={tab !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </>
  );
}
