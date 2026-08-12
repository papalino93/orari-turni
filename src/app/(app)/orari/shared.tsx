"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { coverageCounts, COVERAGE_END_HOUR, COVERAGE_START_HOUR, dayLabel, formatDayMonth, parseDateKey, timeToMinutes } from "@/lib/week";
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

function timeSlotLabel(startTime: string): string {
  const h = Math.floor(timeToMinutes(startTime) / 60);
  if (h < 14) return "Mattina";
  if (h < 18) return "Pomeriggio";
  return "Sera";
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
  type Row = { startTime: string; endTime: string; enabled: boolean };

  const [mode, setMode] = useState<Mode>(initialLeave ? initialLeave.type : "WORK");
  const [rows, setRows] = useState<Row[]>(
    initialBlocks.length > 0
      ? initialBlocks
          .slice()
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((b) => ({ startTime: b.startTime, endTime: b.endTime, enabled: true }))
      : [
          { startTime: "09:00", endTime: "13:00", enabled: false },
          { startTime: "16:00", endTime: "20:00", enabled: false },
        ],
  );
  const [quantity, setQuantity] = useState(initialLeave?.quantity ?? 1);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const date = parseDateKey(dateKey);

  function save() {
    const leave: DayLeaveInput = mode === "WORK" ? null : { type: mode, quantity: mode === "LIBERO" ? 0 : quantity };
    const blocks = mode === "WORK" ? rows.filter((r) => r.enabled && r.startTime && r.endTime) : [];
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
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) =>
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, enabled: e.target.checked } : r)))
                    }
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="w-20 shrink-0 text-xs font-medium text-foreground-muted">
                    {timeSlotLabel(row.startTime)}
                  </span>
                </label>
                <input
                  type="time"
                  value={row.startTime}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, startTime: e.target.value } : r)))
                  }
                  className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-accent"
                />
                <span className="text-foreground-muted">–</span>
                <input
                  type="time"
                  value={row.endTime}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, endTime: e.target.value } : r)))
                  }
                  className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-muted hover:bg-danger-bg hover:text-danger"
                  aria-label="Rimuovi"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, { startTime: "20:00", endTime: "23:00", enabled: true }])}
              className="text-xs font-medium text-accent hover:text-accent-hover"
            >
              + aggiungi un altro orario
            </button>
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
