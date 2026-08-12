import { forwardRef } from "react";
import { addDays, formatDayMonth, formatMonthYear, sumHours, toDateKey, weeksInMonth } from "@/lib/week";
import { orderEmployees, type Block, type Employee } from "./shared";

export const SummaryExportCard = forwardRef<
  HTMLDivElement,
  {
    monthDateKey: string;
    employees: Employee[];
    blocks: Block[];
  }
>(function SummaryExportCard({ monthDateKey, employees, blocks }, ref) {
  const monthDate = new Date(`${monthDateKey}T00:00:00.000Z`);
  const weeks = weeksInMonth(monthDate);
  const orderedEmployees = orderEmployees(employees);

  function hoursForEmployeeInRange(employeeId: string, start: Date, end: Date) {
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return sumHours(blocks.filter((b) => b.employeeId === employeeId && b.dateKey >= startKey && b.dateKey <= endKey));
  }

  function monthTotal(employeeId: string) {
    return sumHours(blocks.filter((b) => b.employeeId === employeeId));
  }

  const grandTotal = Math.round(orderedEmployees.reduce((sum, e) => sum + monthTotal(e.id), 0) * 100) / 100;

  return (
    <div
      ref={ref}
      style={{
        width: 800,
        background: "#fffdfb",
        color: "#211c1e",
        fontFamily: "system-ui, sans-serif",
        padding: 32,
        borderRadius: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "#8a2740",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
          }}
        >
          🍷
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Riepilogo ore — tutto il personale</div>
          <div style={{ fontSize: 13, color: "#6b6468" }}>{formatMonthYear(monthDate)}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 10px", background: "#8a2740", color: "#fdf2f4", borderTopLeftRadius: 8 }}>
              Dipendente
            </th>
            {weeks.map((week, i) => (
              <th key={i} style={{ padding: "8px 6px", background: "#8a2740", color: "#fdf2f4", textAlign: "center" }}>
                {formatDayMonth(week[0])}–{formatDayMonth(week[6])}
              </th>
            ))}
            <th
              style={{
                padding: "8px 10px",
                background: "#8a2740",
                color: "#fdf2f4",
                textAlign: "center",
                borderTopRightRadius: 8,
              }}
            >
              Totale mese
            </th>
          </tr>
        </thead>
        <tbody>
          {orderedEmployees.map((emp, i) => (
            <tr key={emp.id} style={{ background: i % 2 === 0 ? "#fff" : "#faf2f0" }}>
              <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                {emp.name}
                {emp.role === "OWNER" ? " ★" : ""}
              </td>
              {weeks.map((week, wi) => (
                <td key={wi} style={{ padding: "8px 6px", textAlign: "center" }}>
                  {hoursForEmployeeInRange(emp.id, week[0], addDays(week[0], 6))}h
                </td>
              ))}
              <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "#8a2740" }}>
                {monthTotal(emp.id)}h
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={weeks.length + 1} style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>
              Totale generale
            </td>
            <td style={{ padding: "10px", textAlign: "center", fontWeight: 700, color: "#8a2740" }}>{grandTotal}h</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: 16, fontSize: 11, color: "#a39d9a", textAlign: "right" }}>
        Generato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
});
