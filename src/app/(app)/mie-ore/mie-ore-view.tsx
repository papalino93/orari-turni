"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, formatWeekRange, isToday, monthLabel, parseDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/week";
import { buildSchedule, type Block, type Closure, type Leave } from "@/lib/schedule";
import { EmployeeWeekCard } from "../orari/week-grid";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REOPENED";

export function MieOreView({
  employee,
  weekStartKey,
  dateKeys,
  blocks,
  leaveEntries,
  closures,
  deactivatedAtKey,
  lastCompletedMonth,
  lastMonthStatus,
  wasHiredByReviewMonth,
}: {
  employee: { id: string; name: string; jobTitle: string | null; photoVersion: string | null };
  weekStartKey: string;
  dateKeys: string[];
  blocks: Block[];
  leaveEntries: Leave[];
  closures: Closure[];
  /** Presente solo per un account disattivato: confine oltre il quale non si va più avanti. */
  deactivatedAtKey: string | null;
  lastCompletedMonth: { year: number; month: number };
  lastMonthStatus: SubmissionStatus | null;
  /** False se il dipendente è stato assunto dopo la fine di lastCompletedMonth. */
  wasHiredByReviewMonth: boolean;
}) {
  const router = useRouter();
  const weekStart = parseDateKey(weekStartKey);
  const days = useMemo(() => dateKeys.map((k) => parseDateKey(k)), [dateKeys]);
  // "Vede solo il passato": una volta disattivato, non si naviga oltre la
  // settimana in cui è avvenuta la disattivazione — non ha senso mostrare
  // il pulsante "avanti" verso settimane che comunque non vedrà mai.
  const deactivationWeekKey = deactivatedAtKey ? toDateKey(startOfWeek(parseDateKey(deactivatedAtKey))) : null;
  const atOrPastDeactivation = deactivationWeekKey !== null && weekStartKey >= deactivationWeekKey;

  // Stessa ragione di EmployeeList in Dipendenti: uno Schedule contiene
  // funzioni (entry, employeeHours...), che un Server Component non può
  // passare come prop — si ricostruisce qui dai dati grezzi.
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

  function navigate(date: string) {
    router.push(`/mie-ore?date=${date}`);
  }

  function step(direction: 1 | -1) {
    navigate(toDateKey(addDays(weekStart, direction * 7)));
  }

  const thisWeek = toDateKey(startOfWeek(parseDateKey(todayKey()))) === weekStartKey;

  return (
    <div className="mx-auto max-w-xl">
      {!deactivatedAtKey && (
        <ReviewReminder
          lastCompletedMonth={lastCompletedMonth}
          status={lastMonthStatus}
          wasHiredByReviewMonth={wasHiredByReviewMonth}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            La tua settimana
            {deactivatedAtKey && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
                Account disattivato
              </span>
            )}
          </h1>
          <p className="text-sm text-foreground-muted">{formatWeekRange(weekStart)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
            aria-label="Settimana precedente"
          >
            ‹
          </button>
          {!thisWeek && !atOrPastDeactivation && (
            <button
              type="button"
              onClick={() => navigate(toDateKey(startOfWeek(parseDateKey(todayKey()))))}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
            >
              Questa settimana
            </button>
          )}
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atOrPastDeactivation}
            title={atOrPastDeactivation ? "Nessuna settimana successiva: l'account è disattivato da qui in poi" : undefined}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-30 disabled:hover:border-border disabled:hover:text-foreground-muted"
            aria-label="Settimana successiva"
          >
            ›
          </button>
        </div>
      </div>

      {/* Qui sotto è sola lettura: l'orario pianificato dal titolare. Per
          correggere le ore davvero lavorate (e aggiungerne di mancanti) si
          passa dalla revisione mensile — vedi il richiamo qui sopra. */}
      <p className="mb-4 text-xs text-foreground-muted">
        {deactivatedAtKey
          ? "Account disattivato: puoi consultare solo lo storico fino alla data di disattivazione."
          : (days.some((d) => isToday(d)) ? "Questa settimana include oggi. " : "") + "Sola lettura — è l'orario compilato dal titolare."}
      </p>

      <EmployeeWeekCard employee={{ ...employee, role: "EMPLOYEE", sortOrder: 0 }} days={days} schedule={schedule} />
    </div>
  );
}

// L'unico promemoria che l'app può permettersi senza email/SMS/push a
// pagamento: un banner dentro l'app stessa. Compare da solo se l'ultimo
// mese concluso non è ancora stato inviato — altrimenti resta comunque un
// link discreto per rivedere le ore quando si vuole, non solo a fine mese.
function ReviewReminder({
  lastCompletedMonth,
  status,
  wasHiredByReviewMonth,
}: {
  lastCompletedMonth: { year: number; month: number };
  status: SubmissionStatus | null;
  wasHiredByReviewMonth: boolean;
}) {
  // Assunto dopo la fine di quel mese: nessun mese dimenticato da segnalare,
  // solo il link discreto sotto per rivedere le ore quando servirà.
  const needsAttention = wasHiredByReviewMonth && (status === null || status === "DRAFT" || status === "REOPENED");
  const label = `${monthLabel(lastCompletedMonth.month - 1)} ${lastCompletedMonth.year}`;
  const href = `/mie-ore/revisione?year=${lastCompletedMonth.year}&month=${lastCompletedMonth.month}`;

  if (!needsAttention) {
    return (
      <Link
        href="/mie-ore/revisione"
        className="mb-4 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
      >
        Rivedi le tue ore
        <span aria-hidden>›</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold transition-colors hover:bg-gold/15"
    >
      <span>
        <span className="font-medium">
          {status === "REOPENED" ? `${label}: il titolare ha rimandato indietro le ore` : `Rivedi le ore di ${label}`}
        </span>
        <span className="mt-0.5 block text-xs opacity-80">
          {status === "REOPENED" ? "Tocca per controllare e reinviare." : "Controlla che sia tutto giusto e invia."}
        </span>
      </span>
      <span aria-hidden>›</span>
    </Link>
  );
}
