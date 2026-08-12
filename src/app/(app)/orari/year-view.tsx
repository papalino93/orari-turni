"use client";

import { monthLabel, sumHours } from "@/lib/week";
import { orderEmployees, type Block, type Employee } from "./shared";

export function YearView({
  year,
  employees,
  blocks,
  employeeFilter,
}: {
  year: number;
  employees: Employee[];
  blocks: Block[];
  employeeFilter?: string;
}) {
  const allOrdered = orderEmployees(employees);
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;
  const months = Array.from({ length: 12 }, (_, i) => i);

  function hoursForMonth(employeeId: string, monthIndex: number) {
    const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    return sumHours(blocks.filter((b) => b.employeeId === employeeId && b.dateKey.startsWith(prefix)));
  }

  function yearTotal(employeeId: string) {
    return sumHours(blocks.filter((b) => b.employeeId === employeeId));
  }

  if (orderedEmployees.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
        Nessun dipendente attivo.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-medium text-foreground-muted">
                Dipendente
              </th>
              {months.map((m) => (
                <th key={m} className="border-b border-border px-2 py-3 text-center text-xs font-medium text-foreground-muted">
                  {monthLabel(m, true)}
                </th>
              ))}
              <th className="border-b border-border px-4 py-3 text-center text-xs font-medium text-foreground-muted">
                Totale anno
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedEmployees.map((emp) => (
              <tr key={emp.id}>
                <td className="border-b border-border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {emp.name}
                    {emp.role === "OWNER" && <span className="text-[10px] text-gold">★</span>}
                  </span>
                </td>
                {months.map((m) => (
                  <td key={m} className="border-b border-border px-2 py-3 text-center text-sm text-foreground-muted">
                    {hoursForMonth(emp.id, m) || "–"}
                  </td>
                ))}
                <td className="border-b border-border px-4 py-3 text-center text-sm font-semibold text-foreground">
                  {yearTotal(emp.id)}h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {orderedEmployees.map((emp) => (
          <div key={emp.id} className="px-4 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {emp.name}
                {emp.role === "OWNER" && <span className="text-[10px] text-gold">★</span>}
              </span>
              <span className="text-sm font-semibold text-foreground">{yearTotal(emp.id)}h</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {months.map((m) => (
                <span key={m} className="rounded-lg bg-surface-2 px-2 py-1.5 text-center text-[11px] text-foreground-muted">
                  {monthLabel(m, true)}
                  <br />
                  <span className="font-medium text-foreground">{hoursForMonth(emp.id, m) || "–"}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
