"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  addYears,
  formatFullDate,
  formatMonthYear,
  formatWeekRange,
  isToday,
  parseDateKey,
  startOfWeek,
  toDateKey,
  todayKey,
} from "@/lib/week";
import { buildSchedule, type Block, type Closure, type Employee, type Leave } from "@/lib/schedule";
import { orderEmployees } from "./shared";
import { WeekBody } from "./week-grid";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { YearView } from "./year-view";
import { ExportButton } from "./export-button";
import { SummaryExportButton } from "./summary-export-button";
import { ClearWeekButton } from "./clear-week-button";
import { useToast, runWithToast } from "@/components/toast";
import { confirmPastShifts, setWeekPublished } from "./actions";

export type ViewMode = "day" | "week" | "month" | "year";
export type DisplayMode = "periods" | "employees";

const VIEW_LABELS: Record<ViewMode, string> = {
  day: "Giorno",
  week: "Settimana",
  month: "Mese",
  year: "Anno",
};

// Solo Giorno e Settimana permettono di inserire/modificare i turni: senza
// un segnale visivo sulle stesse linguette, non è ovvio quale vista usare
// per farlo — è capitato di dover spiegare "devi andare su Settimana".
const VIEW_EDITABLE: Record<ViewMode, boolean> = {
  day: true,
  week: true,
  month: false,
  year: false,
};

