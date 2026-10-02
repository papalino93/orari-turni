"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { formatPrice, type CoverInfo } from "@/lib/menu-format";
import { createGroup, deleteGroup, moveGroup, renameGroup, resetSoldOut, setSoldOut, undoChange } from "./actions";
import type { ChangeResult } from "./actions";
import { ImportSheet } from "./import-sheet";
import { ItemSheet } from "./item-sheet";
import { DuplicatePromoSheet, effectiveStatus, PromoCard, PromoSheet, StatusChip } from "./promo-ui";
import { CoverSheet, HistorySheet, SectionTextsSheet } from "./side-sheets";

export type EditorItem = {
  id: string;
  groupId: string;
  name: string;
  sub: string | null;
  grapes: string | null;
  description: string | null;
  priceGlassCents: number | null;
  priceBottleCents: number | null;
  priceCents: number | null;
  enomatic: boolean;
  variants: { label: string; cents: number }[] | null;
  allergens: string[];
  allergensReviewed: boolean;
  soldOut: boolean;
};

export type EditorGroup = { id: string; title: string; columns: boolean; items: EditorItem[] };

export type EditorSection = {
  id: string;
  slug: string;
  label: string;
  title: string;
  promoId: string | null;
  kind: "WINE" | "FOOD";
  note: string | null;
  coverApplies: boolean;
  addonTitle: string | null;
  addon: string | null;
  groups: EditorGroup[];
};

// Pagina promozionale (evento o annuncio); per gli eventi `section` è il menù speciale.
export type EditorPromo = {
  id: string;
  kind: "NOTICE" | "EVENT";
  slug: string;
  title: string;
  label: string | null;
  body: string | null;
  showFrom: string;
  startDate: string;
  endDate: string;
  hidden: boolean;
  imageVersion: number | null;
  section: EditorSection | null;
};

