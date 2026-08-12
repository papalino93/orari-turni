import { forwardRef } from "react";
import { addDays, dayLabel, formatDayMonth, formatWeekRange, parseDateKey, sumHours } from "@/lib/week";
import { orderEmployees, type Block, type Employee, type Leave } from "./shared";

export const ExportCard = forwardRef<
  HTMLDivElement,
  {
    weekStartKey: string;
    employees: Employee[];
    blocks: Block[];
    leaveEntries: Leave[];
    employeeFilter?: string;
  }
>(function ExportCard({ weekStartKey, employees, blocks, leaveEntries, employeeFilter }, ref) {
  const weekStart = parseDateKey(weekStartKey);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const allOrdered = orderEmployees(employees);
  const rows = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;
  const singleEmployee = rows.length === 1 ? rows[0] : null;

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
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- va dentro un canvas catturato da html-to-image, next/image non è compatibile */}
        <img src="/logo.png" alt="" style={{ height: 34, width: "auto" }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {singleEmployee ? `Orario di ${singleEmployee.name}` : "Orari settimanali"}
          </div>
          <div style={{ fontSize: 13, color: "#6b6468" }}>{formatWeekRange(weekStart)}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "10px 8px",
                background: "#8a2740",
                color: "#fdf2f4",
                borderTopLeftRadius: 8,
                width: singleEmployee ? 0 : 130,
              }}
            >
              {singleEmployee ? "" : "Dipendente"}
            </th>
            {days.map((d, i) => (
              <th
                key={i}
                style={{
                  padding: "10px 6px",
                  background: "#8a2740",
                  color: "#fdf2f4",
                  textAlign: "center",
                  borderTopRightRadius: i === days.length - 1 ? 8 : 0,
                }}
              >
                <div style={{ fontWeight: 700 }}>{dayLabel(d)}</div>
                <div style={{ fontWeight: 400, opacity: 0.85 }}>{formatDayMonth(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((emp, rowIdx) => (
            <tr key={emp.id} style={{ background: rowIdx % 2 === 0 ? "#fff" : "#faf2f0" }}>
              {!singleEmployee && (
                <td style={{ padding: "10px 8px", fontWeight: 600, verticalAlign: "top" }}>
                  {emp.name}
                  {emp.role === "OWNER" && <span style={{ color: "#93701f" }}> ★</span>}
                </td>
              )}
              {days.map((d, i) => {
                const dateKey = `${d.toISOString().slice(0, 10)}`;
                const dayBlocks = blocks.filter((b) => b.employeeId === emp.id && b.dateKey === dateKey);
                const leave = leaveEntries.find((l) => l.employeeId === emp.id && l.dateKey === dateKey);
                return (
                  <td key={i} style={{ padding: "10px 6px", textAlign: "center", verticalAlign: "top" }}>
                    {leave ? (
                      <span
                        style={{
                          color: leave.type === "FERIE" ? "#8a2740" : leave.type === "PERMESSO" ? "#93701f" : "#6b6468",
                          fontWeight: 600,
                        }}
                      >
                        {leave.type === "FERIE" ? "Ferie" : leave.type === "PERMESSO" ? `Perm. ${leave.quantity}h` : "Libero"}
                      </span>
                    ) : dayBlocks.length > 0 ? (
                      <div>
                        {dayBlocks
                          .slice()
                          .sort((a, b) => a.startTime.localeCompare(b.startTime))
                          .map((b, bi) => (
                            <div key={bi} style={{ whiteSpace: "nowrap" }}>
                              {b.startTime}–{b.endTime}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <span style={{ color: "#b8b0ac" }}>riposo</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {singleEmployee && singleEmployee.role !== "OWNER" && (
            <tr>
              <td colSpan={8} style={{ padding: "12px 8px", textAlign: "right", fontWeight: 700, color: "#8a2740" }}>
                Totale settimana: {sumHours(blocks.filter((b) => b.employeeId === singleEmployee.id))}h
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 16, fontSize: 11, color: "#a39d9a", textAlign: "right" }}>
        Generato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
});
