"use client";

import { monthLabel } from "@/lib/week";
import { formatHours, type buildSchedule } from "@/lib/schedule";
import { EmployeeAvatar } from "@/components/avatar";
import { orderEmployees } from "./shared";

export function YearView({
  year,
  schedule,
  employeeFilter,
}: {
  year: number;
  schedule: ReturnType<typeof buildSchedule>;
  employeeFilter?: string;
}) {
  // Il titolare non contribuisce al monte ore: escluso dai riepiloghi annuali.
  const allOrdered = orderEmployees(schedule.employees).filter((e) => e.role !== "OWNER");
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;
  const months = Array.from({ length: 12 }, (_, i) => i);

  function hoursForMonth(employeeId: string, monthIndex: number) {
    const from = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const to = `${year}-${String(monthIndex + 1).padStart(2, "0")}-31`;
    return schedule.hoursInRange(employeeId, from, to);
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
              <th className="border-b border-border px-4 py-3 text-left text-xs font-medium text-foreground-muted">Dipendente</th>
              {months.map((m) => (
                <th key={m} className="border-b border-border px-2 py-3 text-center text-xs font-medium text-foreground-muted">
                  {monthLabel(m, true)}
                </th>
              ))}
              <th className="border-b border-border px-4 py-3 text-center text-xs font-medium text-foreground-muted">Totale anno</th>
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
                {months.map((m) => (
                  <td key={m} className="border-b border-border px-2 py-3 text-center text-sm text-foreground-muted">
                    {hoursForMonth(emp.id, m) || "–"}
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
