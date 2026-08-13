"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDayMonth, dayLabel, monthLabel, parseDateKey, sumHours, todayKey } from "@/lib/week";
import { buildSchedule, type Closure, type Leave } from "@/lib/schedule";
import { DayCellContent, DayEditorModal } from "../../orari/shared";
import { useToast, runWithToast } from "@/components/toast";
import { submitMonth } from "../actions";

type AuditBlock = {
  id: string;
  employeeId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  confirmed: boolean;
  addedByEmployee: boolean;
  originalStartTime: string | null;
  originalEndTime: string | null;
};

type Status = "DRAFT" | "SUBMITTED" | "APPROVED" | "REOPENED";

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Bozza",
  SUBMITTED: "Inviato — in attesa di approvazione",
  APPROVED: "Approvato",
  REOPENED: "Riaperto dal titolare",
};

export function RevisioneView({
  employee,
  isActive,
  year,
  month,
  dateKeys,
  blocks,
  leaveEntries,
  closures,
  status,
  reopenNote,
}: {
  employee: { id: string; name: string; jobTitle: string | null; photoVersion: string | null };
  isActive: boolean;
  year: number;
  month: number;
  dateKeys: string[];
  blocks: AuditBlock[];
  leaveEntries: Leave[];
  closures: Closure[];
  status: Status;
  reopenNote: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const schedule = useMemo(
    () =>
      buildSchedule({
        dateKeys,
        employees: [{ id: employee.id, name: employee.name, role: "EMPLOYEE", jobTitle: employee.jobTitle, sortOrder: 0, photoVersion: employee.photoVersion }],
        blocks,
        leaveEntries,
        closures,
      }),
    [dateKeys, employee, blocks, leaveEntries, closures],
  );

  const editable = isActive && (status === "DRAFT" || status === "REOPENED");
  const totalHours = sumHours(blocks);

  const currentMonthKey = todayKey().slice(0, 7);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const isFutureMonth = monthKey > currentMonthKey;

  function go(y: number, m: number) {
    router.push(`/mie-ore/revisione?year=${y}&month=${m}`);
  }
  function step(direction: 1 | -1) {
    const d = new Date(Date.UTC(year, month - 1 + direction, 1));
    go(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }

  function submit() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => submitMonth(year, month), "Mese inviato — in attesa di approvazione");
      if (result !== null) router.refresh();
    });
  }

  const editingEntry = editingDate ? schedule.entry(employee.id, editingDate) : null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Revisione ore</h1>
          <p className="text-sm text-foreground-muted">
            {monthLabel(month - 1)} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
            aria-label="Mese precedente"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={isFutureMonth}
            title={isFutureMonth ? "Non puoi rivedere un mese non ancora arrivato" : undefined}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-30"
            aria-label="Mese successivo"
          >
            ›
          </button>
        </div>
      </div>

      <StatusBanner status={status} reopenNote={reopenNote} isActive={isActive} />

      <div className="my-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="divide-y divide-border">
          {dateKeys.map((dateKey) => {
            const date = parseDateKey(dateKey);
            const entry = schedule.entry(employee.id, dateKey);
            const dayBlocks = blocks.filter((b) => b.dateKey === dateKey);
            const edited = dayBlocks.some((b) => b.originalStartTime || b.addedByEmployee);
            const clickable = editable && dateKey <= todayKey();
            return (
              <button
                key={dateKey}
                type="button"
                disabled={!clickable}
                onClick={() => setEditingDate(dateKey)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                  clickable ? "hover:bg-surface-2" : "cursor-default"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  {dayLabel(date)} <span className="font-normal normal-case text-foreground-muted/70">{formatDayMonth(date)}</span>
                  {edited && <span className="h-1.5 w-1.5 rounded-full bg-gold" title="Modificato o aggiunto da te" aria-hidden />}
                </span>
                <DayCellContent entry={entry} align="right" />
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground-muted">Totale ore</span>
          <span className="font-semibold text-foreground">{Math.round(totalHours * 100) / 100} h</span>
        </div>
      </div>

      {editable && (
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Invio…" : "Invia questo mese al titolare"}
        </button>
      )}

      {editingDate && editingEntry && (
        <DayEditorModal
          employee={{ id: employee.id, name: employee.name, role: "EMPLOYEE", jobTitle: employee.jobTitle, sortOrder: 0, photoVersion: employee.photoVersion }}
          dateKey={editingDate}
          entry={editingEntry}
          isClosed={schedule.isClosed(editingDate)}
          onClose={() => setEditingDate(null)}
        />
      )}
    </div>
  );
}

function StatusBanner({ status, reopenNote, isActive }: { status: Status; reopenNote: string | null; isActive: boolean }) {
  if (!isActive) {
    return (
      <p className="rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-xs text-foreground-muted">
        Account disattivato: questo mese resta consultabile ma non più modificabile.
      </p>
    );
  }

  const tone =
    status === "APPROVED"
      ? "border-success/30 bg-success-bg text-success"
      : status === "SUBMITTED"
        ? "border-gold/40 bg-gold/10 text-gold"
        : status === "REOPENED"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border bg-surface-2/50 text-foreground-muted";

  return (
    <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${tone}`}>
      {STATUS_LABEL[status]}
      {status === "REOPENED" && reopenNote && (
        <p className="mt-1 font-normal text-foreground">Nota del titolare: {reopenNote}</p>
      )}
      {status === "DRAFT" && (
        <p className="mt-1 font-normal text-foreground-muted">
          Tocca un giorno per correggere l&apos;orario o aggiungerne uno mancante, poi invia il mese quando hai finito.
        </p>
      )}
    </div>
  );
}
