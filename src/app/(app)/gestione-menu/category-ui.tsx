"use client";

import { useState } from "react";
import { createSection, deleteSection, updateSection } from "./section-actions";
import { Field, Sheet, inputClass } from "./sheet";
import type { EditorSection, RunFn } from "./menu-editor";

// Foglio per creare una sezione del menù (nome, tipo, posizione) o modificarne una
// (nome, nome nella barra, riga sopra al titolo; eliminazione con conferma).
export function CategorySheet({
  section,
  sections,
  run,
  onClose,
  onCreated,
}: {
  section: EditorSection | null;
  sections: EditorSection[];
  run: RunFn;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [title, setTitle] = useState(section?.title ?? "");
  const [label, setLabel] = useState(section?.label ?? "");
  const [kicker, setKicker] = useState(section?.kicker ?? "");
  const [kind, setKind] = useState<"FOOD" | "WINE">(section?.kind ?? "FOOD");
  // Nuova sezione: per comodità dopo l'ultima di cucina, prima delle bevande se ci sono.
  const [afterId, setAfterId] = useState<string>(() => {
    if (section) return "";
    const bevande = sections.findIndex((s) => /bevande/i.test(s.title));
    const before = bevande > 0 ? sections[bevande - 1] : sections[sections.length - 1];
    return before?.id ?? "";
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = section ? section.groups.reduce((n, g) => n + g.items.length, 0) : 0;
  const dirty = section
    ? title !== section.title || label !== section.label || kicker !== section.kicker
    : title.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Scrivi il nome della categoria.");
      return;
    }
    setBusy(true);
    if (section) {
      // Se il nome nella barra era uguale al nome, segue il nome nuovo.
      const nextLabel = label === section.label && section.label === section.title ? title : label;
      const result = await run(() => updateSection(section.id, { title, label: nextLabel, kicker }), "Categoria aggiornata");
      setBusy(false);
      if (result) onClose();
      return;
    }
    const result = await run(
      () => createSection({ title, kind, kicker, afterId: afterId === "" ? null : afterId }),
      `Categoria «${title.trim()}» creata`,
    );
    setBusy(false);
    if (result) {
      onClose();
      onCreated(result.slug);
    }
  }

  async function remove() {
    if (!section) return;
    setBusy(true);
    const result = await run(() => deleteSection(section.id), `Categoria «${section.title}» eliminata`);
    setBusy(false);
    if (result) onClose();
  }

  return (
    <Sheet title={section ? "Modifica categoria" : "Nuova categoria"} onClose={onClose} dirty={dirty}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome" hint={section ? undefined : "Il titolo grande della categoria, per esempio «Salatini»."}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} className={inputClass} placeholder="es. Salatini" autoFocus={!section} />
        </Field>

        {section && section.label !== section.title && (
          <Field label="Nome nella barra in alto" hint="Il nome corto nella barra delle categorie del menù.">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className={inputClass} />
          </Field>
        )}

        {!section && (
          <div>
            <p className="mb-1 text-xs font-medium text-foreground-muted">Che cosa contiene</p>
            <div role="radiogroup" aria-label="Che cosa contiene" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["FOOD", "Cucina o altro", "Un prezzo per voce (piatti, salatini, bevande)"],
                  ["WINE", "Vini", "Calice e bottiglia, uvaggio, regione"],
                ] as const
              ).map(([k, name, help]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`min-h-14 rounded-xl border px-3 py-2 text-left transition-colors ${
                    kind === k ? "border-accent bg-accent/10" : "border-border hover:border-accent"
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">{name}</span>
                  <span className="block text-[11px] text-foreground-muted">{help}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label={section ? "Riga piccola sopra al titolo" : "Riga piccola sopra al titolo (facoltativa)"} hint={section ? undefined : `Se la lasci vuota: «${kind === "WINE" ? "Vini" : "Cucina"}».`}>
          <input value={kicker} onChange={(e) => setKicker(e.target.value)} maxLength={40} className={inputClass} placeholder={kind === "WINE" ? "Vini" : "Cucina"} />
        </Field>

        {!section && (
          <Field label="Dove va nel menù">
            <select value={afterId} onChange={(e) => setAfterId(e.target.value)} className={inputClass}>
              <option value="">All&apos;inizio, prima di «{sections[0]?.label ?? "tutte"}»</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Dopo «{s.label}»
                </option>
              ))}
            </select>
          </Field>
        )}

        {section && (
          <p className="text-[11px] leading-snug text-foreground-muted/90">Per spostarla nel menù: «Ordina categorie», sotto l&apos;elenco delle categorie.</p>
        )}

        {!section && (
          <p className="rounded-xl bg-surface-2/60 px-3 py-2 text-[12px] leading-snug text-foreground-muted">
            Finché è vuota i clienti non la vedono. Dopo averla creata aggiungi le voci con «+ Aggiungi».
          </p>
        )}

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
          {busy ? "Salvo…" : section ? "Salva" : "Crea categoria"}
        </button>

        {section &&
          (confirmDelete ? (
            <div className="rounded-xl border border-danger/30 bg-danger-bg px-3 py-3">
              <p className="text-xs text-danger">
                {count > 0
                  ? `Eliminare «${section.title}» con ${count === 1 ? "la sua voce" : `le sue ${count} voci`}? Spariscono dal menù dei clienti. La recuperi dallo storico.`
                  : `Eliminare la categoria «${section.title}»? La recuperi dallo storico.`}
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
              Elimina categoria
            </button>
          ))}
      </form>
    </Sheet>
  );
}
