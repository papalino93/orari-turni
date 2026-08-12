"use client";

import { useState } from "react";
import {
  addDays,
  dayLabel,
  formatDayMonth,
  isPastDateKey,
  isToday,
  parseDateKey,
  sumHours,
  timeToMinutes,
  toDateKey,
} from "@/lib/week";
import { DayCellContent, DayEditorModal, orderEmployees, type Block, type Employee, type Leave } from "./shared";

type Period = "mattina" | "pomeriggio";

function periodOf(block: Block): Period {
  return Math.floor(timeToMinutes(block.startTime) / 60) < 13 ? "mattina" : "pomeriggio";
}

export function WeekBody({
  weekStartKey,
  employees,
  blocks,
  leaveEntries,
  employeeFilter,
}: {
  weekStartKey: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  employeeFilter?: string;
}) {
  const weekStart = parseDateKey(weekStartKey);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [editingCell, setEditingCell] = useState<{ employeeId: string; dateKey: string } | null>(null);

  const allOrdered = orderEmployees(employees);
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

  function cellData(employeeId: string, dateKey: string) {
    const dayBlocks = blocks.filter((b) => b.employeeId === employeeId && b.dateKey === dateKey);
    const leave = leaveEntries.find((l) => l.employeeId === employeeId && l.dateKey === dateKey) ?? null;
    return { blocks: dayBlocks, leave };
  }

  function periodBlocks(employeeId: string, dateKey: string, period: Period) {
    return blocks.filter((b) => b.employeeId === employeeId && b.dateKey === dateKey && periodOf(b) === period);
  }

  function weeklyHours(employeeId: string, period?: Period) {
    return sumHours(
      blocks.filter((b) => b.employeeId === employeeId && (period === undefined || periodOf(b) === period)),
    );
  }

  return (
    <div>
      {/* Desktop */}
      <div className="hidden space-y-4 md:block">
        <PeriodTable
          label="Mattina"
          days={days}
          orderedEmployees={orderedEmployees}
          period="mattina"
          periodBlocks={periodBlocks}
          leaveEntries={leaveEntries}
          weeklyHours={weeklyHours}
          onEdit={(employeeId, dateKey) => setEditingCell({ employeeId, dateKey })}
        />
        <PeriodTable
          label="Pomeriggio"
          days={days}
          orderedEmployees={orderedEmployees}
          period="pomeriggio"
          periodBlocks={periodBlocks}
          leaveEntries={leaveEntries}
          weeklyHours={weeklyHours}
          onEdit={(employeeId, dateKey) => setEditingCell({ employeeId, dateKey })}
        />
      </div>

      {/* Mobile */}
      {orderedEmployees.filter((e) => e.role !== "OWNER").length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 md:hidden">
          {orderedEmployees
            .filter((e) => e.role !== "OWNER")
            .map((emp) => (
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
              </div>
              {(["mattina", "pomeriggio"] as Period[]).map((period) => (
                <div key={period}>
                  <p className="border-t border-border bg-surface-2/50 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
                    {period === "mattina" ? "Mattina" : "Pomeriggio"}
                  </p>
                  <div className="divide-y divide-border">
                    {orderedEmployees.map((emp) => {
                      const { leave } = cellData(emp.id, dateKey);
                      const empBlocks = periodBlocks(emp.id, dateKey, period);
                      if (!leave && empBlocks.length === 0) return null;
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
              ))}
              <button
                type="button"
                onClick={() => setEditingCell({ employeeId: orderedEmployees[0]?.id ?? "", dateKey })}
                className="block w-full border-t border-border px-4 py-2 text-center text-xs font-medium text-accent active:bg-surface-2"
              >
                + aggiungi turno
              </button>
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

function PeriodTable({
  label,
  days,
  orderedEmployees,
  period,
  periodBlocks,
  leaveEntries,
  weeklyHours,
  onEdit,
}: {
  label: string;
  days: Date[];
  orderedEmployees: Employee[];
  period: Period;
  periodBlocks: (employeeId: string, dateKey: string, period: Period) => Block[];
  leaveEntries: Leave[];
  weeklyHours: (employeeId: string, period?: Period) => number;
  onEdit: (employeeId: string, dateKey: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-40 border-b border-border bg-surface-2/60 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
              {label}
            </th>
            {days.map((d) => {
              const dateKey = toDateKey(d);
              return (
                <th
                  key={dateKey}
                  className={`border-b border-border px-2 py-2.5 text-center align-top ${
                    isToday(d) ? "bg-surface-2/60" : "bg-surface-2/60"
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    {dayLabel(d)} <span className="font-normal text-foreground-muted">{formatDayMonth(d)}</span>
                  </div>
                </th>
              );
            })}
            <th className="border-b border-border bg-surface-2/60 px-3 py-2.5 text-center text-xs font-medium text-foreground-muted">
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
                const leave = leaveEntries.find((l) => l.employeeId === emp.id && l.dateKey === dateKey) ?? null;
                return (
                  <td
                    key={dateKey}
                    className={`cursor-pointer border-b border-border px-2 py-2 align-top transition-colors hover:bg-surface-2 ${
                      isToday(d) ? "bg-surface-2/40" : ""
                    }`}
                    onClick={() => onEdit(emp.id, dateKey)}
                  >
                    <DayCellContent blocks={periodBlocks(emp.id, dateKey, period)} leave={leave} isPast={isPastDateKey(dateKey)} />
                  </td>
                );
              })}
              <td className="border-b border-border px-3 py-2.5 text-center align-top text-sm font-semibold text-foreground">
                {emp.role === "OWNER" ? "—" : `${weeklyHours(emp.id, period)}h`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
