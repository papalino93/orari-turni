"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { formatPrice } from "@/lib/menu-format";
import { createGroup, deleteGroup, moveGroup, renameGroup, resetSoldOut, setSoldOut, undoChange } from "./actions";
import type { ChangeResult } from "./actions";
import { ItemSheet } from "./item-sheet";
import { HistorySheet, SectionTextsSheet } from "./side-sheets";

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
  soldOut: boolean;
};

export type EditorGroup = { id: string; title: string; columns: boolean; items: EditorItem[] };

export type EditorSection = {
  id: string;
  slug: string;
  label: string;
  title: string;
  kind: "WINE" | "FOOD";
  note: string | null;
  cover: string | null;
  addonTitle: string | null;
  addon: string | null;
  groups: EditorGroup[];
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
  | { type: "texts" }
  | { type: "history" }
  | null;

const EMPTY: Record<string, boolean> = {};

function priceSummary(item: EditorItem, kind: "WINE" | "FOOD"): string {
  if (kind === "FOOD") return item.priceCents === null ? "" : `€ ${formatPrice(item.priceCents)}`;
  const parts: string[] = [];
  if (item.priceGlassCents !== null) parts.push(`Calice ${formatPrice(item.priceGlassCents)}`);
  if (item.priceBottleCents !== null) parts.push(`Bottiglia ${formatPrice(item.priceBottleCents)}`);
  return parts.join(" · ");
}

export function MenuEditor({ sections, history }: { sections: EditorSection[]; history: HistoryEntry[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [activeSlug, setActiveSlug] = useState(sections[0]?.slug ?? "");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  // Stato "esaurito" mostrato subito, in attesa della risposta del server: vale
  // solo finché i dati ricaricati non lo sostituiscono (si confronta l'identità
  // dei dati, così non serve nessun effetto per "ripulirlo").
  const [local, setLocal] = useState<{ base: EditorSection[]; map: Record<string, boolean> }>({
    base: sections,
    map: EMPTY,
  });
  const localSold = local.base === sections ? local.map : EMPTY;

  const section = sections.find((s) => s.slug === activeSlug) ?? sections[0];
  const isSold = (item: EditorItem) => localSold[item.id] ?? item.soldOut;
  const soldOutCount = sections.reduce(
    (n, s) => n + s.groups.reduce((m, g) => m + g.items.filter(isSold).length, 0),
    0,
  );

  // Dopo "Duplica": la copia compare coi dati ricaricati, e solo allora si
  // apre per la modifica.
  if (pendingOpenId) {
    const found = sections.some((s) => s.groups.some((g) => g.items.some((i) => i.id === pendingOpenId)));
    if (found) {
      const group = sections.flatMap((s) => s.groups).find((g) => g.items.some((i) => i.id === pendingOpenId));
      if (group) {
        setSheet({ type: "item", itemId: pendingOpenId, groupId: group.id });
        setPendingOpenId(null);
      }
    }
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
    for (const s of sections) for (const g of s.groups) for (const i of g.items) map[i.id] = false;
    setLocal({ base: sections, map });
    startTransition(async () => {
      const result = await run(() => resetSoldOut(), "Tutte le voci sono di nuovo disponibili");
      if (result === null) setLocal({ base: sections, map: { ...localSold } });
    });
  }

  const editingItem =
    sheet?.type === "item" && sheet.itemId
      ? sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((i) => i.id === sheet.itemId) ?? null
      : null;
  const itemSheetGroup =
    sheet?.type === "item"
      ? sections.flatMap((s) => s.groups).find((g) => g.id === (editingItem?.groupId ?? sheet.groupId))
      : undefined;
  const itemSheetSection = itemSheetGroup
    ? sections.find((s) => s.groups.some((g) => g.id === itemSheetGroup.id))
    : undefined;
  const itemIndex = itemSheetGroup && editingItem ? itemSheetGroup.items.findIndex((i) => i.id === editingItem.id) : -1;

  if (!section) {
    return <p className="text-sm text-foreground-muted">Il menù non è ancora stato caricato.</p>;
  }

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

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Sezioni" className="flex flex-wrap gap-2 lg:sticky lg:top-24 lg:h-fit lg:flex-col lg:gap-1">
          {sections.map((s) => {
            const count = s.groups.reduce((n, g) => n + g.items.length, 0);
            const active = s.slug === section.slug;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSlug(s.slug)}
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

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
            <button
              type="button"
              onClick={() => setSheet({ type: "texts" })}
              className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
            >
              Testi della sezione
            </button>
          </div>

          {section.groups.map((group, index) => (
            <GroupCard
              key={group.id}
              group={group}
              kind={section.kind}
              isFirst={index === 0}
              isLast={index === section.groups.length - 1}
              isSold={isSold}
              run={run}
              onToggleSold={toggleSold}
              onEdit={(item) => setSheet({ type: "item", itemId: item.id, groupId: group.id })}
              onAdd={() => setSheet({ type: "item", itemId: null, groupId: group.id })}
            />
          ))}

          <NewGroupForm sectionId={section.id} run={run} />
        </div>
      </div>

      {sheet?.type === "item" && itemSheetGroup && itemSheetSection && (sheet.itemId === null || editingItem) && (
        <ItemSheet
          key={sheet.itemId ?? `new-${sheet.groupId}`}
          sections={sections}
          section={itemSheetSection}
          groupId={itemSheetGroup.id}
          item={editingItem}
          isFirst={itemIndex <= 0}
          isLast={itemIndex === -1 || itemIndex === itemSheetGroup.items.length - 1}
          run={run}
          onClose={() => setSheet(null)}
          onDuplicated={(newId) => setPendingOpenId(newId)}
        />
      )}
      {sheet?.type === "texts" && <SectionTextsSheet section={section} run={run} onClose={() => setSheet(null)} />}
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

      <div className="border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onAdd}
          className="min-h-11 w-full rounded-xl border border-dashed border-border text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
        >
          + {kind === "WINE" ? "Aggiungi vino" : "Aggiungi voce"}
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
