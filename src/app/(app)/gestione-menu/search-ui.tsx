"use client";

import { useMemo, useState } from "react";
import { formatPrice, wineDetail } from "@/lib/menu-format";
import type { EditorItem, EditorSection } from "./menu-editor";

function norm(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function priceText(item: EditorItem, kind: "WINE" | "FOOD"): string {
  if (item.variants) return item.variants.map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ");
  if (kind === "FOOD") return item.priceCents === null ? "" : `€ ${formatPrice(item.priceCents)}`;
  const parts: string[] = [];
  if (item.priceGlassCents !== null) parts.push(`Calice ${formatPrice(item.priceGlassCents)}`);
  if (item.priceBottleCents !== null) parts.push(`Bottiglia ${formatPrice(item.priceBottleCents)}`);
  return parts.join(" · ");
}

// Cerca una voce in tutto il menù (fisso, eventi, oggi) e la segna esaurita con
// un tocco, senza scorrere le sezioni. Toccando il nome si apre la modifica.
export function ItemSearch({
  sections,
  isSold,
  onToggleSold,
  onEdit,
}: {
  sections: EditorSection[];
  isSold: (item: EditorItem) => boolean;
  onToggleSold: (item: EditorItem) => void;
  onEdit: (item: EditorItem, groupId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      sections.flatMap((s) =>
        s.groups.flatMap((g) =>
          g.items.map((item) => ({
            item,
            groupId: g.id,
            kind: s.kind,
            place: s.dailyOnly ? "Oggi fuori menù" : s.title,
            text: norm([item.name, item.wineName, item.denomination, item.vintage, item.sub, item.grapes, item.region, item.country, item.description, g.title].filter(Boolean).join(" ")),
          })),
        ),
      ),
    [sections],
  );
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const found = tokens.length > 0 ? rows.filter((r) => tokens.every((t) => r.text.includes(t))) : [];

  return (
    <section aria-label="Cerca una voce" className="mb-5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca una voce del menù…"
        aria-label="Cerca una voce"
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-12 w-full rounded-full border border-border bg-surface px-5 text-base text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-accent sm:text-sm"
      />
      {tokens.length > 0 && (
        <div className="mt-2 rounded-2xl border border-border bg-surface px-4 py-1" role="region" aria-live="polite">
          {found.length === 0 ? (
            <p className="py-3 text-sm text-foreground-muted">Nessuna voce trovata.</p>
          ) : (
            <ul className="divide-y divide-border">
              {found.slice(0, 20).map(({ item, groupId, kind, place }) => {
                const sold = isSold(item);
                return (
                  <li key={item.id} className="flex items-center gap-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onEdit(item, groupId)}
                      aria-label={`Modifica ${item.name}`}
                      className="min-h-12 min-w-0 flex-1 text-left"
                    >
                      <span className={`block line-clamp-2 break-words text-sm font-medium ${sold ? "text-foreground-muted line-through" : "text-foreground"}`}>
                        {item.name}
                      </span>
                      {/* Per i vini il nome proprio e la denominazione: «Aquila del Torre» c'è tre volte. */}
                      {kind === "WINE" && (item.wineName || wineDetail(item)) && (
                        <span className="block truncate text-xs text-foreground">{[item.wineName, wineDetail(item)].filter(Boolean).join(" · ")}</span>
                      )}
                      <span className="block text-xs text-foreground-muted">
                        {place} · {priceText(item, kind)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={sold}
                      aria-label={`${sold ? "Di nuovo disponibile" : "Segna esaurita"}: ${item.name}`}
                      onClick={() => onToggleSold(item)}
                      className={`min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                        sold ? "border-danger bg-danger text-white" : "border-border text-foreground-muted hover:border-danger hover:text-danger"
                      }`}
                    >
                      Esaurito
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {found.length > 20 && <p className="py-2 text-xs text-foreground-muted">Altre voci: precisa la ricerca.</p>}
        </div>
      )}
    </section>
  );
}
