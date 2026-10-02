"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { resetSoldOut, setSoldOut, undoChange } from "../actions";

export type ServiceItem = {
  id: string;
  name: string;
  sub: string | null;
  place: string;
  group: string;
  kind: "WINE" | "FOOD";
  price: string;
  soldOut: boolean;
};

type Filter = "all" | "wine" | "food" | "sold";

function norm(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tutto" },
  { value: "wine", label: "Vini" },
  { value: "food", label: "Piatti" },
  { value: "sold", label: "Esauriti" },
];

export function ServiceView({ items }: { items: ServiceItem[] }) {
  const toast = useToast();
  const [sold, setSold] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.id, i.soldOut])));
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmReset, setConfirmReset] = useState(false);
  const [awake, setAwake] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Altezza della barra fissa (ricerca e filtri): le intestazioni di sezione si fermano sotto di lei.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(112);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(Math.round(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const soldCount = items.filter((i) => sold[i.id]).length;

  // Schermo sempre acceso finché si è in servizio (dove il telefono lo permette).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let active = true;
    async function acquire() {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (!wl || document.visibilityState !== "visible") return;
        lock = await wl.request("screen");
        if (active) setAwake(true);
      } catch {
        setAwake(false);
      }
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const visible = useMemo(
    () =>
      items.filter((i) => {
        if (filter === "wine" && i.kind !== "WINE") return false;
        if (filter === "food" && i.kind !== "FOOD") return false;
        if (filter === "sold" && !sold[i.id]) return false;
        if (tokens.length === 0) return true;
        const hay = norm(`${i.name} ${i.sub ?? ""} ${i.group} ${i.place}`);
        return tokens.every((t) => hay.includes(t));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tokens deriva da query
    [items, filter, sold, query],
  );
  const places = useMemo(() => {
    const out: { place: string; rows: ServiceItem[] }[] = [];
    for (const i of visible) {
      const last = out[out.length - 1];
      if (last && last.place === i.place) last.rows.push(i);
      else out.push({ place: i.place, rows: [i] });
    }
    return out;
  }, [visible]);

  async function toggle(item: ServiceItem) {
    if (pending[item.id]) return;
    const next = !sold[item.id];
    setSold((s) => ({ ...s, [item.id]: next }));
    setPending((p) => ({ ...p, [item.id]: true }));
    try {
      navigator.vibrate?.(12);
    } catch {
      // Vibrazione non disponibile: nessun problema.
    }
    try {
      const res = await setSoldOut(item.id, next);
      if (!res.ok) throw new Error(res.error);
      const changeId = res.data.changeId;
      toast.showSuccess(
        next ? `«${item.name}» esaurito` : `«${item.name}» di nuovo disponibile`,
        changeId
          ? {
              label: "Annulla",
              onClick: () => {
                setSold((s) => ({ ...s, [item.id]: !next }));
                void undoChange(changeId).then((r) => {
                  if (!r.ok) {
                    setSold((s) => ({ ...s, [item.id]: next }));
                    toast.showError(r.error);
                  }
                });
              },
            }
          : undefined,
      );
    } catch (error) {
      setSold((s) => ({ ...s, [item.id]: !next }));
      toast.showError(error instanceof Error && error.message ? error.message : "Non salvato: controlla la connessione e riprova.");
    } finally {
      setPending((p) => ({ ...p, [item.id]: false }));
    }
  }

  async function reset() {
    if (soldCount === 0) return;
    if (!confirmReset) {
      setConfirmReset(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setConfirmReset(false), 5000);
      return;
    }
    setConfirmReset(false);
    const before = { ...sold };
    setSold(Object.fromEntries(items.map((i) => [i.id, false])));
    try {
      const res = await resetSoldOut();
      if (!res.ok) throw new Error(res.error);
      const changeId = res.data.changeId;
      toast.showSuccess(
        "Tutte le voci sono di nuovo disponibili",
        changeId
          ? {
              label: "Annulla",
              onClick: () => {
                setSold(before);
                void undoChange(changeId).then((r) => {
                  if (!r.ok) {
                    setSold(Object.fromEntries(items.map((i) => [i.id, false])));
                    toast.showError(r.error);
                  }
                });
              },
            }
          : undefined,
      );
    } catch (error) {
      setSold(before);
      toast.showError(error instanceof Error && error.message ? error.message : "Non salvato: controlla la connessione e riprova.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl" style={{ ["--svc-h" as string]: `${headerHeight}px` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Servizio</h1>
          <p className="text-xs text-foreground-muted" aria-live="polite">
            {soldCount === 0 ? "Niente di esaurito" : soldCount === 1 ? "1 voce esaurita" : `${soldCount} voci esaurite`}
            {awake ? " · schermo sempre acceso" : ""}
          </p>
        </div>
        <Link
          href="/gestione-menu"
          className="flex min-h-11 shrink-0 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
        >
          Esci dal servizio
        </Link>
      </div>

      <div
        ref={headerRef}
        className="sticky top-[calc(4.25rem+env(safe-area-inset-top))] z-20 -mx-4 mt-3 border-b border-border bg-background/95 px-4 pb-2.5 pt-2 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un vino o un piatto…"
          aria-label="Cerca nell'elenco del servizio"
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-12 w-full rounded-2xl border border-border bg-surface px-5 text-lg text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-accent"
        />
        <div role="tablist" aria-label="Cosa mostrare" className="mt-2 grid grid-cols-4 gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-11 rounded-xl border px-1 text-sm font-semibold ${
                filter === f.value ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground-muted hover:border-accent"
              }`}
            >
              {f.label}
              {f.value === "sold" && soldCount > 0 ? ` (${soldCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-base text-foreground-muted">
          {filter === "sold" && tokens.length === 0 ? "Niente di esaurito." : "Nessuna voce trovata."}
        </p>
      ) : (
        places.map(({ place, rows }) => (
          <section key={place} aria-label={place} className="mt-4">
            <h2 className="sticky top-[calc(4.25rem+env(safe-area-inset-top)+var(--svc-h))] z-10 -mx-4 bg-background/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted sm:-mx-6 sm:px-6">
              {place}
            </h2>
            <ul className="divide-y divide-border">
              {rows.map((item) => {
                const isSold = sold[item.id];
                return (
                  <li key={item.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={`break-words text-lg font-semibold leading-snug ${isSold ? "text-foreground-muted line-through" : "text-foreground"}`}>
                        {item.name}
                      </p>
                      {item.sub && <p className="line-clamp-2 text-sm text-foreground-muted">{item.sub}</p>}
                      <p className="text-sm text-foreground-muted/90">
                        {item.group} · {item.price}
                      </p>
                    </div>
                    <div className="flex w-[84px] shrink-0 flex-col items-center gap-1">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isSold}
                        aria-label={`${item.name}: esaurito`}
                        disabled={pending[item.id]}
                        onClick={() => toggle(item)}
                        className={`relative h-10 w-[72px] rounded-full border-2 transition-colors disabled:opacity-60 ${
                          isSold ? "border-danger bg-danger" : "border-border bg-surface-2"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${isSold ? "left-[36px]" : "left-1"}`}
                        />
                      </button>
                      <span className={`text-[11px] font-semibold uppercase tracking-wide ${isSold ? "text-danger" : "text-foreground-muted"}`}>
                        {isSold ? "Esaurito" : "Disponibile"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {soldCount > 0 && (
          <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mt-6 flex justify-center md:bottom-6">
          <button
            type="button"
            onClick={reset}
            disabled={soldCount === 0}
            className={`min-h-14 rounded-full px-6 text-base font-semibold shadow-xl transition-colors disabled:opacity-40 ${
              confirmReset ? "bg-danger text-white" : "border border-border bg-surface text-foreground"
            }`}
          >
            {confirmReset ? `Confermi? Riattiva ${soldCount} ${soldCount === 1 ? "voce" : "voci"}` : "Riattiva tutto"}
          </button>
        </div>
      )}
    </div>
  );
}
