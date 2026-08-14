"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDayMonth, dayLabel, monthLabel, parseDateKey, todayKey } from "@/lib/week";
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
  readOnly = false,
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
  /** True quando titolare/consulente stanno guardando con "Visualizza come": niente modifiche, niente invio. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const viewAsQuery = readOnly ? `&viewAs=${employee.id}` : "";

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

  const editable = !readOnly && isActive && (status === "DRAFT" || status === "REOPENED");
  // Dallo schedule, non da sumHours(blocks): quest'ultimo contava anche i turni
  // rimasti su giorni di chiusura, così il totale inviato in approvazione non
  // corrispondeva a quello che il titolare vede nel suo riepilogo.
  const totalHours = schedule.employeeHours(employee.id);

  const currentMonthKey = todayKey().slice(0, 7);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const isFutureMonth = monthKey > currentMonthKey;

  function go(y: number, m: number) {
    router.push(`/mie-ore/revisione?year=${y}&month=${m}${viewAsQuery}`);
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

      {readOnly && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
          <span>
            Stai visualizzando come <strong>{employee.name}</strong> — sola lettura.
          </span>
          <Link href="/dipendenti" className="shrink-0 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium hover:bg-accent/15">
            Torna a Dipendenti
          </Link>
        </div>
      )}

      <StatusBanner status={status} reopenNote={reopenNote} isActive={isActive} />

      <div className="my-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="divide-y divide-border">
          {dateKeys.map((dateKey) => {
            const date = parseDateKey(dateKey);
            const entry = schedule.entry(employee.id, dateKey);
            const dayBlocks = blocks.filter((b) => b.dateKey === dateKey);
            const edited = dayBlocks.some((b) => b.originalStartTime || b.addedByEmployee);
            const isFutureDay = dateKey > todayKey();
            const clickable = editable && !isFutureDay;
            return (
              <button
                key={dateKey}
                type="button"
                // Disabilitato solo se il mese intero non è modificabile
                // (spiegato dallo StatusBanner qui sopra). Un giorno futuro
                // resta invece toccabile apposta: senza, il tocco non fa
                // letteralmente nulla e su mobile — senza hover per un
                // title — sembra che l'app "non lasci modificare" senza
                // dire perché.
                disabled={!editable}
                onClick={() => {
                  if (clickable) setEditingDate(dateKey);
                  else if (isFutureDay) toast.showError("Non puoi ancora registrare ore per un giorno futuro.");
                }}
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
          // Senza key, se mai React arrivasse a riusare la stessa istanza per
          // un giorno diverso (invece di smontarla e rimontarla), gli stati
          // interni (orari mattina/pomeriggio, modalità) resterebbero quelli
          // del giorno precedente: l'editor mostrerebbe un giorno nell'header
          // ma gli orari di un altro. La key forza React a ricreare da zero
          // il modal — e quindi il suo stato — ad ogni cambio di giorno.
          key={editingDate}
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
