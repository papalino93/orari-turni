"use client";

import { useRef, useState } from "react";
import { compareWines } from "@/lib/wine-order";
import { reorder } from "./actions";
import type { EditorSection, RunFn } from "./menu-editor";
import { Sheet } from "./sheet";

type Row = { id: string; label: string; detail?: string; region?: string | null; country?: string | null };

// Elenco da riordinare: si trascina dalla maniglia ≡ (sul telefono serve il dito
// sulla maniglia, così scorrere la pagina non sposta niente per sbaglio) oppure
// si usano le frecce.
function SortableList({ rows, onChange, onOpen }: { rows: Row[]; onChange: (rows: Row[]) => void; onOpen?: (row: Row) => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = rows.slice();
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    onChange(next);
  }

  // Il trascinamento segue il dito su tutta la finestra: spostando la riga nel DOM
  // il browser può perdere la «cattura» del puntatore sulla maniglia.
  const rowsRef = useRef(rows);
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault();
    rowsRef.current = rows;
    setDragId(id);
    // Vicino al bordo alto o basso dello schermo l'elenco scorre da solo.
    let scroller: HTMLElement | null = listRef.current;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) {
      scroller = scroller.parentElement;
    }
    const onMove = (ev: PointerEvent) => {
      if (!listRef.current) return;
      if (scroller) {
        if (ev.clientY < 90) scroller.scrollTop -= 14;
        else if (ev.clientY > window.innerHeight - 90) scroller.scrollTop += 14;
      }
      const current = rowsRef.current;
      const items = [...listRef.current.querySelectorAll<HTMLElement>("li[data-id]")];
      const from = current.findIndex((r) => r.id === id);
      let to = items.findIndex((el) => {
        const box = el.getBoundingClientRect();
        return ev.clientY < box.top + box.height / 2;
      });
      if (to === -1) to = items.length - 1;
      else if (to > from) to -= 1;
      if (to === from || from === -1) return;
      const next = current.slice();
      const [r] = next.splice(from, 1);
      next.splice(to, 0, r);
      rowsRef.current = next;
      onChange(next);
    };
    const onUp = () => {
      setDragId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <ul ref={listRef} className="space-y-1.5">
      {rows.map((row, i) => (
        <li
          key={row.id}
          data-id={row.id}
          className={`flex items-center gap-1 rounded-xl border bg-surface px-1 py-1 transition-shadow ${
            dragId === row.id ? "border-accent shadow-lg" : "border-border"
          }`}
        >
          <button
            type="button"
            aria-label={`Trascina ${row.label}`}
            onPointerDown={(e) => onPointerDown(e, row.id)}
            className="flex h-11 w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-lg text-foreground-muted hover:bg-surface-2 active:cursor-grabbing"
          >
            ≡
          </button>
          <div className="min-w-0 flex-1 py-1">
            <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
            {row.detail && <p className="truncate text-[11px] text-foreground-muted">{row.detail}</p>}
          </div>
          {onOpen && (
            <button
              type="button"
              onClick={() => onOpen(row)}
              aria-label={`Apri ${row.label}`}
              className="flex h-11 shrink-0 items-center rounded-lg px-2.5 text-xs font-medium text-foreground-muted hover:bg-surface-2 hover:text-foreground"
            >
              Apri ›
            </button>
          )}
          <button
            type="button"
            disabled={i === 0}
            onClick={() => move(i, i - 1)}
            aria-label={`Sposta su ${row.label}`}
            className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-2 disabled:opacity-25"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={i === rows.length - 1}
            onClick={() => move(i, i + 1)}
            aria-label={`Sposta giù ${row.label}`}
            className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-2 disabled:opacity-25"
          >
            ↓
          </button>
        </li>
      ))}
    </ul>
  );
}