export function OrariView({
  view,
  displayMode,
  dateKey,
  rangeStartKey,
  rangeEndKey,
  employeeFilter,
  employees,
  blocks,
  leaveEntries,
  closures,
  weekPlan,
}: {
  view: ViewMode;
  displayMode: DisplayMode;
  dateKey: string;
  rangeStartKey: string;
  rangeEndKey: string;
  employeeFilter?: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  closures: Closure[];
  weekPlan: { publishedAt: string | null };
}) {
  const router = useRouter();
  const date = parseDateKey(dateKey);
  const [confirming, startConfirming] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const toast = useToast();

  const rangeDateKeys = useMemo(() => {
    const keys: string[] = [];
    let cursor = parseDateKey(rangeStartKey);
    const end = parseDateKey(rangeEndKey);
    while (cursor <= end) {
      keys.push(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return keys;
  }, [rangeStartKey, rangeEndKey]);

  const schedule = useMemo(
    () => buildSchedule({ dateKeys: rangeDateKeys, employees, blocks, leaveEntries, closures }),
    [rangeDateKeys, employees, blocks, leaveEntries, closures],
  );

  function navigate(params: { view?: ViewMode; date?: string; employee?: string | null; mode?: DisplayMode }) {
    const search = new URLSearchParams();
    search.set("view", params.view ?? view);
    search.set("date", params.date ?? dateKey);
    const emp = params.employee === undefined ? employeeFilter : params.employee;
    if (emp) search.set("employee", emp);
    const mode = params.mode ?? displayMode;
    if (mode !== "periods") search.set("mode", mode);
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
      ? capitalize(formatFullDate(date)) + (isToday(date) ? " — Oggi" : "")
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
  const weekStartKey = toDateKey(startOfWeek(date));
  // "Condiviso" non è più un interruttore manuale: si accende da solo
  // quando l'orario viene davvero esportato (PDF o immagine), e si spegne
  // da solo alla prima modifica successiva — vedi unpublishWeeksForDates
  // in actions.ts. Prima era un tasto scollegato da qualunque azione reale
  // ("che senso ha il tasto pubblica?"), e restava acceso anche su una
  // settimana appena svuotata. L'unico controllo manuale rimasto è
  // annullare una condivisione segnata per sbaglio.
  const isPublished = Boolean(weekPlan.publishedAt);

  function unshare() {
    startPublishing(async () => {
      const result = await runWithToast(toast, () => setWeekPublished(weekStartKey, false), "Segnato come non condiviso");
      if (result !== null) router.refresh();
    });
  }

  function verifyPast() {
    startConfirming(async () => {
      const result = await runWithToast(toast, () => confirmPastShifts(rangeStartKey, rangeEndKey, employeeFilter), undefined);
      if (result) {
        toast.showSuccess(result.verified > 0 ? `${result.verified} turni verificati` : "Nessun turno da verificare");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-foreground-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={employeeFilter ?? ""}
            onChange={(e) => navigate({ employee: e.target.value || null })}
            aria-label="Filtra per dipendente"
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
            onClick={() => navigate({ date: todayKey() })}
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
          {schedule.unverifiedPastBlocks > 0 && (
            <button
              type="button"
              disabled={confirming}
              onClick={verifyPast}
              className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20"
              title="Segna come verificati i turni passati in questo periodo"
            >
              {confirming ? "Verifica…" : `⚠️ ${schedule.unverifiedPastBlocks} da verificare`}
            </button>
          )}
          {view === "week" && (
            <>
              <ExportButton
                weekStartKey={weekStartKey}
                employees={employees}
                blocks={blocks}
                leaveEntries={leaveEntries}
                closures={closures}
                employeeFilter={employeeFilter}
              />
              <ClearWeekButton weekStartKey={weekStartKey} />
            </>
          )}
          {view === "month" && <SummaryExportButton monthDateKey={dateKey} employees={employees} blocks={blocks} closures={closures} />}
        </div>
      </div>

      {(view === "week" || view === "day") && (
        <WeekSummary schedule={schedule} isPublished={isPublished} view={view} onUnshare={unshare} unsharing={publishing} />
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full border border-border bg-surface p-1 w-fit">
            {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => navigate({ view: v })}
                title={VIEW_EDITABLE[v] ? `${VIEW_LABELS[v]} — puoi inserire e modificare i turni` : `${VIEW_LABELS[v]} — sola lettura`}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  v === view ? "bg-surface-2 text-foreground" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {VIEW_LABELS[v]}
                {VIEW_EDITABLE[v] && <EditPencilIcon className={v === view ? "text-accent" : "text-foreground-muted/60"} />}
              </button>
            ))}
          </div>
          {view === "week" && (
            // Divisore + etichetta "Vista": senza, queste due pillole
            // affiancate a Giorno/Settimana/Mese/Anno (stesso identico
            // stile) si leggevano come un'unica barra di sei linguette,
            // mentre sono due controlli indipendenti — una sceglie il
            // periodo, l'altra come disporre la stessa settimana.
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <span className="text-xs font-medium text-foreground-muted/70">Vista</span>
              <div className="flex gap-1 rounded-full border border-border bg-surface p-1 w-fit" role="group" aria-label="Modalità di visualizzazione">
                <button
                  type="button"
                  onClick={() => navigate({ mode: "periods" })}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    displayMode === "periods" ? "bg-surface-2 text-foreground" : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  <PeriodsIcon /> Fasce orarie
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ mode: "employees" })}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    displayMode === "employees" ? "bg-surface-2 text-foreground" : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  <PersonIcon /> Dipendenti
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-foreground-muted">
          {view === "day" || view === "week" ? (
            <>
              <EditPencilIcon className="text-accent" /> Clicca su una casella per inserire o modificare un turno, riposo,
              ferie o permesso.
            </>
          ) : (
            "Vista di sola lettura — riepiloga i totali. Per inserire o modificare gli orari passa a Giorno o Settimana (contrassegnate dalla matita)."
          )}
        </p>
      </div>

      {view === "day" && <DayView dateKey={dateKey} schedule={schedule} employeeFilter={employeeFilter} />}
      {view === "week" && (
        <WeekBody weekStartKey={weekStartKey} schedule={schedule} employeeFilter={employeeFilter} displayMode={displayMode} />
      )}
      {view === "month" && <MonthView monthDateKey={dateKey} schedule={schedule} employeeFilter={employeeFilter} />}
      {view === "year" && <YearView year={date.getUTCFullYear()} schedule={schedule} employeeFilter={employeeFilter} />}
    </div>
  );
}

function WeekSummary({
  schedule,
  isPublished,
  view,
  onUnshare,
  unsharing,
}: {
  schedule: ReturnType<typeof buildSchedule>;
  isPublished: boolean;
  view: ViewMode;
  onUnshare: () => void;
  unsharing: boolean;
}) {
  const staffCount = schedule.employees.filter((e) => e.role !== "OWNER").length;
  const anomalyCount = schedule.anomalies.length;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      {view === "week" &&
        (isPublished ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-bg px-2.5 py-1 text-success">
            🟢 Condiviso
            <button
              type="button"
              onClick={onUnshare}
              disabled={unsharing}
              className="text-success/70 underline decoration-dotted hover:text-success"
              title="L'orario è stato esportato e non è ancora stato modificato da allora"
            >
              {unsharing ? "…" : "annulla"}
            </button>
          </span>
        ) : (
          <Badge tone="neutral" title="Diventa 'Condiviso' automaticamente quando esporti questa settimana in PDF o immagine">
            ○ Non condiviso
          </Badge>
        ))}
      <Badge tone="neutral">
        {staffCount} dipendent{staffCount === 1 ? "e" : "i"}
      </Badge>
      <Badge tone="neutral">{schedule.totalHours} h pianificate</Badge>
      {schedule.closedDateKeys.length > 0 && (
        <Badge tone="neutral">
          🔒 {schedule.closedDateKeys.length} giorn{schedule.closedDateKeys.length === 1 ? "o" : "i"} di chiusura
        </Badge>
      )}
      <Badge tone={anomalyCount > 0 ? "warning" : "success"}>
        {anomalyCount > 0 ? `⚠️ ${anomalyCount} da controllare` : "✓ 0 anomalie"}
      </Badge>
    </div>
  );
}

function Badge({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: "neutral" | "success" | "warning";
  title?: string;
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success-bg text-success"
      : tone === "warning"
        ? "border-gold/40 bg-gold/10 text-gold"
        : "border-border bg-surface text-foreground-muted";
  return (
    <span title={title} className={`rounded-full border px-2.5 py-1 font-medium ${cls}`}>
      {children}
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EditPencilIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function PeriodsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="3" />
      <path d="M2 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15.5 14c2.5.3 4.5 2.2 4.5 5.5" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  );
}
