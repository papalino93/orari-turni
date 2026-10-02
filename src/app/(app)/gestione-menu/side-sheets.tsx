"use client";

import { useState } from "react";
import { updateCover, updateSectionTexts } from "./actions";
import { Field, Sheet, inputClass } from "./sheet";
import type { EditorSection, HistoryEntry, RunFn } from "./menu-editor";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Aggiunto",
  UPDATE: "Modificato",
  DELETE: "Eliminato",
  RESTORE: "Ripristinato",
  SOLD_OUT: "Segnato esaurito",
  AVAILABLE: "Di nuovo disponibile",
  RESET_SOLD_OUT: "Riattivate le voci esaurite",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistorySheet({
  history,
  onUndo,
  onClose,
}: {
  history: HistoryEntry[];
  onUndo: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function undo(id: string) {
    setBusyId(id);
    await onUndo(id);
    setBusyId(null);
  }

  return (
    <Sheet title="Storico modifiche" onClose={onClose}>
      {history.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-muted">Nessuna modifica ancora.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-border">
          {history.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-1 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  <span className="text-foreground-muted">{ACTION_LABELS[h.action] ?? h.action}:</span> {h.label}
                </p>
                <p className="text-[11px] text-foreground-muted">
                  {h.actorName} · {formatWhen(h.at)}
                </p>
              </div>
              {h.undone ? (
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground-muted">
                  Annullata
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => undo(h.id)}
                  className="min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
                >
                  {busyId === h.id ? "…" : "Ripristina"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function SectionTextsSheet({
  section,
  run,
  onClose,
}: {
  section: EditorSection;
  run: RunFn;
  onClose: () => void;
}) {
  const [note, setNote] = useState(section.note ?? "");
  const [coverApplies, setCoverApplies] = useState(section.coverApplies);
  const [addonTitle, setAddonTitle] = useState(section.addonTitle ?? "");
  const [addon, setAddon] = useState(section.addon ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => updateSectionTexts(section.id, { note, coverApplies, addonTitle, addon }), "Testi aggiornati");
    setBusy(false);
    if (result) onClose();
  }

  return (
    <Sheet title={`Testi · ${section.title}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Nota sotto il titolo" hint="es. orario di chiusura della cucina. Vuoto = nessuna nota.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} className={inputClass} />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={coverApplies}
            onChange={(e) => setCoverApplies(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          Mostra il coperto in questa sezione
        </label>
        <Field label="Titolo dell'avviso a fondo sezione">
          <input value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} maxLength={120} className={inputClass} />
        </Field>
        <Field label="Testo dell'avviso a fondo sezione">
          <textarea value={addon} onChange={(e) => setAddon(e.target.value)} maxLength={500} rows={4} className={inputClass} />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : "Salva"}
        </button>
      </form>
    </Sheet>
  );
}

// Il coperto è uno solo e vale per tutta la cucina: si modifica qui, non
// sezione per sezione.
export function CoverSheet({ cover, run, onClose }: { cover: string | null; run: RunFn; onClose: () => void }) {
  const [value, setValue] = useState(cover ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => updateCover(value), "Coperto aggiornato");
    setBusy(false);
    if (result) onClose();
  }

  return (
    <Sheet title="Coperto" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field
          label="Testo del coperto"
          hint="Vale per tutta la cucina e compare nelle sezioni di cucina del menù. Lascia vuoto se non c'è coperto."
        >
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
            className={inputClass}
            placeholder="es. Coperto € 1,00"
          />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : "Salva"}
        </button>
      </form>
    </Sheet>
  );
}
