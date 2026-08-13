"use client";

import { forwardRef, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { useToast, runWithToast } from "@/components/toast";
import { entryLabel, type DayEntry, type Employee, type Block, type Leave, type LeaveType } from "@/lib/schedule";
import { saveDayEntry, type DayLeaveInput } from "./actions";

export type { Employee, Block, Leave, LeaveType };

// L'ordine è quello scelto manualmente dal titolare (es. titolare in cima,
// poi il personale di sala): vedi la pagina Dipendenti.
export function orderEmployees<T extends { sortOrder: number; name: string }>(employees: T[]): T[] {
  return employees.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

const KIND_STYLE: Record<DayEntry["kind"], string> = {
  TURNO: "",
  RIPOSO: "bg-surface-2 text-foreground-muted",
  FERIE: "bg-accent/15 text-accent",
  PERMESSO: "bg-gold/15 text-gold",
  MALATTIA: "bg-danger/10 text-danger",
  CHIUSO: "bg-surface-2 text-foreground-muted",
  NON_PIANIFICATO: "",
};

export function DayCellContent({
  entry,
  align = "left",
}: {
  entry: DayEntry;
  align?: "left" | "right";
}) {
  if (entry.kind === "CHIUSO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-foreground-muted">
        <span aria-hidden>🔒</span> Chiuso
      </span>
    );
  }

  if (entry.kind === "NON_PIANIFICATO") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-xs text-foreground-muted/70">
        +
      </span>
    );
  }

  if (entry.kind !== "TURNO") {
    return (
      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${KIND_STYLE[entry.kind]}`}>
        {entryLabel(entry)}
      </span>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 ${align === "right" ? "items-end" : "items-start"}`}>
      {entry.needsVerification && (
        <span className="flex items-center gap-1 text-[10px] font-medium text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" /> da verificare
        </span>
      )}
      {entry.blocks.map((b) => (
        <span key={b.id} className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-foreground">
          {(b.addedByEmployee || b.originalStartTime) && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
              title={
                b.addedByEmployee
                  ? "Aggiunto dal dipendente durante la revisione mensile"
                  : `Corretto dal dipendente — era pianificato ${b.originalStartTime}–${b.originalEndTime}`
              }
            />
          )}
          {b.startTime}–{b.endTime}
        </span>
      ))}
    </div>
  );
}


// La mattina va dalle 8 alle 13, il pomeriggio dalle 13 alle 24: due fasce
// fisse, non un orario libero unico che potrebbe coprire tutta la giornata.
const MATTINA_MIN = "08:00";
const MATTINA_MAX = "13:00";
const POMERIGGIO_MIN = "13:00";
const POMERIGGIO_MAX = "23:59";

function clampTime(value: string, min: string, max: string): string {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

type Row = { startTime: string; endTime: string; enabled: boolean };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Prima qui c'erano due <select> (ore/minuti): risolvevano il problema della
// digitazione a scatti dell'<input type="time"> nativo, ma introducevano il
// proprio — la ricerca-per-tastiera di un <select> si "dimentica" la prima
// cifra se la seconda non arriva abbastanza in fretta, quindi scrivere "11"
// con calma selezionava "01" invece di "11". Un campo di testo a 2 cifre
// elimina anche questo: nessun timeout, e appena la seconda cifra arriva si
// passa da soli al campo successivo (ora → minuti → fine turno successivo),
// senza dover nemmeno premere Tab — che comunque resta libero per chi
// preferisce muoversi a mano.
const DigitInput = forwardRef<
  HTMLInputElement,
  { value: string; max: number; ariaLabel: string; onComplete: (twoDigits: string, el: HTMLInputElement) => void }
>(function DigitInput({ value, max, ariaLabel, onComplete }, ref) {
  const [buffer, setBuffer] = useState(value);
  // Il valore committato può cambiare "da fuori" — tipicamente perché il
  // campo minuti ha appena fatto sforare il massimo consentito e il
  // clampTime del genitore ha corretto anche l'ora. Si aggiorna il buffer
  // durante il render (pattern consigliato da React), non in un effect: non
  // c'è un sistema esterno da sincronizzare, solo uno stato derivato da una
  // prop che è cambiata.
  const [lastSyncedValue, setLastSyncedValue] = useState(value);
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setBuffer(value);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits.length === 0) {
      setBuffer("");
      return;
    }
    if (digits.length === 1) {
      setBuffer(digits);
      return;
    }
    // Selezione automatica al focus (sotto) fa sì che il caso normale sia
    // "esattamente 2 cifre digitate di fila"; prendere le ultime due copre
    // anche incolla/digitazione più rapida del previsto.
    const padded = pad2(Math.min(max, Number(digits.slice(-2))));
    setBuffer(padded);
    onComplete(padded, e.target);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.select();
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (buffer.length === 1) {
      const padded = pad2(Number(buffer));
      setBuffer(padded);
      onComplete(padded, e.target);
    } else if (buffer.length === 0) {
      setBuffer(value);
    }
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={buffer}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-label={ariaLabel}
      data-time-chain-input=""
      className="w-11 shrink-0 rounded-lg border border-border bg-surface-2 px-1 py-2 text-center text-sm tabular-nums outline-none focus:border-accent"
    />
  );
});

