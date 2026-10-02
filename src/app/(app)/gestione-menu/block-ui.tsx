"use client";

import { useState } from "react";
import {
  BLOCK_KIND_LABELS,
  PLACEMENT_LABELS,
  type BlockKind,
  type BlockPlacement,
  type MenuBlockView,
  blockStatus,
  blockSummary,
  formatBlockDates,
  formatMoney,
} from "@/lib/menu-format";
import { deleteBlock, moveBlock, saveBlock } from "./block-actions";
import { Field, Sheet, dateInputClass, inputClass } from "./sheet";
import type { RunFn } from "./menu-editor";

export type SectionChoice = { id: string; label: string; event: boolean };

const PLACEMENT_ORDER: BlockPlacement[] = ["TOP", "SECTIONS", "BOTTOM"];

const PLACEMENT_TITLES: Record<BlockPlacement, string> = {
  TOP: "In cima al menù",
  SECTIONS: "Sotto il titolo di una sezione",
  BOTTOM: "In fondo al menù",
};

const KIND_TAGS: Record<BlockKind, string> = { TEXT: "Testo", PRICE: "Prezzo", NOTICE: "Avviso" };

function whereLabel(block: MenuBlockView, choices: SectionChoice[]): string {
  if (block.placement !== "SECTIONS") return PLACEMENT_LABELS[block.placement];
  const names = block.sectionIds.map((id) => choices.find((c) => c.id === id)?.label).filter(Boolean) as string[];
  return names.length > 0 ? names.join(", ") : "nessuna sezione";
}

