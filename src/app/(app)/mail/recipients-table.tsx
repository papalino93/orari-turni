"use client";

import { useState, type ClipboardEvent, type KeyboardEvent } from "react";
import type { Recipient, TypedRowState } from "@/lib/mail-text";

// «Scrivili qui»: i destinatari scritti a mano, una riga per persona (email e nome o azienda).
// Su telefono ogni riga ha il nome sotto l'email; da tablet e computer è una tabella a due colonne.
// La lettura vera (controllo degli indirizzi, doppioni) è checkTypedRows in mail-text.ts, la stessa
// strada degli altri modi; qui c'è solo la tabella.

export type Row = { id: string; email: string; header: string };
export const MAX_ROWS = 200;

let seq = 0;
export const newRow = (email = "", header = ""): Row => ({ id: `r${Date.now().toString(36)}${++seq}`, email, header });

const cell =
  "w-full rounded-xl border bg-surface-2 px-3.5 py-3 text-base text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none sm:py-2.5 sm:text-sm";
const iconBtn =
  "inline-flex h-11 w-11 items-center justify-center rounded-xl text-xl leading-none text-foreground-muted transition-colors hover:bg-surface-2 hover:text-foreground";

// Righe incollate (da Excel, da una mail…): email e nome separati da tabulazione, punto e virgola o
// virgola. Le righe sbagliate restano, così si vedono e si correggono.
function splitPasted(text: string): { email: string; header: string }[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out = lines.map((l) => {
    if (l.includes("\t")) {
      const [email = "", header = ""] = l.split("\t");
      return { email: email.trim(), header: header.trim() };
    }
    const m = l.match(/^([^;,]*)[;,](.*)$/);
    return m ? { email: m[1].trim(), header: m[2].trim() } : { email: l, header: "" };
  });
  // Riga dei titoli copiata insieme ai dati («Email; Nome»): non è una persona.
  if (out.length > 1 && !out[0].email.includes("@") && /^(e-?mail|mail|indirizzo)/i.test(out[0].email)) out.shift();
  return out;
}

