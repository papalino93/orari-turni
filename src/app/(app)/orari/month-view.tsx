"use client";

import { addDays, formatDayMonth, sumHours, toDateKey, weeksInMonth } from "@/lib/week";
import { orderEmployees, type Block, type Employee } from "./shared";

export function MonthView({
  monthDateKey,
  employees,
  blocks,
  employeeFilter,
}: {
  monthDateKey: string;
  employees: Employee[];
  blocks: Block[];
  employeeFilter?: string;
}) {
  const monthDate = new Date(`${monthDateKey}T00:00:00.000Z`);
  const weeks = weeksInMonth(monthDate);
  const allOrdered = orderEmployees(employees);
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

  function hoursForEmployeeInRange(employeeId: string, start: Date, end: Date) {
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return sumHours(
      blocks.filter((b) => b.employeeId === employeeId && b.dateKey >= startKey && b.dateKey <= endKey),
    );
  }

  function monthTotal(employeeId: string) {
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
              {weeks.map((week, i) => (
                <th
                  key={i}
                  className="border-b border-border px-3 py-3 text-center text-xs font-medium text-foreground-muted"
                >
                  {formatDayMonth(week[0])}–{formatDayMonth(week[6])}
                </th>
              ))}
              <th className="border-b border-border px-4 py-3 text-center text-xs font-medium text-foreground-muted">
                Totale mese
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
                {weeks.map((week, i) => (
                  <td key={i} className="border-b border-border px-3 py-3 text-center text-sm text-foreground-muted">
                    {hoursForEmployeeInRange(emp.id, week[0], addDays(week[0], 6))}h
                  </td>
                ))}
                <td className="border-b border-border px-4 py-3 text-center text-sm font-semibold text-foreground">
                  {monthTotal(emp.id)}h
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
              <span className="text-sm font-semibold text-foreground">{monthTotal(emp.id)}h</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {weeks.map((week, i) => (
                <span key={i} className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-foreground-muted">
                  {formatDayMonth(week[0])}–{formatDayMonth(week[6])}:{" "}
                  <span className="font-medium text-foreground">
                    {hoursForEmployeeInRange(emp.id, week[0], addDays(week[0], 6))}h
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
