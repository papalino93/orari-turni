"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { coverageCounts, COVERAGE_START_HOUR, dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { saveDayEntry, setDayThreshold, type DayLeaveInput } from "./actions";

export type Role = "EMPLOYEE" | "OWNER";
export type LeaveType = "FERIE" | "PERMESSO";

export type Employee = { id: string; name: string; role: Role };
export type Block = { id: string; employeeId: string; dateKey: string; startTime: string; endTime: string };
export type Leave = { id: string; employeeId: string; dateKey: string; type: LeaveType; quantity: number };
export type Threshold = { dayOfWeek: number | null; dateKey: string | null; minStaff: number };

export function orderEmployees(employees: Employee[]): Employee[] {
  const active = employees.filter((e) => e.role === "EMPLOYEE");
  const owner = employees.find((e) => e.role === "OWNER");
  return owner ? [...active, owner] : active;
}

export function DayCellContent({
  blocks,
  leave,
  align = "left",
}: {
  blocks: Block[];
  leave: Leave | null;
  align?: "left" | "right";
}) {
  if (leave) {
    return (
      <span
        className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
          leave.type === "FERIE" ? "bg-accent/15 text-accent" : "bg-gold/15 text-gold"
        }`}
      >
        {leave.type === "FERIE" ? `Ferie${leave.quantity !== 1 ? ` (${leave.quantity}g)` : ""}` : `Permesso ${leave.quantity}h`}
      </span>
    );
  }
  if (blocks.length === 0) {
    return <span className="text-xs text-foreground-muted/50">+</span>;
  }
  return (
    <div className={`flex flex-col gap-0.5 ${align === "right" ? "items-end" : "items-start"}`}>
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

export function ThresholdBadge({ dateKey, value }: { dateKey: string; value: number | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState(value?.toString() ?? "");

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = Number(val);
          if (!Number.isNaN(n)) startTransition(() => setDayThreshold(dateKey, n));
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 w-12 rounded border border-accent bg-surface-2 px-1 py-0.5 text-center text-[11px]"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="mt-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted hover:border-accent hover:text-foreground"
      title="Soglia minima di copertura per questo giorno"
    >
      min {value ?? "–"}
    </button>
  );
}

export function CoverageHeatmap({
  blocks,
  threshold,
  compact = false,
}: {
  blocks: Block[];
  threshold: number | null;
  compact?: boolean;
}) {
  const counts = coverageCounts(blocks);
  const max = Math.max(1, ...counts);

  return (
    <div className="flex items-end gap-[2px]" style={{ height: compact ? 20 : 28 }}>
      {counts.map((c, i) => {
        const hour = COVERAGE_START_HOUR + i;
        const under = threshold !== null && threshold > 0 && c < threshold;
        const h = Math.max(3, (c / max) * (compact ? 20 : 28));
        return (
          <div
            key={hour}
            title={`${hour}:00 — ${c} presenti${threshold ? ` (min ${threshold})` : ""}`}
            className="w-1 flex-1 rounded-sm"
            style={{
              height: h,
              background: c === 0 ? "var(--border)" : under ? "var(--danger)" : "var(--success)",
              opacity: c === 0 ? 0.5 : 1,
            }}
          />
        );
      })}
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
  type Mode = "WORK" | "FERIE" | "PERMESSO";
  const [mode, setMode] = useState<Mode>(initialLeave ? initialLeave.type : "WORK");
  const [rows, setRows] = useState<{ startTime: string; endTime: string }[]>(
    initialBlocks.length > 0
      ? initialBlocks.map((b) => ({ startTime: b.startTime, endTime: b.endTime }))
      : [{ startTime: "09:00", endTime: "13:00" }],
  );
  const [quantity, setQuantity] = useState(initialLeave?.quantity ?? 1);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const date = parseDateKey(dateKey);

  function save() {
    const leave: DayLeaveInput = mode === "WORK" ? null : { type: mode, quantity };
    const blocks = mode === "WORK" ? rows.filter((r) => r.startTime && r.endTime) : [];
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

        <div className="mb-4 flex gap-2">
          <ModeButton label="Turno" active={mode === "WORK"} onClick={() => setMode("WORK")} />
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
              onClick={() => setRows((rs) => [...rs, { startTime: "16:00", endTime: "20:00" }])}
              className="text-xs font-medium text-accent hover:text-accent-hover"
            >
              + aggiungi orario
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
