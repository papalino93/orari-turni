"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDayMonth, dayLabel, monthLabel, parseDateKey, todayKey } from "@/lib/week";
import { buildSchedule, formatHours, type Closure, type Leave } from "@/lib/schedule";
import { DayCellContent, DayEditorModal } from "../../orari/shared";
import { useToast, runWithToast } from "@/components/toast";
import { submitMonth } from "../actions";
import { ConfirmSheet } from "@/components/confirm-sheet";

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
  DRAFT: "Da inviare",
  SUBMITTED: "Inviato — in attesa di approvazione",
  APPROVED: "Approvato",
  REOPENED: "Rimandato indietro dal titolare",
};

/** Perché il mese non si può toccare: prima dell'assunzione, non ancora arrivato, o troppo vecchio. */
type LockedReason = "beforeHire" | "future" | "tooOld" | null;

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
  hireMonthKey,
  hireDateKey,
  canEditMonth,
  lockedReason,
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
  /** "AAAA-MM" del mese di assunzione: prima di qui non c'è nulla da rivedere. */
  hireMonthKey: string;
  /** "AAAA-MM-GG" dell'assunzione: i giorni prima non si toccano. */
  hireDateKey: string;
  /** Regola di editable-month.ts: mese in corso, ultimo concluso non inviato o rimandato indietro. */
  canEditMonth: boolean;
  lockedReason: LockedReason;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const viewAsQuery = readOnly ? `&viewAs=${employee.id}` : "";

  // Stesso motivo di mie-ore-view.tsx: senza questo, arrivando qui con la
  // pagina di provenienza già scrollata, il banner "Stai visualizzando
  // come…" — l'unico modo per tornare a Dipendenti in questa modalità —
  // può restare fuori vista.
  useEffect(() => {
    if (readOnly) window.scrollTo({ top: 0 });
  }, [readOnly, employee.id]);

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

  const editable = !readOnly && isActive && canEditMonth;
  // Dallo schedule, non da sumHours(blocks): quest'ultimo contava anche i turni
  // rimasti su giorni di chiusura, così il totale inviato in approvazione non
  // corrispondeva a quello che il titolare vede nel suo riepilogo.
  const totalHours = schedule.employeeHours(employee.id);

  const currentMonthKey = todayKey().slice(0, 7);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  // Dal mese in corso non si va avanti: un mese non ancora arrivato non ha ore da rivedere.
  const isCurrentOrFutureMonth = monthKey >= currentMonthKey;
  const isBeforeHire = monthKey <= hireMonthKey;
  // Il mese in corso non è ancora finito: si possono comunque correggere i
  // giorni già passati (utile a metà mese), ma non "chiudere" ancora tutto
  // il mese — vedi lo stesso limite, quello vero, in submitMonth.
  const monthNotYetOver = monthKey === currentMonthKey;

  function go(y: number, m: number) {
    router.push(`/mie-ore/revisione?year=${y}&month=${m}${viewAsQuery}`);
  }
  function step(direction: 1 | -1) {
    const d = new Date(Date.UTC(year, month - 1 + direction, 1));
    go(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }

  // L'invio blocca il mese finché il titolare non lo riapre: prima un riepilogo da confermare.
  const [askSubmit, setAskSubmit] = useState(false);
  function submit() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => submitMonth(year, month), "Mese inviato — in attesa di approvazione");
      setAskSubmit(false);
      if (result !== null) {
        router.refresh();
        // Il pulsante d'invio, in fondo alla pagina, sparisce: si torna in
        // cima, dove lo stato ora dice «Inviato».
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  const editingEntry = editingDate ? schedule.entry(employee.id, editingDate) : null;

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href={readOnly ? `/mie-ore?viewAs=${employee.id}` : "/mie-ore"}
        className="-ml-1 mb-2 inline-flex min-h-11 items-center px-1 text-sm font-medium text-foreground-muted hover:text-foreground"
      >
        ‹ Le mie ore
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-medium">Revisione ore</h1>
          <p className="text-sm text-foreground-muted">
            {monthLabel(month - 1)} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={isBeforeHire}
            title={isBeforeHire ? "Non lavoravi ancora qui prima di questo mese" : undefined}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-30"
            aria-label="Mese precedente"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={isCurrentOrFutureMonth}
            title={isCurrentOrFutureMonth ? "Non puoi rivedere un mese non ancora arrivato" : undefined}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-30"
            aria-label="Mese successivo"
          >
            ›
          </button>
        </div>
      </div>

      {readOnly && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-ink">
          <span>
            Stai visualizzando come <strong>{employee.name}</strong> — sola lettura.
          </span>
          <Link href="/dipendenti" className="shrink-0 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium hover:bg-accent/15">
            Torna a Dipendenti
          </Link>
        </div>
      )}

      <StatusBanner
        status={status}
        reopenNote={reopenNote}
        isActive={isActive}
        monthNotYetOver={monthNotYetOver}
        lockedReason={lockedReason}
      />

      <div className="my-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="divide-y divide-border">
          {dateKeys.map((dateKey) => {
            const date = parseDateKey(dateKey);
            const entry = schedule.entry(employee.id, dateKey);
            const dayBlocks = blocks.filter((b) => b.dateKey === dateKey);
            const edited = dayBlocks.some((b) => b.originalStartTime || b.addedByEmployee) || !!entry.leave?.addedByEmployee;
            const isFutureDay = dateKey > todayKey();
            const isBeforeHireDay = dateKey < hireDateKey;
            const clickable = editable && !isFutureDay && !isBeforeHireDay;
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
                  else if (isBeforeHireDay) toast.showError("In questo giorno non lavoravi ancora qui.");
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                  clickable ? "hover:bg-surface-2" : "cursor-default"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  {dayLabel(date)} <span className="font-normal normal-case text-foreground-muted">{formatDayMonth(date)}</span>
                  {edited && <span className="h-1.5 w-1.5 rounded-full bg-gold" title="Modificato o aggiunto da te" aria-hidden />}
                </span>
                {/* Il «+» tratteggiato solo dove si può davvero aggiungere qualcosa. */}
                <DayCellContent entry={entry} align="right" readOnly={!clickable} forEmployee />
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground-muted">Totale ore</span>
          <span className="font-semibold text-foreground">{formatHours(totalHours)}</span>
        </div>
      </div>

      {editable && !monthNotYetOver && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setAskSubmit(true)}
          className="min-h-11 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Invio…" : "Invia questo mese al titolare"}
        </button>
      )}
      {askSubmit && (
        <ConfirmSheet
          title={`Inviare ${monthLabel(month - 1).toLowerCase()} al titolare?`}
          confirmLabel="Sì, invia"
          busyLabel="Invio…"
          busy={pending}
          onConfirm={submit}
          onCancel={() => setAskSubmit(false)}
        >
          <p>
            Totale del mese: <b className="text-foreground">{formatHours(totalHours)}</b>.
          </p>
          <p>Dopo l&apos;invio non puoi più cambiarlo, finché il titolare non lo riapre.</p>
        </ConfirmSheet>
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
          selfReview
        />
      )}
    </div>
  );
}

