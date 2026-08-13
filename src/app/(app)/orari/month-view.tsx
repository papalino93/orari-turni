"use client";

import { formatDayMonth, toDateKey, weekRangesInMonth } from "@/lib/week";
import { formatHours, type buildSchedule } from "@/lib/schedule";
import { EmployeeAvatar } from "@/components/avatar";
import { orderEmployees } from "./shared";

export function MonthView({
  monthDateKey,
  schedule,
  employeeFilter,
}: {
  monthDateKey: string;
  schedule: ReturnType<typeof buildSchedule>;
  employeeFilter?: string;
}) {
  const monthDate = new Date(`${monthDateKey}T00:00:00.000Z`);
  const weeks = weekRangesInMonth(monthDate);
  // Il titolare non contribuisce al monte ore: escluso dai riepiloghi mensili.
  const allOrdered = orderEmployees(schedule.employees).filter((e) => e.role !== "OWNER");
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

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
              <th className="border-b border-border px-4 py-3 text-left text-xs font-medium text-foreground-muted">Dipendente</th>
              {weeks.map((week, i) => (
                <th key={i} className="border-b border-border px-3 py-3 text-center text-xs font-medium text-foreground-muted">
                  {formatDayMonth(week.start)}–{formatDayMonth(week.end)}
                </th>
              ))}
              <th className="border-b border-border px-4 py-3 text-center text-xs font-medium text-foreground-muted">Totale mese</th>
            </tr>
          </thead>
          <tbody>
            {orderedEmployees.map((emp) => (
              <tr key={emp.id}>
                <td className="border-b border-border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <EmployeeAvatar employee={emp} size="sm" />
                    {emp.name}
                  </span>
                </td>
                {weeks.map((week, i) => (
                  <td key={i} className="border-b border-border px-3 py-3 text-center text-sm text-foreground-muted">
                    {formatHours(schedule.hoursInRange(emp.id, toDateKey(week.start), toDateKey(week.end)))}
                  </td>
                ))}
                <td className="border-b border-border px-4 py-3 text-center text-sm font-semibold text-foreground">
                  {formatHours(schedule.employeeHours(emp.id))}
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
                <EmployeeAvatar employee={emp} size="sm" />
                {emp.name}
              </span>
              <span className="text-sm font-semibold text-foreground">{formatHours(schedule.employeeHours(emp.id))}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {weeks.map((week, i) => (
                <span key={i} className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-foreground-muted">
                  {formatDayMonth(week.start)}–{formatDayMonth(week.end)}:{" "}
                  <span className="font-medium text-foreground">
                    {formatHours(schedule.hoursInRange(emp.id, toDateKey(week.start), toDateKey(week.end)))}
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
