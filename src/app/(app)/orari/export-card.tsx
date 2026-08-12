import { forwardRef } from "react";
import { addDays, dayLabel, formatDayMonth, formatWeekRange, isToday, parseDateKey, sumHours, timeToMinutes } from "@/lib/week";
import { orderEmployees, type Block, type Employee, type Leave } from "./shared";
import { LOGO_DATA_URI } from "@/lib/logo-data-uri";

type Period = "mattina" | "pomeriggio";

function periodOf(block: Block): Period {
  return Math.floor(timeToMinutes(block.startTime) / 60) < 13 ? "mattina" : "pomeriggio";
}

const HEADER_GRADIENT = "linear-gradient(135deg, #9c3050 0%, #7c2138 100%)";

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

  function leaveLabel(leave: Leave) {
    if (leave.type === "FERIE") return { text: "Ferie", color: "#8a2740" };
    if (leave.type === "PERMESSO") return { text: `Perm. ${leave.quantity}h`, color: "#93701f" };
    return { text: "Libero", color: "#6b6468" };
  }

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
          <div style={{ fontSize: 21, fontWeight: 700 }}>
            {singleEmployee ? `Orario di ${singleEmployee.name}` : "Orari settimanali"}
          </div>
          <div style={{ fontSize: 13, color: "#6b6468" }}>{formatWeekRange(weekStart)}</div>
        </div>
      </div>

      <div style={{ height: 3, background: "linear-gradient(90deg, #8a2740, transparent)", margin: "18px 0 22px" }} />

      {(["mattina", "pomeriggio"] as Period[]).map((period, sectionIdx) => (
        <div key={period} style={{ marginTop: sectionIdx > 0 ? 20 : 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "11px 10px",
                    background: HEADER_GRADIENT,
                    color: "#fdf2f4",
                    borderTopLeftRadius: 10,
                    borderBottomLeftRadius: 10,
                    fontSize: 12,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    width: singleEmployee ? 0 : 128,
                  }}
                >
                  {singleEmployee ? "" : period === "mattina" ? "Mattina" : "Pomeriggio"}
                </th>
                {days.map((d, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "9px 4px",
                      background: isToday(d) ? "#5c1728" : HEADER_GRADIENT,
                      color: "#fdf2f4",
                      textAlign: "center",
                      borderTopRightRadius: i === days.length - 1 ? 10 : 0,
                      borderBottomRightRadius: i === days.length - 1 ? 10 : 0,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{dayLabel(d)}</div>
                    <div style={{ fontWeight: 400, opacity: 0.85, fontSize: 11 }}>{formatDayMonth(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((emp, rowIdx) => (
                <tr
                  key={emp.id}
                  style={{
                    background: rowIdx % 2 === 0 ? "#fff" : "#fbf1ef",
                    borderBottom: rowIdx === rows.length - 1 ? "none" : "1px solid #f1e2e0",
                  }}
                >
                  {!singleEmployee && (
                    <td style={{ padding: "10px 10px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 24,
                            height: 24,
                            borderRadius: 999,
                            background: emp.role === "OWNER" ? "#e9d5a5" : "#f1e2e0",
                            color: emp.role === "OWNER" ? "#8a6a1f" : "#8a2740",
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
                  )}
                  {days.map((d, i) => {
                    const dateKey = `${d.toISOString().slice(0, 10)}`;
                    const dayBlocks = blocks.filter(
                      (b) => b.employeeId === emp.id && b.dateKey === dateKey && periodOf(b) === period,
                    );
                    const leave = leaveEntries.find((l) => l.employeeId === emp.id && l.dateKey === dateKey);
                    return (
                      <td
                        key={i}
                        style={{
                          padding: "10px 4px",
                          textAlign: "center",
                          verticalAlign: "middle",
                          background: isToday(d) ? "#fdf6f3" : undefined,
                        }}
                      >
                        {leave ? (
                          <span style={{ color: leaveLabel(leave).color, fontWeight: 600 }}>{leaveLabel(leave).text}</span>
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
                          <span style={{ color: "#c2b7b4", fontStyle: "italic" }}>riposo</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {singleEmployee && singleEmployee.role !== "OWNER" && (
        <div style={{ marginTop: 14, textAlign: "right", fontWeight: 700, color: "#8a2740" }}>
          Totale settimana: {sumHours(blocks.filter((b) => b.employeeId === singleEmployee.id))}h
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: "#a39d9a", textAlign: "right" }}>
        Generato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
});
