import { forwardRef } from "react";
import { addDays, dayLabel, formatDayMonth, formatWeekRange, parseDateKey } from "@/lib/week";
import { buildSchedule, entryLabel, formatHours, PERIOD_LABEL, PERIODS, entryForPeriod, type Block, type Closure, type Employee, type Leave } from "@/lib/schedule";
import { orderEmployees } from "./shared";
import { LOGO_DATA_URI } from "@/lib/logo-data-uri";

const HEADER_GRADIENT = "linear-gradient(135deg, #9c3050 0%, #7c2138 100%)";

export const ExportCard = forwardRef<
  HTMLDivElement,
  {
    weekStartKey: string;
    employees: Employee[];
    blocks: Block[];
    leaveEntries: Leave[];
    closures: Closure[];
    employeeFilter?: string;
  }
>(function ExportCard({ weekStartKey, employees, blocks, leaveEntries, closures, employeeFilter }, ref) {
  const weekStart = parseDateKey(weekStartKey);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateKeys = days.map((d) => d.toISOString().slice(0, 10));
  const allOrdered = orderEmployees(employees);
  const rows = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;
  const singleEmployee = rows.length === 1 ? rows[0] : null;

  const schedule = buildSchedule({ dateKeys, employees: rows, blocks, leaveEntries, closures });

  return (
    <div ref={ref} style={{ width: 800, background: "#fffdfb", color: "#211c1e", fontFamily: "system-ui, sans-serif", padding: 36, borderRadius: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- va dentro un canvas catturato da html-to-image, next/image non è compatibile */}
        <img src={LOGO_DATA_URI} alt="" style={{ height: 40, width: "auto" }} />
        <div>
          <div style={{ fontSize: 21, fontWeight: 700 }}>{singleEmployee ? `Orario di ${singleEmployee.name}` : "Orari settimanali"}</div>
          <div style={{ fontSize: 13, color: "#6b6468" }}>{formatWeekRange(weekStart)}</div>
        </div>
      </div>

      <div style={{ height: 3, background: "linear-gradient(90deg, #8a2740, transparent)", margin: "18px 0 22px" }} />

      {PERIODS.map((period, sectionIdx) => (
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
                  {singleEmployee ? "" : PERIOD_LABEL[period]}
                </th>
                {days.map((d, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "9px 4px",
                      background: HEADER_GRADIENT,
                      color: "#fdf2f4",
                      textAlign: "center",
                      borderTopRightRadius: i === days.length - 1 ? 10 : 0,
                      borderBottomRightRadius: i === days.length - 1 ? 10 : 0,
                      borderLeft: "1px solid rgba(253,242,244,0.25)",
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
                <tr key={emp.id} style={{ background: rowIdx % 2 === 0 ? "#fff" : "#fbf1ef", borderBottom: rowIdx === rows.length - 1 ? "none" : "1px solid #f1e2e0" }}>
                  {!singleEmployee && (
                    <td style={{ padding: "10px 10px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ExportAvatar employee={emp} size={24} />
                        <span style={{ fontWeight: 600 }}>{emp.name}</span>
                      </div>
                    </td>
                  )}
                  {dateKeys.map((dateKey, i) => {
                    const closed = schedule.isClosed(dateKey);
                    const entry = closed ? schedule.entry(emp.id, dateKey) : entryForPeriod(schedule.entry(emp.id, dateKey), period);
                    return (
                      <td
                        key={i}
                        style={{
                          padding: "10px 4px",
                          textAlign: "center",
                          verticalAlign: "middle",
                          borderLeft: "1px solid #f1e2e0",
                        }}
                      >
                        <ExportCellLabel kind={entry.kind} text={entry.kind === "TURNO" || entry.kind === "CHIUSO" ? undefined : entryLabel(entry)} blocks={entry.blocks} />
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
          Totale settimana: {formatHours(schedule.employeeHours(singleEmployee.id))}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: "#a39d9a", textAlign: "right" }}>
        Generato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
});

function ExportCellLabel({
  kind,
  text,
  blocks,
}: {
  kind: string;
  text?: string;
  blocks: { startTime: string; endTime: string }[];
}) {
  if (kind === "CHIUSO") {
    return <span style={{ color: "#8a2740", fontWeight: 600 }}>🔒 LOCALE CHIUSO</span>;
  }
  if (kind === "TURNO") {
    return (
      <div>
        {blocks.map((b, bi) => (
          <div key={bi} style={{ whiteSpace: "nowrap" }}>
            {b.startTime}–{b.endTime}
          </div>
        ))}
      </div>
    );
  }
  if (kind === "NON_PIANIFICATO") {
    return <span style={{ color: "#c2b7b4", fontStyle: "italic" }}>—</span>;
  }
  const color = kind === "FERIE" ? "#8a2740" : kind === "PERMESSO" ? "#93701f" : kind === "MALATTIA" ? "#c23b33" : "#6b6468";
  return <span style={{ color, fontWeight: 600 }}>{text}</span>;
}

// Foto se presente, altrimenti iniziale — stessa logica di
// components/avatar.tsx ma con stili inline: questa card è catturata via
// html-to-image, dove le classi Tailwind coi colori del tema non sono
// affidabili quanto uno stile inline con colori fissi.
function ExportAvatar({ employee, size }: { employee: Employee; size: number }) {
  if (employee.photoVersion) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- va dentro un canvas catturato da html-to-image, next/image non è compatibile
      <img
        src={`/api/employee-photo/${employee.id}?v=${employee.photoVersion}`}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 999,
        background: employee.role === "OWNER" ? "#e9d5a5" : "#f1e2e0",
        color: employee.role === "OWNER" ? "#8a6a1f" : "#8a2740",
        fontSize: size * 0.46,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {employee.name.charAt(0).toUpperCase()}
    </span>
  );
}
