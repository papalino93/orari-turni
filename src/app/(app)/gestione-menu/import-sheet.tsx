"use client";

import { useMemo, useState } from "react";
import { formatPrice, tryParsePrice } from "@/lib/menu-format";
import { MAX_IMPORT_ROWS, importColumns, parseImport } from "@/lib/menu-import";
import { importItems } from "./actions";
import { Field, Sheet, inputClass } from "./sheet";
import type { EditorSection, RunFn } from "./menu-editor";

const EXAMPLE: Record<"WINE" | "FOOD", string> = {
  WINE: "Aquila del Torre; Friuli Colli Orientali Doc; 100% Friulano; 6; 30\nMastrojanni; Rosso di Montalcino Doc; 100% Sangiovese; 8; 40",
  FOOD: "Tagliere Classico; Prosciutto crudo, salame, pecorino; 13\nBurro & Acciughe; 4 pezzi; 10",
};

function priceText(value: string): string {
  const parsed = tryParsePrice(value);
  return parsed.ok && parsed.cents !== null ? formatPrice(parsed.cents) : "—";
}

// Incolla un elenco (da appunti, WhatsApp o Excel), guarda l'anteprima e
// conferma: tutte le righe corrette entrano insieme e si annullano insieme.
export function ImportSheet({
  section,
  groupId,
  run,
  onClose,
}: {
  section: EditorSection;
  groupId: string;
  run: RunFn;
  onClose: () => void;
}) {
  const [targetGroup, setTargetGroup] = useState(groupId);
  const [text, setText] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const kind = section.kind;
  const formats = kind === "FOOD" ? (section.groups.find((g) => g.id === targetGroup)?.formats ?? null) : null;
  const columns = importColumns(kind, formats);
  // Calcolo leggero: ci pensa il compilatore di React a non ripeterlo.
  const parsed = parseImport(text, kind, formats);
  const valid = parsed.rows.filter((r) => r.ok);
  const invalid = parsed.rows.length - valid.length;
  const existing = useMemo(() => {
    const group = section.groups.find((g) => g.id === targetGroup);
    return new Set((group?.items ?? []).map((i) => i.name.trim().toLowerCase()));
  }, [section.groups, targetGroup]);

  async function submit() {
    setBusy(true);
    const result = await run(
      () =>
        importItems(
          targetGroup,
          parsed.rows.flatMap((r) => (r.ok ? [r.input] : [])),
        ),
      `${valid.length} ${valid.length === 1 ? "voce aggiunta" : "voci aggiunte"}`,
    );
    setBusy(false);
    if (result) onClose();
  }

  return (
    <Sheet title="Aggiungi più voci" onClose={onClose}>
      {!previewing ? (
        <div className="space-y-3.5">
          <Field label="Gruppo">
            <select value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)} className={inputClass}>
              {section.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Elenco da incollare"
            hint={`Una riga per voce, campi separati da punto e virgola (o colonne di Excel): ${columns.join("; ")}.${formats ? " Prezzo vuoto = formato non disponibile." : ""}${kind === "WINE" ? " Poi apri ogni vino per aggiungere regione, nome del vino e annata: quelli senza regione sono segnalati con «Manca la regione»." : ""}`}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              spellCheck={false}
              className={`${inputClass} font-mono !text-xs`}
              placeholder={
                formats
                  ? `Paulaner Helles; Monaco · Helles · 4,9% vol.; ${["3,50", "6", "11", "8"].slice(0, formats.length).join("; ")}\nHacker-Pschorr Weisse; Weizen · 5,5% vol.; ${["", "6,50", "12", "8"].slice(0, formats.length).join("; ")}`
                  : EXAMPLE[kind]
              }
            />
          </Field>
          {kind === "WINE" && (
            <p className="text-[11px] text-foreground-muted">
              Prezzi come 7 oppure 7,50. Se un vino non è al calice, scrivi — oppure lascia il campo vuoto.
            </p>
          )}

          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => setPreviewing(true)}
            className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            Anteprima
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {parsed.tooMany ? (
            <p className="rounded-xl border border-danger/30 bg-danger-bg px-3 py-2.5 text-sm text-danger">
              Troppe righe: al massimo {MAX_IMPORT_ROWS} voci per volta. Dividi l&apos;elenco in più parti.
            </p>
          ) : parsed.rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-foreground-muted">Non ho trovato nessuna riga.</p>
          ) : (
            <p className="text-sm text-foreground">
              <span className="font-semibold">{valid.length}</span> {valid.length === 1 ? "voce pronta" : "voci pronte"}
              {invalid > 0 && (
                <>
                  , <span className="font-semibold text-danger">{invalid}</span> con errore (non verranno aggiunte)
                </>
              )}
              .
            </p>
          )}

          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {parsed.rows.map((row) => (
              <li key={row.line} className={`px-3 py-2.5 ${row.ok ? "" : "bg-danger-bg"}`}>
                {row.ok ? (
                  <>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground">
                      <span aria-hidden className="text-success">
                        ✓
                      </span>
                      {row.input.name}
                      {existing.has(row.input.name.trim().toLowerCase()) && (
                        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                          Già presente
                        </span>
                      )}
                    </p>
                    <p className="ml-5 text-xs text-foreground-muted">
                      {kind === "WINE"
                        ? [row.input.sub, row.input.grapes].filter(Boolean).join(" · ") || "—"
                        : row.input.description || "—"}
                    </p>
                    <p className="ml-5 text-xs text-foreground-muted">
                      {kind === "WINE"
                        ? `Calice ${priceText(row.input.priceGlass)} · Bottiglia ${priceText(row.input.priceBottle)}`
                        : row.input.formatPrices
                          ? (formats ?? []).map((f, j) => `${f} ${priceText(row.input.formatPrices?.[j] ?? "")}`).join(" · ")
                          : `€ ${priceText(row.input.price)}`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-danger">
                      <span aria-hidden>✗</span> Riga {row.line}: {row.error}
                    </p>
                    <p className="ml-4 truncate text-xs text-foreground-muted">{row.raw}</p>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreviewing(false)}
              className="min-h-11 flex-1 rounded-xl border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Modifica l&apos;elenco
            </button>
            <button
              type="button"
              disabled={busy || valid.length === 0 || parsed.tooMany}
              onClick={submit}
              className="min-h-11 flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "Aggiungo…" : valid.length === 1 ? "Aggiungi 1 voce" : `Aggiungi ${valid.length} voci`}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
