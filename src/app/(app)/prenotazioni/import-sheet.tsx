"use client";

// «Importa dal librone»: si incolla (o si scrive) la lista delle prenotazioni già segnate sulla carta,
// una per riga; sotto si vede subito come è stata letta, con i problemi in rosso e quelle già in agenda
// in giallo; poi un tocco le segna tutte. Le righe non segnate restano nel riquadro, da correggere.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { E_PEOPLE, importable, importCounts, importSig, parseImport, IMPORT_MAX_ROWS, W_PEOPLE, W_TIME, type ImportRow } from "@/lib/booking/import";
import { addDays, businessDay, dayShort, timeToDayMinutes, weekdayOf } from "@/lib/booking/rules";
import { checkImport, importBookings, type ImportOutcome } from "./actions";
import { phoneDisplay } from "./format";

type ServerRow = ImportOutcome["results"][number];

const WEEKDAY_SHORT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const WEEKDAY_LONG = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const dm = (day: string) => `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`;
const bookingsWord = (n: number) => (n === 1 ? "prenotazione" : "prenotazioni");

export function ImportSheet({ now, testMode, onClose }: { now: number; testMode: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  // Righe già in agenda da segnare lo stesso («Importa lo stesso»), per impronta (restano scelte
  // anche se si corregge un'altra riga).
  const [keep, setKeep] = useState<Set<string>>(() => new Set());
  // Risposta del server per l'anteprima (doppioni, giorni chiusi): per riga, con l'impronta letta là.
  const [server, setServer] = useState<Map<number, ServerRow>>(() => new Map());
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  // Dopo un salvataggio con righe non segnate: il riepilogo sopra il riquadro.
  const [leftover, setLeftover] = useState<string | null>(null);
  const seq = useRef(0);

  const today = businessDay(new Date(now));
  const rows = useMemo(() => parseImport(text, new Date(now)), [text, now]);
  const counts = importCounts(rows);
  const tooMany = counts.bookings > IMPORT_MAX_ROWS;

  // Il server dice quali sono già in agenda: si chiede mezzo secondo dopo l'ultima modifica.
  useEffect(() => {
    const id = ++seq.current;
    if (!counts.ok || tooMany) {
      const clear = setTimeout(() => {
        if (id === seq.current) {
          setServer(new Map());
          setChecking(false);
        }
      }, 0);
      return () => clearTimeout(clear);
    }
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await checkImport(text);
        if (id !== seq.current) return;
        if (res.ok) setServer(new Map(res.data.results.map((r) => [r.line, r])));
      } catch {
        /* l'anteprima resta senza il controllo dei doppioni: al salvataggio si rifà */
      } finally {
        if (id === seq.current) setChecking(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [text, counts.ok, tooMany]);

  // Quello che il server ha detto di questa riga, se l'ha letta uguale.
  const fromServer = (r: ImportRow): ServerRow | null => {
    const s = server.get(r.line);
    return s && s.sig === importSig(r) ? s : null;
  };
  const isDup = (r: ImportRow) => importable(r) && Boolean(fromServer(r)?.dup);
  const kept = (r: ImportRow) => keep.has(importSig(r));
  const toSave = rows.filter((r) => importable(r) && (!isDup(r) || kept(r)));
  const dupSkipped = rows.filter((r) => isDup(r) && !kept(r)).length;
  const n = toSave.length;

  async function save() {
    if (!n || busy) return;
    setBusy(true);
    try {
      const keepLines = rows.filter((r) => importable(r) && kept(r)).map((r) => r.line);
      const res = await importBookings(text, keepLines);
      if (!res.ok) {
        toast.showError(res.error);
        return;
      }
      const results = res.data.results;
      const saved = results.filter((r) => r.ok).length;
      const skipped = results.filter((r) => r.skippedDuplicate).length;
      const failed = results.filter((r) => !r.ok && r.error);
      router.refresh();
      const done = saved
        ? `${saved === 1 ? "Segnata 1 prenotazione" : `Segnate ${saved} prenotazioni`}${skipped ? ` · ${skipped} già in agenda, saltate` : ""}`
        : skipped
          ? "Nessuna prenotazione segnata: erano già in agenda"
          : null;
      if (!failed.length) {
        if (done) toast.showSuccess(done);
        onClose();
        return;
      }
      if (done) toast.showSuccess(done);
      // Restano solo le righe da correggere (con la riga del giorno, se lo prendevano da lì).
      const all = text.split(/\r\n|\r|\n/);
      const wanted = new Set<number>();
      for (const f of failed) {
        const r = rows.find((x) => x.line === f.line);
        if (r?.dayFrom) wanted.add(r.dayFrom);
        wanted.add(f.line);
      }
      setText(
        [...wanted]
          .sort((a, b) => a - b)
          .map((l) => all[l - 1] ?? "")
          .join("\n"),
      );
      setKeep(new Set());
      setServer(new Map());
      setLeftover(
        `${saved ? `${saved === 1 ? "Segnata 1 prenotazione" : `Segnate ${saved} prenotazioni`}. ` : ""}${failed.length === 1 ? "Questa riga non è stata segnata" : `Queste ${failed.length} righe non sono state segnate`}: correggile qui sotto e tocca di nuovo il pulsante.`,
      );
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  // Esempio con i giorni di domani e dopodomani (così il giorno della settimana torna).
  const ex1 = addDays(today, 1);
  const ex2 = addDays(today, 2);

  return (
    <Sheet title="Importa dal librone" onClose={onClose} dirty={text.trim() !== "" && !busy} wide>
      <div className="space-y-4" data-testid="importa-librone">
        <div className="space-y-2 text-sm text-foreground">
          <p>
            Una prenotazione per riga: <strong>giorno, ora, persone, nome</strong>. Telefono, menù e nota se ci sono. Se ora o persone non si sanno ancora, la segno «da completare».
          </p>
          <pre className="overflow-x-auto rounded-xl bg-surface-2 px-3 py-2 font-mono text-[12px] sm:text-[13px] leading-relaxed whitespace-pre text-foreground">
            {`${dm(ex1)} 20:30 4 Rossi 333 123 4567 seggiolone\n${WEEKDAY_SHORT[weekdayOf(ex2)]} ${dm(ex2)}; 21:00; 2; Bianchi`}
          </pre>
          <p className="text-xs text-foreground-muted">
            Se copi una pagina intera, scrivi il giorno da solo su una riga (es. «{WEEKDAY_LONG[weekdayOf(ex1)]} {dm(ex1)}»): vale per le righe sotto. Da Excel: copia le colonne e incolla qui.
          </p>
        </div>

        {leftover && (
          <p role="status" className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-sm font-medium text-foreground">
            {leftover}
          </p>
        )}

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (leftover && !e.target.value.trim()) setLeftover(null);
          }}
          rows={6}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Prenotazioni da importare"
          placeholder="Incolla o scrivi qui, una prenotazione per riga"
          className={`${inputClass} resize-y font-mono leading-relaxed`}
        />

        {rows.length > 0 && (
          <section aria-label="Come le ho lette" className="space-y-2">
            <p className="px-1 text-sm text-foreground" data-testid="import-riepilogo">
              <span className="font-semibold">Come le ho lette:</span>{" "}
              {[
                `${n} da segnare`,
                toSave.filter((r) => r.time === null || r.people === null).length ? `${toSave.filter((r) => r.time === null || r.people === null).length} da completare` : "",
                counts.errors ? `${counts.errors} da correggere` : "",
                dupSkipped ? `${dupSkipped} già in agenda` : "",
                counts.repeats ? `${counts.repeats} ${counts.repeats === 1 ? "ripetuta" : "ripetute"}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              {checking && <span className="text-foreground-muted"> · controllo l&apos;agenda…</span>}
            </p>
            {tooMany && (
              <p role="alert" className="px-1 text-sm font-medium text-danger">
                Al massimo {IMPORT_MAX_ROWS} prenotazioni alla volta: dividi la lista in più parti.
              </p>
            )}
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {rows.map((r) => (
                <PreviewRow
                  key={r.line}
                  r={r}
                  server={fromServer(r)}
                  kept={kept(r)}
                  onKeep={(on) =>
                    setKeep((s) => {
                      const next = new Set(s);
                      if (on) next.add(importSig(r));
                      else next.delete(importSig(r));
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          </section>
        )}

        {testMode && <p className="px-1 text-xs text-foreground-muted">L&apos;agenda è spenta: quelle che importi sono di prova.</p>}

        <div className="sticky bottom-0 z-10 -mx-5 flex gap-2 border-t border-border bg-surface px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
          <button type="button" onClick={onClose} className="min-h-12 shrink-0 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground sm:min-h-11 sm:px-5">
            Annulla
          </button>
          <button
            type="button"
            disabled={!n || busy || tooMany}
            onClick={save}
            className="min-h-12 min-w-0 flex-1 rounded-full bg-accent px-3 text-sm font-semibold whitespace-nowrap text-accent-foreground hover:bg-accent-hover disabled:opacity-50 sm:min-h-11 sm:flex-none sm:px-6 sm:text-[15px]"
          >
            {busy ? "Un attimo…" : n ? `Segna ${n} ${bookingsWord(n)} in agenda` : "Segna in agenda"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function PreviewRow({ r, server, kept, onKeep }: { r: ImportRow; server: ServerRow | null; kept: boolean; onKeep: (on: boolean) => void }) {
  if (r.kind === "skip") {
    return (
      <li data-testid="import-row" data-line={r.line} data-state="skip" className="px-3 py-2 text-xs text-foreground-muted">
        Riga {r.line} · intestazione delle colonne: la salto
      </li>
    );
  }
  if (r.kind === "day") {
    return (
      <li data-testid="import-row" data-line={r.line} data-state={r.errors.length ? "error" : "day"} className="bg-surface-2/70 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">
          {r.day && !r.errors.length ? dayShort(r.day) : r.text}
          <span className="font-normal text-foreground-muted"> · {r.errors.length ? `riga ${r.line}` : "vale per le righe sotto"}</span>
        </p>
        {r.errors.length > 0 && <p className="mt-0.5 text-sm font-medium text-danger">{r.errors.join(" · ")}</p>}
        {r.warnings.map((w) => (
          <p key={w} className="mt-0.5 text-sm text-gold">
            {w}
          </p>
        ))}
      </li>
    );
  }
  const bad = r.errors.length > 0;
  const repeat = r.repeatOf !== null;
  const dup = !bad && !repeat && server?.dup ? server.dup : null;
  // Senza ora o senza persone si segna lo stesso, «da completare» (in giallo, non un errore).
  const incomplete = !bad && (r.time === null || r.people === null);
  const state = bad ? "error" : repeat ? "repeat" : dup ? (kept ? "dup-kept" : "dup") : incomplete ? "incomplete" : "ok";
  const bar = bad ? "bg-danger" : repeat || (dup && !kept) || incomplete ? "bg-gold" : "bg-success";
  const missing = (t: string) => <span className="font-semibold text-danger">{t}</span>;
  const later = (t: string) => <span className="font-semibold text-gold">{t}</span>;
  const warnings = [
    ...(incomplete ? [`Da completare: ${[r.time === null ? "ora" : "", r.people === null ? "persone" : ""].filter(Boolean).join(" e ")} da definire. La segno lo stesso.`] : []),
    ...r.warnings.filter((w) => w !== W_TIME && w !== W_PEOPLE),
    ...(server?.warning && !bad && !repeat ? [server.warning] : []),
  ];
  return (
    <li data-testid="import-row" data-line={r.line} data-state={state} className={`relative py-2.5 pr-3 pl-4 ${repeat ? "opacity-70" : ""}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs tabular-nums text-foreground-muted">Riga {r.line}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {r.day ? dayShort(r.day) : missing("Giorno?")} · {r.time ? (timeToDayMinutes(r.time) >= 1440 ? `${r.time} (notte)` : r.time) : later("ora da definire")} ·{" "}
          {r.people !== null ? `${r.people} pers.` : r.errors.includes(E_PEOPLE) ? missing("Persone?") : later("persone da definire")}
        </span>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {r.name ? <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{r.name}</span> : missing("Nome?")}
        {r.phone && <span className="tabular-nums text-foreground-muted">{r.phoneIntl ? phoneDisplay(r.phoneIntl) : r.phone}</span>}
        {r.table && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent-ink">Tavolo {r.table}</span>}
        {r.menu && <span className="rounded-md bg-gold/10 px-1.5 py-0.5 text-xs font-semibold text-gold ring-1 ring-inset ring-gold/25">{r.menu}</span>}
        {r.allergies && <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger">⚠ Allergie</span>}
      </p>
      {r.note && <p className="mt-0.5 text-sm text-foreground-muted [overflow-wrap:anywhere]">«{r.note}»</p>}
      {bad && (
        <p className="mt-1 text-sm font-medium text-danger" data-testid="import-problema">
          {r.errors.join(" · ")}
        </p>
      )}
      {repeat && <p className="mt-1 text-sm text-foreground-muted">Uguale alla riga {r.repeatOf}: non la segno due volte</p>}
      {warnings.map((w) => (
        <p key={w} className="mt-1 text-sm text-gold">
          {w}
        </p>
      ))}
      {dup && (
        <div className="mt-1.5 flex flex-col gap-x-3 gap-y-0.5 rounded-lg bg-gold/10 px-2.5 py-1.5 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm text-foreground">
            {dup}: {kept ? "la segno lo stesso" : "non la segno"}
          </p>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={kept} onChange={(e) => onKeep(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
            Importa lo stesso
          </label>
        </div>
      )}
    </li>
  );
}