// Cerca, dentro il contenitore [data-time-chain-root] più vicino, il
// prossimo campo-cifre in ordine di comparsa nel DOM e ci sposta il focus.
// Niente ref passate a mano attraverso Mattina/Pomeriggio: l'ordine nel DOM
// coincide già con l'ordine visivo (ora → minuti → fine → fascia
// successiva), quindi basta cercarlo.
function focusNextChainInput(current: HTMLElement) {
  const container = current.closest("[data-time-chain-root]");
  if (!container) return;
  const all = Array.from(container.querySelectorAll<HTMLInputElement>("[data-time-chain-input]"));
  const idx = all.indexOf(current as HTMLInputElement);
  if (idx >= 0 && idx < all.length - 1) {
    const next = all[idx + 1];
    next.focus();
    next.select();
  }
}

function TimeFieldInput({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [hh, mm] = value.split(":");
  const maxHour = Number(max.split(":")[0]);

  function commit(newHH: string, newMM: string, el: HTMLInputElement) {
    onChange(clampTime(`${newHH}:${newMM}`, min, max));
    // Spostare il focus subito, in modo sincrono, fa scattare il blur sul
    // campo appena completato PRIMA che React abbia ridisegnato quel campo
    // con le sue 2 cifre definitive: l'handler onBlur vede ancora lo stato
    // di un istante fa (un solo carattere in buffer) e — pensando che
    // l'utente si sia allontanato a metà digitazione — rilancia un commit
    // "fantasma" con solo la prima cifra, sovrascrivendo quello corretto
    // appena fatto. Rimandare lo spostamento del focus a un macrotask dà a
    // React il tempo di completare il render con lo stato aggiornato.
    setTimeout(() => focusNextChainInput(el), 0);
  }

  return (
    <span className="flex flex-1 items-center gap-1">
      <DigitInput value={hh} max={maxHour} ariaLabel={`${ariaLabel} — ora`} onComplete={(v, el) => commit(v, mm, el)} />
      <span className="text-foreground-muted">:</span>
      <DigitInput value={mm} max={59} ariaLabel={`${ariaLabel} — minuti`} onComplete={(v, el) => commit(hh, v, el)} />
      <TimePresetSelect min={min} max={max} onSelect={onChange} ariaLabel={`${ariaLabel} — scegli da un elenco di orari`} />
    </span>
  );
}

function buildTimeOptions(min: string, max: string, stepMinutes: number): string[] {
  const [minH, minM] = min.split(":").map(Number);
  const [maxH, maxM] = max.split(":").map(Number);
  const startTotal = minH * 60 + minM;
  const endTotal = maxH * 60 + maxM;
  const options: string[] = [];
  for (let t = startTotal; t <= endTotal; t += stepMinutes) {
    options.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
  }
  return options;
}

// Digitare a mano (sopra) resta sempre possibile ed è il modo principale:
// questo è solo un modo alternativo, più veloce, per scegliere un orario
// "tondo" senza digitare nulla. Un <select> nativo vero, non un pannello
// disegnato a mano: resta accessibile da tastiera e apre lo stesso menu che
// il sistema operativo usa per ogni altro elenco a scelta singola. Il
// valore mostrato nel pulsante resta sempre la freccetta ▾ (non l'ultimo
// orario scelto): è un pulsante-menu "usa e getta", lo stato vero resta nei
// campi a cifre accanto.
function TimePresetSelect({
  min,
  max,
  onSelect,
  ariaLabel,
}: {
  min: string;
  max: string;
  onSelect: (value: string) => void;
  ariaLabel: string;
}) {
  const options = useMemo(() => buildTimeOptions(min, max, 15), [min, max]);
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onSelect(e.target.value);
      }}
      aria-label={ariaLabel}
      title="Scegli da un elenco di orari"
      className="h-8 w-6 shrink-0 cursor-pointer rounded-lg border border-border bg-surface-2 text-center text-xs text-foreground-muted outline-none focus:border-accent"
    >
      <option value="" disabled>
        ▾
      </option>
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function PeriodRowInput({
  label,
  row,
  min,
  max,
  onChange,
}: {
  label: string;
  row: Row;
  min: string;
  max: string;
  onChange: (row: Row) => void;
}) {
  // Scegliere un orario è già un'istruzione chiara di voler attivare quella
  // fascia: non ha senso costringere l'utente a spuntare anche la casella a
  // parte. La spunta resta comunque disattivabile a mano, per poter
  // "spegnere" una fascia senza perdere l'orario già impostato.
  function updateStart(startTime: string) {
    onChange({ ...row, startTime: clampTime(startTime, min, max), enabled: true });
  }
  function updateEnd(endTime: string) {
    onChange({ ...row, endTime: clampTime(endTime, min, max), enabled: true });
  }

  // Sotto ~400px di larghezza (un iPhone SE, non un caso raro) i 4 campi
  // ora/minuti più l'etichetta non ci stanno tutte su una riga: l'ultimo
  // finiva letteralmente fuori dallo schermo, inutilizzabile al tocco.
  // Sotto "sm" l'orario va a capo su una riga propria, indentato sotto la
  // checkbox invece che schiacciato accanto ad essa.
  //
  // Sotto "sm" i campi a cifre con avanzamento automatico lasciano il posto
  // a due <input type="time"> nativi: sono pensati per una tastiera fisica
  // che digita in fretta, ma al tocco aprono una tastiera numerica che
  // "salta" da un campo minuscolo all'altro — confuso e, sui telefoni più
  // stretti, con dimensioni che sforano il bordo dello schermo. La rotella
  // di sistema nativa (quella che ogni altra app usa) è più stretta, più
  // familiare al tocco, e non serve nemmeno una tastiera.
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={(e) => onChange({ ...row, enabled: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
        <span className="w-20 shrink-0 text-xs font-medium text-foreground-muted">{label}</span>
      </label>
      <div className="flex min-w-0 items-center gap-2 pl-6 sm:pl-0">
        <span className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
          <NativeTimeField value={row.startTime} min={min} max={max} onChange={updateStart} ariaLabel={`${label} — inizio`} />
          <span className="shrink-0 text-foreground-muted">–</span>
          <NativeTimeField value={row.endTime} min={min} max={max} onChange={updateEnd} ariaLabel={`${label} — fine`} />
        </span>
        <span className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          <TimeFieldInput value={row.startTime} min={min} max={max} onChange={updateStart} ariaLabel={`${label} — inizio`} />
          <span className="text-foreground-muted">–</span>
          <TimeFieldInput value={row.endTime} min={min} max={max} onChange={updateEnd} ariaLabel={`${label} — fine`} />
        </span>
      </div>
    </div>
  );
}

function NativeTimeField({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="time"
      step={60}
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        if (e.target.value) onChange(clampTime(e.target.value, min, max));
      }}
      aria-label={ariaLabel}
      className="w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2 py-2.5 text-sm outline-none focus:border-accent"
    />
  );
}

