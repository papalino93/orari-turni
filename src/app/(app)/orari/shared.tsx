"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { useToast, runWithToast } from "@/components/toast";
import {
  COVERAGE_END_HOUR,
  COVERAGE_START_HOUR,
  entryLabel,
  type DayEntry,
  type Employee,
  type Block,
  type Leave,
  type LeaveType,
} from "@/lib/schedule";
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
        <span key={b.id} className="whitespace-nowrap text-xs font-medium text-foreground">
          {b.startTime}–{b.endTime}
        </span>
      ))}
    </div>
  );
}

export function CoverageHeatmap({
  counts,
  compact = false,
  showAxis = false,
}: {
  counts: number[];
  compact?: boolean;
  showAxis?: boolean;
}) {
  const max = Math.max(1, ...counts);
  const n = counts.length;
  const H = compact ? 22 : 30;
  const barW = 0.62;
  const radius = barW / 2;

  return (
    <div>
      <svg
        viewBox={`0 0 ${n} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: H, display: "block", overflow: "visible" }}
      >
        <line x1={0} y1={H - 0.5} x2={n} y2={H - 0.5} stroke="var(--border)" strokeWidth={0.4} />
        {counts.map((c, i) => {
          const hour = COVERAGE_START_HOUR + i;
          const color = c === 0 ? "var(--border)" : "var(--accent)";
          const barH = c === 0 ? 0.6 : Math.max(2.2, (c / max) * (H - 5));
          const x = i + (1 - barW) / 2;
          return (
            <rect key={hour} x={x} y={H - 1 - barH} width={barW} height={barH} rx={radius} fill={color}>
              <title>{`ore ${hour}:00 — ${c} in turno`}</title>
            </rect>
          );
        })}
      </svg>
      {showAxis && (
        <div className="mt-1 flex justify-between text-[10px] text-foreground-muted/70">
          <span>{COVERAGE_START_HOUR}</span>
          <span>{Math.round((COVERAGE_START_HOUR + COVERAGE_END_HOUR) / 2)}</span>
          <span>{COVERAGE_END_HOUR}</span>
        </div>
      )}
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

// L'<input type="time"> nativo del browser è un widget su cui l'app non ha
// controllo: la digitazione da tastiera è a scatti (bisogna digitare le due
// cifre dell'ora abbastanza in fretta, altrimenti "23" diventa "02" poi
// "03") e il selettore a scorrimento del sistema operativo non rispetta in
// modo prevedibile i limiti mattina/pomeriggio. Due <select> — ore e minuti
// — risolvono entrambi i problemi: rispondono in modo affidabile alla
// tastiera (digitare "23" seleziona subito l'opzione giusta, comportamento
// standard di ogni <select>) e restano dentro l'intervallo consentito senza
// bisogno di clampare dopo il fatto.
const MINUTE_STEPS = [0, 15, 30, 45];

function hourOptions(min: string, max: string): number[] {
  const minH = Number(min.split(":")[0]);
  const maxH = Number(max.split(":")[0]);
  const hours: number[] = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);
  return hours;
}

function minuteOptions(currentMinute: number): number[] {
  // Un turno storico potrebbe avere minuti "strani" (es. :05): li includiamo
  // comunque nell'elenco, così non scompaiono in silenzio al primo render.
  return Array.from(new Set([...MINUTE_STEPS, currentMinute])).sort((a, b) => a - b);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function TimeFieldSelect({
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
  const hours = hourOptions(min, max);
  const minutes = minuteOptions(Number(mm));

  return (
    <span className="flex flex-1 items-center gap-1">
      <select
        value={hh}
        onChange={(e) => onChange(`${e.target.value}:${mm}`)}
        aria-label={`${ariaLabel} — ora`}
        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-accent"
      >
        {hours.map((h) => (
          <option key={h} value={pad2(h)}>
            {pad2(h)}
          </option>
        ))}
      </select>
      <span className="text-foreground-muted">:</span>
      <select
        value={mm}
        onChange={(e) => onChange(`${hh}:${e.target.value}`)}
        aria-label={`${ariaLabel} — minuti`}
        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-accent"
      >
        {minutes.map((m) => (
          <option key={m} value={pad2(m)}>
            {pad2(m)}
          </option>
        ))}
      </select>
    </span>
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

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={(e) => onChange({ ...row, enabled: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
        <span className="w-20 shrink-0 text-xs font-medium text-foreground-muted">{label}</span>
      </label>
      <TimeFieldSelect value={row.startTime} min={min} max={max} onChange={updateStart} ariaLabel={`${label} — inizio`} />
      <span className="text-foreground-muted">–</span>
      <TimeFieldSelect value={row.endTime} min={min} max={max} onChange={updateEnd} ariaLabel={`${label} — fine`} />
    </div>
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
              <div className="space-y-2">
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
