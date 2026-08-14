"use client";

import { useState } from "react";
import { COVERAGE_START_HOUR, formatHours, type buildSchedule } from "@/lib/schedule";
import { DayCellContent, DayEditorModal, orderEmployees } from "./shared";
import { DayStatusModal } from "./day-status-modal";
import { EmployeeAvatar } from "@/components/avatar";

// Un grafico a barre senza numeri né legenda visibile a colpo d'occhio non
// comunicava nulla di utile ("barre alte" rispetto a cosa?) — lo stesso
// array orario diventa immediatamente leggibile come testo semplice:
// "13:00–16:00 (1 persona) · 16:00–20:00 (2 persone)".
function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function summarizeCoverage(counts: number[]): string | null {
  const ranges: { start: number; end: number; count: number }[] = [];
  let current: { start: number; end: number; count: number } | null = null;
  counts.forEach((count, i) => {
    const hour = COVERAGE_START_HOUR + i;
    if (count > 0 && current && current.count === count && current.end === hour) {
      current.end = hour + 1;
    } else {
      if (current) ranges.push(current);
      current = count > 0 ? { start: hour, end: hour + 1, count } : null;
    }
  });
  if (current) ranges.push(current);
  if (ranges.length === 0) return null;
  return ranges
    .map((r) => `${formatHourLabel(r.start)}–${formatHourLabel(r.end)} (${r.count} ${r.count === 1 ? "persona" : "persone"})`)
    .join(" · ");
}

export function DayView({
  dateKey,
  schedule,
  employeeFilter,
}: {
  dateKey: string;
  schedule: ReturnType<typeof buildSchedule>;
  employeeFilter?: string;
}) {
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [managingDay, setManagingDay] = useState(false);
  const allOrdered = orderEmployees(schedule.employees);
  const orderedEmployees = employeeFilter ? allOrdered.filter((e) => e.id === employeeFilter) : allOrdered;

  const closed = schedule.isClosed(dateKey);
  const totalHours = schedule.dayHours(dateKey);
  const coverageSummary = closed ? null : summarizeCoverage(schedule.dayCoverage(dateKey));
  // Su tutti i dipendenti, non su quelli filtrati: la chiusura rimuove i turni
  // di chiunque, quindi un conteggio filtrato farebbe confermare la
  // cancellazione di turni che non erano stati mostrati.
  const shiftCount = allOrdered.reduce((sum, e) => {
    const entry = schedule.entry(e.id, dateKey);
    return sum + entry.blocks.length + entry.suspendedBlocks.length;
  }, 0);

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm font-medium text-foreground-muted">Copertura della giornata</p>
          <div className="flex items-center gap-3">
            {!closed && (
              <p className="text-sm">
                <span className="font-semibold text-foreground">{totalHours}h</span>{" "}
                <span className="text-foreground-muted">totali</span>
              </p>
            )}
            <button
              type="button"
              onClick={() => setManagingDay(true)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                closed ? "border-danger/40 bg-danger/10 text-danger" : "border-border text-foreground-muted hover:border-accent hover:text-foreground"
              }`}
            >
              {closed ? "🔒 Locale chiuso" : "Chiudi locale"}
            </button>
          </div>
        </div>
        <div className="border-t border-border px-4 py-3">
          {closed ? (
            <p className="text-center text-sm text-foreground-muted">
              🔒 Il locale non apre in questa giornata: nessuna copertura da mostrare.
            </p>
          ) : coverageSummary ? (
            <p className="text-sm text-foreground">{coverageSummary}</p>
          ) : (
            <p className="text-sm text-foreground-muted">Nessun turno pianificato per questa giornata.</p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {orderedEmployees.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-foreground-muted">Nessun dipendente attivo.</p>
        )}
        <div className="divide-y divide-border">
          {orderedEmployees.map((emp) => {
            const entry = schedule.entry(emp.id, dateKey);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => setEditingEmployeeId(emp.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <EmployeeAvatar employee={emp} size="sm" />
                  {emp.name}
                  {emp.role === "OWNER" && (
                    <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold">Titolare</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {entry.kind === "TURNO" && <span className="text-xs text-foreground-muted">{formatHours(entry.hours)}</span>}
                  <DayCellContent entry={entry} align="right" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {editingEmployeeId && (
        <DayEditorModal
          employee={orderedEmployees.find((e) => e.id === editingEmployeeId)!}
          dateKey={dateKey}
          entry={schedule.entry(editingEmployeeId, dateKey)}
          isClosed={closed}
          onClose={() => setEditingEmployeeId(null)}
          onOpenClosureManager={() => {
            setManagingDay(true);
            setEditingEmployeeId(null);
          }}
        />
      )}

      {managingDay && (
        <DayStatusModal dateKey={dateKey} isClosed={closed} shiftCount={shiftCount} onClose={() => setManagingDay(false)} />
      )}
    </div>
  );
}
