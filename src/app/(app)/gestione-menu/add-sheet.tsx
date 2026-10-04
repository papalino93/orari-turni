"use client";

import { useState } from "react";
import type { EditorSection } from "./menu-editor";
import { Sheet } from "./sheet";

export type AddChoice =
  | { type: "item"; groupId: string }
  | { type: "daily"; kind: "FOOD" | "WINE" }
  | { type: "promo"; kind: "EVENT" | "NOTICE" };

const big =
  "flex min-h-14 w-full flex-col items-start justify-center rounded-xl border border-border px-4 py-2.5 text-left hover:border-accent hover:bg-surface-2";

// «+ Aggiungi»: un solo pulsante che chiede che cosa aggiungere. Per un vino o un piatto
// si sceglie poi la sezione e il gruppo (se ce n'è più d'uno), e si apre la scheda vuota.
export function AddSheet({
  sections,
  startSectionId = null,
  onChoose,
  onClose,
}: {
  sections: EditorSection[];
  // Dal «+ Aggiungi» accanto a una sezione: si sceglie solo il gruppo.
  startSectionId?: string | null;
  onChoose: (choice: AddChoice) => void;
  onClose: () => void;
}) {
  const start = sections.find((s) => s.id === startSectionId) ?? null;
  const [kind, setKind] = useState<"WINE" | "FOOD" | null>(start?.kind ?? null);
  const [sectionId, setSectionId] = useState<string | null>(start?.id ?? null);
  const list = kind ? sections.filter((s) => s.kind === kind) : [];
  const section = list.find((s) => s.id === sectionId) ?? null;

  function pickSection(s: EditorSection) {
    if (s.groups.length === 1) onChoose({ type: "item", groupId: s.groups[0].id });
    else setSectionId(s.id);
  }

  const title = !kind ? "Che cosa vuoi aggiungere?" : !section ? (kind === "WINE" ? "Un vino: in quale sezione?" : "Un piatto: in quale sezione?") : `In quale gruppo di «${section.label}»?`;

  return (
    <Sheet title={title} onClose={onClose} dirty={false}>
      {!kind && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className={big} onClick={() => setKind("WINE")}>
            <span className="text-sm font-semibold text-foreground">Un vino</span>
            <span className="text-xs text-foreground-muted">Nella carta dei vini, al posto della sua regione.</span>
          </button>
          <button type="button" className={big} onClick={() => setKind("FOOD")}>
            <span className="text-sm font-semibold text-foreground">Un piatto o una bevanda</span>
            <span className="text-xs text-foreground-muted">Taglieri, tartare, bevande e le altre sezioni.</span>
          </button>
          <button type="button" className={big} onClick={() => onChoose({ type: "daily", kind: "FOOD" })}>
            <span className="text-sm font-semibold text-foreground">Il piatto di oggi</span>
            <span className="text-xs text-foreground-muted">In «Oggi fuori menù»: sparisce da solo alle 5.</span>
          </button>
          <button type="button" className={big} onClick={() => onChoose({ type: "daily", kind: "WINE" })}>
            <span className="text-sm font-semibold text-foreground">Il vino di oggi</span>
            <span className="text-xs text-foreground-muted">In «Oggi fuori menù»: sparisce da solo alle 5.</span>
          </button>
          <button type="button" className={big} onClick={() => onChoose({ type: "promo", kind: "EVENT" })}>
            <span className="text-sm font-semibold text-foreground">Un evento</span>
            <span className="text-xs text-foreground-muted">Locandina, date, orario e, se serve, il suo menù.</span>
          </button>
          <button type="button" className={big} onClick={() => onChoose({ type: "promo", kind: "NOTICE" })}>
            <span className="text-sm font-semibold text-foreground">Un annuncio</span>
            <span className="text-xs text-foreground-muted">Una riga sotto la copertina, es. «Lunedì chiusi per ferie».</span>
          </button>
        </div>
      )}

      {kind && !section && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => (
              <button key={s.id} type="button" className={big} onClick={() => pickSection(s)}>
                <span className="text-sm font-semibold text-foreground">{s.label}</span>
                <span className="text-xs text-foreground-muted">{s.groups.map((g) => g.title).join(" · ") || "Nessun gruppo"}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setKind(null)} className="min-h-10 rounded-full px-3 text-xs font-medium text-foreground-muted hover:text-foreground">
            ← Indietro
          </button>
        </div>
      )}

      {section && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {section.groups.map((g) => (
              <button key={g.id} type="button" className={big} onClick={() => onChoose({ type: "item", groupId: g.id })}>
                <span className="text-sm font-semibold text-foreground">{g.title}</span>
                <span className="text-xs text-foreground-muted">
                  {g.items.length === 1 ? "1 voce" : `${g.items.length} voci`}
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setSectionId(null)} className="min-h-10 rounded-full px-3 text-xs font-medium text-foreground-muted hover:text-foreground">
            ← Indietro
          </button>
        </div>
      )}
    </Sheet>
  );
}