export function RecipientsTable({
  rows,
  states,
  optedOut,
  onChange,
}: {
  rows: Row[];
  states: TypedRowState[];
  optedOut: Set<string>;
  onChange: (rows: Row[]) => void;
}) {
  // Gli errori di una riga si mostrano quando si esce dalla casella (non mentre si scrive) e
  // subito per le righe incollate o ritrovate dopo aver ricaricato la pagina (id «s…»).
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState("");
  const shown = (r: Row) => touched.has(r.id) || r.id.startsWith("s");
  const touch = (...ids: string[]) => setTouched((t) => new Set([...t, ...ids]));
  const full = rows.length >= MAX_ROWS;

  const focus = (id: string, field: "email" | "header") =>
    requestAnimationFrame(() => document.getElementById(`mail-row-${field}-${id}`)?.focus());

  function update(id: string, patch: Partial<Row>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function add(after?: number) {
    if (full) return;
    const row = newRow();
    const at = after === undefined ? rows.length : after + 1;
    onChange([...rows.slice(0, at), row, ...rows.slice(at)]);
    setNote("");
    focus(row.id, "email");
  }

  function remove(i: number) {
    const gone = rows[i];
    if (rows.length === 1) {
      const row = newRow();
      onChange([row]);
      focus(row.id, "email");
    } else {
      const next = rows.filter((_, j) => j !== i);
      onChange(next);
      const target = next[Math.min(i, next.length - 1)];
      focus(target.id, "email");
    }
    setNote(gone.email.trim() ? `Riga ${i + 1} tolta (${gone.email.trim()}).` : `Riga ${i + 1} tolta.`);
  }

  // Più righe incollate in una casella dell'email: diventano più righe della tabella.
  function onPaste(e: ClipboardEvent<HTMLInputElement>, i: number) {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t;,]/.test(text.trim())) return;
    const items = splitPasted(text);
    if (items.length === 0) return;
    e.preventDefault();
    const cur = rows[i];
    const reuse = !cur.email.trim();
    const room = MAX_ROWS - rows.length + (reuse ? 1 : 0);
    const taken = items.slice(0, Math.max(room, 0));
    const made = taken.map((it, k) => (k === 0 && reuse ? { ...cur, email: it.email, header: it.header || cur.header } : newRow(it.email, it.header)));
    const next = reuse ? [...rows.slice(0, i), ...made, ...rows.slice(i + 1)] : [...rows.slice(0, i + 1), ...made, ...rows.slice(i + 1)];
    onChange(next);
    touch(...made.map((r) => r.id));
    const left = items.length - taken.length;
    setNote(
      left > 0
        ? `Aggiunte ${taken.length} righe: la tabella arriva a ${MAX_ROWS}, le altre ${left} non ci stanno. Per elenchi lunghi usa «Carica un file».`
        : taken.length === 1
          ? "Aggiunta 1 riga."
          : `Aggiunte ${taken.length} righe.`,
    );
    if (made.length) focus(made[made.length - 1].id, "email");
  }

  // Invio: dall'email si passa al nome; dal nome alla riga dopo (nell'ultima riga se ne aggiunge una).
  function onKey(e: KeyboardEvent<HTMLInputElement>, i: number, field: "email" | "header") {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const row = rows[i];
    if (field === "email") return focus(row.id, "header");
    if (i < rows.length - 1) return focus(rows[i + 1].id, "email");
    if (row.email.trim() || row.header.trim()) add(i);
  }

  return (
    <div className="mt-4">
      <div aria-hidden className="hidden grid-cols-[1.5rem_minmax(0,1.25fr)_minmax(0,1fr)_2.75rem] gap-x-2 px-0.5 pb-1.5 text-xs font-medium text-foreground-muted sm:grid">
        <span />
        <span>Email</span>
        <span>
          Nome o azienda <span className="font-normal">(facoltativo)</span>
        </span>
        <span />
      </div>
      <ol className="divide-y divide-border rounded-xl border border-border px-3 sm:divide-y-0 sm:border-0 sm:px-0" aria-label="Destinatari scritti qui">
        {rows.map((r, i) => {
          const st = states[i] ?? { kind: "vuota" };
          const email = r.email.trim().toLowerCase();
          const bad = shown(r) && (st.kind === "manca" || st.kind === "non valida");
          const msg = !shown(r)
            ? null
            : st.kind === "manca"
              ? "Manca l'email."
              : st.kind === "non valida"
                ? "Non sembra un'email: controlla (es. nome@esempio.it)."
                : st.kind === "doppia"
                  ? `Già scritta alla riga ${st.of + 1}: riceverà una mail sola.`
                  : null;
          const gone = st.kind === "ok" && optedOut.has(email);
          const hintId = msg || gone ? `mail-row-msg-${r.id}` : undefined;
          return (
            <li
              key={r.id}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)_2.75rem] items-start gap-x-2 gap-y-2 py-3 sm:grid-cols-[1.5rem_minmax(0,1.25fr)_minmax(0,1fr)_2.75rem] sm:py-1"
            >
              <span className="col-start-1 row-start-1 pt-3 text-right text-xs tabular-nums text-foreground-muted sm:pt-2.5" aria-hidden>
                {i + 1}
              </span>
              <div className="col-start-2 row-start-1 min-w-0">
                <label htmlFor={`mail-row-email-${r.id}`} className="sr-only">
                  Email della riga {i + 1}
                </label>
                <input
                  id={`mail-row-email-${r.id}`}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="next"
                  value={r.email}
                  maxLength={254}
                  onChange={(e) => update(r.id, { email: e.target.value })}
                  onBlur={() => r.email.trim() && touch(r.id)}
                  onPaste={(e) => onPaste(e, i)}
                  onKeyDown={(e) => onKey(e, i, "email")}
                  placeholder="nome@esempio.it"
                  aria-invalid={bad || undefined}
                  aria-describedby={hintId}
                  className={`${cell} ${bad ? "border-danger" : "border-border"}`}
                />
                {(msg || gone) && (
                  <p id={hintId} className={`mt-1 text-xs ${bad ? "text-danger" : "text-foreground-muted"}`}>
                    {msg ?? "Si è cancellata dalle nostre mail: non la riceverà."}
                  </p>
                )}
              </div>
              <div className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1">
                <label htmlFor={`mail-row-header-${r.id}`} className="sr-only">
                  Nome o azienda della riga {i + 1}
                </label>
                <input
                  id={`mail-row-header-${r.id}`}
                  value={r.header}
                  maxLength={200}
                  enterKeyHint={i === rows.length - 1 ? "done" : "next"}
                  onChange={(e) => update(r.id, { header: e.target.value })}
                  onKeyDown={(e) => onKey(e, i, "header")}
                  placeholder="Es. Dott. Rossi"
                  className={`${cell} border-border`}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={r.email.trim() ? `Togli la riga ${i + 1} (${r.email.trim()})` : `Togli la riga ${i + 1}`}
                title="Togli la riga"
                className={`${iconBtn} col-start-3 row-start-1 sm:col-start-4`}
              >
                <span aria-hidden>×</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => add()}
          disabled={full}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dashed border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Aggiungi una riga
        </button>
        <p className="text-xs text-foreground-muted" role="status">
          {full ? `Sei arrivato a ${MAX_ROWS} righe: per elenchi più lunghi usa «Carica un file».` : note}
        </p>
      </div>
    </div>
  );
}