function StatusBanner({
  status,
  reopenNote,
  isActive,
  monthNotYetOver,
  lockedReason,
}: {
  status: Status;
  reopenNote: string | null;
  isActive: boolean;
  /** Il mese visualizzato è quello in corso: si corregge già, ma non si invia finché non finisce. */
  monthNotYetOver: boolean;
  lockedReason: LockedReason;
}) {
  if (!isActive) {
    return (
      <p className="rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-xs text-foreground-muted">
        Account disattivato: questo mese resta consultabile ma non più modificabile.
      </p>
    );
  }

  if (lockedReason) {
    return (
      <p className="rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-sm text-foreground-muted">
        {lockedReason === "beforeHire"
          ? "Non lavoravi ancora qui in questo mese: non c'è nulla da rivedere."
          : lockedReason === "future"
            ? "Questo mese non è ancora arrivato: non c'è nulla da rivedere."
            : "Questo mese non si può più modificare: se serve, chiedi al titolare."}
      </p>
    );
  }

  const tone =
    status === "APPROVED"
      ? "border-success/30 bg-success-bg text-success"
      : status === "SUBMITTED"
        ? "border-gold/40 bg-gold/10 text-gold"
        : status === "REOPENED"
          ? "border-accent/30 bg-accent/10 text-accent-ink"
          : "border-border bg-surface-2/50 text-foreground-muted";

  return (
    <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${tone}`}>
      {monthNotYetOver && status === "DRAFT" ? "Mese in corso" : STATUS_LABEL[status]}
      {status === "SUBMITTED" && (
        <p className="mt-1 font-normal text-foreground-muted">Il titolare deve controllarlo: finché non risponde non puoi cambiarlo.</p>
      )}
      {status === "APPROVED" && <p className="mt-1 font-normal text-foreground-muted">Non devi fare altro.</p>}
      {status === "REOPENED" && (
        <p className="mt-1 font-normal text-foreground">
          {reopenNote ? <>Nota del titolare: {reopenNote} </> : null}
          <span className="text-foreground-muted">Tocca un giorno per correggerlo, poi invia di nuovo il mese.</span>
        </p>
      )}
      {status === "DRAFT" && (
        <p className="mt-1 font-normal text-foreground-muted">
          {monthNotYetOver
            ? "Tocca un giorno per correggere l'orario o aggiungerne uno mancante. Il mese è ancora in corso: potrai inviarlo al titolare solo dopo che sarà finito."
            : "Tocca un giorno per correggere l'orario o aggiungerne uno mancante, poi invia il mese quando hai finito."}
        </p>
      )}
    </div>
  );
}