type Mode = "WORK" | "FERIE" | "PERMESSO" | "MALATTIA" | "LIBERO";

export function DayEditorModal({
  employee,
  dateKey,
  entry,
  isClosed,
  onClose,
  onOpenClosureManager,
}: {
  employee: Employee;
  dateKey: string;
  entry: DayEntry;
  isClosed: boolean;
  onClose: () => void;
  /** Se presente, mostra un pulsante che apre la gestione della chiusura giornata. */
  onOpenClosureManager?: () => void;
}) {
  const initialMode: Mode =
    entry.kind === "TURNO" || entry.kind === "NON_PIANIFICATO" || entry.kind === "CHIUSO"
      ? "WORK"
      : entry.kind === "RIPOSO"
        ? "LIBERO"
        : entry.kind;

  const [mode, setMode] = useState<Mode>(initialMode);

  const existingMattina = entry.blocks.find((b) => b.startTime < POMERIGGIO_MIN);
  const existingPomeriggio = entry.blocks.find((b) => b.startTime >= POMERIGGIO_MIN);
  const mattinaSpillsOver = existingMattina && existingMattina.endTime > POMERIGGIO_MIN;

  const [mattina, setMattina] = useState<Row>(
    existingMattina
      ? {
          startTime: clampTime(existingMattina.startTime, MATTINA_MIN, MATTINA_MAX),
          endTime: clampTime(existingMattina.endTime, MATTINA_MIN, MATTINA_MAX),
          enabled: true,
        }
      : { startTime: "09:30", endTime: MATTINA_MAX, enabled: false },
  );
  const [pomeriggio, setPomeriggio] = useState<Row>(
    existingPomeriggio
      ? {
          startTime: clampTime(existingPomeriggio.startTime, POMERIGGIO_MIN, POMERIGGIO_MAX),
          endTime: clampTime(existingPomeriggio.endTime, POMERIGGIO_MIN, POMERIGGIO_MAX),
          enabled: true,
        }
      : mattinaSpillsOver
        ? { startTime: POMERIGGIO_MIN, endTime: clampTime(existingMattina!.endTime, POMERIGGIO_MIN, POMERIGGIO_MAX), enabled: true }
        : { startTime: "16:30", endTime: "22:00", enabled: false },
  );

  const [quantity, setQuantity] = useState(entry.leave?.quantity ?? 1);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const date = parseDateKey(dateKey);

  function save() {
    const leave: DayLeaveInput =
      mode === "WORK"
        ? null
        : {
            type: mode === "LIBERO" ? "LIBERO" : mode,
            // Solo ferie e permesso hanno una quantità: riposo e malattia sono
            // assenze dell'intera giornata, la quantità non ha senso per loro.
            quantity: mode === "FERIE" || mode === "PERMESSO" ? quantity : 0,
          };
    const blocks = mode === "WORK" ? [mattina, pomeriggio].filter((r) => r.enabled && r.startTime && r.endTime) : [];
    startTransition(async () => {
      const result = await runWithToast(toast, () => saveDayEntry(employee.id, dateKey, blocks, leave), "Turno salvato");
      if (result !== null) {
        router.refresh();
        onClose();
      }
    });
  }

  function clearDay() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => saveDayEntry(employee.id, dateKey, [], null), "Giornata svuotata");
      if (result !== null) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4">
          <p className="text-xs text-foreground-muted">
            {dayLabel(date, true)} {formatDayMonth(date)}
          </p>
          <h2 className="text-base font-semibold text-foreground">{employee.name}</h2>
        </div>

        {isClosed ? (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-3 text-sm text-foreground">
              <span aria-hidden>🔒</span>
              <span>
                Il locale è chiuso in questa giornata: non è possibile pianificare turni.
                {entry.suspendedBlocks.length > 0 &&
                  ` C'è un turno conservato come bozza per ${employee.name} (${entry.suspendedBlocks
                    .map((b) => `${b.startTime}–${b.endTime}`)
                    .join(", ")}), tornerà visibile alla riapertura.`}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              {onOpenClosureManager && (
                <button
                  type="button"
                  onClick={onOpenClosureManager}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
                >
                  Gestisci chiusura
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
              >
                Chiudi
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <ModeButton label="Turno" active={mode === "WORK"} onClick={() => setMode("WORK")} />
              <ModeButton label="Riposo" active={mode === "LIBERO"} onClick={() => setMode("LIBERO")} />
              {employee.role === "EMPLOYEE" && (
                <>
                  <ModeButton label="Ferie" active={mode === "FERIE"} onClick={() => setMode("FERIE")} accent />
                  <ModeButton label="Permesso" active={mode === "PERMESSO"} onClick={() => setMode("PERMESSO")} gold />
                  <ModeButton label="Malattia" active={mode === "MALATTIA"} onClick={() => setMode("MALATTIA")} danger />
                </>
              )}
            </div>

            {mode === "WORK" && (
              <div className="space-y-2" data-time-chain-root="">
                <PeriodRowInput label="Mattina" row={mattina} min={MATTINA_MIN} max={MATTINA_MAX} onChange={setMattina} />
                <PeriodRowInput
                  label="Pomeriggio"
                  row={pomeriggio}
                  min={POMERIGGIO_MIN}
                  max={POMERIGGIO_MAX}
                  onChange={setPomeriggio}
                />
                <p className="text-xs text-foreground-muted">
                  Mattina 8:00–13:00, pomeriggio 13:00–24:00: due fasce separate, non un orario unico.
                </p>
              </div>
            )}

            {(mode === "FERIE" || mode === "PERMESSO") && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-foreground-muted">
                  Quantità ({mode === "FERIE" ? "giorni" : "ore"})
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  aria-label={`Quantità in ${mode === "FERIE" ? "giorni" : "ore"}`}
                  className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-2 text-center text-sm outline-none focus:border-accent"
                />
              </div>
            )}

            {mode === "LIBERO" && (
              <p className="text-sm text-foreground-muted">
                Il locale resta aperto: {employee.name} è a riposo. Non conta su ferie o permessi.
              </p>
            )}

            {mode === "MALATTIA" && (
              <p className="text-sm text-foreground-muted">Assenza per malattia — non incide su ferie o permessi.</p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={clearDay}
                disabled={pending}
                className="text-xs font-medium text-foreground-muted hover:text-danger disabled:opacity-50"
              >
                Svuota giornata
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? "Salvo…" : "Salva"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  label,
  active,
  onClick,
  accent,
  gold,
  danger,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: boolean;
  gold?: boolean;
  danger?: boolean;
}) {
  const activeClass = accent
    ? "border-accent text-accent bg-accent/10"
    : gold
      ? "border-gold text-gold bg-gold/10"
      : danger
        ? "border-danger text-danger bg-danger/10"
        : "border-foreground text-foreground bg-surface-2";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active ? activeClass : "border-border text-foreground-muted"
      }`}
    >
      {label}
    </button>
  );
}
