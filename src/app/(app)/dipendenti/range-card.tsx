import { forwardRef } from "react";
import { blockHours, dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";

type RangeBlock = { dateKey: string; startTime: string; endTime: string };
type RangeLeave = { dateKey: string; type: "FERIE" | "PERMESSO"; quantity: number };

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
          <div style={{ fontSize: 20, fontWeight: 700 }}>Orario di {employeeName}</div>
          <div style={{ fontSize: 13, color: "#6b6468" }}>
            {jobTitle ? `${jobTitle} — ` : ""}
            {rangeLabel}
          </div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 10px", background: "#8a2740", color: "#fdf2f4", borderTopLeftRadius: 8 }}>
              Data
            </th>
            <th style={{ textAlign: "left", padding: "8px 10px", background: "#8a2740", color: "#fdf2f4" }}>Orario</th>
            <th style={{ textAlign: "right", padding: "8px 10px", background: "#8a2740", color: "#fdf2f4", borderTopRightRadius: 8 }}>
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
              <tr key={dateKey} style={{ background: i % 2 === 0 ? "#fff" : "#faf2f0" }}>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  {dayLabel(date)} {formatDayMonth(date)}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {leave ? (
                    <span style={{ color: leave.type === "FERIE" ? "#8a2740" : "#93701f", fontWeight: 600 }}>
                      {leave.type === "FERIE" ? "Ferie" : `Permesso ${leave.quantity}h`}
                    </span>
                  ) : dayBlocks.length > 0 ? (
                    dayBlocks.map((b, bi) => (
                      <span key={bi} style={{ marginRight: 8, whiteSpace: "nowrap" }}>
                        {b.startTime}–{b.endTime}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#b8b0ac" }}>riposo</span>
                  )}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{hours > 0 ? `${Math.round(hours * 100) / 100}h` : ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "#8a2740" }}>
              Totale ore
            </td>
            <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "#8a2740" }}>
              {Math.round(totalHours * 100) / 100}h
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: 16, fontSize: 11, color: "#a39d9a", textAlign: "right" }}>
        Generato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
});
