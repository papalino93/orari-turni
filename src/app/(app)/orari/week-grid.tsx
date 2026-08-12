"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addDays,
  dayLabel,
  formatDayMonth,
  isPastDateKey,
  isToday,
  jsDayOfWeek,
  parseDateKey,
  sumHours,
  toDateKey,
} from "@/lib/week";
import { setWeekdayDefaultThreshold } from "./actions";
import {
  CoverageHeatmap,
  CoverageLegend,
  DayCellContent,
  DayEditorModal,
  ThresholdBadge,
  orderEmployees,
  type Block,
  type Employee,
  type Leave,
  type Threshold,
} from "./shared";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // lunedì..domenica in termini di jsDayOfWeek

export function WeekBody({
  weekStartKey,
  employees,
  blocks,
  leaveEntries,
  thresholds,
  employeeFilter,
  showDefaults,
  onCloseDefaults,
}: {
  weekStartKey: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  thresholds: Threshold[];
  employeeFilter?: string;
  showDefaults: boolean;
  onCloseDefaults: () => void;
}) {
  const weekStart = parseDateKey(weekStartKey);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [editingCell, setEditingCell] = useState<{ employeeId: string; dateKey: string } | null>(null);

  const defaultsByDow = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of thresholds) if (t.dayOfWeek !== null && !t.dateKey) map.set(t.dayOfWeek, t.minStaff);
    return map;
  }, [thresholds]);

  function effectiveThreshold(dateKey: string, dow: number): number | null {
    const override = thresholds.find((t) => t.dateKey === dateKey);
    if (override) return override.minStaff;
    return defaultsByDow.get(dow) ?? null;
  }

  const allOrdered = orderEmployees(employees);
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

  function cellData(employeeId: string, dateKey: string) {
    const dayBlocks = blocks.filter((b) => b.employeeId === employeeId && b.dateKey === dateKey);
    const leave = leaveEntries.find((l) => l.employeeId === employeeId && l.dateKey === dateKey) ?? null;
    return { blocks: dayBlocks, leave };
  }

  function weeklyHours(employeeId: string) {
    return sumHours(blocks.filter((b) => b.employeeId === employeeId));
  }

  return (
    <div>
      {showDefaults && (
        <WeekdayDefaults defaultsByDow={defaultsByDow} onClose={onCloseDefaults} />
      )}

      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-40 border-b border-border px-3 py-3 text-left text-xs font-medium text-foreground-muted">
                &nbsp;
              </th>
              {days.map((d) => {
                const dateKey = toDateKey(d);
                const dow = jsDayOfWeek(d);
                const threshold = effectiveThreshold(dateKey, dow);
                return (
                  <th
                    key={dateKey}
                    className={`border-b border-border px-2 py-3 text-center align-top ${
                      isToday(d) ? "bg-surface-2/60" : ""
                    }`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {dayLabel(d)} <span className="font-normal text-foreground-muted">{formatDayMonth(d)}</span>
                    </div>
                    <ThresholdBadge dateKey={dateKey} value={threshold} />
                  </th>
                );
              })}
              <th className="border-b border-border px-3 py-3 text-center text-xs font-medium text-foreground-muted">
                Tot. ore
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedEmployees.map((emp) => (
              <tr key={emp.id} className={emp.role === "OWNER" ? "border-t-2 border-t-border" : ""}>
                <td className="border-b border-border px-3 py-2.5 align-top">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {emp.name}
                    {emp.role === "OWNER" && (
                      <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                        Titolare
                      </span>
                    )}
                  </div>
                </td>
                {days.map((d) => {
                  const dateKey = toDateKey(d);
                  const { blocks: dayBlocks, leave } = cellData(emp.id, dateKey);
                  return (
                    <td
                      key={dateKey}
                      className={`cursor-pointer border-b border-border px-2 py-2 align-top transition-colors hover:bg-surface-2 ${
                        isToday(d) ? "bg-surface-2/40" : ""
                      }`}
                      onClick={() => setEditingCell({ employeeId: emp.id, dateKey })}
                    >
                      <DayCellContent blocks={dayBlocks} leave={leave} isPast={isPastDateKey(dateKey)} />
                    </td>
                  );
                })}
                <td className="border-b border-border px-3 py-2.5 text-center align-top text-sm font-semibold text-foreground">
                  {weeklyHours(emp.id)}h
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 py-3 text-xs font-medium text-foreground-muted">Copertura</td>
              {days.map((d) => {
                const dateKey = toDateKey(d);
                const dow = jsDayOfWeek(d);
                const threshold = effectiveThreshold(dateKey, dow);
                const dayBlocks = blocks.filter((b) => b.dateKey === dateKey);
                return (
                  <td key={dateKey} className="px-2 py-3">
                    <CoverageHeatmap blocks={dayBlocks} threshold={threshold} />
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
        <div className="border-t border-border px-3 py-2.5">
          <CoverageLegend />
        </div>
      </div>

      {/* Mobile */}
      <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3 md:hidden">
        <CoverageLegend />
      </div>
      {orderedEmployees.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 md:hidden">
          {orderedEmployees.map((emp) => (
            <span
              key={emp.id}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground-muted"
            >
              {emp.name}: <span className="font-semibold text-foreground">{weeklyHours(emp.id)}h</span>
            </span>
          ))}
        </div>
      )}
      <div className="space-y-4 md:hidden">
        {days.map((d) => {
          const dateKey = toDateKey(d);
          const dow = jsDayOfWeek(d);
          const threshold = effectiveThreshold(dateKey, dow);
          const dayBlocks = blocks.filter((b) => b.dateKey === dateKey);
          return (
            <div
              key={dateKey}
              className={`overflow-hidden rounded-2xl border border-border bg-surface ${
                isToday(d) ? "ring-1 ring-accent/50" : ""
              }`}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="text-sm font-semibold">
                  {dayLabel(d, true)} <span className="font-normal text-foreground-muted">{formatDayMonth(d)}</span>
                </div>
                <ThresholdBadge dateKey={dateKey} value={threshold} />
              </div>
              <div className="px-4 py-2">
                <CoverageHeatmap blocks={dayBlocks} threshold={threshold} compact />
              </div>
              <div className="divide-y divide-border">
                {orderedEmployees.map((emp) => {
                  const { blocks: empBlocks, leave } = cellData(emp.id, dateKey);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setEditingCell({ employeeId: emp.id, dateKey })}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-surface-2"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {emp.name}
                        {emp.role === "OWNER" && <span className="text-[10px] text-gold">★</span>}
                      </span>
                      <DayCellContent blocks={empBlocks} leave={leave} align="right" isPast={isPastDateKey(dateKey)} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {editingCell && (
        <DayEditorModal
          employee={orderedEmployees.find((e) => e.id === editingCell.employeeId)!}
          dateKey={editingCell.dateKey}
          initialBlocks={cellData(editingCell.employeeId, editingCell.dateKey).blocks}
          initialLeave={cellData(editingCell.employeeId, editingCell.dateKey).leave}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}

function WeekdayDefaults({
  defaultsByDow,
  onClose,
}: {
  defaultsByDow: Map<number, number>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const dow of WEEKDAY_ORDER) init[dow] = defaultsByDow.get(dow)?.toString() ?? "";
    return init;
  });
  const [, startTransition] = useTransition();

  const labels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  return (
    <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Soglia minima predefinita per giorno</p>
        <button type="button" onClick={onClose} className="text-xs text-foreground-muted hover:text-foreground">
          Chiudi
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {WEEKDAY_ORDER.map((dow, idx) => (
          <label key={dow} className="flex flex-col items-center gap-1">
            <span className="text-[11px] text-foreground-muted">{labels[idx]}</span>
            <input
              type="number"
              min={0}
              value={values[dow]}
              onChange={(e) => setValues((v) => ({ ...v, [dow]: e.target.value }))}
              onBlur={() => {
                const n = Number(values[dow]);
                if (!Number.isNaN(n) && values[dow] !== "") {
                  startTransition(() => setWeekdayDefaultThreshold(dow, n));
                }
              }}
              className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-center text-sm outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-foreground-muted">
        Vale per ogni settimana, salvo quando imposti una soglia specifica su un singolo giorno (es. un evento).
      </p>
    </div>
  );
}
