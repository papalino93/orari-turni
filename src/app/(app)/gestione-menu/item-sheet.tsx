"use client";

import { useEffect, useRef, useState } from "react";
import { ALLERGENS, allergenState, type AllergenState } from "@/lib/allergens";
import { formatPrice, originLabel, wineDetail } from "@/lib/menu-format";
import { WINE_TRAITS } from "@/lib/wine-traits";
import { isItalianWine } from "@/lib/wine-order";
import { TraitIcon } from "@/app/(public)/menu/wine-traits";
import { deleteItem, duplicateItem, moveItem, saveItem } from "./actions";
import { Field, Sheet, inputClass } from "./sheet";
import type { EditorItem, EditorSection, PairWine, RunFn } from "./menu-editor";

function priceInput(cents: number | null): string {
  return cents === null ? "" : formatPrice(cents);
}

// Suggerimenti per regione e nazione: scritti sempre uguali, l'ordine della carta
// li riconosce (Toscana prima, poi le altre in ordine alfabetico).
const ITALIAN_REGIONS = [
  "Abruzzo", "Alto Adige", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria",
  "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino", "Umbria", "Valle d'Aosta", "Veneto",
];
const COUNTRIES = ["Italia", "Francia", "Spagna", "Portogallo", "Germania", "Austria", "Slovenia", "Grecia"];

