import { blockHours, dayLabel, formatDayMonth, parseDateKey } from "@/lib/week";
import { LOGO_DATA_URI } from "@/lib/logo-data-uri";

type RangeBlock = { dateKey: string; startTime: string; endTime: string };
type RangeLeave = { dateKey: string; type: "FERIE" | "PERMESSO" | "LIBERO" | "MALATTIA"; quantity: number };
type RangeClosure = { dateKey: string; reason: string | null };

const HEADER_GRADIENT = "linear-gradient(135deg, #9c3050 0%, #7c2138 100%)";

const LEAVE_LABEL: Record<RangeLeave["type"], (q: number) => { text: string; color: string }> = {
  FERIE: () => ({ text: "Ferie", color: "#8a2740" }),
  PERMESSO: (q) => ({ text: `Permesso ${q}h`, color: "#93701f" }),
  LIBERO: () => ({ text: "Riposo", color: "#6b6468" }),
  MALATTIA: () => ({ text: "Malattia", color: "#c23b33" }),
};

// Anteprima a schermo dell'orario del dipendente (il PDF vero è disegnato a
// parte, vettoriale, in pdf-export.ts — questa card serve solo a vedere cosa
// si sta per esportare prima di scaricarlo).
export function RangeCard({
  employeeId,
  employeeName,
  photoVersion,
  jobTitle,
  rangeLabel,
  dateKeys,
  blocks,
  leaveEntries,
  closures,
}: {
  employeeId: string;
  employeeName: string;
  photoVersion?: string | null;
  jobTitle?: string | null;
  rangeLabel: string;
  dateKeys: string[];
  blocks: RangeBlock[];
  leaveEntries: RangeLeave[];
  closures: RangeClosure[];
}) {
  const closedSet = new Set(closures.map((c) => c.dateKey));
  const dayHours = new Map(
    dateKeys.map((dateKey) => [
      dateKey,
      closedSet.has(dateKey)
        ? 0
        : blocks.filter((b) => b.dateKey === dateKey).reduce((sum, b) => sum + blockHours(b), 0),
    ]),
  );
  const totalHours = Array.from(dayHours.values()).reduce((sum, h) => sum + h, 0);

  return (
    <div style={{ width: 700, background: "#fffdfb", color: "#211c1e", fontFamily: "system-ui, sans-serif", padding: 36, borderRadius: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- anteprima statica, non serve next/image */}
        <img src={LOGO_DATA_URI} alt="" style={{ height: 40, width: "auto" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {photoVersion ? (
            // eslint-disable-next-line @next/next/no-img-element -- va dentro un canvas catturato da html-to-image, next/image non è compatibile
            <img
              src={`/api/employee-photo/${employeeId}?v=${photoVersion}`}
              alt=""
              style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
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
          )}
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
            <th style={{ textAlign: "left", padding: "11px 12px", background: HEADER_GRADIENT, color: "#fdf2f4", borderTopLeftRadius: 10, borderBottomLeftRadius: 10, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" }}>
              Data
            </th>
            <th style={{ textAlign: "left", padding: "11px 12px", background: HEADER_GRADIENT, color: "#fdf2f4", fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" }}>
              Orario
            </th>
            <th style={{ textAlign: "right", padding: "11px 12px", background: HEADER_GRADIENT, color: "#fdf2f4", borderTopRightRadius: 10, borderBottomRightRadius: 10, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" }}>
              Ore
            </th>
          </tr>
        </thead>
        <tbody>
          {dateKeys.map((dateKey, i) => {
            const date = parseDateKey(dateKey);
            const closed = closedSet.has(dateKey);
            const dayBlocks = blocks.filter((b) => b.dateKey === dateKey).sort((a, b) => a.startTime.localeCompare(b.startTime));
            const leave = leaveEntries.find((l) => l.dateKey === dateKey);
            const hours = dayHours.get(dateKey) ?? 0;

            return (
              <tr key={dateKey} style={{ background: i % 2 === 0 ? "#fff" : "#fbf1ef", borderBottom: i === dateKeys.length - 1 ? "none" : "1px solid #f1e2e0" }}>
                <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                  {dayLabel(date)} {formatDayMonth(date)}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  {closed ? (
                    <span style={{ color: "#8a2740", fontWeight: 600 }}>🔒 Locale chiuso</span>
                  ) : leave ? (
                    <span style={{ color: LEAVE_LABEL[leave.type](leave.quantity).color, fontWeight: 600 }}>
                      {LEAVE_LABEL[leave.type](leave.quantity).text}
                    </span>
                  ) : dayBlocks.length > 0 ? (
                    dayBlocks.map((b, bi) => (
                      <span key={bi} style={{ marginRight: 8, whiteSpace: "nowrap" }}>
                        {b.startTime}–{b.endTime}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#c2b7b4", fontStyle: "italic" }}>non pianificato</span>
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
    </div>
  );
}
