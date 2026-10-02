"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { blockStatus, formatPrice, priceLine, wineDetail, type MenuBlockView } from "@/lib/menu-format";
import { traitLabel } from "@/lib/wine-traits";
import { createGroup, deleteGroup, moveGroup, renameGroup, resetSoldOut, setSoldOut, undoChange } from "./actions";
import type { ChangeResult } from "./actions";
import { BlockSheet, BlocksPanel, type SectionChoice } from "./block-ui";
import { DailyPanel, type DailyData } from "./daily-ui";
import { ImportSheet } from "./import-sheet";
import { ItemSheet } from "./item-sheet";
import { DuplicatePromoSheet, effectiveStatus, PromoCard, PromoSheet, StatusChip } from "./promo-ui";
import { ItemSearch } from "./search-ui";
import { HistorySheet, PreviewSheet, QrSheet, SectionTextsSheet } from "./side-sheets";
import { ContactsSheet, HeroSheet, HoursSheet, VenuePanel, type EditorVenue, type VenueSheetKind } from "./venue-ui";

export type EditorItem = {
  id: string;
  groupId: string;
  name: string;
  wineName: string | null;
  denomination: string | null;
  vintage: string | null;
  sub: string | null;
  grapes: string | null;
  region: string | null;
  country: string | null;
  description: string | null;
  priceGlassCents: number | null;
  priceBottleCents: number | null;
  priceCents: number | null;
  enomatic: boolean;
  traits: string[];
  pairWineId: string | null;
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
  dailyOnly: boolean;
  kind: "WINE" | "FOOD";
  note: string | null;
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
  // `queue`: percorso «Compila allergeni» (piatti da compilare, nell'ordine in cui si vedono).
  | { type: "item"; itemId: string | null; groupId: string; queue?: QueueItem[] }
  | { type: "import"; groupId: string }
  | { type: "texts" }
  | { type: "block"; id: string | null }
  | { type: "venue"; kind: VenueSheetKind }
  | { type: "history" }
  | { type: "preview" }
  | { type: "qr" }
  | { type: "promo"; id: string | null }
  | { type: "promo-duplicate"; id: string }
  | null;

// key: dove portare la gestione per mostrare il piatto (null = resta dove sei, es. «Oggi fuori menù»).
type QueueItem = { itemId: string; groupId: string; name: string; key: string | null };

const EMPTY: Record<string, boolean> = {};

function priceSummary(item: EditorItem, kind: "WINE" | "FOOD"): string {
  if (item.variants) return item.variants.map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ");
  if (kind === "FOOD") return item.priceCents === null ? "" : `€ ${formatPrice(item.priceCents)}`;
  const parts: string[] = [];
  if (item.priceGlassCents !== null) parts.push(`Calice ${formatPrice(item.priceGlassCents)}`);
  if (item.priceBottleCents !== null) parts.push(`Bottiglia ${formatPrice(item.priceBottleCents)}`);
  return parts.join(" · ");
}

// Un vino del menù fisso che si può abbinare a un piatto («Abbinamento consigliato»).
export type PairWine = { id: string; name: string; section: string; detail: string; soldOut: boolean };

export function MenuEditor({
  sections,
  daily,
  promos,
  today,
  blocks,
  venue,
  history,
}: {
  sections: EditorSection[];
  daily: DailyData;
  promos: EditorPromo[];
  today: string;
  blocks: MenuBlockView[];
  venue: EditorVenue;
  history: HistoryEntry[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [activeSlug, setActiveSlug] = useState(sections[0]?.slug ?? "");
  const [sheet, setSheet] = useState<SheetState>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  // «Compila ora» dopo aver aggiunto un piatto senza allergeni: la scheda si apre già sugli allergeni.
  const [focusAllergens, setFocusAllergens] = useState<string | null>(null);
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
  const allSections = [...sections, ...eventSections, ...daily.sections];
  // Sezioni in cui si può scegliere di mostrare un'informazione: quelle fisse e i menù speciali non conclusi.
  const sectionChoices: SectionChoice[] = [
    ...sections.map((s) => ({ id: s.id, label: s.title, event: false })),
    ...promos.flatMap((p) => (p.section && effectiveStatus(p, today) !== "past" ? [{ id: p.section.id, label: p.title, event: true }] : [])),
  ];
  const blockToEdit = sheet?.type === "block" && sheet.id ? (blocks.find((b) => b.id === sheet.id) ?? null) : null;
  // Selezione: o una sezione fissa (slug) o una pagina promozionale ("promo:<id>").
  const promoSelected = activeSlug.startsWith("promo:");
  const activePromo = promoSelected ? (promos.find((p) => `promo:${p.id}` === activeSlug) ?? null) : null;
  const section: EditorSection | null = promoSelected
    ? (activePromo?.section ?? null)
    : (sections.find((s) => s.slug === activeSlug) ?? sections[0] ?? null);
  const sectionBlocks = section ? blocks.filter((b) => b.placement === "SECTIONS" && b.sectionIds.includes(section.id)) : [];
  // Piatti con allergeni "da compilare": sul menù dei clienti risultano "da
  // verificare con il personale". Gli eventi già conclusi non contano.
  const liveEventSections = promos.flatMap((p) =>
    p.section && effectiveStatus(p, today) !== "past" ? [p.section] : [],
  );
  const missingAllergens = [...daily.sections, ...sections, ...liveEventSections].reduce(
    (n, s) => n + (s.kind === "FOOD" ? s.groups.reduce((m, g) => m + g.items.filter((i) => !i.allergensReviewed).length, 0) : 0),
    0,
  );
  // Piatti con allergeni da compilare, nell'ordine in cui si vedono (sezioni fisse, poi eventi non conclusi):
  // servono al percorso «Compila allergeni».
  const missingQueue: QueueItem[] = [
    // «Oggi fuori menù» è in cima alla gestione e del menù: si comincia da lì.
    ...daily.sections.map((s) => ({ key: null, section: s })),
    ...sections.map((s) => ({ key: s.slug, section: s })),
    ...promos.flatMap((p) => (p.section && effectiveStatus(p, today) !== "past" ? [{ key: `promo:${p.id}`, section: p.section }] : [])),
  ].flatMap((target) =>
    target.section.kind === "FOOD"
      ? target.section.groups.flatMap((g) =>
          g.items.filter((i) => !i.allergensReviewed).map((i) => ({ itemId: i.id, groupId: g.id, name: i.name, key: target.key })),
        )
      : [],
  );
  const isSold = (item: EditorItem) => localSold[item.id] ?? item.soldOut;
  // Vini del menù fisso: scelta dell'abbinamento e nomi mostrati nell'elenco dei piatti.
  const wines: PairWine[] = sections
    .filter((s) => s.kind === "WINE")
    .flatMap((s) =>
      s.groups.flatMap((g) =>
        g.items.map((i) => ({ id: i.id, name: i.name, section: s.label, detail: [i.wineName, wineDetail(i), priceSummary(i, "WINE")].filter(Boolean).join(" · "), soldOut: isSold(i) })),
      ),
    );
  const wineNames = new Map(wines.map((w) => [w.id, w.name]));
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
  function select(key: string | null) {
    if (key === null) return;
    setActiveSlug(key);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  // «Compila allergeni»: apre il primo piatto mancante; «Salva e passa al successivo» scorre gli altri.
  function startCompile() {
    const first = missingQueue[0];
    if (!first) return;
    setSheet({ type: "item", itemId: first.itemId, groupId: first.groupId, queue: missingQueue });
    select(first.key);
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
  const queue = sheet?.type === "item" ? sheet.queue : undefined;
  const queueIndex = queue && editingItem ? queue.findIndex((m) => m.itemId === editingItem.id) : -1;
  const nextMissing = queue && queueIndex >= 0 ? (queue[queueIndex + 1] ?? null) : null;
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
          <button
            type="button"
            onClick={() => setSheet({ type: "preview" })}
            className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            Anteprima
          </button>
          <button
            type="button"
            onClick={() => setSheet({ type: "qr" })}
            className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            Codice QR
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

      <ItemSearch
        sections={allSections.filter((s) => !s.promoId || effectiveStatus(promos.find((p) => p.id === s.promoId)!, today) !== "past")}
        isSold={isSold}
        onToggleSold={toggleSold}
        onEdit={(item, groupId) => setSheet({ type: "item", itemId: item.id, groupId })}
      />

      <DailyPanel
        daily={daily}
        run={run}
        onAdd={(groupId) => setSheet({ type: "item", itemId: null, groupId })}
        onEdit={(item, groupId) => setSheet({ type: "item", itemId: item.id, groupId })}
      />

      <BlocksPanel
        blocks={blocks}
        choices={sectionChoices}
        today={today}
        run={run}
        onEdit={(id) => setSheet({ type: "block", id })}
        onAdd={() => setSheet({ type: "block", id: null })}
      />

      <VenuePanel venue={venue} onOpen={(kind) => setSheet({ type: "venue", kind })} />

      {missingAllergens > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-gold">
          <p className="min-w-0 flex-1">
            {missingAllergens === 1 ? "1 piatto ha gli allergeni da compilare." : `${missingAllergens} piatti hanno gli allergeni da compilare.`}{" "}
            <span className="text-gold/80">Finché non lo fai, i clienti vedono «da verificare con il personale».</span>
          </p>
          <button
            type="button"
            onClick={startCompile}
            className="min-h-10 shrink-0 rounded-full bg-gold/20 px-3.5 text-xs font-semibold text-gold hover:bg-gold/30"
          >
            Compila allergeni ({missingAllergens} da fare)
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
          <nav aria-label="Sezioni" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {sections.map((s) => {
              const count = s.groups.reduce((n, g) => n + g.items.length, 0);
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
                  }`}
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
                    {sectionBlocks.map((b) => (
                      <p key={b.id} className="flex items-baseline gap-2 text-foreground">
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground-muted">{b.kind === "PRICE" ? "Prezzo: " : b.kind === "NOTICE" ? "Avviso: " : "Informazione: "}</span>
                          {b.kind === "PRICE" ? priceLine(b) : b.text}
                          {blockStatus(b, today) !== "live" && <span className="text-foreground-muted"> (non visibile oggi)</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSheet({ type: "block", id: b.id })}
                          className="shrink-0 text-[11px] font-medium text-accent hover:underline"
                        >
                          Modifica
                        </button>
                      </p>
                    ))}
                    {!section.note && !section.addon && sectionBlocks.length === 0 && (
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

              {section.groups.map((group, index) => {
                return (
                  <GroupCard
                    key={group.id}
                    group={group}
                    kind={section.kind}
                    isFirst={index === 0}
                    isLast={index === section.groups.length - 1}
                    isSold={isSold}
                    wineNames={wineNames}
                    run={run}
                    onToggleSold={toggleSold}
                    onEdit={(item) => setSheet({ type: "item", itemId: item.id, groupId: group.id })}
                    onAdd={() => setSheet({ type: "item", itemId: null, groupId: group.id })}
                    onImport={() => setSheet({ type: "import", groupId: group.id })}
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
          sections={itemSheetSection.promoId || itemSheetSection.dailyOnly ? [itemSheetSection] : sections}
          section={itemSheetSection}
          groupId={itemSheetGroup.id}
          item={editingItem}
          wines={wines}
          isFirst={itemIndex <= 0}
          isLast={itemIndex === -1 || itemIndex === itemSheetGroup.items.length - 1}
          run={run}
          onClose={() => setSheet(null)}
          onDuplicated={(newId) => setPendingOpenId(newId)}
          focusAllergens={focusAllergens === sheet.itemId}
          onMissingAllergens={(newId, name) =>
            toast.showSuccess(`«${name}» aggiunta · mancano gli allergeni`, {
              label: "Compila ora",
              onClick: () => {
                setFocusAllergens(newId);
                setPendingOpenId(newId);
              },
            })
          }
          nextMissing={nextMissing}
          progress={queue && queueIndex >= 0 ? { position: queueIndex + 1, total: queue.length } : null}
          onNext={(n) => {
            setSheet({ type: "item", itemId: n.itemId, groupId: n.groupId, queue });
            select(n.key);
          }}
        />
      )}
      {sheet?.type === "import" && section && (
        <ImportSheet key={sheet.groupId} section={section} groupId={sheet.groupId} run={run} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === "preview" && <PreviewSheet onClose={() => setSheet(null)} />}
      {sheet?.type === "qr" && <QrSheet onClose={() => setSheet(null)} />}
      {sheet?.type === "venue" && sheet.kind === "hero" && <HeroSheet venue={venue} run={run} onClose={() => setSheet(null)} />}
      {sheet?.type === "venue" && sheet.kind === "hours" && (
        <HoursSheet hours={venue.hours} today={today} run={run} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === "venue" && sheet.kind === "contacts" && <ContactsSheet contacts={venue.contacts} run={run} onClose={() => setSheet(null)} />}
      {sheet?.type === "block" && (sheet.id === null || blockToEdit) && (
        <BlockSheet key={sheet.id ?? "new"} block={blockToEdit} choices={sectionChoices} run={run} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === "promo" && (sheet.id === null || promoToEdit) && (
        <PromoSheet
          key={sheet.id ?? "new"}
          promo={promoToEdit}
          today={today}
          blocks={blocks}
          fixedFoodSectionIds={sections.filter((s) => s.kind === "FOOD").map((s) => s.id)}
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
  wineNames,
  run,
  onToggleSold,
  onEdit,
  onAdd,
  onImport,
}: {
  group: EditorGroup;
  kind: "WINE" | "FOOD";
  isFirst: boolean;
  isLast: boolean;
  isSold: (item: EditorItem) => boolean;
  wineNames: Map<string, string>;
  run: RunFn;
  onToggleSold: (item: EditorItem) => void;
  onEdit: (item: EditorItem) => void;
  onAdd: () => void;
  onImport: () => void;
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
            Eliminare il gruppo «{group.title}»{group.items.length > 0 ? ` e ${group.items.length === 1 ? "la sua voce" : `le sue ${group.items.length} voci`}` : ""}? Lo recuperi
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
            const secondary = kind === "WINE" ? [item.wineName, wineDetail(item)].filter(Boolean).join(" · ") : item.description;
            return (
              <li key={item.id} className={`flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0 ${sold ? "bg-surface-2/60" : ""}`}>
                <button type="button" onClick={() => onEdit(item)} className="min-h-12 min-w-0 flex-1 py-1 text-left" aria-label={`Modifica ${item.name}`}>
                  <span className={`block line-clamp-2 break-words text-sm font-medium ${sold ? "text-foreground-muted line-through" : "text-foreground"}`}>
                    {item.name}
                    {item.enomatic && <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-accent">Enomatic</span>}
                  </span>
                  {secondary && <span className="block line-clamp-2 break-words text-xs text-foreground-muted">{secondary}</span>}
                  <span className="block text-xs text-foreground-muted/90">{priceSummary(item, kind)}</span>
                  {kind === "WINE" && item.traits.length > 0 && (
                    <span className="mt-0.5 block text-[11px] text-foreground-muted">{item.traits.map(traitLabel).join(" · ")}</span>
                  )}
                  {item.pairWineId && wineNames.has(item.pairWineId) && (
                    <span className="mt-0.5 block truncate text-[11px] text-foreground-muted">
                      Abbinamento: {wineNames.get(item.pairWineId)}
                    </span>
                  )}
                  {kind === "FOOD" && !item.allergensReviewed && (
                    <span className="mt-0.5 block text-[11px] font-medium text-gold">Allergeni da compilare</span>
                  )}
                </button>
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
