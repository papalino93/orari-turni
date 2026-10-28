"use client";

import { IconInfo, IconVetrina, PanelHead } from "./panel-head";
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
import { deleteBlock, moveBlock, saveBlock, setBlockHidden } from "./block-actions";
import { setRecommended } from "./actions";
import { VetrinaCard } from "@/app/(public)/menu/menu-blocks";
import { sans, serif } from "@/app/(public)/menu/fonts";
import { Field, Sheet, dateInputClass, inputClass } from "./sheet";
import type { RunFn } from "./menu-editor";

export type SectionChoice = { id: string; label: string; event: boolean };

const PLACEMENT_ORDER: BlockPlacement[] = ["TOP", "SECTIONS", "BOTTOM"];

const PLACEMENT_TITLES: Record<BlockPlacement, string> = {
  TOP: "In cima al menù",
  SECTIONS: "Sotto il titolo di una categoria",
  BOTTOM: "In fondo al menù",
};

const KIND_TAGS: Record<BlockKind, string> = { TEXT: "Testo", PRICE: "Prezzo", NOTICE: "Avviso", HIGHLIGHT: "Vetrina" };

function whereLabel(block: MenuBlockView, choices: SectionChoice[]): string {
  if (block.placement !== "SECTIONS") return PLACEMENT_LABELS[block.placement];
  const names = block.sectionIds.map((id) => choices.find((c) => c.id === id)?.label).filter(Boolean) as string[];
  return names.length > 0 ? names.join(", ") : "nessuna categoria";
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
  defaultOpen = false,
}: {
  blocks: MenuBlockView[];
  choices: SectionChoice[];
  today: string;
  run: RunFn;
  onEdit: (id: string) => void;
  onAdd: () => void;
  // Nella scheda «Orari e contatti» è già aperto: lì non c'è altro.
  defaultOpen?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  async function move(id: string, direction: "up" | "down") {
    setBusy(true);
    await run(() => moveBlock(id, direction), "");
    setBusy(false);
  }

  return (
    <section aria-label="Informazioni del menù" className="mb-5 rounded-2xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-10 min-w-0 flex-1 items-center rounded-xl text-left"
        >
          <PanelHead
            icon={IconInfo}
            tone="accent"
            title="Informazioni del menù"
            chevron={open ? "open" : "closed"}
            badge={
              blocks.length > 0 ? (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent-hover">{blocks.length}</span>
              ) : undefined
            }
            subtitle={blocks.length === 0 ? "Coperto, chiusura cucina, avvisi: nessuna ancora." : blocks.map((b) => blockSummary(b)).join(" · ")}
          />
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="min-h-10 shrink-0 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          + Aggiungi
        </button>
      </div>

      {open && blocks.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-foreground-muted">
          Nessuna informazione. Aggiungi, per esempio, il coperto o un avviso sulla cucina.
        </p>
      )}

      {PLACEMENT_ORDER.map((placement) => {
        const group = blocks.filter((b) => b.placement === placement);
        if (!open || group.length === 0) return null;
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
  PRICE: "Una riga con un costo, per esempio «Coperto € 1,00»; sotto si può aggiungere una descrizione.",
  NOTICE: "Un riquadro ben visibile, per esempio «Domenica cucina chiusa» o una novità con il suo prezzo.",
  HIGHLIGHT: "Un riquadro elegante bordeaux e oro per una proposta speciale, per esempio «Su prenotazione · Caviale & Tartufo bianco».",
};

const PLACEMENT_HELP: Record<BlockPlacement, string> = {
  TOP: "Dopo «In evidenza» e «I consigli della casa», prima delle categorie.",
  SECTIONS: "Sotto il titolo di una o più categorie (anche i menù speciali degli eventi).",
  BOTTOM: "In fondo al menù, prima della legenda degli allergeni.",
};

// Foglio per creare o modificare un blocco: tipo, contenuto, dove compare, quando.
export function BlockSheet({
  block,
  choices,
  run,
  onClose,
  forSectionId = null,
  vetrina = false,
}: {
  block: MenuBlockView | null;
  // Riquadro in vetrina (dal riquadro «In vetrina» della scheda Menù): niente scelta del tipo.
  vetrina?: boolean;
  // Nuovo blocco aggiunto dai «Testi della sezione»: già sotto il titolo di quella sezione.
  forSectionId?: string | null;
  choices: SectionChoice[];
  run: RunFn;
  onClose: () => void;
}) {
  const isVetrina = vetrina || block?.kind === "HIGHLIGHT";
  const [kind, setKind] = useState<BlockKind>(isVetrina ? "HIGHLIGHT" : (block?.kind ?? "TEXT"));
  const noun = isVetrina ? "Riquadro" : "Informazione";
  const [label, setLabel] = useState(block?.label ?? "");
  const [title, setTitle] = useState(block?.title ?? "");
  const [text, setText] = useState(block?.text ?? "");
  const [price, setPrice] = useState(block?.priceCents != null ? formatMoney(block.priceCents) : "");
  const [placement, setPlacement] = useState<BlockPlacement>(block?.placement ?? (forSectionId ? "SECTIONS" : "TOP"));
  const [sectionIds, setSectionIds] = useState<string[]>(block?.sectionIds ?? (forSectionId ? [forSectionId] : []));
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
    if (kind === "HIGHLIGHT" && !title.trim()) {
      setError("Scrivi il titolo del riquadro.");
      return;
    }
    if (placement === "SECTIONS" && sectionIds.length === 0) {
      setError("Scegli almeno una categoria in cui mostrarlo.");
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
          title,
          text,
          price,
          placement,
          sectionIds: placement === "SECTIONS" ? sectionIds : [],
          startDate,
          endDate,
          hidden,
        }),
      block ? `${noun} aggiornat${isVetrina ? "o" : "a"}` : `${noun} aggiunt${isVetrina ? "o" : "a"}`,
    );
    setBusy(false);
    if (result) onClose();
  }

  async function remove() {
    if (!block) return;
    setBusy(true);
    const result = await run(() => deleteBlock(block.id), isVetrina ? "Riquadro eliminato" : "Informazione eliminata");
    setBusy(false);
    if (result) onClose();
  }

  return (
    <Sheet
      title={isVetrina ? (block ? "Modifica riquadro in vetrina" : "Nuovo riquadro in vetrina") : block ? "Modifica informazione" : "Nuova informazione"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {isVetrina ? (
          <p className="text-[12px] leading-snug text-foreground-muted">{KIND_HELP.HIGHLIGHT}</p>
        ) : (
        <div>
          <p className="mb-1 text-xs font-medium text-foreground-muted">Che cos&apos;è</p>
          <div role="radiogroup" aria-label="Tipo di informazione" className="grid grid-cols-3 gap-2">
            {(Object.keys(BLOCK_KIND_LABELS) as BlockKind[]).filter((k) => k !== "HIGHLIGHT").map((k) => (
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
        )}

        {kind === "HIGHLIGHT" ? (
          <>
            <Field label="Titoletto (facoltativo)" hint="La riga piccola in oro sopra il titolo.">
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={inputClass} placeholder="es. Su prenotazione" />
            </Field>
            <Field label="Titolo">
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputClass} placeholder="es. Caviale & Tartufo bianco" />
            </Field>
            <Field label="Testo (facoltativo)">
              <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} className={inputClass} placeholder="es. Per prezzi e disponibilità chiedete al nostro personale." />
            </Field>
            <div>
              <p className="mb-1 text-xs font-medium text-foreground-muted">Anteprima</p>
              <div className={`${serif.variable} ${sans.variable} rounded-2xl bg-[#F4EEE3] p-3`}>
                <VetrinaCard block={{ label: label.trim() || null, title: title.trim() || "Titolo", text: text.trim() || null }} />
              </div>
            </div>
          </>
        ) : kind === "PRICE" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <Field label="Nome">
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={inputClass} placeholder="es. Coperto" />
            </Field>
            <Field label="Prezzo (€)">
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputClass} placeholder="1,00" />
            </Field>
            <div className="col-span-2">
              <Field label="Descrizione (facoltativa)" hint="Compare sotto la riga del prezzo.">
                <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={400} rows={3} className={inputClass} placeholder="es. Arancia, basilico o peperoncino, da aggiungere alla tartare" />
              </Field>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field label={kind === "NOTICE" ? "Titolo (facoltativo)" : "Titoletto (facoltativo)"}>
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={inputClass} placeholder={kind === "NOTICE" ? "es. Novità · Oli aromatizzati" : "es. Cucina"} />
              </Field>
              <Field label="Prezzo (facolt.)">
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputClass} placeholder="es. 1,50" />
              </Field>
            </div>
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
              <legend className="px-1 text-[11px] text-foreground-muted">Scegli le categorie</legend>
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
          <p className="mt-1 text-[11px] text-foreground-muted/90">
            {isVetrina
              ? "Se lasci vuoto compare sempre. Per una cosa di stagione (es. il tartufo bianco) metti le date: compare e sparisce da sola."
              : "Se lasci vuoto compare sempre. Finita la data, sparisce da solo."}
          </p>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          {isVetrina ? "Spento per ora (non compare sul menù)" : "Nascondi per ora (non compare sul menù)"}
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
          {busy ? "Salvo…" : block ? "Salva" : isVetrina ? "Aggiungi al menù" : "Aggiungi"}
        </button>

        {block &&
          (confirmDelete ? (
            <div className="rounded-xl border border-danger/30 bg-danger-bg px-3 py-3">
              <p className="text-xs text-danger">
                {isVetrina ? "Eliminare questo riquadro? Se vuoi solo toglierlo per un po', spegnilo. Lo recuperi dallo storico." : "Eliminare questa informazione dal menù? La recuperi dallo storico."}
              </p>
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
              {isVetrina ? "Elimina riquadro" : "Elimina informazione"}
            </button>
          ))}
      </form>
    </Sheet>
  );
}

// «In vetrina» (scheda Menù): i riquadri bordeaux e oro, come li vedono i clienti, con
// l'interruttore «Sul menù» per accenderli o spegnerli con un tocco, lo stato (date) e
// l'ordine. Si modificano nel foglio dedicato.
// Una voce del menù fisso che si può consigliare (per «I consigli della casa»).
export type ConsiglioChoice = { id: string; groupId: string; name: string; detail: string; category: string; kind: "WINE" | "FOOD"; recommended: boolean };
const MAX_CONSIGLI = 4;

export function VetrinaPanel({
  blocks,
  consigli,
  today,
  run,
  onEdit,
  onAdd,
  onOpenItem,
}: {
  blocks: MenuBlockView[];
  consigli: ConsiglioChoice[];
  today: string;
  run: RunFn;
  onEdit: (id: string) => void;
  onAdd: () => void;
  onOpenItem: (itemId: string, groupId: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const live = blocks.filter((b) => blockStatus(b, today) === "live").length;
  const chosen = consigli.filter((c) => c.recommended);

  async function recommend(c: ConsiglioChoice, value: boolean) {
    setBusyId(c.id);
    const ok = await run(() => setRecommended(c.id, value), value ? `«${c.name}» tra i consigli della casa` : `«${c.name}» tolto dai consigli della casa`);
    setBusyId(null);
    if (ok && value) setPicking(false);
  }

  async function toggle(b: MenuBlockView) {
    setBusyId(b.id);
    await run(() => setBlockHidden(b.id, !b.hidden), b.hidden ? `«${b.title}» di nuovo sul menù` : `«${b.title}» tolto dal menù`);
    setBusyId(null);
  }

  async function move(id: string, direction: "up" | "down") {
    setBusyId(id);
    await run(() => moveBlock(id, direction), "");
    setBusyId(null);
  }

  return (
    <section aria-label="In vetrina" className="mb-5 rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] to-accent/[0.01] px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelHead
          icon={IconVetrina}
          tone="accent"
          title="In vetrina"
          subtitle="Quello che i clienti vedono subito dopo la copertina: i consigli della casa e i riquadri speciali."
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
          I consigli della casa · {chosen.length} di {MAX_CONSIGLI}
        </p>
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={chosen.length >= MAX_CONSIGLI}
          className="min-h-10 shrink-0 rounded-full border border-accent/40 px-3.5 text-xs font-semibold text-accent-hover hover:bg-accent/10 disabled:opacity-40"
        >
          + Aggiungi consiglio
        </button>
      </div>
      {chosen.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-foreground-muted">
          Nessun consiglio. Scegli fino a {MAX_CONSIGLI} vini o piatti da mettere in evidenza.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {chosen.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5">
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">{c.kind === "WINE" ? "Vino" : "Piatto"}</span>
              <button type="button" onClick={() => onOpenItem(c.id, c.groupId)} aria-label={`Apri: ${c.name}`} className="min-h-11 min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="block truncate text-[11px] text-foreground-muted">{[c.detail, c.category].filter(Boolean).join(" · ")}</span>
              </button>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => recommend(c, false)}
                aria-label={`Togli dai consigli: ${c.name}`}
                className="min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                Togli
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length >= MAX_CONSIGLI && <p className="mt-1.5 text-[11px] text-foreground-muted">Sono già {MAX_CONSIGLI}: per aggiungerne un altro, prima togline uno.</p>}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
          Riquadri speciali{blocks.length > 0 ? ` · ${live} sul menù` : ""}
        </p>
        <button type="button" onClick={onAdd} className="min-h-10 shrink-0 rounded-full border border-accent/40 px-3.5 text-xs font-semibold text-accent-hover hover:bg-accent/10">
          + Nuovo riquadro
        </button>
      </div>
      {blocks.length === 0 && (
        <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-foreground-muted">
          Nessun riquadro. Servono per le proposte speciali, per esempio «Su prenotazione · Caviale & Tartufo bianco».
        </p>
      )}
      {picking && (
        <ConsigliPicker
          choices={consigli.filter((c) => !c.recommended)}
          busyId={busyId}
          onPick={(c) => recommend(c, true)}
          onClose={() => setPicking(false)}
        />
      )}
      {blocks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {blocks.map((b, index) => {
            const status = blockStatus(b, today);
            const dates = formatBlockDates(b.startDate, b.endDate);
            const state =
              status === "hidden"
                ? "Spento"
                : status === "expired"
                  ? `Finito${dates ? ` (${dates})` : ""}`
                  : status === "scheduled"
                    ? `Sul menù ${dates}`
                    : dates
                      ? `Sul menù ${dates}`
                      : "Sul menù";
            const where = b.placement === "TOP" ? null : b.placement === "BOTTOM" ? "in fondo al menù" : "sotto il titolo di una categoria";
            return (
              <li key={b.id} className={`flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 ${status !== "live" ? "opacity-70" : ""}`}>
                <button type="button" onClick={() => onEdit(b.id)} aria-label={`Modifica: ${blockSummary(b)}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                  <span aria-hidden className="flex h-11 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-[radial-gradient(60px_40px_at_50%_0%,#7a1428,#4a0c18)] px-1 text-center">
                    <span className="block w-full truncate text-[6px] uppercase tracking-[0.15em] text-[#D8B97A]">{b.label ?? ""}</span>
                    <span className="block w-full truncate font-serif text-[9px] italic leading-tight text-[#F4EEE3]">{b.title}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{b.title}</span>
                    <span className={`block truncate text-[11px] ${status === "live" ? "text-success" : "text-foreground-muted"}`}>
                      {state}
                      {where && <span className="text-foreground-muted"> · {where}</span>}
                    </span>
                  </span>
                </button>
                {blocks.length > 1 && (
                  <div className="hidden shrink-0 items-center sm:flex">
                    <button type="button" disabled={busyId !== null || index === 0} onClick={() => move(b.id, "up")} aria-label={`Sposta su: ${b.title}`} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:text-foreground disabled:opacity-30">
                      <Chevron up />
                    </button>
                    <button type="button" disabled={busyId !== null || index === blocks.length - 1} onClick={() => move(b.id, "down")} aria-label={`Sposta giù: ${b.title}`} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:text-foreground disabled:opacity-30">
                      <Chevron />
                    </button>
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  <span aria-hidden className="hidden text-[11px] text-foreground-muted sm:inline">Sul menù</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!b.hidden}
                    aria-label={`Sul menù: ${b.title}`}
                    disabled={busyId === b.id}
                    onClick={() => toggle(b)}
                    className="flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
                  >
                    {/* Zona di tocco grande (44 px), disegno dell'interruttore piccolo. */}
                    <span aria-hidden className={`relative h-6 w-11 rounded-full transition-colors ${!b.hidden ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${!b.hidden ? "left-[1.375rem]" : "left-0.5"}`} />
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// «+ Aggiungi» ai consigli della casa: cerca tra vini e piatti del menù fisso.
function ConsigliPicker({
  choices,
  busyId,
  onPick,
  onClose,
}: {
  choices: ConsiglioChoice[];
  busyId: string | null;
  onPick: (c: ConsiglioChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = norm(query.trim());
  const list = q ? choices.filter((c) => norm(`${c.name} ${c.detail} ${c.category}`).includes(q)) : choices;
  return (
    <Sheet title="Aggiungi ai consigli della casa" onClose={onClose} dirty={false}>
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un vino o un piatto…"
          aria-label="Cerca un vino o un piatto"
          autoFocus
          className={inputClass}
        />
        {list.length === 0 ? (
          <p className="px-1 py-4 text-sm text-foreground-muted">Nessuna voce trovata.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {list.slice(0, 60).map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{c.name}</span>
                  <span className="block truncate text-[11px] text-foreground-muted">{[c.kind === "WINE" ? "Vino" : "Piatto", c.detail, c.category].filter(Boolean).join(" · ")}</span>
                </span>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => onPick(c)}
                  aria-label={`Consiglia: ${c.name}`}
                  className="min-h-10 shrink-0 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                >
                  Consiglia
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
