import { forwardRef } from "react";
import { formatDayMonth, formatMonthYear, sumHours, toDateKey, weekRangesInMonth } from "@/lib/week";
import { LOGO_DATA_URI } from "@/lib/logo-data-uri";
import { orderEmployees, type Block, type Employee } from "./shared";

const HEADER_GRADIENT = "linear-gradient(135deg, #9c3050 0%, #7c2138 100%)";

export const SummaryExportCard = forwardRef<
  HTMLDivElement,
  {
    monthDateKey: string;
    employees: Employee[];
    blocks: Block[];
  }
>(function SummaryExportCard({ monthDateKey, employees, blocks }, ref) {
  const monthDate = new Date(`${monthDateKey}T00:00:00.000Z`);
  const weeks = weekRangesInMonth(monthDate);
  // Il titolare non contribuisce al monte ore.
  const orderedEmployees = orderEmployees(employees).filter((e) => e.role !== "OWNER");

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
        padding: 36,
        borderRadius: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- va dentro un canvas catturato da html-to-image, next/image non è compatibile */}
        <img src={LOGO_DATA_URI} alt="" style={{ height: 40, width: "auto" }} />
        <div>
          <div style={{ fontSize: 21, fontWeight: 700 }}>Riepilogo ore — tutto il personale</div>
          <div style={{ fontSize: 13, color: "#6b6468" }}>{formatMonthYear(monthDate)}</div>
        </div>
      </div>

      <div style={{ height: 3, background: "linear-gradient(90deg, #8a2740, transparent)", margin: "18px 0 22px" }} />

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "11px 12px",
                background: HEADER_GRADIENT,
                color: "#fdf2f4",
                borderTopLeftRadius: 10,
                borderBottomLeftRadius: 10,
                fontSize: 12,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Dipendente
            </th>
            {weeks.map((week, i) => (
              <th key={i} style={{ padding: "11px 6px", background: HEADER_GRADIENT, color: "#fdf2f4", textAlign: "center" }}>
                {formatDayMonth(week.start)}–{formatDayMonth(week.end)}
              </th>
            ))}
            <th
              style={{
                padding: "11px 12px",
                background: HEADER_GRADIENT,
                color: "#fdf2f4",
                textAlign: "center",
                borderTopRightRadius: 10,
                borderBottomRightRadius: 10,
                fontSize: 12,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Totale mese
            </th>
          </tr>
        </thead>
        <tbody>
          {orderedEmployees.map((emp, i) => (
            <tr
              key={emp.id}
              style={{
                background: i % 2 === 0 ? "#fff" : "#fbf1ef",
                borderBottom: i === orderedEmployees.length - 1 ? "none" : "1px solid #f1e2e0",
              }}
            >
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      background: "#f1e2e0",
                      color: "#8a2740",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {emp.name.charAt(0).toUpperCase()}
                  </span>
                  <span style={{ fontWeight: 600 }}>{emp.name}</span>
                </div>
              </td>
              {weeks.map((week, wi) => (
                <td key={wi} style={{ padding: "10px 6px", textAlign: "center" }}>
                  {hoursForEmployeeInRange(emp.id, week.start, week.end)}h
                </td>
              ))}
              <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#8a2740" }}>
                {monthTotal(emp.id)}h
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={weeks.length + 1} style={{ padding: "12px", textAlign: "right", fontWeight: 700 }}>
              Totale generale
            </td>
            <td style={{ padding: "12px", textAlign: "center", fontWeight: 700, color: "#8a2740" }}>{grandTotal}h</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: 20, fontSize: 11, color: "#a39d9a", textAlign: "right" }}>
        Generato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
});
