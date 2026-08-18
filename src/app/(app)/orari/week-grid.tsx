"use client";

import { useState } from "react";
import { dayLabel, formatDayMonth, isToday, parseDateKey, toDateKey } from "@/lib/week";
import { entryForPeriod, formatHours, PERIOD_LABEL, PERIODS, type DayEntry, type Employee, type Period, buildSchedule } from "@/lib/schedule";
import { DayCellContent, DayEditorModal, orderEmployees } from "./shared";
import { DayStatusModal } from "./day-status-modal";
import { ClosureRangeModal } from "./closure-range-modal";
import { EmployeeAvatar } from "@/components/avatar";
import { PdfExportModal } from "../dipendenti/pdf-export-modal";
import type { DisplayMode } from "./orari-view";

export function WeekBody({
  weekStartKey,
  schedule,
  employeeFilter,
  displayMode,
}: {
  weekStartKey: string;
  schedule: ReturnType<typeof buildSchedule>;
  employeeFilter?: string;
  displayMode: DisplayMode;
}) {
  const weekStart = parseDateKey(weekStartKey);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });

  const [editingCell, setEditingCell] = useState<{ employeeId: string; dateKey: string } | null>(null);
  const [managingDate, setManagingDate] = useState<string | null>(null);
  const [managingRange, setManagingRange] = useState(false);

  const allOrdered = orderEmployees(schedule.employees);
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

  const editingEmployee = editingCell ? orderedEmployees.find((e) => e.id === editingCell.employeeId) : null;

  return (
    <div>
      {/* Prima l'unico modo per chiudere una giornata era cliccare
          sull'intestazione del giorno — un'etichetta di testo che non
          sembrava affatto un pulsante, spiegata solo da un tooltip al
          passaggio del mouse (invisibile al tocco), e per giunta assente
          del tutto nella vista "Dipendenti" (i giorni lì sono righe dentro
          la scheda di ognuno, non un'intestazione di colonna). Questa riga
          è sempre visibile, sempre etichettata, sempre cliccabile, in
          entrambe le disposizioni. */}
      {/* Su mobile, in disposizione "Fasce orarie" ogni scheda giorno qui
          sotto mostra già se è chiusa e la si gestisce toccandone
          l'intestazione: questa barra sarebbe una riga in più che ripete la
          stessa informazione prima di arrivare al primo giorno vero. In
          disposizione "Dipendenti" invece resta l'unico modo per chiudere
          una giornata (i giorni lì sono righe nella scheda di ognuno, non
          un'intestazione di colonna), quindi lì resta visibile anche su
          mobile. */}
      <WeekClosureBar
        days={days}
        schedule={schedule}
        onManageDay={setManagingDate}
        onManageRange={() => setManagingRange(true)}
        hideOnMobile={displayMode === "periods"}
      />

      {displayMode === "periods" ? (
        <PeriodsLayout
          days={days}
          orderedEmployees={orderedEmployees}
          schedule={schedule}
          onEdit={(employeeId, dateKey) => setEditingCell({ employeeId, dateKey })}
          onManageDay={setManagingDate}
        />
      ) : (
        <EmployeesLayout
          days={days}
          orderedEmployees={orderedEmployees}
          schedule={schedule}
          onEdit={(employeeId, dateKey) => setEditingCell({ employeeId, dateKey })}
        />
      )}

      {editingCell && editingEmployee && (
        <DayEditorModal
          // Stessa ragione della key in revisione-view.tsx: lega l'istanza
          // del modal alla cella dipendente+giorno che sta modificando, così
          // il suo stato interno non può mai restare quello della cella
          // precedente.
          key={`${editingCell.employeeId}-${editingCell.dateKey}`}
          employee={editingEmployee}
          dateKey={editingCell.dateKey}
          entry={schedule.entry(editingCell.employeeId, editingCell.dateKey)}
          isClosed={schedule.isClosed(editingCell.dateKey)}
          // Gli altri giorni della settimana mostrata: permettono di
          // assegnare lo stesso turno a più giornate senza riaprire ogni
          // volta questo riquadro.
          applyToDays={days.map((d) => ({
            dateKey: toDateKey(d),
            label: dayLabel(d),
            isClosed: schedule.isClosed(toDateKey(d)),
          }))}
          onClose={() => setEditingCell(null)}
          onOpenClosureManager={() => {
            setManagingDate(editingCell.dateKey);
            setEditingCell(null);
          }}
        />
      )}

      {managingDate && (
        <DayStatusModal
          dateKey={managingDate}
          isClosed={schedule.isClosed(managingDate)}
          // Su tutti i dipendenti, non su quelli filtrati: la chiusura rimuove
          // i turni di chiunque, quindi un conteggio filtrato farebbe
          // confermare la cancellazione di turni che non erano stati mostrati.
          shiftCount={allOrdered.reduce((sum, e) => {
            const entry = schedule.entry(e.id, managingDate);
            return sum + entry.blocks.length + entry.suspendedBlocks.length;
          }, 0)}
          onClose={() => setManagingDate(null)}
        />
      )}

      {managingRange && <ClosureRangeModal defaultKey={weekStartKey} onClose={() => setManagingRange(false)} />}
    </div>
  );
}

