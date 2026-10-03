"use client";

import { useState } from "react";
import { formatPrice, tryParsePrice } from "@/lib/menu-format";
import { savePrices, type PriceChange } from "./actions";
import type { EditorItem, EditorSection, RunFn } from "./menu-editor";
import { Sheet } from "./sheet";

// Prezzi di una voce come testi da modificare: calice e bottiglia (vini),
// prezzo singolo oppure un prezzo per formato (piatti e bevande).
// Con i formati del gruppo (birre 0,2 l · 0,4 l · 1 l) `cols` ha un prezzo per
// colonna del gruppo, vuoto = formato non disponibile.
type Draft = { glass: string; bottle: string; price: string; variants: string[]; cols: string[] };

const toText = (cents: number | null) => (cents === null ? "" : formatPrice(cents));
function base(item: EditorItem, formats: string[] | null = null): Draft {
  return {
    glass: toText(item.priceGlassCents),
    bottle: toText(item.priceBottleCents),
    price: toText(item.priceCents),
    variants: (item.variants ?? []).map((v) => formatPrice(v.cents)),
    cols: (formats ?? []).map((f) => toText(item.variants?.find((v) => v.label === f)?.cents ?? null)),
  };
}
const same = (a: Draft, b: Draft) =>
  a.glass === b.glass && a.bottle === b.bottle && a.price === b.price && a.variants.join("|") === b.variants.join("|") && a.cols.join("|") === b.cols.join("|");
const valid = (text: string) => tryParsePrice(text).ok;
const filled = (text: string) => {
  const p = tryParsePrice(text);
  return p.ok && p.cents !== null;
};

// Cosa non va in una voce (null = tutto a posto), come lo dirà il server.
function problem(item: EditorItem, kind: "WINE" | "FOOD", d: Draft, formats: string[] | null = null): string | null {
  if (formats) {
    if (!d.cols.every(valid)) return "Prezzo non valido (esempio: 7 oppure 7,50).";
    return d.cols.some(filled) ? null : "Serve almeno un prezzo.";
  }
  if (kind === "WINE") {
    if (!valid(d.glass) || !valid(d.bottle)) return "Prezzo non valido (esempio: 7 oppure 7,50).";
    if (!filled(d.glass) && !filled(d.bottle)) return "Serve almeno un prezzo, calice o bottiglia.";
    return null;
  }
  if (item.variants?.length) return d.variants.every(filled) ? null : "Ogni formato ha bisogno del suo prezzo.";
  return filled(d.price) ? null : valid(d.price) ? "Manca il prezzo." : "Prezzo non valido (esempio: 7 oppure 7,50).";
}

function PriceInput({ value, original, label, onChange }: { value: string; original: string; label: string; onChange: (v: string) => void }) {
  const changed = value !== original;
  const bad = !valid(value);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad || undefined}
      placeholder="—"
      className={`h-10 w-[4.5rem] shrink-0 rounded-lg border px-2 text-right text-base tabular-nums text-foreground outline-none focus:border-accent sm:text-sm ${
        bad ? "border-danger bg-danger-bg" : changed ? "border-accent bg-accent/15 font-semibold text-accent" : "border-border bg-surface-2"
      }`}
    />
  );
}