// Un blocco della scheda: titolo piccolo e una riga sopra, per non avere un
// muro di campi tutti uguali.
function Block({ title, hint, children, first = false }: { title: string; hint?: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`space-y-3 ${first ? "" : "border-t border-border pt-3.5"}`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{title}</p>
        {hint && <p className="mt-0.5 text-[11px] text-foreground-muted/80">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function ItemSheet({
  sections,
  section,
  groupId,
  item,
  wines,
  isFirst,
  isLast,
  run,
  onClose,
  onDuplicated,
  focusAllergens = false,
  onMissingAllergens,
  nextMissing,
  progress,
  onNext,
}: {
  sections: EditorSection[];
  section: EditorSection;
  groupId: string;
  item: EditorItem | null;
  // Vini del menù fisso, per l'abbinamento consigliato.
  wines: PairWine[];
  isFirst: boolean;
  isLast: boolean;
  run: RunFn;
  onClose: () => void;
  onDuplicated: (newId: string) => void;
  // Apre la scheda già sulla parte degli allergeni («Compila ora»).
  focusAllergens?: boolean;
  // Piatto nuovo salvato con gli allergeni «Da compilare»: la gestione propone «Compila ora».
  onMissingAllergens?: (newId: string, name: string) => void;
  // Nella vista "allergeni da compilare": il piatto successivo da compilare.
  nextMissing?: { itemId: string; groupId: string; name: string; key: string | null } | null;
  // «Piatto 2 di 5» nel percorso «Compila allergeni».
  progress?: { position: number; total: number } | null;
  onNext?: (next: { itemId: string; groupId: string; name: string; key: string | null }) => void;
}) {
  const isWine = section.kind === "WINE";
  const [name, setName] = useState(item?.name ?? "");
  const [sub, setSub] = useState(item?.sub ?? "");
  const [wineName, setWineName] = useState(item?.wineName ?? "");
  const [denomination, setDenomination] = useState(item?.denomination ?? "");
  const [vintage, setVintage] = useState(item?.vintage ?? "");
  const [grapes, setGrapes] = useState(item?.grapes ?? "");
  const [region, setRegion] = useState(item?.region ?? "");
  const [country, setCountry] = useState(item?.country ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [priceGlass, setPriceGlass] = useState(priceInput(item?.priceGlassCents ?? null));
  const [priceBottle, setPriceBottle] = useState(priceInput(item?.priceBottleCents ?? null));
  const [price, setPrice] = useState(priceInput(item?.priceCents ?? null));
  const [enomatic, setEnomatic] = useState(item?.enomatic ?? false);
  const [traits, setTraits] = useState<string[]>(item?.traits ?? []);
  // Un abbinamento a un vino che non c'è più (eliminato) si lascia cadere al salvataggio.
  const pairLost = Boolean(item?.pairWineId && !wines.some((w) => w.id === item.pairWineId));
  const [pairWineId, setPairWineId] = useState<string | null>(pairLost ? null : (item?.pairWineId ?? null));
  // Gli abbinamenti valgono per i piatti del menù fisso, non per eventi e «Oggi fuori menù».
  const canPair = !isWine && !section.promoId && !section.dailyOnly && wines.length > 0;
  // Più formati con prezzo (es. birra 0,2 l · 0,4 l · Maß 1 l), alternativi al prezzo singolo.
  const [variants, setVariants] = useState<{ label: string; price: string }[]>(
    () => item?.variants?.map((v) => ({ label: v.label, price: formatPrice(v.cents) })) ?? [],
  );
  const [allergenMode, setAllergenMode] = useState<AllergenState>(item ? allergenState(item) : "unknown");
  const [allergens, setAllergens] = useState<string[]>(item?.allergens ?? []);
  const [targetGroup, setTargetGroup] = useState(groupId);
  const allergensRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (focusAllergens) allergensRef.current?.scrollIntoView({ block: "center" });
  }, [focusAllergens]);
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
          wineName,
          denomination,
          vintage,
          grapes,
          region,
          country,
          description,
          priceGlass,
          priceBottle,
          price,
          enomatic,
          traits: isWine ? traits : [],
          pairWineId: canPair ? pairWineId : null,
          allergens: allergenMode === "some" ? allergens : [],
          allergensReviewed: allergenMode !== "unknown",
          variants: variants.filter((v) => v.label.trim() || v.price.trim()),
        }),
      // Piatto nuovo senza allergeni: il messaggio lo dice e propone «Compila ora».
      item || isWine || allergenMode !== "unknown" ? (item ? "Voce salvata" : "Voce aggiunta") : "",
    );
    setBusy(false);
    if (result) {
      if (!item && !isWine && allergenMode === "unknown" && result.id) onMissingAllergens?.(result.id, name.trim());
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

  async function move(direction: "up" | "down" | "top" | "bottom") {
    if (!item) return;
    setBusy(true);
    await run(() => moveItem(item.id, direction), "");
    setBusy(false);
  }

  const nameField = (
    <Field label={isWine ? "Azienda" : "Nome"}>
      <input
        autoFocus={!item}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        required
        className={inputClass}
        placeholder={isWine ? "es. Avignonesi" : "es. Tagliere Classico"}
      />
    </Field>
  );
  // Regioni e nazioni già usate nella carta, più quelle italiane.
  const known = (pick: (i: EditorItem) => string | null, base: string[]) =>
    [...new Set([...base, ...sections.flatMap((x) => x.groups.flatMap((g) => g.items.map(pick))).filter((v): v is string => Boolean(v && v.trim()))])].sort((a, b) =>
      a.localeCompare(b, "it"),
    );
  const regionOptions = isWine ? known((i) => i.region, ITALIAN_REGIONS) : [];
  const countryOptions = isWine ? known((i) => i.country, COUNTRIES) : [];
  const italian = isWine && isItalianWine({ country });
  const preview = {
    detail: wineDetail({ denomination, vintage, sub }),
    origin: originLabel({ region: region.trim() || null, country: country.trim() || null }),
  };

  return (
    <Sheet title={progress ? `Allergeni · ${progress.position} di ${progress.total}` : item ? "Modifica voce" : isWine ? "Nuovo vino" : "Nuova voce"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        {!isWine && nameField}

        {isWine ? (
          <>
            <Block title="Il vino" first>
            {nameField}
            <Field label="Nome del vino (facoltativo)" hint="Se il vino non ha un nome proprio, lascia vuoto.">
              <input value={wineName} onChange={(e) => setWineName(e.target.value)} maxLength={120} className={inputClass} placeholder="es. Da-Di" />
            </Field>
            <div className="grid grid-cols-[1.6fr_1fr] gap-3">
              <Field label="Denominazione">
                <input value={denomination} onChange={(e) => setDenomination(e.target.value)} maxLength={120} className={inputClass} placeholder="es. Toscana Igt" />
              </Field>
              <Field label="Annata">
                <input value={vintage} onChange={(e) => setVintage(e.target.value)} maxLength={20} inputMode="numeric" className={inputClass} placeholder="es. 2022" />
              </Field>
            </div>
            {sub && (
              <Field label="Vecchio sottotitolo" hint="Spostalo nei campi qui sopra, poi svuota questo: sul menù si usano i campi nuovi.">
                <input value={sub} onChange={(e) => setSub(e.target.value)} maxLength={160} className={inputClass} />
              </Field>
            )}
            <Field label="Uvaggio">
              <input
                value={grapes}
                onChange={(e) => setGrapes(e.target.value)}
                maxLength={200}
                className={inputClass}
                placeholder="es. 100% Friulano"
              />
            </Field>
            </Block>

            <Block title="Da dove viene" hint="Per i vini italiani la regione è obbligatoria: decide anche il posto in carta (prima la Toscana, poi le altre in ordine alfabetico, poi l'estero).">
            <div className="grid grid-cols-2 gap-3">
              <Field label={italian ? "Regione" : "Regione (facoltativa)"}>
                <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={60} required={italian} list="wine-regions" autoComplete="off" className={inputClass} placeholder="es. Toscana" />
              </Field>
              <Field label="Nazione (vuota = Italia)">
                <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} list="wine-countries" autoComplete="off" className={inputClass} placeholder="es. Italia" />
              </Field>
            </div>
            <datalist id="wine-regions">
              {regionOptions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <datalist id="wine-countries">
              {countryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            </Block>

            <Block title="Prezzi">
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
            </Block>

            <Block title="Caratteristiche" hint="Facoltative: sul menù compaiono sotto l'uvaggio, con il disegnino.">
            <fieldset>
              <legend className="sr-only">Caratteristiche</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {WINE_TRAITS.map((t) => {
                  const checked = traits.includes(t.code);
                  return (
                    <label
                      key={t.code}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm ${
                        checked ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground-muted"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setTraits((prev) => (checked ? prev.filter((c) => c !== t.code) : [...prev, t.code]))}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <TraitIcon code={t.code} size={15} stroke="currentColor" />
                      <span className="min-w-0">{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            </Block>

            {name.trim() && (
              <div className="rounded-xl bg-surface-2 px-3.5 py-3" aria-label="Come si legge sul menù">
                <p className="mb-1 text-[11px] font-medium text-foreground-muted">Sul menù si legge così</p>
                <p className="text-sm font-semibold text-foreground">{name.trim()}</p>
                {wineName.trim() && <p className="text-sm italic text-foreground">{wineName.trim()}</p>}
                {preview.detail && <p className="text-xs text-foreground-muted">{preview.detail}</p>}
                {grapes.trim() && <p className="text-xs text-foreground-muted">{grapes.trim()}</p>}
                {preview.origin && <p className="text-xs text-foreground-muted">{preview.origin}</p>}
                {traits.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-foreground-muted">
                    {WINE_TRAITS.filter((t) => traits.includes(t.code)).map((t) => (
                      <span key={t.code} className="inline-flex items-center gap-1">
                        <TraitIcon code={t.code} size={13} stroke="currentColor" />
                        {t.short}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}
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

            {canPair && <PairPicker wines={wines} value={pairWineId} onChange={setPairWineId} lost={pairLost} />}

            <fieldset ref={allergensRef} className="scroll-mt-4">
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

        <Field label={isWine ? "Gruppo (dove sta nella carta)" : "Gruppo (dove sta nel menù)"}>
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
                disabled={busy || isFirst}
                onClick={() => move("top")}
                className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-30"
              >
                ⤒ In cima
              </button>
              <button
                type="button"
                disabled={busy || isLast}
                onClick={() => move("bottom")}
                className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-30"
              >
                ⤓ In fondo
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

// «Abbinamento consigliato»: un vino del menù per il piatto. Si cerca per nome (o zona,
// uvaggio, sezione) e si sceglie con un tocco; ✕ lo toglie.
function PairPicker({
  wines,
  value,
  onChange,
  lost,
}: {
  wines: PairWine[];
  value: string | null;
  onChange: (id: string | null) => void;
  lost: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = value ? wines.find((w) => w.id === value) : undefined;
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const results =
    tokens.length > 0 ? wines.filter((w) => tokens.every((t) => norm(`${w.name} ${w.section} ${w.detail}`).includes(t))).slice(0, 6) : [];

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-foreground-muted">
        Abbinamento consigliato <span className="font-normal">(facoltativo, un vino)</span>
      </p>
      {selected ? (
        <div className="flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/5 py-1.5 pl-3 pr-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {selected.name}
              {selected.soldOut && <span className="ml-2 text-[11px] font-semibold text-danger">Esaurito oggi</span>}
            </p>
            <p className="truncate text-[11px] text-foreground-muted">
              {selected.section}
              {selected.detail ? ` · ${selected.detail}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Togli l'abbinamento con ${selected.name}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-2 hover:text-danger"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cerca un vino da abbinare"
            placeholder="Cerca un vino da abbinare…"
            className={inputClass}
          />
          {results.length > 0 && (
            <ul className="mt-1.5 overflow-hidden rounded-xl border border-border">
              {results.map((w) => (
                <li key={w.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(w.id);
                      setQuery("");
                    }}
                    className="block min-h-11 w-full px-3 py-1.5 text-left hover:bg-surface-2"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {w.name}
                      {w.soldOut && <span className="ml-2 text-[11px] font-semibold text-danger">Esaurito oggi</span>}
                    </span>
                    <span className="block truncate text-[11px] text-foreground-muted">
                      {w.section}
                      {w.detail ? ` · ${w.detail}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tokens.length > 0 && results.length === 0 && <p className="mt-1.5 text-[11px] text-foreground-muted">Nessun vino trovato.</p>}
        </>
      )}
      <p className="mt-1.5 text-[11px] text-foreground-muted">
        {lost
          ? "Il vino abbinato prima non è più nel menù: scegline un altro, oppure lascia vuoto."
          : selected?.soldOut
            ? "Oggi il vino è esaurito: il riquadro tornerà sul menù quando sarà di nuovo disponibile."
            : "Sul menù compare sotto il piatto; se il vino è esaurito non si vede."}
      </p>
    </div>
  );
}
