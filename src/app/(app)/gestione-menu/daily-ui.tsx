"use client";

import { IconToday, PanelHead } from "./panel-head";
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
  isSold,
  onToggleSold,
  run,
  onAdd,
  onEdit,
}: {
  daily: DailyData;
  // «Esaurito» come per le altre voci del menù.
  isSold: (item: EditorItem) => boolean;
  onToggleSold: (item: EditorItem) => void;
  run: RunFn;
  onAdd: (groupId: string) => void;
  onEdit: (item: EditorItem, groupId: string) => void;
}) {
  const [showRecent, setShowRecent] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // «Togli»: si chiede conferma (la voce sparisce subito dal menù dei clienti).
  const [confirmId, setConfirmId] = useState<string | null>(null);

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
    setConfirmId(null);
  }

  async function repropose(r: DailyRecent) {
    setBusyId(r.id);
    await run(() => reproposeItem(r.id), `«${r.name}» riproposto per oggi`);
    setBusyId(null);
  }

  return (
    <section aria-label="Oggi fuori menù" className="mb-5 rounded-2xl border border-gold/35 bg-gradient-to-br from-gold/[0.10] to-gold/[0.02] px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelHead
          icon={IconToday}
          tone="gold"
          title="Oggi fuori menù"
          subtitle="Il piatto e il vino del giorno: spariscono da soli alle 5 del mattino."
          badge={
            rows.length > 0 ? (
              <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold text-gold">{rows.length} oggi</span>
            ) : undefined
          }
        />
        {/* Sul telefono i pulsanti vanno sotto: la descrizione resta intera. */}
        <div className="flex w-full gap-2 sm:w-auto">
          {foodGroup && (
            <button
              type="button"
              onClick={() => onAdd(foodGroup)}
              className="min-h-10 flex-1 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover sm:flex-none"
            >
              + Piatto
            </button>
          )}
          {wineGroup && (
            <button
              type="button"
              onClick={() => onAdd(wineGroup)}
              className="min-h-10 flex-1 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover sm:flex-none"
            >
              + Vino
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-gold/30 px-3 py-2.5 text-sm text-foreground-muted">
          Niente di speciale oggi. Tocca «+ Piatto» o «+ Vino» per proporre qualcosa fuori carta.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {rows.map(({ item, kind, groupId }) => {
            const sold = isSold(item);
            return (
            <li key={item.id} className="py-1.5">
              {/* Sul telefono, se il nome non ci sta accanto ai pulsanti, i pulsanti vanno sotto. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={() => onEdit(item, groupId)}
                aria-label={`Modifica ${item.name}`}
                className="min-h-12 min-w-[9rem] flex-1 text-left"
              >
                <span className={`block line-clamp-2 break-words text-sm font-medium ${sold ? "text-foreground-muted line-through" : "text-foreground"}`}>
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
              <div className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                aria-pressed={sold}
                onClick={() => onToggleSold(item)}
                title={sold ? "Segna di nuovo disponibile" : "Segna esaurita"}
                className={`min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                  sold ? "border-danger bg-danger text-white" : "border-border text-foreground-muted hover:border-danger hover:text-danger"
                }`}
              >
                Esaurito
                {sold && <span className="block text-[10px] font-medium leading-tight opacity-90">tocca per rimettere</span>}
              </button>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => setConfirmId(confirmId === item.id ? null : item.id)}
                aria-expanded={confirmId === item.id}
                aria-label={`Togli ${item.name} da oggi`}
                className="min-h-11 shrink-0 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Togli
              </button>
              </div>
              </div>
              {confirmId === item.id && (
                <div className="mt-1.5 rounded-xl border border-danger/30 bg-danger-bg p-3">
                  <p className="text-xs text-danger">Togliere «{item.name}» da oggi? Sparisce subito dal menù dei clienti (la ritrovi in «Riproponi»).</p>
                  <div className="mt-2.5 flex justify-end gap-2">
                    <button type="button" onClick={() => setConfirmId(null)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground">
                      No, lascialo
                    </button>
                    <button type="button" disabled={busyId === item.id} onClick={() => remove(item)} className="min-h-10 rounded-full bg-danger px-3.5 text-xs font-semibold text-white disabled:opacity-60">
                      Sì, togli
                    </button>
                  </div>
                </div>
              )}
            </li>
            );
          })}
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