// «Incolla un elenco»: come è stato capito quello che hai incollato (le prime righe, quanti
// pronti, quali righe sono da correggere), sotto la casella, mentre scrivi.
export function PasteReading({
  ready,
  skipped,
  titleRow,
  duplicates,
}: {
  ready: Recipient[];
  skipped: string[];
  titleRow: string | null;
  duplicates: number;
}) {
  return (
    <div className="mt-3 rounded-xl border border-border p-3 text-sm" aria-live="polite">
      <p className="text-xs font-medium text-foreground-muted">Come l&apos;ho letto</p>
      {ready.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {ready.slice(0, 3).map((r) => (
            <li key={r.email} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
              <span className="min-w-0 break-all text-foreground">{r.email}</span>
              <span aria-hidden className="text-foreground-muted">→</span>
              <span className={r.header ? "text-foreground" : "italic text-foreground-muted"}>{r.header || "senza nome"}</span>
            </li>
          ))}
          {ready.length > 3 && <li className="text-xs text-foreground-muted">e altre {ready.length - 3}</li>}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-foreground-muted">Ancora nessun indirizzo valido.</p>
      )}
      <p className="mt-2 text-xs font-medium">
        <span className="text-foreground">{ready.length} {ready.length === 1 ? "pronto" : "pronti"}</span>
        {skipped.length > 0 && <span className="text-danger"> · {skipped.length} da correggere</span>}
      </p>
      {skipped.length > 0 && (
        <p className="mt-1 break-words text-xs text-danger">
          Da correggere (l&apos;email non va): {skipped.slice(0, 5).map((s) => `«${s}»`).join(", ")}
          {skipped.length > 5 ? ` e altre ${skipped.length - 5}` : ""}
        </p>
      )}
      {titleRow && (
        <p className="mt-1 break-words text-xs text-foreground-muted">La prima riga («{titleRow}») l&apos;ho presa come titolo delle colonne.</p>
      )}
      {duplicates > 0 && (
        <p className="mt-1 text-xs text-foreground-muted">
          {duplicates === 1 ? "1 indirizzo ripetuto: riceverà una mail sola." : `${duplicates} indirizzi ripetuti: ognuno riceverà una mail sola.`}
        </p>
      )}
    </div>
  );
}