// Riquadro in alto: l'elenco delle informazioni del menù (coperto, chiusura cucina,
// avvisi…) con il punto in cui compaiono, e «+ Aggiungi».
export function BlocksPanel({
  blocks,
  choices,
  today,
  run,
  onEdit,
  onAdd,
}: {
  blocks: MenuBlockView[];
  choices: SectionChoice[];
  today: string;
  run: RunFn;
  onEdit: (id: string) => void;
  onAdd: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function move(id: string, direction: "up" | "down") {
    setBusy(true);
    await run(() => moveBlock(id, direction), "");
    setBusy(false);
  }

  return (
    <section aria-label="Informazioni del menù" className="mb-5 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Informazioni del menù</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">Coperto, chiusura cucina, avvisi e note: scegli cosa dire e dove compare.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="min-h-10 shrink-0 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          + Aggiungi
        </button>
      </div>

      {blocks.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-foreground-muted">
          Nessuna informazione. Aggiungi, per esempio, il coperto o un avviso sulla cucina.
        </p>
      )}

      {PLACEMENT_ORDER.map((placement) => {
        const group = blocks.filter((b) => b.placement === placement);
        if (group.length === 0) return null;
        return (
          <div key={placement} className="mt-3">
            <p className="mb-1 text-[11px] font-medium text-foreground-muted">{PLACEMENT_TITLES[placement]}</p>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {group.map((b, index) => {
                const status = blockStatus(b, today);
                const dates = formatBlockDates(b.startDate, b.endDate);
                return (
                  <li key={b.id} className={`flex items-center gap-2 px-3 py-2 ${status !== "live" ? "bg-surface-2/50" : ""}`}>
                    <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                      {KIND_TAGS[b.kind]}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(b.id)}
                      aria-label={`Modifica: ${blockSummary(b)}`}
                      className="min-h-10 min-w-0 flex-1 text-left"
                    >
                      <span className={`block truncate text-sm ${status !== "live" ? "text-foreground-muted" : "text-foreground"}`}>
                        {blockSummary(b)}
                      </span>
                      <span className="block truncate text-[11px] text-foreground-muted">
                        {placement === "SECTIONS" ? whereLabel(b, choices) : null}
                        {placement === "SECTIONS" && (dates || status === "hidden") ? " · " : null}
                        {dates}
                        {status === "hidden" && " · nascosto"}
                        {status === "expired" && " · scaduto"}
                        {status === "scheduled" && " · non ancora visibile"}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        disabled={busy || index === 0}
                        onClick={() => move(b.id, "up")}
                        aria-label="Sposta su"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:text-foreground disabled:opacity-30"
                      >
                        <Chevron up />
                      </button>
                      <button
                        type="button"
                        disabled={busy || index === group.length - 1}
                        onClick={() => move(b.id, "down")}
                        aria-label="Sposta giù"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:text-foreground disabled:opacity-30"
                      >
                        <Chevron />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={up ? "rotate-180" : ""}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const KIND_HELP: Record<BlockKind, string> = {
  TEXT: "Un paragrafo in corsivo, per esempio «La cucina chiude circa 40–50 minuti prima della chiusura del negozio».",
  PRICE: "Una riga con un costo, per esempio «Coperto € 1,00» o «Servizio 10%».",
  NOTICE: "Un riquadro ben visibile, per esempio «Domenica cucina chiusa».",
};

const PLACEMENT_HELP: Record<BlockPlacement, string> = {
  TOP: "Appena sotto «In evidenza», prima delle sezioni.",
  SECTIONS: "Sotto il titolo di una o più sezioni (anche i menù speciali degli eventi).",
  BOTTOM: "In fondo al menù, prima della legenda degli allergeni.",
};

// Foglio per creare o modificare un blocco: tipo, contenuto, dove compare, quando.
export function BlockSheet({
  block,
  choices,
  run,
  onClose,
}: {
  block: MenuBlockView | null;
  choices: SectionChoice[];
  run: RunFn;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<BlockKind>(block?.kind ?? "TEXT");
  const [label, setLabel] = useState(block?.label ?? "");
  const [text, setText] = useState(block?.text ?? "");
  const [price, setPrice] = useState(block?.priceCents != null ? formatMoney(block.priceCents) : "");
  const [placement, setPlacement] = useState<BlockPlacement>(block?.placement ?? "TOP");
  const [sectionIds, setSectionIds] = useState<string[]>(block?.sectionIds ?? []);
  const [startDate, setStartDate] = useState(block?.startDate ?? "");
  const [endDate, setEndDate] = useState(block?.endDate ?? "");
  const [hidden, setHidden] = useState(block?.hidden ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSection(id: string) {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (placement === "SECTIONS" && sectionIds.length === 0) {
      setError("Scegli almeno una sezione in cui mostrarlo.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError("La data «Al» non può essere prima di «Dal».");
      return;
    }
    setBusy(true);
    const result = await run(
      () =>
        saveBlock(block?.id ?? null, {
          kind,
          label,
          text,
          price,
          placement,
          sectionIds: placement === "SECTIONS" ? sectionIds : [],
          startDate,
          endDate,
          hidden,
        }),
      block ? "Informazione aggiornata" : "Informazione aggiunta",
    );
    setBusy(false);
    if (result) onClose();
  }

  async function remove() {
    if (!block) return;
    setBusy(true);
    const result = await run(() => deleteBlock(block.id), "Informazione eliminata");
    setBusy(false);
    if (result) onClose();
  }

  return (
    <Sheet title={block ? "Modifica informazione" : "Nuova informazione"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-foreground-muted">Che cos&apos;è</p>
          <div role="radiogroup" aria-label="Tipo di informazione" className="grid grid-cols-3 gap-2">
            {(Object.keys(BLOCK_KIND_LABELS) as BlockKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors ${
                  kind === k ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground-muted hover:border-accent hover:text-foreground"
                }`}
              >
                {BLOCK_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-foreground-muted/90">{KIND_HELP[kind]}</p>
        </div>

        {kind === "PRICE" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <Field label="Nome">
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={inputClass} placeholder="es. Coperto" />
            </Field>
            <Field label="Prezzo (€)">
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputClass} placeholder="1,00" />
            </Field>
          </div>
        ) : (
          <>
            <Field label={kind === "NOTICE" ? "Titolo (facoltativo)" : "Titoletto (facoltativo)"}>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={inputClass} placeholder={kind === "NOTICE" ? "es. Attenzione" : "es. Cucina"} />
            </Field>
            <Field label="Testo">
              <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={400} rows={4} className={inputClass} />
            </Field>
          </>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-foreground-muted">Dove compare</p>
          <div role="radiogroup" aria-label="Dove compare" className="space-y-2">
            {PLACEMENT_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={placement === p}
                onClick={() => setPlacement(p)}
                className={`block min-h-11 w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                  placement === p ? "border-accent bg-accent/10" : "border-border hover:border-accent"
                }`}
              >
                <span className="block text-sm font-medium text-foreground">{PLACEMENT_TITLES[p]}</span>
                <span className="block text-[11px] text-foreground-muted">{PLACEMENT_HELP[p]}</span>
              </button>
            ))}
          </div>
          {placement === "SECTIONS" && (
            <fieldset className="mt-2 rounded-xl border border-border px-3 py-1.5">
              <legend className="px-1 text-[11px] text-foreground-muted">Scegli le sezioni</legend>
              {choices.map((c) => (
                <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={sectionIds.includes(c.id)}
                    onChange={() => toggleSection(c.id)}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.event && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-foreground-muted">evento</span>}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-foreground-muted">Quando (facoltativo)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dal">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={dateInputClass} />
            </Field>
            <Field label="Al">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={dateInputClass} />
            </Field>
          </div>
          <p className="mt-1 text-[11px] text-foreground-muted/90">Se lasci vuoto compare sempre. Finita la data, sparisce da solo.</p>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          Nascondi per ora (non compare sul menù)
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : block ? "Salva" : "Aggiungi"}
        </button>

        {block &&
          (confirmDelete ? (
            <div className="rounded-xl border border-danger/30 bg-danger-bg px-3 py-3">
              <p className="text-xs text-danger">Eliminare questa informazione dal menù? La recuperi dallo storico.</p>
              <div className="mt-2.5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted">
                  Annulla
                </button>
                <button type="button" onClick={remove} disabled={busy} className="min-h-10 rounded-full bg-danger px-3.5 text-xs font-semibold text-white disabled:opacity-50">
                  Sì, elimina
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-danger hover:border-danger"
            >
              Elimina informazione
            </button>
          ))}
      </form>
    </Sheet>
  );
}
