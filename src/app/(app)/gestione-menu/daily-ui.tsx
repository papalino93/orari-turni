"use client";

import { useState } from "react";
import { allergenState } from "@/lib/allergens";
import { formatPrice, formatPromoDay } from "@/lib/menu-format";
import { deleteItem, reproposeItem } from "./actions";
import type { EditorItem, EditorSection, RunFn } from "./menu-editor";

export type DailyRecent = { id: string; name: string; kind: "WINE" | "FOOD"; day: string; summary: string };
export type DailyData = { sections: EditorSection[]; recent: DailyRecent[] };

function summary(item: EditorItem, kind: "WINE" | "FOOD"): string {
  if (item.variants) return item.variants.map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ");
  if (kind === "FOOD") return item.priceCents === null ? "" : `€ ${formatPrice(item.priceCents)}`;
  const parts: string[] = [];
  if (item.priceGlassCents !== null) parts.push(`Calice ${formatPrice(item.priceGlassCents)}`);
  if (item.priceBottleCents !== null) parts.push(`Bottiglia ${formatPrice(item.priceBottleCents)}`);
  return parts.join(" · ");
}

// «Oggi fuori menù»: piatti e vini solo di oggi, a due tocchi dal telefono. Spariscono
// da soli alle 5:00; «Riproponi» ripresenta quelli dei giorni scorsi.
export function DailyPanel({
  daily,
  run,
  onAdd,
  onEdit,
}: {
  daily: DailyData;
  run: RunFn;
  onAdd: (groupId: string) => void;
  onEdit: (item: EditorItem, groupId: string) => void;
}) {
  const [showRecent, setShowRecent] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = daily.sections.flatMap((s) =>
    s.groups.flatMap((g) => g.items.map((item) => ({ item, kind: s.kind, groupId: g.id }))),
  );
  const firstGroup = (kind: "WINE" | "FOOD") => daily.sections.find((s) => s.kind === kind)?.groups[0]?.id ?? null;
  const foodGroup = firstGroup("FOOD");
  const wineGroup = firstGroup("WINE");

  async function remove(item: EditorItem) {
    setBusyId(item.id);
    await run(() => deleteItem(item.id), `«${item.name}» tolto da oggi`);
    setBusyId(null);
  }

  async function repropose(r: DailyRecent) {
    setBusyId(r.id);
    await run(() => reproposeItem(r.id), `«${r.name}» riproposto per oggi`);
    setBusyId(null);
  }

  return (
    <section aria-label="Oggi fuori menù" className="mb-5 rounded-2xl border border-gold/30 bg-gold/[0.04] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gold">Oggi fuori menù</p>
          <p className="text-[11px] text-foreground-muted">Solo per oggi: spariscono da soli alle 5:00.</p>
        </div>
        <div className="flex gap-2">
          {foodGroup && (
            <button
              type="button"
              onClick={() => onAdd(foodGroup)}
              className="min-h-10 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              + Piatto
            </button>
          )}
          {wineGroup && (
            <button
              type="button"
              onClick={() => onAdd(wineGroup)}
              className="min-h-10 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              + Vino
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-foreground-muted">Niente di speciale oggi. Aggiungi un piatto o un vino del giorno.</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {rows.map(({ item, kind, groupId }) => (
            <li key={item.id} className="flex items-center gap-2 py-1.5">
              <button
                type="button"
                onClick={() => onEdit(item, groupId)}
                aria-label={`Modifica ${item.name}`}
                className="min-h-12 min-w-0 flex-1 text-left"
              >
                <span className="block line-clamp-2 break-words text-sm font-medium text-foreground">
                  <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                    {kind === "WINE" ? "Vino" : "Piatto"}
                  </span>
                  {item.name}
                </span>
                <span className="block text-xs text-foreground-muted/90">{summary(item, kind)}</span>
                {kind === "FOOD" && allergenState(item) === "unknown" && (
                  <span className="mt-0.5 block text-[11px] font-medium text-gold">Allergeni da compilare</span>
                )}
              </button>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => remove(item)}
                aria-label={`Togli ${item.name} da oggi`}
                className="min-h-11 shrink-0 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Togli
              </button>
            </li>
          ))}
        </ul>
      )}

      {daily.recent.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            aria-expanded={showRecent}
            onClick={() => setShowRecent((v) => !v)}
            className="min-h-10 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {showRecent ? "Nascondi i giorni scorsi" : `Riproponi (${daily.recent.length} dei giorni scorsi)`}
          </button>
          {showRecent && (
            <ul className="mt-1 divide-y divide-border">
              {daily.recent.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="block line-clamp-2 break-words text-sm text-foreground">{r.name}</span>
                    <span className="block text-xs text-foreground-muted/90">
                      {r.kind === "WINE" ? "Vino" : "Piatto"} · {r.summary} · {formatPromoDay(r.day)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => repropose(r)}
                    aria-label={`Riproponi ${r.name}`}
                    className="min-h-11 shrink-0 rounded-full border border-gold/40 px-3.5 text-xs font-semibold text-gold hover:bg-gold/10 disabled:opacity-50"
                  >
                    Riproponi
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