// «Riordina»: tre livelli (sezioni → gruppi di una sezione → voci di un gruppo).
// L'ordine si salva tutto insieme con «Salva ordine» e si annulla con un tocco.
export function ReorderSheet({
  sections,
  startSectionId,
  run,
  onClose,
}: {
  sections: EditorSection[];
  startSectionId: string | null;
  run: RunFn;
  onClose: () => void;
}) {
  const [sectionId, setSectionId] = useState<string | null>(startSectionId);
  const [groupId, setGroupId] = useState<string | null>(null);
  const section = sections.find((s) => s.id === sectionId) ?? null;
  const group = section?.groups.find((g) => g.id === groupId) ?? null;

  const level: "section" | "group" | "item" = group ? "item" : section ? "group" : "section";
  const baseRows: Row[] =
    level === "section"
      ? sections.map((s) => ({ id: s.id, label: s.label, detail: `${s.groups.length} grupp${s.groups.length === 1 ? "o" : "i"}` }))
      : level === "group"
        ? (section?.groups ?? []).map((g) => ({ id: g.id, label: g.title, detail: `${g.items.length} voc${g.items.length === 1 ? "e" : "i"}` }))
        : (group?.items ?? []).map((i) => ({
            id: i.id,
            label: i.name,
            detail: [i.wineName, i.region].filter(Boolean).join(" · ") || undefined,
            region: i.region,
            country: i.country,
          }));
  const key = `${level}:${sectionId ?? ""}:${groupId ?? ""}`;
  const [draft, setDraft] = useState<{ key: string; rows: Row[] } | null>(null);
  const rows = draft?.key === key ? draft.rows : baseRows;
  const changed = rows.map((r) => r.id).join() !== baseRows.map((r) => r.id).join();
  const [busy, setBusy] = useState(false);

  function go(next: { sectionId: string | null; groupId: string | null }) {
    setDraft(null);
    setSectionId(next.sectionId);
    setGroupId(next.groupId);
  }

  async function save() {
    setBusy(true);
    const parentId = level === "section" ? null : level === "group" ? sectionId : groupId;
    const label = level === "section" ? "sezioni" : level === "group" ? `gruppi di «${section?.label}»` : `«${group?.title}» (${section?.label})`;
    const result = await run(() => reorder(level, parentId, rows.map((r) => r.id)), `Nuovo ordine salvato: ${label}`);
    setBusy(false);
    if (result !== null) setDraft(null);
  }

  const isWineGroup = level === "item" && section?.kind === "WINE";

  return (
    <Sheet title="Riordina" onClose={onClose}>
      <nav aria-label="Livello" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => go({ sectionId: null, groupId: null })} className={`rounded-lg px-2 py-1 ${level === "section" ? "font-semibold text-foreground" : "text-accent hover:underline"}`}>
          Sezioni
        </button>
        {section && (
          <>
            <span className="text-foreground-muted">›</span>
            <button type="button" onClick={() => go({ sectionId: section.id, groupId: null })} className={`rounded-lg px-2 py-1 ${level === "group" ? "font-semibold text-foreground" : "text-accent hover:underline"}`}>
              {section.label}
            </button>
          </>
        )}
        {group && (
          <>
            <span className="text-foreground-muted">›</span>
            <span className="px-2 py-1 font-semibold text-foreground">{group.title}</span>
          </>
        )}
      </nav>

      <p className="mb-3 text-xs text-foreground-muted">
        {level === "section"
          ? "L'ordine delle sezioni sul menù (Oggi fuori menù resta sempre in cima). «Apri» per riordinare i gruppi di una sezione."
          : level === "group"
            ? "L'ordine dei gruppi in questa sezione. «Apri» per riordinare le voci di un gruppo."
            : "L'ordine delle voci in questo gruppo. Resta com'è: i vini nuovi si mettono da soli al posto della loro regione."}
      </p>

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-foreground-muted">Niente da riordinare qui.</p>
      ) : (
        <SortableList
          rows={rows}
          onChange={(next) => setDraft({ key, rows: next })}
          onOpen={
            level === "section"
              ? (r) => go({ sectionId: r.id, groupId: null })
              : level === "group"
                ? (r) => go({ sectionId, groupId: r.id })
                : undefined
          }
        />
      )}

      <div className="sticky bottom-0 mt-4 flex flex-wrap gap-2 border-t border-border bg-surface pt-3">
        {isWineGroup && rows.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setDraft({
                key,
                rows: rows.slice().sort((a, b) => compareWines({ name: a.label, region: a.region ?? null, country: a.country ?? null }, { name: b.label, region: b.region ?? null, country: b.country ?? null })),
              })
            }
            className="min-h-11 rounded-xl border border-border px-3.5 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            Ordina per regione
          </button>
        )}
        {changed && (
          <button type="button" onClick={() => setDraft(null)} className="min-h-11 rounded-xl border border-border px-3.5 text-sm font-medium text-foreground-muted hover:text-foreground">
            Annulla le modifiche
          </button>
        )}
        <button
          type="button"
          disabled={!changed || busy}
          onClick={save}
          className="ml-auto min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? "Salvo…" : "Salva ordine"}
        </button>
      </div>
    </Sheet>
  );
}