function WeekClosureBar({
  days,
  schedule,
  onManageDay,
  onManageRange,
  hideOnMobile,
}: {
  days: Date[];
  schedule: ReturnType<typeof buildSchedule>;
  onManageDay: (dateKey: string) => void;
  onManageRange: () => void;
  hideOnMobile: boolean;
}) {
  return (
    // flex-wrap, non scroll: su schermi stretti in disposizione "Dipendenti"
    // (l'unica dove questa barra resta visibile su mobile) 9 elementi a
    // larghezza fissa non ci stanno mai su una riga sola — uno scroll senza
    // alcuna indicazione li taglierebbe a metà senza dire che ce n'è altro
    // (lo stesso identico problema già risolto nella toolbar). Andare a capo
    // costa un po' di altezza in più ma non taglia mai nulla.
    <div
      className={`mb-3 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-2 ${
        hideOnMobile ? "hidden md:flex" : "flex"
      }`}
    >
      <span className="mr-0.5 text-[11px] font-medium text-foreground-muted">Chiusure settimana</span>
      {days.map((d) => {
        const dateKey = toDateKey(d);
        const closed = schedule.isClosed(dateKey);
        return (
          <button
            key={dateKey}
            type="button"
            onClick={() => onManageDay(dateKey)}
            title={closed ? "Locale chiuso — clicca per riaprire o gestire" : "Clicca per chiudere il locale in questa giornata"}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-2 text-xs font-medium transition-colors ${
              closed
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-border text-foreground-muted hover:border-accent hover:text-foreground"
            }`}
          >
            {closed ? <LockClosedIcon /> : <LockOpenIcon />}
            {dayLabel(d)}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onManageRange}
        title="Chiudi più giorni di fila in un colpo solo — es. ferie del locale"
        className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-[11px] font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
      >
        <PlusIcon /> Periodo
      </button>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function LockClosedIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 9.5-2.2" />
    </svg>
  );
}

function DayHeaderCell({
  d,
  onManageDay,
  closed,
}: {
  d: Date;
  onManageDay: (dateKey: string) => void;
  closed: boolean;
}) {
  const dateKey = toDateKey(d);
  const today = isToday(d);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={() => onManageDay(dateKey)}
        className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-surface ${
          closed ? "text-danger" : "text-foreground-muted hover:text-foreground"
        }`}
        title={closed ? "Locale chiuso — clicca per gestire" : "Clicca per chiudere il locale in questa giornata"}
      >
        {closed ? <LockClosedIcon /> : <LockOpenIcon />}
        {dayLabel(d)} <span className="font-normal text-foreground-muted">{formatDayMonth(d)}</span>
      </button>
      {today && (
        <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
          Oggi
        </span>
      )}
      {closed && <span className="text-[10px] font-medium text-danger">🔒 Chiuso</span>}
    </div>
  );
}

function PeriodsLayout({
  days,
  orderedEmployees,
  schedule,
  onEdit,
  onManageDay,
}: {
  days: Date[];
  orderedEmployees: Employee[];
  schedule: ReturnType<typeof buildSchedule>;
  onEdit: (employeeId: string, dateKey: string) => void;
  onManageDay: (dateKey: string) => void;
}) {
  function weeklyHours(employeeId: string, period?: Period) {
    if (period === undefined) return schedule.employeeHours(employeeId);
    return (
      Math.round(
        schedule.openDateKeys.reduce(
          (sum, d) => sum + entryForPeriod(schedule.entry(employeeId, d), period).hours,
          0,
        ) * 100,
      ) / 100
    );
  }

  return (
    <div>
      {/* Desktop. Un solo contenitore scorrevole condiviso tra Mattina e
          Pomeriggio — non uno scroll indipendente a testa: prima, su uno
          schermo troppo stretto per mostrare tutta la settimana (tipico di
          un tablet in verticale), scorrere la tabella Mattina per vedere
          sabato lasciava Pomeriggio ancora fermo su lunedì, due metà della
          stessa settimana disallineate tra loro. */}
      <div className="relative hidden md:block">
        <div className="overflow-x-auto">
          <div className="w-max min-w-full space-y-4">
            {PERIODS.map((period) => (
              <PeriodTable
                key={period}
                label={PERIOD_LABEL[period]}
                days={days}
                orderedEmployees={orderedEmployees}
                period={period}
                schedule={schedule}
                weeklyHours={weeklyHours}
                onEdit={onEdit}
                onManageDay={onManageDay}
              />
            ))}
          </div>
        </div>
        {/* Solo un accenno che c'è altro da scorrere (es. un tablet in
            verticale, troppo stretto per tutta la settimana): una tabella è
            un contenuto che ci si aspetta possa scorrere, a differenza dei
            pulsanti della toolbar — qui la sfumatura basta, senza bisogno
            di spostare nulla in un menu. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
        />
      </div>

      {/* Mobile */}
      {orderedEmployees.filter((e) => e.role !== "OWNER").length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 md:hidden">
          {orderedEmployees
            .filter((e) => e.role !== "OWNER")
            .map((emp) => (
              <span key={emp.id} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground-muted">
                {emp.name}: <span className="font-semibold text-foreground">{weeklyHours(emp.id)}h</span>
              </span>
            ))}
        </div>
      )}
      <div className="space-y-4 md:hidden">
        {days.map((d) => {
          const dateKey = toDateKey(d);
          const closed = schedule.isClosed(dateKey);
          return (
            <div key={dateKey} className={`overflow-hidden rounded-2xl border bg-surface ${isToday(d) ? "border-accent/50" : "border-border"}`}>
              <button
                type="button"
                onClick={() => onManageDay(dateKey)}
                className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left active:bg-surface-2"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {dayLabel(d, true)} <span className="font-normal text-foreground-muted">{formatDayMonth(d)}</span>
                  {isToday(d) && (
                    <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                      Oggi
                    </span>
                  )}
                </div>
                {closed && (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">🔒 Locale chiuso</span>
                )}
              </button>
              {closed ? (
                <p className="px-4 py-4 text-sm text-foreground-muted">Nessun turno: il locale non apre in questa giornata.</p>
              ) : (
                PERIODS.map((period) => (
                  <div key={period}>
                    <p className="border-t border-border bg-surface-2/50 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
                      {PERIOD_LABEL[period]}
                    </p>
                    <div className="divide-y divide-border">
                      {orderedEmployees.map((emp) => {
                        const entry = entryForPeriod(schedule.entry(emp.id, dateKey), period);
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => onEdit(emp.id, dateKey)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-surface-2"
                          >
                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                              {emp.name}
                              {emp.role === "OWNER" && <span className="text-[10px] text-gold">★</span>}
                            </span>
                            <DayCellContent entry={entry} align="right" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeriodTable({
  label,
  days,
  orderedEmployees,
  period,
  schedule,
  weeklyHours,
  onEdit,
  onManageDay,
}: {
  label: string;
  days: Date[];
  orderedEmployees: Employee[];
  period: Period;
  schedule: ReturnType<typeof buildSchedule>;
  weeklyHours: (employeeId: string, period?: Period) => number;
  onEdit: (employeeId: string, dateKey: string) => void;
  onManageDay: (dateKey: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-40 border-b border-border bg-surface-2/60 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
              {label}
            </th>
            {days.map((d) => {
              const dateKey = toDateKey(d);
              return (
                <th key={dateKey} className="border-b border-border bg-surface-2/60 px-2 py-2 text-center align-top">
                  <DayHeaderCell d={d} onManageDay={onManageDay} closed={schedule.isClosed(dateKey)} />
                </th>
              );
            })}
            <th className="border-b border-border bg-surface-2/60 px-3 py-2.5 text-center text-xs font-medium text-foreground-muted">
              Tot. ore
            </th>
          </tr>
        </thead>
        <tbody>
          {orderedEmployees.map((emp) => (
            <tr key={emp.id} className={emp.role === "OWNER" ? "border-t-2 border-t-border" : ""}>
              <td className="border-b border-border px-3 py-2.5 align-top">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <EmployeeAvatar employee={emp} size="sm" />
                  {emp.name}
                  {emp.role === "OWNER" && (
                    <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold">Titolare</span>
                  )}
                </div>
              </td>
              {days.map((d) => {
                const dateKey = toDateKey(d);
                const closed = schedule.isClosed(dateKey);
                const entry: DayEntry = closed
                  ? schedule.entry(emp.id, dateKey)
                  : entryForPeriod(schedule.entry(emp.id, dateKey), period);
                return (
                  <td
                    key={dateKey}
                    className={`cursor-pointer border-b border-border px-2 py-2 align-top transition-colors hover:bg-surface-2 ${
                      isToday(d) ? "bg-accent/[0.04]" : ""
                    } ${closed ? "bg-surface-2/40" : ""}`}
                    onClick={() => onEdit(emp.id, dateKey)}
                  >
                    <DayCellContent entry={entry} />
                  </td>
                );
              })}
              <td className="border-b border-border px-3 py-2.5 text-center align-top text-sm font-semibold text-foreground">
                {emp.role === "OWNER" ? "—" : formatHours(weeklyHours(emp.id, period))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Vista per dipendente ---------------------------------------------------

function EmployeesLayout({
  days,
  orderedEmployees,
  schedule,
  onEdit,
}: {
  days: Date[];
  orderedEmployees: Employee[];
  schedule: ReturnType<typeof buildSchedule>;
  onEdit: (employeeId: string, dateKey: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {orderedEmployees.map((emp) => (
        <EmployeeWeekCard key={emp.id} employee={emp} days={days} schedule={schedule} onEdit={onEdit} />
      ))}
      {orderedEmployees.length === 0 && (
        <p className="col-span-full rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
          Nessun dipendente da mostrare.
        </p>
      )}
    </div>
  );
}

export function EmployeeWeekCard({
  employee,
  days,
  schedule,
  onEdit,
}: {
  employee: Employee;
  days: Date[];
  schedule: ReturnType<typeof buildSchedule>;
  onEdit?: (employeeId: string, dateKey: string) => void;
}) {
  const totalHours = schedule.employeeHours(employee.id);
  const [showPdfExport, setShowPdfExport] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <EmployeeAvatar employee={employee} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {employee.name}
            {employee.role === "OWNER" && (
              <span className="ml-1.5 rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold align-middle">
                Titolare
              </span>
            )}
          </p>
          {employee.jobTitle && <p className="truncate text-xs text-foreground-muted">{employee.jobTitle}</p>}
        </div>
        {employee.role !== "OWNER" && (
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold leading-none text-foreground">{totalHours}</p>
            <p className="text-[10px] uppercase tracking-wide text-foreground-muted">ore</p>
          </div>
        )}
      </div>
      <div className="divide-y divide-border">
        {days.map((d) => {
          const dateKey = toDateKey(d);
          const entry = schedule.entry(employee.id, dateKey);
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onEdit?.(employee.id, dateKey)}
              disabled={!onEdit}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors ${
                onEdit ? "hover:bg-surface-2" : ""
              } ${isToday(d) ? "bg-accent/[0.04]" : ""}`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                {dayLabel(d)}
                {isToday(d) && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="Oggi" />}
              </span>
              <DayCellContent entry={entry} align="right" />
            </button>
          );
        })}
      </div>
      <div className="border-t border-border px-4 py-2.5">
        <button
          type="button"
          onClick={() => setShowPdfExport(true)}
          className="text-xs font-medium text-foreground-muted transition-colors hover:text-accent"
        >
          📄 Esporta orario di {employee.name.split(" ")[0]}
        </button>
      </div>

      {showPdfExport && (
        <PdfExportModal
          employeeId={employee.id}
          employeeName={employee.name}
          jobTitle={employee.jobTitle}
          photoVersion={employee.photoVersion}
          onClose={() => setShowPdfExport(false)}
        />
      )}
    </div>
  );
}
