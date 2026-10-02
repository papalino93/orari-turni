"use client";

import { useState } from "react";
import { ALLERGENS, allergenState, type AllergenState } from "@/lib/allergens";
import { formatPrice } from "@/lib/menu-format";
import { deleteItem, duplicateItem, moveItem, saveItem } from "./actions";
import { Field, Sheet, inputClass } from "./sheet";
import type { EditorItem, EditorSection, RunFn } from "./menu-editor";

function priceInput(cents: number | null): string {
  return cents === null ? "" : formatPrice(cents);
}

export function ItemSheet({
  sections,
  section,
  groupId,
  item,
  isFirst,
  isLast,
  run,
  onClose,
  onDuplicated,
  nextMissing,
  progress,
  onNext,
}: {
  sections: EditorSection[];
  section: EditorSection;
  groupId: string;
  item: EditorItem | null;
  isFirst: boolean;
  isLast: boolean;
  run: RunFn;
  onClose: () => void;
  onDuplicated: (newId: string) => void;
  // Nella vista "allergeni da compilare": il piatto successivo da compilare.
  nextMissing?: { itemId: string; groupId: string; name: string; key: string } | null;
  // «Piatto 2 di 5» nel percorso «Compila allergeni».
  progress?: { position: number; total: number } | null;
  onNext?: (next: { itemId: string; groupId: string; name: string; key: string }) => void;
}) {
  const isWine = section.kind === "WINE";
  const [name, setName] = useState(item?.name ?? "");
  const [sub, setSub] = useState(item?.sub ?? "");
  const [grapes, setGrapes] = useState(item?.grapes ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [priceGlass, setPriceGlass] = useState(priceInput(item?.priceGlassCents ?? null));
  const [priceBottle, setPriceBottle] = useState(priceInput(item?.priceBottleCents ?? null));
  const [price, setPrice] = useState(priceInput(item?.priceCents ?? null));
  const [enomatic, setEnomatic] = useState(item?.enomatic ?? false);
  // Più formati con prezzo (es. birra 0,2 l · 0,4 l · Maß 1 l), alternativi al prezzo singolo.
  const [variants, setVariants] = useState<{ label: string; price: string }[]>(
    () => item?.variants?.map((v) => ({ label: v.label, price: formatPrice(v.cents) })) ?? [],
  );
  const [allergenMode, setAllergenMode] = useState<AllergenState>(item ? allergenState(item) : "unknown");
  const [allergens, setAllergens] = useState<string[]>(item?.allergens ?? []);
  const [targetGroup, setTargetGroup] = useState(groupId);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Si può spostare solo tra sezioni dello stesso tipo: un vino non diventa
  // un piatto (i campi non sono gli stessi).
  const sameKind = sections.filter((s) => s.kind === section.kind);

  async function submit(e: React.SyntheticEvent, goNext = false) {
    e.preventDefault();
    setBusy(true);
    const result = await run(
      () =>
        saveItem(item?.id ?? null, {
          name,
          groupId: targetGroup,
          sub,
          grapes,
          description,
          priceGlass,
          priceBottle,
          price,
          enomatic,
          allergens: allergenMode === "some" ? allergens : [],
          allergensReviewed: allergenMode !== "unknown",
          variants: variants.filter((v) => v.label.trim() || v.price.trim()),
        }),
      item ? "Voce salvata" : "Voce aggiunta",
    );
    setBusy(false);
    if (result) {
      onClose();
      if (goNext && nextMissing) onNext?.(nextMissing);
    }
  }

  async function duplicate() {
    if (!item) return;
    setBusy(true);
    const result = await run(() => duplicateItem(item.id), "Voce duplicata");
    setBusy(false);
    if (result) {
      onClose();
      onDuplicated(result.id);
    }
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    const result = await run(() => deleteItem(item.id), `«${item.name}» eliminata`);
    setBusy(false);
    if (result) onClose();
  }

  async function move(direction: "up" | "down") {
    if (!item) return;
    setBusy(true);
    await run(() => moveItem(item.id, direction), "");
    setBusy(false);
  }

  return (
    <Sheet title={progress ? `Allergeni · ${progress.position} di ${progress.total}` : item ? "Modifica voce" : isWine ? "Nuovo vino" : "Nuova voce"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Nome">
          <input
            autoFocus={!item}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            className={inputClass}
            placeholder={isWine ? "es. Aquila del Torre" : "es. Tagliere Classico"}
          />
        </Field>

        {isWine ? (
          <>
            <Field label="Sottotitolo" hint="Denominazione, annata, zona…">
              <input value={sub} onChange={(e) => setSub(e.target.value)} maxLength={160} className={inputClass} placeholder="es. Torre Bianco" />
            </Field>
            <Field label="Uvaggio">
              <input
                value={grapes}
                onChange={(e) => setGrapes(e.target.value)}
                maxLength={200}
                className={inputClass}
                placeholder="es. 100% Friulano"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calice (€)" hint="Vuoto = non al calice">
                <input
                  value={priceGlass}
                  onChange={(e) => setPriceGlass(e.target.value)}
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="es. 6"
                />
              </Field>
              <Field label="Bottiglia (€)">
                <input
                  value={priceBottle}
                  onChange={(e) => setPriceBottle(e.target.value)}
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="es. 30"
                />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
              <input type="checkbox" checked={enomatic} onChange={(e) => setEnomatic(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
              Fa parte del Progetto Enomatic
            </label>
          </>
        ) : (
          <>
            <Field label="Descrizione">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                rows={3}
                className={inputClass}
                placeholder="Ingredienti, peso…"
              />
            </Field>
            {variants.length === 0 && (
              <Field label="Prezzo (€)">
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required className={inputClass} placeholder="es. 13" />
              </Field>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-foreground-muted">
                Formati e prezzi <span className="font-normal">(facoltativo, es. birra 0,2 l · 0,4 l · 1 l)</span>
              </p>
              {variants.map((v, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <input
                    value={v.label}
                    onChange={(e) => setVariants((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    maxLength={30}
                    aria-label={`Formato ${i + 1}`}
                    placeholder="es. 0,4 l"
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <input
                    value={v.price}
                    onChange={(e) => setVariants((prev) => prev.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                    inputMode="decimal"
                    aria-label={`Prezzo del formato ${i + 1}`}
                    placeholder="€"
                    className={`${inputClass} w-24 shrink-0`}
                  />
                  <button
                    type="button"
                    onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Togli il formato ${i + 1}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-2 hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={variants.length >= 8}
                onClick={() => setVariants((prev) => [...prev, { label: "", price: "" }])}
                className="min-h-11 w-full rounded-xl border border-dashed border-border text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-40"
              >
                + Aggiungi un formato
              </button>
              {variants.length > 0 && (
                <p className="mt-1.5 text-[11px] text-foreground-muted">Con i formati il prezzo singolo non serve.</p>
              )}
            </div>

            <fieldset>
              <legend className="mb-1 text-xs font-medium text-foreground-muted">Allergeni</legend>
              <div role="radiogroup" aria-label="Allergeni" className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["unknown", "Da compilare"],
                    ["none", "Nessuno"],
                    ["some", "Contiene…"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={allergenMode === value}
                    onClick={() => setAllergenMode(value)}
                    className={`min-h-11 rounded-xl border px-2 text-xs font-medium transition-colors ${
                      allergenMode === value
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border text-foreground-muted hover:border-accent hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {allergenMode === "unknown" && (
                <p className="mt-1.5 text-[11px] text-gold">Finché non è compilato, i clienti vedono «da verificare con il personale».</p>
              )}
              {allergenMode === "none" && (
                <p className="mt-1.5 text-[11px] text-foreground-muted">Confermi che il piatto non contiene nessuno dei 14 allergeni.</p>
              )}
              {allergenMode === "some" && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {ALLERGENS.map((a) => {
                    const checked = allergens.includes(a.code);
                    return (
                      <label
                        key={a.code}
                        title={a.detail}
                        className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm ${
                          checked ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setAllergens((prev) => (checked ? prev.filter((c) => c !== a.code) : [...prev, a.code]))}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        {a.label}
                      </label>
                    );
                  })}
                </div>
              )}
              {allergenMode === "some" && allergens.length === 0 && (
                <p className="mt-1.5 text-[11px] text-danger">Spunta almeno un allergene, oppure scegli «Nessuno».</p>
              )}
            </fieldset>
          </>
        )}

        <Field label="Gruppo">
          <select value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)} className={inputClass}>
            {sameKind.map((s) => (
              <optgroup key={s.id} label={s.title}>
                {s.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          onClick={progress ? (e) => void submit(e, true) : undefined}
          disabled={busy || !name.trim() || (!isWine && allergenMode === "some" && allergens.length === 0)}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : progress ? (nextMissing ? "Salva e passa al successivo" : "Salva e chiudi") : item ? "Salva" : "Aggiungi"}
        </button>

        {progress && nextMissing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onNext?.(nextMissing)}
            className="min-h-11 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
          >
            Salta questo piatto
          </button>
        )}

        {item && (
          <div className="space-y-3 border-t border-border pt-3.5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || isFirst}
                onClick={() => move("up")}
                className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-30"
              >
                ↑ Sposta su
              </button>
              <button
                type="button"
                disabled={busy || isLast}
                onClick={() => move("down")}
                className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-30"
              >
                ↓ Sposta giù
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={duplicate}
                className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-50"
              >
                Duplica
              </button>
            </div>

            {confirmingDelete ? (
              <div className="rounded-xl border border-danger/30 bg-danger-bg p-3">
                <p className="text-xs text-danger">Eliminare «{item.name}»? Resta recuperabile dallo storico.</p>
                <div className="mt-2.5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={remove}
                    className="min-h-10 rounded-full bg-danger px-3.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Sì, elimina
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger"
              >
                Elimina voce
              </button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}
