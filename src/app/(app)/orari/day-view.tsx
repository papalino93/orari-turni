"use client";

import { useState } from "react";
import { sumHours } from "@/lib/week";
import {
  CoverageHeatmap,
  DayCellContent,
  DayEditorModal,
  orderEmployees,
  type Block,
  type Employee,
  type Leave,
} from "./shared";

export function DayView({
  dateKey,
  employees,
  blocks,
  leaveEntries,
  threshold,
  employeeFilter,
}: {
  dateKey: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  threshold: number | null;
  employeeFilter?: string;
}) {
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const allOrdered = orderEmployees(employees);
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

  function cellData(employeeId: string) {
    const dayBlocks = blocks.filter((b) => b.employeeId === employeeId);
    const leave = leaveEntries.find((l) => l.employeeId === employeeId) ?? null;
    return { blocks: dayBlocks, leave };
  }

  const totalHours = sumHours(blocks);

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground-muted">Copertura della giornata</p>
          <p className="text-sm">
            <span className="font-semibold text-foreground">{totalHours}h</span>{" "}
            <span className="text-foreground-muted">totali</span>
          </p>
        </div>
        <div className="px-4 py-3">
          <CoverageHeatmap blocks={blocks} threshold={threshold} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {orderedEmployees.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-foreground-muted">Nessun dipendente attivo.</p>
        )}
        <div className="divide-y divide-border">
          {orderedEmployees.map((emp) => {
            const { blocks: empBlocks, leave } = cellData(emp.id);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => setEditingEmployeeId(emp.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {emp.name}
                  {emp.role === "OWNER" && (
                    <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                      Titolare
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {empBlocks.length > 0 && (
                    <span className="text-xs text-foreground-muted">{sumHours(empBlocks)}h</span>
                  )}
                  <DayCellContent blocks={empBlocks} leave={leave} align="right" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {editingEmployeeId && (
        <DayEditorModal
          employee={orderedEmployees.find((e) => e.id === editingEmployeeId)!}
          dateKey={dateKey}
          initialBlocks={cellData(editingEmployeeId).blocks}
          initialLeave={cellData(editingEmployeeId).leave}
          onClose={() => setEditingEmployeeId(null)}
        />
      )}
    </div>
  );
}