// «Tabella prezzi»: tutti i prezzi di una sezione in una pagina sola, si cambiano
// al volo e si salvano insieme. Un solo «Annulla» rimette tutti i prezzi di prima.
export function PricesSheet({ sections, startSectionId, run, onClose }: { sections: EditorSection[]; startSectionId: string | null; run: RunFn; onClose: () => void }) {
  const [sectionId, setSectionId] = useState(startSectionId && sections.some((s) => s.id === startSectionId) ? startSectionId : (sections[0]?.id ?? null));
  // Modifiche per voce, anche passando da una sezione all'altra.
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const section = sections.find((s) => s.id === sectionId) ?? null;

  const formatsOf = (g: EditorSection["groups"][number], kind: "WINE" | "FOOD") => (kind === "FOOD" ? g.formats : null);
  // Una voce con un prezzo solo in un gruppo con i formati (es. l'acqua) resta a prezzo singolo,
  // e una con formati suoi (nomi diversi dalle colonne) si modifica formato per formato.
  const itemFormats = (item: EditorItem, formats: string[] | null) =>
    formats && (item.variants?.length || item.priceCents === null) && !item.variants?.some((v) => !formats.includes(v.label)) ? formats : null;
  const all = sections.flatMap((s) =>
    s.groups.flatMap((g) =>
      g.items.filter((item) => !item.textOnly).map((item) => ({ item, kind: s.kind, section: s, formats: itemFormats(item, formatsOf(g, s.kind)) })),
    ),
  );
  const changes = all.filter(({ item, formats }) => draft[item.id] && !same(draft[item.id], base(item, formats)));
  const problems = changes.filter(({ item, kind, formats }) => problem(item, kind, draft[item.id], formats));
  const perSection = (id: string) => changes.filter((c) => c.section.id === id).length;

  function edit(item: EditorItem, patch: Partial<Draft>, formats: string[] | null = null) {
    setDraft((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? base(item, formats)), ...patch } }));
  }

  async function save() {
    setBusy(true);
    const list: PriceChange[] = changes.map(({ item, kind, formats }) => {
      const d = draft[item.id];
      if (formats) return { id: item.id, formats: d.cols };
      if (kind === "WINE") return { id: item.id, priceGlass: d.glass, priceBottle: d.bottle };
      return item.variants?.length ? { id: item.id, variants: d.variants } : { id: item.id, price: d.price };
    });
    const labels = [...new Set(changes.map((c) => c.section.label))];
    const result = await run(() => savePrices(list), `Prezzi salvati (${list.length === 1 ? "1 voce" : `${list.length} voci`}) · ${labels.join(", ")}`);
    setBusy(false);
    if (result !== null) setDraft({});
  }

  return (
    <Sheet title="Tabella prezzi" onClose={onClose} wide dirty={changes.length > 0} onSave={problems.length === 0 ? save : undefined}>
      <nav aria-label="Sezione" className="-mx-1 mb-3 flex flex-wrap gap-1.5">
        {sections.map((s) => {
          const active = s.id === sectionId;
          const n = perSection(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSectionId(s.id)}
              aria-current={active ? "true" : undefined}
              className={`min-h-9 rounded-full px-3 text-xs font-medium ${active ? "bg-accent text-accent-foreground" : "border border-border text-foreground-muted hover:border-accent hover:text-foreground"}`}
            >
              {s.label}
              {n > 0 && <span className={`ml-1.5 ${active ? "text-accent-foreground/80" : "text-accent"}`}>· {n}</span>}
            </button>
          );
        })}
      </nav>
      <p className="mb-3 text-xs text-foreground-muted">
        Scrivi il nuovo prezzo (es. 7 oppure 7,50): le caselle cambiate si colorano. Puoi passare da una sezione all&apos;altra e salvare tutto alla fine.
        {section?.kind === "WINE" && " Calice vuoto = non si vende al calice."}
        {section?.groups.some((g) => g.formats) && " Nei gruppi con i formati (es. birre), casella vuota = formato non disponibile."}
      </p>

      {section && (
        <div className="space-y-4">
          {section.groups.map((group) => {
            const formats = formatsOf(group, section.kind);
            return (
            <div key={group.id}>
              <div className="sticky top-0 z-10 -mx-1 flex items-end gap-2 bg-surface px-1 pb-1 pt-1">
                <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{group.title}</p>
                {section.kind === "WINE" ? (
                  <>
                    <span className="w-[4.5rem] shrink-0 text-right text-[11px] text-foreground-muted">Calice €</span>
                    <span className="w-[4.5rem] shrink-0 text-right text-[11px] text-foreground-muted">Bottiglia €</span>
                  </>
                ) : formats ? (
                  formats.map((f) => (
                    <span key={f} className="w-[4.5rem] shrink-0 truncate text-right text-[11px] text-foreground-muted">
                      {f} €
                    </span>
                  ))
                ) : (
                  <span className="w-[4.5rem] shrink-0 text-right text-[11px] text-foreground-muted">Prezzo €</span>
                )}
              </div>
              {group.items.length === 0 && <p className="py-2 text-xs text-foreground-muted">Nessuna voce.</p>}
              <ul className="divide-y divide-border">
                {group.items.filter((item) => !item.textOnly).map((item) => {
                  const cols = itemFormats(item, formats);
                  const orig = base(item, cols);
                  const d = draft[item.id] ?? orig;
                  const err = draft[item.id] && !same(d, orig) ? problem(item, section.kind, d, cols) : null;
                  const sub = section.kind === "WINE" ? item.wineName || item.denomination : null;
                  return (
                    <li key={item.id} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">{item.name}</p>
                          {sub && <p className="truncate text-[11px] italic text-foreground-muted">{sub}</p>}
                        </div>
                        {section.kind === "WINE" ? (
                          <>
                            <PriceInput value={d.glass} original={orig.glass} label={`Calice · ${item.name}${sub ? ` ${sub}` : ""}`} onChange={(v) => edit(item, { glass: v })} />
                            <PriceInput value={d.bottle} original={orig.bottle} label={`Bottiglia · ${item.name}${sub ? ` ${sub}` : ""}`} onChange={(v) => edit(item, { bottle: v })} />
                          </>
                        ) : cols ? (
                          cols.map((f, j) => (
                            <PriceInput
                              key={f}
                              value={d.cols[j] ?? ""}
                              original={orig.cols[j] ?? ""}
                              label={`Prezzo · ${item.name} · ${f}`}
                              onChange={(val) => edit(item, { cols: d.cols.map((x, k) => (k === j ? val : x)) }, cols)}
                            />
                          ))
                        ) : item.variants?.length ? (
                          <span className="shrink-0 text-[11px] text-foreground-muted">{item.variants.length} formati</span>
                        ) : (
                          <>
                            {formats && <span className="shrink-0 text-[10px] text-foreground-muted">prezzo unico</span>}
                            <PriceInput value={d.price} original={orig.price} label={`Prezzo · ${item.name}`} onChange={(v) => edit(item, { price: v })} />
                          </>
                        )}
                      </div>
                      {section.kind === "FOOD" &&
                        !cols &&
                        item.variants?.map((v, j) => (
                          <div key={j} className="mt-1 flex items-center gap-2 pl-3">
                            <p className="min-w-0 flex-1 truncate text-xs text-foreground-muted">{v.label}</p>
                            <PriceInput
                              value={d.variants[j] ?? ""}
                              original={orig.variants[j] ?? ""}
                              label={`Prezzo · ${item.name} · ${v.label}`}
                              onChange={(val) => edit(item, { variants: d.variants.map((x, k) => (k === j ? val : x)) })}
                            />
                          </div>
                        ))}
                      {err && <p className="mt-1 text-[11px] text-danger">{err}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface pt-3">
        <p className="min-w-0 flex-1 text-xs text-foreground-muted">
          {changes.length === 0 ? "Nessun prezzo cambiato." : changes.length === 1 ? "1 voce cambiata" : `${changes.length} voci cambiate`}
          {problems.length > 0 && <span className="text-danger"> · {problems.length === 1 ? "1 da sistemare" : `${problems.length} da sistemare`}</span>}
        </p>
        {changes.length > 0 && (
          <button type="button" onClick={() => setDraft({})} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium text-foreground-muted hover:text-foreground">
            Annulla le modifiche
          </button>
        )}
        <button
          type="button"
          disabled={changes.length === 0 || problems.length > 0 || busy}
          onClick={save}
          className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? "Salvo…" : "Salva tutto"}
        </button>
      </div>
    </Sheet>
  );
}
