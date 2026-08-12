"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { coverageCounts, COVERAGE_END_HOUR, COVERAGE_START_HOUR, dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { saveDayEntry, type DayLeaveInput } from "./actions";

export type Role = "EMPLOYEE" | "OWNER";
export type LeaveType = "FERIE" | "PERMESSO" | "LIBERO";

export type Employee = { id: string; name: string; role: Role; sortOrder: number };
export type Block = {
  id: string;
  employeeId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  confirmed: boolean;
};
export type Leave = { id: string; employeeId: string; dateKey: string; type: LeaveType; quantity: number };

// L'ordine è quello scelto manualmente dal titolare (es. titolare in cima,
// poi il personale di sala): vedi la pagina Dipendenti.
export function orderEmployees(employees: Employee[]): Employee[] {
  return employees.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

export function DayCellContent({
  blocks,
  leave,
  align = "left",
  isPast = false,
}: {
  blocks: Block[];
  leave: Leave | null;
  align?: "left" | "right";
  isPast?: boolean;
}) {
  if (leave) {
    const styles: Record<LeaveType, string> = {
      FERIE: "bg-accent/15 text-accent",
      PERMESSO: "bg-gold/15 text-gold",
      LIBERO: "bg-surface-2 text-foreground-muted",
    };
    const labels: Record<LeaveType, string> = {
      FERIE: `Ferie${leave.quantity !== 1 ? ` (${leave.quantity}g)` : ""}`,
      PERMESSO: `Permesso ${leave.quantity}h`,
      LIBERO: "Libero",
    };
    return (
      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${styles[leave.type]}`}>
        {labels[leave.type]}
      </span>
    );
  }
  if (blocks.length === 0) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-xs text-foreground-muted/70">
        +
      </span>
    );
  }
  const needsConfirm = isPast && blocks.some((b) => !b.confirmed);
  return (
    <div className={`flex flex-col gap-0.5 ${align === "right" ? "items-end" : "items-start"}`}>
      {needsConfirm && (
        <span className="flex items-center gap-1 text-[10px] font-medium text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" /> da confermare
        </span>
      )}
      {blocks
        .slice()
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((b) => (
          <span key={b.id} className="whitespace-nowrap text-xs font-medium text-foreground">
            {b.startTime}–{b.endTime}
          </span>
        ))}
    </div>
  );
}

export function CoverageHeatmap({
  blocks,
  compact = false,
  showAxis = false,
}: {
  blocks: Block[];
  compact?: boolean;
  showAxis?: boolean;
}) {
  const counts = coverageCounts(blocks);
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
      <input
        type="time"
        min={min}
        max={max}
        value={row.startTime}
        onChange={(e) => onChange({ ...row, startTime: clampTime(e.target.value, min, max) })}
        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-accent"
      />
      <span className="text-foreground-muted">–</span>
      <input
        type="time"
        min={min}
        max={max}
        value={row.endTime}
        onChange={(e) => onChange({ ...row, endTime: clampTime(e.target.value, min, max) })}
        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-accent"
      />
    </div>
  );
}

export function DayEditorModal({
  employee,
  dateKey,
  initialBlocks,
  initialLeave,
  onClose,
}: {
  employee: Employee;
  dateKey: string;
  initialBlocks: Block[];
  initialLeave: Leave | null;
  onClose: () => void;
}) {
  type Mode = "WORK" | "FERIE" | "PERMESSO" | "LIBERO";

  const [mode, setMode] = useState<Mode>(initialLeave ? initialLeave.type : "WORK");

  // Turni creati prima di questo vincolo potevano avere un blocco unico che
  // sconfina tra mattina e pomeriggio (es. 09:00–23:00): li dividiamo qui,
  // così aprendo il giorno non si perde il pezzo di orario oltre le 13:00.
  const existingMattina = initialBlocks.find((b) => b.startTime < POMERIGGIO_MIN);
  const existingPomeriggio = initialBlocks.find((b) => b.startTime >= POMERIGGIO_MIN);
  const mattinaSpillsOver = existingMattina && existingMattina.endTime > POMERIGGIO_MIN;

  const [mattina, setMattina] = useState<Row>(
    existingMattina
      ? {
          startTime: clampTime(existingMattina.startTime, MATTINA_MIN, MATTINA_MAX),
          endTime: clampTime(existingMattina.endTime, MATTINA_MIN, MATTINA_MAX),
          enabled: true,
        }
      : { startTime: "09:00", endTime: MATTINA_MAX, enabled: false },
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
        : { startTime: POMERIGGIO_MIN, endTime: "20:00", enabled: false },
  );

  const [quantity, setQuantity] = useState(initialLeave?.quantity ?? 1);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const date = parseDateKey(dateKey);

  function save() {
    const leave: DayLeaveInput = mode === "WORK" ? null : { type: mode, quantity: mode === "LIBERO" ? 0 : quantity };
    const blocks =
      mode === "WORK"
        ? [mattina, pomeriggio].filter((r) => r.enabled && r.startTime && r.endTime)
        : [];
    startTransition(async () => {
      await saveDayEntry(employee.id, dateKey, blocks, leave);
      router.refresh();
      onClose();
    });
  }

  function clearDay() {
    startTransition(async () => {
      await saveDayEntry(employee.id, dateKey, [], null);
      router.refresh();
      onClose();
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

        <div className="mb-4 flex flex-wrap gap-2">
          <ModeButton label="Turno" active={mode === "WORK"} onClick={() => setMode("WORK")} />
          <ModeButton label="Libero" active={mode === "LIBERO"} onClick={() => setMode("LIBERO")} />
          {employee.role === "EMPLOYEE" && (
            <>
              <ModeButton label="Ferie" active={mode === "FERIE"} onClick={() => setMode("FERIE")} accent />
              <ModeButton label="Permesso" active={mode === "PERMESSO"} onClick={() => setMode("PERMESSO")} gold />
            </>
          )}
        </div>

        {mode === "WORK" && (
          <div className="space-y-2">
            <PeriodRowInput
              label="Mattina"
              row={mattina}
              min={MATTINA_MIN}
              max={MATTINA_MAX}
              onChange={setMattina}
            />
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
              className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-2 text-center text-sm outline-none focus:border-accent"
            />
          </div>
        )}

        {mode === "LIBERO" && (
          <p className="text-sm text-foreground-muted">
            Giorno segnato come libero — non conta su ferie o permessi, serve solo a far sapere che è stato deciso.
          </p>
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
              Salva
            </button>
          </div>
        </div>
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: boolean;
  gold?: boolean;
}) {
  const activeClass = accent
    ? "border-accent text-accent bg-accent/10"
    : gold
      ? "border-gold text-gold bg-gold/10"
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
