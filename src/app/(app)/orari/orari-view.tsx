"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  addYears,
  formatFullDate,
  formatMonthYear,
  formatWeekRange,
  parseDateKey,
  startOfWeek,
  toDateKey,
} from "@/lib/week";
import { orderEmployees, type Block, type Employee, type Leave, type Threshold } from "./shared";
import { WeekBody } from "./week-grid";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { YearView } from "./year-view";
import { ExportButton } from "./export-button";
import { SummaryExportButton } from "./summary-export-button";
import { confirmPastShifts } from "./actions";

export type ViewMode = "day" | "week" | "month" | "year";

const VIEW_LABELS: Record<ViewMode, string> = {
  day: "Giorno",
  week: "Settimana",
  month: "Mese",
  year: "Anno",
};

export function OrariView({
  view,
  dateKey,
  rangeStartKey,
  rangeEndKey,
  employeeFilter,
  employees,
  blocks,
  leaveEntries,
  thresholds,
  dayThreshold,
}: {
  view: ViewMode;
  dateKey: string;
  rangeStartKey: string;
  rangeEndKey: string;
  employeeFilter?: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  thresholds: Threshold[];
  dayThreshold: number | null;
}) {
  const router = useRouter();
  const date = parseDateKey(dateKey);
  const [showDefaults, setShowDefaults] = useState(false);
  const [confirming, startConfirming] = useTransition();

  const hasUnconfirmedPast = blocks.some((b) => !b.confirmed && b.dateKey < toDateKey(new Date()));

  function navigate(params: { view?: ViewMode; date?: string; employee?: string | null }) {
    const search = new URLSearchParams();
    search.set("view", params.view ?? view);
    search.set("date", params.date ?? dateKey);
    const emp = params.employee === undefined ? employeeFilter : params.employee;
    if (emp) search.set("employee", emp);
    router.push(`/orari?${search.toString()}`);
  }

  function step(direction: 1 | -1) {
    let newDate: Date;
    switch (view) {
      case "day":
        newDate = addDays(date, direction);
        break;
      case "week":
        newDate = addDays(date, direction * 7);
        break;
      case "month":
        newDate = addMonths(date, direction);
        break;
      case "year":
        newDate = addYears(date, direction);
        break;
    }
    navigate({ date: toDateKey(newDate) });
  }

  const title =
    view === "day"
      ? capitalize(formatFullDate(date))
      : view === "week"
        ? "Orari settimanali"
        : view === "month"
          ? "Orari mensili"
          : "Orari annuali";

  const subtitle =
    view === "day"
      ? null
      : view === "week"
        ? formatWeekRange(startOfWeek(date))
        : view === "month"
          ? formatMonthYear(date)
          : String(date.getUTCFullYear());

  const allEmployees = orderEmployees(employees);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-foreground-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={employeeFilter ?? ""}
            onChange={(e) => navigate({ employee: e.target.value || null })}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted outline-none hover:border-accent hover:text-foreground"
          >
            <option value="">Tutti</option>
            {allEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
            aria-label="Precedente"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => navigate({ date: toDateKey(new Date()) })}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
            aria-label="Successivo"
          >
            ›
          </button>
          {(view === "day" || view === "week") && (
            <button
              type="button"
              onClick={() => setShowDefaults((v) => !v)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
            >
              Soglie predefinite
            </button>
          )}
          {hasUnconfirmedPast && (
            <button
              type="button"
              disabled={confirming}
              onClick={() =>
                startConfirming(async () => {
                  await confirmPastShifts(rangeStartKey, rangeEndKey, employeeFilter);
                  router.refresh();
                })
              }
              className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20"
              title="Segna come verificati tutti i turni passati in questo periodo"
            >
              {confirming ? "Conferma…" : "Conferma turni passati"}
            </button>
          )}
          {view === "week" && (
            <ExportButton
              weekStartKey={toDateKey(startOfWeek(date))}
              employees={employees}
              blocks={blocks}
              leaveEntries={leaveEntries}
              employeeFilter={employeeFilter}
            />
          )}
          {view === "month" && <SummaryExportButton monthDateKey={dateKey} employees={employees} blocks={blocks} />}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-border bg-surface p-1 w-fit">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => navigate({ view: v })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                v === view ? "bg-surface-2 text-foreground" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        <p className="text-xs text-foreground-muted">
          {view === "day" || view === "week" ? (
            <>
              <span className="text-accent">✎</span> Clicca su una casella per inserire o modificare un turno, ferie
              o permesso.
            </>
          ) : (
            "Vista di sola lettura — riepiloga i totali. Per inserire o modificare gli orari passa a Giorno o Settimana."
          )}
        </p>
      </div>

      {view === "day" && (
        <DayView
          dateKey={dateKey}
          employees={employees}
          blocks={blocks}
          leaveEntries={leaveEntries}
          threshold={dayThreshold}
          employeeFilter={employeeFilter}
        />
      )}
      {view === "week" && (
        <WeekBody
          weekStartKey={toDateKey(startOfWeek(date))}
          employees={employees}
          blocks={blocks}
          leaveEntries={leaveEntries}
          thresholds={thresholds}
          employeeFilter={employeeFilter}
          showDefaults={showDefaults}
          onCloseDefaults={() => setShowDefaults(false)}
        />
      )}
      {view === "month" && (
        <MonthView monthDateKey={dateKey} employees={employees} blocks={blocks} employeeFilter={employeeFilter} />
      )}
      {view === "year" && (
        <YearView
          year={date.getUTCFullYear()}
          employees={employees}
          blocks={blocks}
          employeeFilter={employeeFilter}
        />
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