export type HistoryEntry = {
  id: string;
  at: string;
  actorName: string;
  action: string;
  label: string;
  undone: boolean;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Esegue un'azione, mostra il toast giusto (con "Annulla" se la modifica è
// annullabile) e ricarica i dati. message vuoto = nessun toast (es. riordino).
export type RunFn = <T extends ChangeResult | { changeId: string | null; id: string } | void>(
  fn: () => Promise<ActionResult<T>>,
  message: string,
) => Promise<T | null>;

type SheetState =
  | { type: "item"; itemId: string | null; groupId: string }
  | { type: "import"; groupId: string }
  | { type: "texts" }
  | { type: "cover" }
  | { type: "history" }
  | { type: "promo"; id: string | null }
  | { type: "promo-duplicate"; id: string }
  | null;

const EMPTY: Record<string, boolean> = {};

function priceSummary(item: EditorItem, kind: "WINE" | "FOOD"): string {
  if (item.variants) return item.variants.map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ");
  if (kind === "FOOD") return item.priceCents === null ? "" : `€ ${formatPrice(item.priceCents)}`;
  const parts: string[] = [];
  if (item.priceGlassCents !== null) parts.push(`Calice ${formatPrice(item.priceGlassCents)}`);
  if (item.priceBottleCents !== null) parts.push(`Bottiglia ${formatPrice(item.priceBottleCents)}`);
  return parts.join(" · ");
}

export function MenuEditor({
  sections,
  promos,
  today,
  coverInfo,
  history,
}: {
  sections: EditorSection[];
  promos: EditorPromo[];
  today: string;
  coverInfo: CoverInfo;
  history: HistoryEntry[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [activeSlug, setActiveSlug] = useState(sections[0]?.slug ?? "");
  const [sheet, setSheet] = useState<SheetState>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Vista "solo i piatti con allergeni da compilare", attivata dall'avviso in alto.
  const [missingOnly, setMissingOnly] = useState(false);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  // Stato "esaurito" mostrato subito, in attesa della risposta del server: vale
  // solo finché i dati ricaricati non lo sostituiscono (si confronta l'identità
  // dei dati, così non serve nessun effetto per "ripulirlo").
  const [local, setLocal] = useState<{ base: EditorSection[]; map: Record<string, boolean> }>({
    base: sections,
    map: EMPTY,
  });
  const localSold = local.base === sections ? local.map : EMPTY;

  // Sezioni fisse + menù speciali degli eventi: per cercare voci e gruppi servono tutte.
  const eventSections = promos.flatMap((p) => (p.section ? [p.section] : []));
  const allSections = [...sections, ...eventSections];
  // Selezione: o una sezione fissa (slug) o una pagina promozionale ("promo:<id>").
  const promoSelected = activeSlug.startsWith("promo:");
  const activePromo = promoSelected ? (promos.find((p) => `promo:${p.id}` === activeSlug) ?? null) : null;
  const section: EditorSection | null = promoSelected
    ? (activePromo?.section ?? null)
    : (sections.find((s) => s.slug === activeSlug) ?? sections[0] ?? null);
  // Piatti con allergeni "da compilare": sul menù dei clienti risultano "da
  // verificare con il personale". Gli eventi già conclusi non contano.
  const liveEventSections = promos.flatMap((p) =>
    p.section && effectiveStatus(p, today) !== "past" ? [p.section] : [],
  );
  const missingAllergens = [...sections, ...liveEventSections].reduce(
    (n, s) => n + (s.kind === "FOOD" ? s.groups.reduce((m, g) => m + g.items.filter((i) => !i.allergensReviewed).length, 0) : 0),
    0,
  );
  const missingIn = (s: EditorSection | null) =>
    s && s.kind === "FOOD" ? s.groups.reduce((m, g) => m + g.items.filter((i) => !i.allergensReviewed).length, 0) : 0;
  const filterOn = missingOnly && missingAllergens > 0;
  // Sezioni (fisse o di eventi non conclusi) con piatti da compilare, nell'ordine in cui si vedono.
  const missingTargets = [
    ...sections.map((s) => ({ key: s.slug, section: s })),
    ...promos.flatMap((p) => (p.section && effectiveStatus(p, today) !== "past" ? [{ key: `promo:${p.id}`, section: p.section }] : [])),
  ].filter((target) => missingIn(target.section) > 0);
  const foodSections = [...sections, ...liveEventSections].filter((s) => s.kind === "FOOD");
  const totalFood = foodSections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0);
  const compiledFood = totalFood - missingAllergens;
  // Piatti da compilare nell'ordine in cui si vedono: servono a "Salva e vai al prossimo".
  const missingItems = filterOn
    ? missingTargets.flatMap((target) =>
        target.section.groups.flatMap((g) =>
          g.items.filter((i) => !i.allergensReviewed).map((i) => ({ itemId: i.id, groupId: g.id, name: i.name, key: target.key })),
        ),
      )
    : [];
  const isSold = (item: EditorItem) => localSold[item.id] ?? item.soldOut;
  const soldOutCount = allSections.reduce(
    (n, s) => n + s.groups.reduce((m, g) => m + g.items.filter(isSold).length, 0),
    0,
  );

  // Dopo "Duplica": la copia compare coi dati ricaricati, e solo allora si
  // apre per la modifica.
  if (pendingOpenId) {
    const found = allSections.some((s) => s.groups.some((g) => g.items.some((i) => i.id === pendingOpenId)));
    if (found) {
      const group = allSections.flatMap((s) => s.groups).find((g) => g.items.some((i) => i.id === pendingOpenId));
      if (group) {
        setSheet({ type: "item", itemId: pendingOpenId, groupId: group.id });
        setPendingOpenId(null);
      }
    }
  }

  // Sul telefono l'elenco delle sezioni è sopra al contenuto: scegliendone una,
  // la pagina scorre da sola al contenuto invece di lasciarlo fuori schermo.
  function select(key: string) {
    setActiveSlug(key);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  // Apre la prima sezione con piatti da compilare (o la successiva a quella aperta).
  function goToMissing() {
    if (missingTargets.length === 0) return;
    const index = missingTargets.findIndex((target) => target.key === activeSlug);
    const next = missingTargets[(index + 1) % missingTargets.length];
    setMissingOnly(true);
    select(next.key);
  }

  async function undo(changeId: string) {
    const res = await undoChange(changeId);
    if (!res.ok) {
      toast.showError(res.error);
      return;
    }
    toast.showSuccess("Modifica annullata");
    router.refresh();
  }

  const run: RunFn = async (fn, message) => {
    const res = await fn();
    if (!res.ok) {
      toast.showError(res.error);
      return null;
    }
    const data = res.data;
    const changeId = data && typeof data === "object" && "changeId" in data ? data.changeId : null;
    if (message) {
      toast.showSuccess(message, changeId ? { label: "Annulla", onClick: () => void undo(changeId) } : undefined);
    }
    router.refresh();
    return data;
  };

  function toggleSold(item: EditorItem) {
    const next = !isSold(item);
    setLocal({ base: sections, map: { ...localSold, [item.id]: next } });
    startTransition(async () => {
      const result = await run(
        () => setSoldOut(item.id, next),
        next ? `«${item.name}» segnata esaurita` : `«${item.name}» di nuovo disponibile`,
      );
      if (result === null) setLocal({ base: sections, map: { ...localSold } });
    });
  }

  function reactivateAll() {
    const map: Record<string, boolean> = { ...localSold };
    for (const s of allSections) for (const g of s.groups) for (const i of g.items) map[i.id] = false;
    setLocal({ base: sections, map });
    startTransition(async () => {
      const result = await run(() => resetSoldOut(), "Tutte le voci sono di nuovo disponibili");
      if (result === null) setLocal({ base: sections, map: { ...localSold } });
    });
  }

  const editingItem =
    sheet?.type === "item" && sheet.itemId
      ? allSections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((i) => i.id === sheet.itemId) ?? null
      : null;
  const itemSheetGroup =
    sheet?.type === "item"
      ? allSections.flatMap((s) => s.groups).find((g) => g.id === (editingItem?.groupId ?? sheet.groupId))
      : undefined;
  const itemSheetSection = itemSheetGroup
    ? allSections.find((s) => s.groups.some((g) => g.id === itemSheetGroup.id))
    : undefined;
  const missingIndex = editingItem ? missingItems.findIndex((m) => m.itemId === editingItem.id) : -1;
  const nextMissing = missingIndex >= 0 ? (missingItems[missingIndex + 1] ?? null) : null;
  const itemIndex = itemSheetGroup && editingItem ? itemSheetGroup.items.findIndex((i) => i.id === editingItem.id) : -1;

  if (!section && !promoSelected) {
    return <p className="text-sm text-foreground-muted">Il menù non è ancora stato caricato.</p>;
  }
  // Eventi conclusi → archivio (restano con locandina, menù e formati, e si possono duplicare).
  const archivePromos = promos.filter((p) => effectiveStatus(p, today) === "past" || (p.hidden && p.endDate < today));
  const currentPromos = promos.filter((p) => !archivePromos.includes(p));
  const promoButton = (p: EditorPromo) => {
    const active = activeSlug === `promo:${p.id}`;
    const status = effectiveStatus(p, today);
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => select(`promo:${p.id}`)}
        aria-current={active ? "true" : undefined}
        className={`flex min-h-10 max-w-full items-center justify-between gap-2 rounded-full px-3.5 text-sm font-medium transition-colors lg:rounded-xl ${
          active
            ? "bg-accent text-accent-foreground"
            : "border border-border text-foreground-muted hover:border-accent hover:text-foreground lg:border-transparent"
        }`}
      >
        <span className="truncate">{p.title}</span>
        {!active && (status === "past" ? <span className="shrink-0 text-[10px] text-foreground-muted/80">{p.endDate.slice(0, 4)}</span> : <StatusChip status={status} />)}
      </button>
    );
  };
  const promoToEdit = sheet?.type === "promo" && sheet.id ? (promos.find((p) => p.id === sheet.id) ?? null) : null;
  const promoToDuplicate = sheet?.type === "promo-duplicate" ? (promos.find((p) => p.id === sheet.id) ?? null) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Menù</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Quello che cambi qui compare subito sul menù dei clienti (quello del QR).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {soldOutCount > 0 && (
            <button
              type="button"
              onClick={reactivateAll}
              className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
            >
              Riattiva tutto ({soldOutCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setSheet({ type: "promo", id: null })}
            className="min-h-10 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
          >
            + Evento o annuncio
          </button>
          <button
            type="button"
            onClick={() => setSheet({ type: "history" })}
            className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            Storico
          </button>
          <a
            href="/menu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            Vedi menù ↗
          </a>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Coperto e chiusura cucina</p>
          <p className="mt-1 text-sm text-foreground">
            <span className="text-foreground-muted">Coperto: </span>
            <span className="font-medium">{coverInfo.cover || "nessuno"}</span>
          </p>
          <p className="mt-0.5 text-sm text-foreground">
            <span className="text-foreground-muted">Chiusura cucina: </span>
            {coverInfo.kitchenNote ? <span>{coverInfo.kitchenNote}</span> : <span className="font-medium">nessun avviso</span>}
          </p>
          <p className="text-[11px] text-foreground-muted">
            Vale per tutta la cucina
            {sections.some((s) => s.coverApplies)
              ? `: compare in ${sections
                  .filter((s) => s.coverApplies)
                  .map((s) => s.title)
                  .join(" e ")}.`
              : "."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheet({ type: "cover" })}
          aria-label="Modifica coperto e chiusura cucina"
          className="min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
        >
          Modifica
        </button>
      </div>

      {filterOn && (
        <div className="sticky top-[calc(4.25rem+env(safe-area-inset-top))] z-20 mb-5 rounded-2xl border border-gold/40 bg-surface/95 p-3.5 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gold">Allergeni da compilare</p>
              <p className="text-xs text-foreground-muted">
                {compiledFood} di {totalFood} piatti compilati · {missingAllergens} da fare
                {missingIn(section) > 0 && missingAllergens !== missingIn(section) ? ` (${missingIn(section)} in questa sezione)` : ""}
              </p>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-label="Piatti con allergeni compilati"
                aria-valuemin={0}
                aria-valuemax={totalFood}
                aria-valuenow={compiledFood}
              >
                <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${totalFood ? Math.round((compiledFood / totalFood) * 100) : 0}%` }} />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {missingTargets.some((target) => target.key !== activeSlug) && (
                <button
                  type="button"
                  onClick={goToMissing}
                  className="min-h-10 rounded-full border border-gold/40 px-3.5 text-xs font-semibold text-gold hover:bg-gold/10"
                >
                  Prossima sezione →
                </button>
              )}
              <button
                type="button"
                onClick={() => setMissingOnly(false)}
                className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
              >
                Mostra tutto
              </button>
            </div>
          </div>
        </div>
      )}

      {!filterOn && missingAllergens > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-gold">
          <p className="min-w-0 flex-1">
            {missingAllergens === 1 ? "1 piatto ha gli allergeni da compilare." : `${missingAllergens} piatti hanno gli allergeni da compilare.`}{" "}
            <span className="text-gold/80">Finché non lo fai, i clienti vedono «da verificare con il personale».</span>
          </p>
          <button
            type="button"
            onClick={goToMissing}
            className="min-h-10 shrink-0 rounded-full bg-gold/20 px-3.5 text-xs font-semibold text-gold hover:bg-gold/30"
          >
            Vedi i piatti →
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
          <nav aria-label="Sezioni" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {sections.map((s) => {
              const count = filterOn ? missingIn(s) : s.groups.reduce((n, g) => n + g.items.length, 0);
              const active = !promoSelected && s.slug === section?.slug;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(s.slug)}
                  aria-current={active ? "true" : undefined}
                  className={`flex min-h-10 items-center justify-between gap-3 rounded-full px-3.5 text-sm font-medium transition-colors lg:rounded-xl ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "border border-border text-foreground-muted hover:border-accent hover:text-foreground lg:border-transparent"
                  } ${filterOn && count === 0 && !active ? "opacity-50" : ""}`}
                >
                  <span>{s.label}</span>
                  <span className={`text-xs ${active ? "text-accent-foreground/80" : "text-foreground-muted/70"}`}>{count}</span>
                </button>
              );
            })}
          </nav>

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Eventi e annunci</p>
            {currentPromos.length === 0 && <p className="text-xs text-foreground-muted">Nessun evento in programma.</p>}
            {currentPromos.length > 0 && (
              <nav aria-label="Eventi e annunci" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
                {currentPromos.map((p) => promoButton(p))}
              </nav>
            )}
            {archivePromos.length > 0 && (
              <details className="mt-3" open={archivePromos.some((p) => activeSlug === `promo:${p.id}`) || undefined}>
                <summary className="flex min-h-10 cursor-pointer items-center text-xs font-medium uppercase tracking-wide text-foreground-muted hover:text-foreground">
                  Archivio ({archivePromos.length})
                </summary>
                <nav aria-label="Archivio eventi" className="mt-2 flex flex-wrap gap-2 lg:flex-col lg:gap-1">
                  {archivePromos.map((p) => promoButton(p))}
                </nav>
              </details>
            )}
          </div>
        </div>

        <div ref={contentRef} className="min-w-0 scroll-mt-20 space-y-4">
          {promoSelected && !activePromo && <p className="py-6 text-sm text-foreground-muted">Carico la pagina…</p>}

          {activePromo && (
            <PromoCard
              promo={activePromo}
              today={today}
              run={run}
              onEdit={() => setSheet({ type: "promo", id: activePromo.id })}
              onDuplicate={() => setSheet({ type: "promo-duplicate", id: activePromo.id })}
            />
          )}

          {activePromo && activePromo.kind === "NOTICE" && (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-foreground-muted">
              Un annuncio ha testo e foto, senza menù. Per aggiungere un menù speciale con voci e prezzi crea un «Evento con menù speciale».
            </p>
          )}

          {section && (
            <>
              <h2 className="text-base font-semibold text-foreground">{activePromo ? "Menù speciale" : section.title}</h2>

              {!activePromo && (
                <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Testi di questa sezione</p>
                    {section.note && (
                      <p className="text-foreground">
                        <span className="text-foreground-muted">Nota: </span>
                        {section.note}
                      </p>
                    )}
                    {section.addon && (
                      <p className="text-foreground">
                        <span className="text-foreground-muted">Avviso{section.addonTitle ? ` · ${section.addonTitle}` : ""}: </span>
                        {section.addon}
                      </p>
                    )}
                    {section.coverApplies && (
                      <>
                        <p className="text-foreground">
                          <span className="text-foreground-muted">Chiusura cucina: </span>
                          {coverInfo.kitchenNote || "nessun avviso"}
                        </p>
                        <p className="text-foreground">
                          <span className="text-foreground-muted">Coperto: </span>
                          {coverInfo.cover || "nessuno"}
                        </p>
                        <p className="text-[11px] text-foreground-muted">Valgono per tutta la cucina: si cambiano nel riquadro in alto.</p>
                      </>
                    )}
                    {!section.note && !section.addon && !section.coverApplies && (
                      <p className="text-foreground-muted">Nessun testo: compaiono solo titolo e voci.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheet({ type: "texts" })}
                    aria-label="Modifica i testi di questa sezione"
                    className="min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
                  >
                    Modifica
                  </button>
                </div>
              )}

              {filterOn && missingIn(section) === 0 && (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-foreground-muted">
                  {section.kind === "WINE"
                    ? "I vini non hanno allergeni da compilare: vale la nota sui solfiti."
                    : "In questa sezione i piatti sono tutti a posto."}
                </p>
              )}

              {section.groups.map((group, index) => {
                // Nella vista "da compilare" restano solo i piatti senza allergeni; i
                // gruppi rimasti vuoti spariscono, i vini non hanno nulla da compilare.
                const shown =
                  filterOn && section.kind === "FOOD" ? { ...group, items: group.items.filter((i) => !i.allergensReviewed) } : group;
                if (filterOn && (section.kind === "WINE" || shown.items.length === 0)) return null;
                return (
                  <GroupCard
                    key={group.id}
                    group={shown}
                    kind={section.kind}
                    isFirst={index === 0}
                    isLast={index === section.groups.length - 1}
                    isSold={isSold}
                    run={run}
                    onToggleSold={toggleSold}
                    onEdit={(item) => setSheet({ type: "item", itemId: item.id, groupId: group.id })}
                    onAdd={() => setSheet({ type: "item", itemId: null, groupId: group.id })}
                    onImport={() => setSheet({ type: "import", groupId: group.id })}
                    compileMode={filterOn}
                  />
                );
              })}

              <NewGroupForm sectionId={section.id} run={run} />
            </>
          )}
        </div>
      </div>

      {sheet?.type === "item" && itemSheetGroup && itemSheetSection && (sheet.itemId === null || editingItem) && (
        <ItemSheet
          key={sheet.itemId ?? `new-${sheet.groupId}`}
          sections={itemSheetSection.promoId ? [itemSheetSection] : sections}
          section={itemSheetSection}
          groupId={itemSheetGroup.id}
          item={editingItem}
          isFirst={itemIndex <= 0}
          isLast={itemIndex === -1 || itemIndex === itemSheetGroup.items.length - 1}
          run={run}
          onClose={() => setSheet(null)}
          onDuplicated={(newId) => setPendingOpenId(newId)}
          nextMissing={nextMissing}
          onNext={(n) => {
            setSheet({ type: "item", itemId: n.itemId, groupId: n.groupId });
            select(n.key);
          }}
        />
      )}
      {sheet?.type === "import" && section && (
        <ImportSheet key={sheet.groupId} section={section} groupId={sheet.groupId} run={run} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === "cover" && <CoverSheet info={coverInfo} run={run} onClose={() => setSheet(null)} />}
      {sheet?.type === "promo" && (sheet.id === null || promoToEdit) && (
        <PromoSheet
          key={sheet.id ?? "new"}
          promo={promoToEdit}
          today={today}
          run={run}
          onSaved={(id) => setActiveSlug(`promo:${id}`)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === "promo-duplicate" && promoToDuplicate && (
        <DuplicatePromoSheet
          promo={promoToDuplicate}
          today={today}
          run={run}
          onSaved={(id) => setActiveSlug(`promo:${id}`)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === "texts" && section && <SectionTextsSheet section={section} run={run} onClose={() => setSheet(null)} />}
      {sheet?.type === "history" && <HistorySheet history={history} onUndo={undo} onClose={() => setSheet(null)} />}
    </div>
  );
}

function GroupCard({
  group,
  kind,
  isFirst,
  isLast,
  isSold,
  run,
  onToggleSold,
  onEdit,
  onAdd,
  onImport,
  compileMode,
}: {
  group: EditorGroup;
  kind: "WINE" | "FOOD";
  isFirst: boolean;
  isLast: boolean;
  isSold: (item: EditorItem) => boolean;
  run: RunFn;
  onToggleSold: (item: EditorItem) => void;
  onEdit: (item: EditorItem) => void;
  onAdd: () => void;
  onImport: () => void;
  compileMode: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveTitle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => renameGroup(group.id, title), "Gruppo rinominato");
    setBusy(false);
    if (result) setRenaming(false);
  }

  async function move(direction: "up" | "down") {
    setBusy(true);
    await run(() => moveGroup(group.id, direction), "");
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const result = await run(() => deleteGroup(group.id), `Gruppo «${group.title}» eliminato`);
    setBusy(false);
    if (result) setConfirmingDelete(false);
  }

  const iconButton =
    "flex h-10 w-10 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-30";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5">
        {renaming ? (
          <form onSubmit={saveTitle} className="flex min-w-0 flex-1 items-center gap-2 py-1">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="min-w-0 flex-1 rounded-lg border border-accent bg-surface-2 px-2.5 py-1.5 text-base text-foreground outline-none sm:text-sm"
            />
            <button type="submit" disabled={busy || !title.trim()} className="min-h-10 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground disabled:opacity-50">
              Salva
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setTitle(group.title);
              }}
              className="min-h-10 rounded-full border border-border px-3 text-xs font-medium text-foreground-muted"
            >
              Annulla
            </button>
          </form>
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate py-1 text-sm font-semibold text-foreground">
              {group.title} <span className="font-normal text-foreground-muted">· {group.items.length}</span>
            </h3>
            <button type="button" onClick={() => setRenaming(true)} className={iconButton} aria-label={`Rinomina ${group.title}`} title="Rinomina">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button type="button" disabled={busy || isFirst} onClick={() => move("up")} className={iconButton} aria-label="Sposta gruppo su" title="Sposta su">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 6l7 9H5z" />
              </svg>
            </button>
            <button type="button" disabled={busy || isLast} onClick={() => move("down")} className={iconButton} aria-label="Sposta gruppo giù" title="Sposta giù">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 18l-7-9h14z" />
              </svg>
            </button>
            <button type="button" onClick={() => setConfirmingDelete(true)} className={`${iconButton} hover:!text-danger`} aria-label={`Elimina ${group.title}`} title="Elimina gruppo">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
              </svg>
            </button>
          </>
        )}
      </header>

      {confirmingDelete && (
        <div className="border-b border-danger/30 bg-danger-bg px-3 py-3">
          <p className="text-xs text-danger">
            Eliminare il gruppo «{group.title}»{group.items.length > 0 ? ` e le sue ${group.items.length} voci` : ""}? Lo recuperi
            dallo storico.
          </p>
          <div className="mt-2.5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted">
              Annulla
            </button>
            <button type="button" disabled={busy} onClick={remove} className="min-h-10 rounded-full bg-danger px-3.5 text-xs font-semibold text-white disabled:opacity-60">
              Sì, elimina
            </button>
          </div>
        </div>
      )}

      {group.items.length === 0 ? (
        <p className="px-3 py-4 text-sm text-foreground-muted">Nessuna voce in questo gruppo.</p>
      ) : (
        <ul>
          {group.items.map((item) => {
            const sold = isSold(item);
            const secondary = kind === "WINE" ? item.sub : item.description;
            return (
              <li key={item.id} className={`flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0 ${sold ? "bg-surface-2/60" : ""}`}>
                <button type="button" onClick={() => onEdit(item)} className="min-h-12 min-w-0 flex-1 py-1 text-left" aria-label={`Modifica ${item.name}`}>
                  <span className={`block truncate text-sm font-medium ${sold ? "text-foreground-muted line-through" : "text-foreground"}`}>
                    {item.name}
                    {item.enomatic && <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-accent">Enomatic</span>}
                  </span>
                  {secondary && <span className="block truncate text-xs text-foreground-muted">{secondary}</span>}
                  <span className="block text-xs text-foreground-muted/90">{priceSummary(item, kind)}</span>
                  {kind === "FOOD" && !item.allergensReviewed && (
                    <span className="mt-0.5 block text-[11px] font-medium text-gold">Allergeni da compilare</span>
                  )}
                </button>
                {compileMode ? (
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="min-h-11 shrink-0 rounded-full bg-gold/20 px-4 text-xs font-semibold text-gold hover:bg-gold/30"
                  >
                    Compila
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-pressed={sold}
                    onClick={() => onToggleSold(item)}
                    title={sold ? "Segna di nuovo disponibile" : "Segna esaurita"}
                    className={`min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                      sold
                        ? "border-danger bg-danger text-white"
                        : "border-border text-foreground-muted hover:border-danger hover:text-danger"
                    }`}
                  >
                    Esaurito
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onAdd}
          className="min-h-11 min-w-[10rem] flex-1 rounded-xl border border-dashed border-border text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
        >
          + {kind === "WINE" ? "Aggiungi vino" : "Aggiungi voce"}
        </button>
        <button
          type="button"
          onClick={onImport}
          className="min-h-11 min-w-[10rem] flex-1 rounded-xl border border-dashed border-border text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
        >
          Incolla più voci
        </button>
      </div>
    </section>
  );
}

function NewGroupForm({ sectionId, run }: { sectionId: string; run: RunFn }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => createGroup(sectionId, title), "Gruppo aggiunto");
    setBusy(false);
    if (result) {
      setTitle("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-2xl border border-dashed border-border text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
      >
        + Aggiungi gruppo
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="Nome del gruppo (es. Vini dolci)"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-accent sm:text-sm"
      />
      <button type="submit" disabled={busy || !title.trim()} className="min-h-11 rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground disabled:opacity-50">
        Aggiungi
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTitle("");
        }}
        className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted"
      >
        Annulla
      </button>
    </form>
  );
}
