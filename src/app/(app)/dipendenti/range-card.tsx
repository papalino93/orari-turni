import { forwardRef } from "react";
import { blockHours, dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { LOGO_DATA_URI } from "@/lib/logo-data-uri";

type RangeBlock = { dateKey: string; startTime: string; endTime: string };
type RangeLeave = { dateKey: string; type: "FERIE" | "PERMESSO" | "LIBERO"; quantity: number };

const HEADER_GRADIENT = "linear-gradient(135deg, #9c3050 0%, #7c2138 100%)";

export const RangeCard = forwardRef<
  HTMLDivElement,
  {
    employeeName: string;
    jobTitle?: string | null;
    rangeLabel: string;
    dateKeys: string[];
    blocks: RangeBlock[];
    leaveEntries: RangeLeave[];
  }
>(function RangeCard({ employeeName, jobTitle, rangeLabel, dateKeys, blocks, leaveEntries }, ref) {
  let totalHours = 0;

  return (
    <div
      ref={ref}
      style={{
        width: 700,
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: 999,
              background: "#f1e2e0",
              color: "#8a2740",
              fontSize: 15,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {employeeName.charAt(0).toUpperCase()}
          </span>
          <div>
            <div style={{ fontSize: 21, fontWeight: 700 }}>{employeeName}</div>
            <div style={{ fontSize: 13, color: "#6b6468" }}>
              {jobTitle ? `${jobTitle} — ` : ""}
              {rangeLabel}
            </div>
          </div>
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
              Data
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "11px 12px",
                background: HEADER_GRADIENT,
                color: "#fdf2f4",
                fontSize: 12,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Orario
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "11px 12px",
                background: HEADER_GRADIENT,
                color: "#fdf2f4",
                borderTopRightRadius: 10,
                borderBottomRightRadius: 10,
                fontSize: 12,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Ore
            </th>
          </tr>
        </thead>
        <tbody>
          {dateKeys.map((dateKey, i) => {
            const date = parseDateKey(dateKey);
            const dayBlocks = blocks.filter((b) => b.dateKey === dateKey).sort((a, b) => a.startTime.localeCompare(b.startTime));
            const leave = leaveEntries.find((l) => l.dateKey === dateKey);
            const hours = dayBlocks.reduce((sum, b) => sum + blockHours(b), 0);
            totalHours += hours;

            return (
              <tr
                key={dateKey}
                style={{
                  background: i % 2 === 0 ? "#fff" : "#fbf1ef",
                  borderBottom: i === dateKeys.length - 1 ? "none" : "1px solid #f1e2e0",
                }}
              >
                <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                  {dayLabel(date)} {formatDayMonth(date)}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  {leave ? (
                    <span
                      style={{
                        color: leave.type === "FERIE" ? "#8a2740" : leave.type === "PERMESSO" ? "#93701f" : "#6b6468",
                        fontWeight: 600,
                      }}
                    >
                      {leave.type === "FERIE" ? "Ferie" : leave.type === "PERMESSO" ? `Permesso ${leave.quantity}h` : "Libero"}
                    </span>
                  ) : dayBlocks.length > 0 ? (
                    dayBlocks.map((b, bi) => (
                      <span key={bi} style={{ marginRight: 8, whiteSpace: "nowrap" }}>
                        {b.startTime}–{b.endTime}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#c2b7b4", fontStyle: "italic" }}>riposo</span>
                  )}
                </td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{hours > 0 ? `${Math.round(hours * 100) / 100}h` : ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "#8a2740" }}>
              Totale ore
            </td>
            <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "#8a2740" }}>
              {Math.round(totalHours * 100) / 100}h
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: 20, fontSize: 11, color: "#a39d9a", textAlign: "right" }}>
        Generato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
});
