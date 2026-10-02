"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { originLabel } from "@/lib/menu-format";
import { track } from "./stats";
import { WINE_TRAITS, traitLabel } from "@/lib/wine-traits";

export type SearchItem = {
  id: string;
  name: string;
  sub: string | null;
  grapes: string | null;
  region: string | null;
  country: string | null;
  description: string | null;
  section: string;
  group: string;
  kind: "WINE" | "FOOD";
  price: string;
  glass: boolean;
  enomatic: boolean;
  traits: string[];
  soldOut: boolean;
};

// Minuscolo e senza accenti: «Gewürz» si trova anche scrivendo «gewurz».
function norm(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function haystack(i: SearchItem): string {
  return norm([i.name, i.sub, i.grapes, i.region, i.country, i.description, i.group, i.section, ...i.traits.map(traitLabel)].filter(Boolean).join(" "));
}

const MAX_RESULTS = 40;

// Ricerca nel menù: per nome, zona, uvaggio e ingredienti, con due filtri rapidi.
// Scegliere un risultato chiude la ricerca e porta alla voce, evidenziandola.
export function MenuSearch({ items, onClose }: { items: SearchItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [glass, setGlass] = useState(false);
  const [enomatic, setEnomatic] = useState(false);
  // Filtri per caratteristica: solo quelle che almeno un vino ha.
  const [trait, setTrait] = useState<Set<string>>(() => new Set());
  const availableTraits = useMemo(() => WINE_TRAITS.filter((t) => items.some((i) => i.traits.includes(t.code))), [items]);
  const input = useRef<HTMLInputElement>(null);
  const index = useMemo(() => items.map((item) => ({ item, text: haystack(item) })), [items]);

  useEffect(() => {
    input.current?.focus();
    // Il menù dietro non scorre mentre la ricerca è aperta.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const active = tokens.length > 0 || glass || enomatic || trait.size > 0;
  const results = active
    ? index
        .filter(({ item, text }) => (!glass || item.glass) && (!enomatic || item.enomatic) && [...trait].every((c) => item.traits.includes(c)) && tokens.every((t) => text.includes(t)))
        .map(({ item }) => item)
    : [];

  // Statistiche: la parola cercata (una volta, alla fine) e il risultato scelto.
  const sentQuery = useRef(false);
  function sendQuery() {
    const q = query.trim();
    if (sentQuery.current || q.length < 2) return;
    sentQuery.current = true;
    track(results.length > 0 ? "search" : "search_empty", q);
  }
  const close = () => {
    sendQuery();
    onClose();
  };
  // Esc chiude (inviando anche la parola cercata): si riaggancia a ogni modifica.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function go(item: SearchItem) {
    sendQuery();
    track("pick", item.name, item.id);
    onClose();
    // Dopo la chiusura il menù torna a scorrere: si attende il frame successivo.
    requestAnimationFrame(() => {
      const el = document.getElementById(`v-${item.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("menu-found");
      void el.offsetWidth;
      el.classList.add("menu-found");
    });
  }

  const chip = (on: boolean) =>
    `menu-sans flex min-h-11 items-center rounded-full border px-4 text-[11px] font-medium uppercase tracking-[0.16em] ${
      on ? "menu-chip-active bg-[#6B1020] !text-[#F4EEE3]" : "menu-chip-idle-border !text-[#5B605A]"
    }`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Cerca nel menù" className="fixed inset-0 z-50 flex flex-col bg-[#F4EEE3]">
      <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Vino, vitigno, zona, piatto…"
          aria-label="Cerca nel menù"
          enterKeyHint="search"
          autoComplete="off"
          className="menu-sans min-h-12 min-w-0 flex-1 rounded-full border border-[#D9CEBC] bg-[#FBF7EF] px-5 text-[16px] text-[#1F2621] outline-none placeholder:text-[#8A8F88] focus:border-[#6B1020]"
        />
        <button
          type="button"
          onClick={close}
          className="menu-sans flex min-h-12 items-center px-1 text-[11px] font-medium uppercase tracking-[0.2em] !text-[#6B1020]"
        >
          Chiudi
        </button>
      </div>
      {/* Filtri su una riga che scorre di lato: con le caratteristiche dei vini possono essere sei. */}
      <div className="mx-auto flex w-full max-w-[720px] gap-2 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&>*]:shrink-0">
        <button type="button" aria-pressed={glass} onClick={() => setGlass((v) => !v)} className={chip(glass)}>
          Al calice
        </button>
        <button type="button" aria-pressed={enomatic} onClick={() => setEnomatic((v) => !v)} className={chip(enomatic)}>
          Enomatic
        </button>
        {availableTraits.map((t) => (
          <button
            key={t.code}
            type="button"
            aria-pressed={trait.has(t.code)}
            onClick={() =>
              setTrait((prev) => {
                const next = new Set(prev);
                if (next.has(t.code)) next.delete(t.code);
                else next.add(t.code);
                return next;
              })
            }
            className={chip(trait.has(t.code))}
          >
            {t.code === "NO_ADDED_SULFITES" ? "Senza solfiti" : t.short}
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-[720px] flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(24px,env(safe-area-inset-bottom))]" role="region" aria-live="polite">
        {!active && (
          <p className="mt-10 text-center text-[17px] italic leading-normal text-[#5B605A]">
            Scrivi il nome di un vino, un vitigno, una zona o un ingrediente.
          </p>
        )}
        {active && results.length === 0 && (
          <p className="mt-10 text-center text-[17px] italic leading-normal text-[#5B605A]">Nessun risultato. Prova con meno parole.</p>
        )}
        {active && results.length > 0 && (
          <>
            <p className="menu-sans mb-1 text-[11px] uppercase tracking-[0.2em] text-[#5B605A]">
              {results.length === 1 ? "1 risultato" : `${results.length} risultati`}
            </p>
            <ul className="m-0 list-none p-0">
              {results.slice(0, MAX_RESULTS).map((item) => (
                <li key={item.id} className="menu-rule-soft border-b">
                  <button type="button" onClick={() => go(item)} className="flex min-h-14 w-full items-baseline gap-3 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[18px] font-medium leading-tight text-[#1F2621]">{item.name}</span>
                      {(item.sub || item.region || item.country) && (
                        <span className="menu-sans block text-[13px] leading-snug text-[#4A504B]">
                          {[item.sub, originLabel(item, ", ")].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {item.traits.length > 0 && (
                        <span className="menu-sans block text-[12px] text-[#4A504B]">{item.traits.map(traitLabel).join(" · ")}</span>
                      )}
                      <span className="menu-sans block text-[11px] uppercase tracking-[0.16em] text-[#8A8F88]">
                        {item.section}
                        {item.soldOut ? " · esaurito" : ""}
                      </span>
                    </span>
                    <span className="menu-sans shrink-0 text-right text-[14px] font-medium text-[#6B1020]">{item.price}</span>
                  </button>
                </li>
              ))}
            </ul>
            {results.length > MAX_RESULTS && (
              <p className="mt-3 text-center text-[15px] italic text-[#5B605A]">Altri risultati: precisa la ricerca.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
