"use client";

import { useEffect, useMemo } from "react";
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
  lastMonthReopenNote,
  wasHiredByReviewMonth,
  preview = false,
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
  /** Il motivo scritto dal titolare quando ha riaperto il mese — non tutti lo compilano. */
  lastMonthReopenNote: string | null;
  /** False se il dipendente è stato assunto dopo la fine di lastCompletedMonth. */
  wasHiredByReviewMonth: boolean;
  /** True quando titolare/consulente stanno guardando con "Visualizza come". */
  preview?: boolean;
}) {
  const router = useRouter();
  const weekStart = parseDateKey(weekStartKey);
  const days = useMemo(() => dateKeys.map((k) => parseDateKey(k)), [dateKeys]);
  // "Vede solo il passato": una volta disattivato, non si naviga oltre la
  // settimana in cui è avvenuta la disattivazione — non ha senso mostrare
  // il pulsante "avanti" verso settimane che comunque non vedrà mai.
  const deactivationWeekKey = deactivatedAtKey ? toDateKey(startOfWeek(parseDateKey(deactivatedAtKey))) : null;
  const atOrPastDeactivation = deactivationWeekKey !== null && weekStartKey >= deactivationWeekKey;
  const viewAsQuery = preview ? `&viewAs=${employee.id}` : "";

  // Il link "Visualizza come" in Dipendenti sta sotto la piega: si arriva
  // qui con la pagina già scrollata, e il banner "Stai visualizzando come…"
  // — l'unico modo per tornare a Dipendenti in questa modalità — resta
  // fuori vista finché non si scorre di nuovo verso l'alto da soli.
  useEffect(() => {
    if (preview) window.scrollTo({ top: 0 });
  }, [preview, employee.id]);

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
    router.push(`/mie-ore?date=${date}${viewAsQuery}`);
  }

  function step(direction: 1 | -1) {
    navigate(toDateKey(addDays(weekStart, direction * 7)));
  }

  const thisWeek = toDateKey(startOfWeek(parseDateKey(todayKey()))) === weekStartKey;

  // Mese a cui punta il collegamento "correggi" in fondo. Una settimana può
  // stare a cavallo di due mesi: se contiene oggi vale il mese corrente
  // (quello che si sta vivendo), altrimenti quello in cui cade il lunedì
  // della settimana mostrata.
  const correctionAnchor = days.find((d) => isToday(d)) ?? weekStart;
  const correctionMonth = {
    year: correctionAnchor.getUTCFullYear(),
    month: correctionAnchor.getUTCMonth() + 1,
  };

  return (
    <div className="mx-auto max-w-xl">
      {preview && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
          <span>
            Stai visualizzando come <strong>{employee.name}</strong> — sola lettura.
          </span>
          <Link href="/dipendenti" className="shrink-0 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium hover:bg-accent/15">
            Torna a Dipendenti
          </Link>
        </div>
      )}

      {!deactivatedAtKey && (
        <ReviewReminder
          lastCompletedMonth={lastCompletedMonth}
          status={lastMonthStatus}
          reopenNote={lastMonthReopenNote}
          wasHiredByReviewMonth={wasHiredByReviewMonth}
          viewAsQuery={viewAsQuery}
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
        {/* h-11 (44px): stessa dimensione già adottata per la navigazione di
            /orari. Qui conta anche di più — l'Area Dipendenti si consulta
            quasi solo dal telefono, spesso con una mano sola. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
            aria-label="Settimana precedente"
          >
            ‹
          </button>
          {!thisWeek && !atOrPastDeactivation && (
            <button
              type="button"
              onClick={() => navigate(toDateKey(startOfWeek(parseDateKey(todayKey()))))}
              className="flex h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
            >
              Questa settimana
            </button>
          )}
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atOrPastDeactivation}
            title={atOrPastDeactivation ? "Nessuna settimana successiva: l'account è disattivato da qui in poi" : undefined}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-30 disabled:hover:border-border disabled:hover:text-foreground-muted"
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

      {/* Vedere un orario sbagliato qui e non sapere dove correggerlo era il
          punto morto del percorso: la correzione vive in una sezione con un
          altro nome ("Rivedi le tue ore"), raggiungibile solo dal richiamo
          in cima, che parla dell'ultimo mese concluso e non della settimana
          che si sta effettivamente guardando. Questo collegamento porta
          direttamente al mese giusto, con davanti le ore di questi giorni. */}
      {!deactivatedAtKey && (
        <Link
          href={`/mie-ore/revisione?year=${correctionMonth.year}&month=${correctionMonth.month}${viewAsQuery}`}
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
        >
          <span>
            <span className="font-medium text-foreground">Qualcosa non torna in questi giorni?</span>
            <span className="mt-0.5 block text-xs">
              Correggi le tue ore di {monthLabel(correctionMonth.month - 1).toLowerCase()}
            </span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}
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
  reopenNote,
  wasHiredByReviewMonth,
  viewAsQuery,
}: {
  lastCompletedMonth: { year: number; month: number };
  status: SubmissionStatus | null;
  reopenNote: string | null;
  wasHiredByReviewMonth: boolean;
  viewAsQuery: string;
}) {
  // Assunto dopo la fine di quel mese: nessun mese dimenticato da segnalare,
  // solo il link discreto sotto per rivedere le ore quando servirà.
  const needsAttention = wasHiredByReviewMonth && (status === null || status === "DRAFT" || status === "REOPENED");
  const label = `${monthLabel(lastCompletedMonth.month - 1)} ${lastCompletedMonth.year}`;
  const href = `/mie-ore/revisione?year=${lastCompletedMonth.year}&month=${lastCompletedMonth.month}${viewAsQuery}`;

  if (!needsAttention) {
    return (
      <Link
        href={`/mie-ore/revisione${viewAsQuery ? `?${viewAsQuery.slice(1)}` : ""}`}
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
          {status === "REOPENED" ? `${label}: da correggere e reinviare` : `Rivedi le ore di ${label}`}
        </span>
        {/* Il motivo scritto dal titolare in Dipendenti è facoltativo: se
            manca, il generico "controlla e reinvia" resta l'unica indicazione
            possibile. Quando c'è, mostrarlo già qui evita al dipendente un
            passaggio a vuoto solo per scoprire cosa non andava. */}
        <span className="mt-0.5 line-clamp-2 block text-xs opacity-80">
          {status === "REOPENED"
            ? reopenNote
              ? `“${reopenNote}” — tocca per correggere e reinviare.`
              : "Tocca per controllare e reinviare."
            : "Controlla che sia tutto giusto e invia."}
        </span>
      </span>
      <span aria-hidden>›</span>
    </Link>
  );
}
