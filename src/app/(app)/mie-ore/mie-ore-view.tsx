"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, dayLabel, formatWeekRange, isToday, monthLabel, parseDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/week";
import { buildSchedule, formatHoursNumber, type Block, type Closure, type Leave } from "@/lib/schedule";
import { DayCellContent } from "../orari/shared";
import { EmployeeAvatar } from "@/components/avatar";
import { PdfExportModal } from "../dipendenti/pdf-export-modal";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REOPENED";

/** Il primo turno non ancora finito (vedi findNextShift in page.tsx). */
export type NextShift = {
  /** -1 = ieri (turno dopo mezzanotte ancora in corso), 0 = oggi, 1 = domani… */
  dayOffset: number;
  dayName: string;
  dayOfMonth: number;
  monthIndex: number;
  times: string[];
  inProgress: boolean;
  /** Falso se la settimana non è ancora confermata dal titolare. */
  confirmed: boolean;
};

type ReopenedMonth = { year: number; month: number; note: string | null };

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
  reopenedMonths,
  wasHiredByReviewMonth,
  preview = false,
  notConfirmed = false,
  currentWeekUnconfirmed = false,
  correctionMonth,
  nextShift,
  showWidgetLink = false,
  showInstallLink = true,
}: {
  /** Settimana futura che il titolare non ha ancora confermato: i turni non si mostrano. */
  notConfirmed?: boolean;
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
  /** Mesi rimandati indietro dal titolare (il più vecchio per primo), con la sua nota se l'ha scritta. */
  reopenedMonths: ReopenedMonth[];
  /** False se il dipendente è stato assunto dopo la fine di lastCompletedMonth. */
  wasHiredByReviewMonth: boolean;
  /** True quando titolare/consulente stanno guardando con "Visualizza come". */
  preview?: boolean;
  /** Settimana in corso, non ancora confermata dal titolare: si vede, ma va detto. */
  currentWeekUnconfirmed?: boolean;
  /** Mese da correggere per la settimana mostrata; null = niente collegamento (giorni futuri o mese chiuso). */
  correctionMonth: { year: number; month: number } | null;
  nextShift: NextShift | null;
  showWidgetLink?: boolean;
  /** Falso quando l'app è già installata: niente più inviti a installarla. */
  showInstallLink?: boolean;
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
  // Settimana in corso non confermata e senza nulla per questo dipendente:
  // sette «Nessun turno» sembrerebbero una settimana di riposo.
  const nothingYet = blocks.length === 0 && leaveEntries.length === 0;
  const showNotConfirmedBox = notConfirmed || (currentWeekUnconfirmed && nothingYet);

  return (
    <div className="mx-auto max-w-xl">

      {preview && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-ink">
          <span>
            Stai visualizzando come <strong>{employee.name}</strong> — sola lettura.
          </span>
          <Link href="/dipendenti" className="shrink-0 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium hover:bg-accent/15">
            Torna a Dipendenti
          </Link>
        </div>
      )}

      {nextShift && <NextShiftCard shift={nextShift} />}

      {!deactivatedAtKey && (
        <ReviewReminder
          lastCompletedMonth={lastCompletedMonth}
          status={lastMonthStatus}
          reopenedMonths={reopenedMonths}
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
          : "L'orario lo prepara il titolare: qui puoi solo guardarlo."}
      </p>

      {showNotConfirmedBox ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center">
          <p className="text-sm font-medium text-foreground">Orari non ancora confermati</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Il titolare sta preparando i turni di questa settimana. Li vedrai qui appena li conferma.
          </p>
        </div>
      ) : (
        <>
          {currentWeekUnconfirmed && (
            <p className="mb-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs text-gold">
              Il titolare non ha ancora confermato gli orari di questa settimana: possono ancora cambiare.
            </p>
          )}
          <MyWeekCard employee={employee} days={days} schedule={schedule} />
        </>
      )}

      {/* Vedere un orario sbagliato qui e non sapere dove correggerlo era il
          punto morto del percorso: la correzione vive in una sezione con un
          altro nome ("Rivedi le tue ore"), raggiungibile solo dal richiamo
          in cima, che parla dell'ultimo mese concluso e non della settimana
          che si sta effettivamente guardando. Questo collegamento porta
          direttamente al mese giusto, con davanti le ore di questi giorni. */}
      {!deactivatedAtKey && correctionMonth && (
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

      {/* In fondo, sempre raggiungibili: non sono cose di tutti i giorni («Installa l'app» solo
          finché l'app non risulta installata, come l'invito in alto). */}
      {!preview && (showWidgetLink || showInstallLink) && (
        <div className="mt-8 space-y-3">
          {showWidgetLink && (
            <Link
              href="/widget"
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
            >
              <span>
                <span className="block text-sm font-medium text-foreground">Widget sul telefono</span>
                <span className="block text-xs text-foreground-muted">I tuoi turni sulla schermata Home dell&apos;iPhone</span>
              </span>
              <span className="text-foreground-muted" aria-hidden>›</span>
            </Link>
          )}
          {showInstallLink && (
            <Link
              href="/installa"
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
            >
              <span>
                <span className="block text-sm font-medium text-foreground">Installa l&apos;app sul telefono</span>
                <span className="block text-xs text-foreground-muted">Un&apos;icona sulla schermata Home, come una vera app</span>
              </span>
              <span className="text-foreground-muted" aria-hidden>›</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// «Prossimo turno: sabato 14 novembre 16:30–22:00» — la prima cosa che un
// dipendente cerca aprendo l'app.
function NextShiftCard({ shift }: { shift: NextShift }) {
  const when =
    shift.dayOffset === 0
      ? "oggi"
      : shift.dayOffset === 1
        ? "domani"
        : shift.dayOffset === -1
          ? "da ieri sera"
          : `${shift.dayName} ${shift.dayOfMonth} ${monthLabel(shift.monthIndex).toLowerCase()}`;
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium text-foreground-muted">{shift.inProgress ? "Turno in corso" : "Prossimo turno"}</p>
      <p className="mt-0.5 text-base font-semibold text-foreground">
        {when.charAt(0).toUpperCase() + when.slice(1)} {shift.times.join(" e ")}
      </p>
      {!shift.confirmed && (
        <p className="mt-0.5 text-xs text-foreground-muted">Orario non ancora confermato dal titolare: può cambiare.</p>
      )}
    </div>
  );
}

// La settimana del dipendente: come la scheda per dipendente di Orari, ma con
// la data accanto al giorno («Lun 2»), «Oggi» scritto per esteso e il
// pulsante per scaricare l'orario ben visibile anche dal computer.
function MyWeekCard({
  employee,
  days,
  schedule,
}: {
  employee: { id: string; name: string; jobTitle: string | null; photoVersion: string | null };
  days: Date[];
  schedule: ReturnType<typeof buildSchedule>;
}) {
  const [showPdfExport, setShowPdfExport] = useState(false);
  const totalHours = schedule.employeeHours(employee.id);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <EmployeeAvatar employee={employee} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
          {employee.jobTitle && <p className="truncate text-xs text-foreground-muted">{employee.jobTitle}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold leading-none text-foreground">{formatHoursNumber(totalHours)}</p>
          <p className="text-[10px] uppercase tracking-wide text-foreground-muted">ore</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {days.map((d) => {
          const dateKey = toDateKey(d);
          const today = isToday(d);
          return (
            <div
              key={dateKey}
              className={`flex min-h-11 items-center justify-between gap-3 px-4 py-2 ${today ? "bg-accent/[0.06]" : ""}`}
            >
              <span className="flex items-center gap-2 text-sm text-foreground-muted">
                <span className={today ? "font-semibold text-foreground" : "font-medium"}>
                  {dayLabel(d)} {d.getUTCDate()}
                </span>
                {today && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                    Oggi
                  </span>
                )}
              </span>
              <DayCellContent entry={schedule.entry(employee.id, dateKey)} align="right" readOnly forEmployee />
            </div>
          );
        })}
      </div>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => setShowPdfExport(true)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/60 px-4 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent-ink"
        >
          <DownloadIcon />
          Scarica il mio orario
        </button>
      </div>

      {showPdfExport && (
        <PdfExportModal
          employeeId={employee.id}
          employeeName={employee.name}
          jobTitle={employee.jobTitle}
          photoVersion={employee.photoVersion}
          initialDateKey={toDateKey(days[0])}
          onClose={() => setShowPdfExport(false)}
        />
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

// L'unico promemoria che l'app può permettersi senza email/SMS/push a
// pagamento: un banner dentro l'app stessa. Prima i mesi che il titolare ha
// rimandato indietro (anche vecchi: prima si vedeva solo l'ultimo mese
// concluso), poi l'ultimo mese concluso se non è ancora stato inviato.
// Se non c'è nulla da fare resta un link discreto per rivedere le ore.
function ReviewReminder({
  lastCompletedMonth,
  status,
  reopenedMonths,
  wasHiredByReviewMonth,
  viewAsQuery,
}: {
  lastCompletedMonth: { year: number; month: number };
  status: SubmissionStatus | null;
  reopenedMonths: ReopenedMonth[];
  wasHiredByReviewMonth: boolean;
  viewAsQuery: string;
}) {
  // Assunto dopo la fine di quel mese: nessun mese dimenticato da segnalare.
  const lastNeedsSending = wasHiredByReviewMonth && (status === null || status === "DRAFT");
  const label = (m: { year: number; month: number }) => `${monthLabel(m.month - 1)} ${m.year}`;
  const href = (m: { year: number; month: number }) => `/mie-ore/revisione?year=${m.year}&month=${m.month}${viewAsQuery}`;

  if (!lastNeedsSending && reopenedMonths.length === 0) {
    return (
      <Link
        href={`/mie-ore/revisione${viewAsQuery ? `?${viewAsQuery.slice(1)}` : ""}`}
        className="mb-4 flex min-h-11 items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
      >
        Rivedi le tue ore
        <span aria-hidden>›</span>
      </Link>
    );
  }

  return (
    <div className="mb-4 space-y-2">
      {reopenedMonths.map((m) => (
        <Link
          key={`${m.year}-${m.month}`}
          href={href(m)}
          className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-ink transition-colors hover:bg-accent/15"
        >
          <span className="min-w-0">
            <span className="block font-semibold">{label(m)}: il titolare ti chiede di correggerlo</span>
            {/* Il motivo scritto dal titolare è facoltativo: quando c'è, si
                legge già qui, senza un passaggio a vuoto per scoprirlo. */}
            {m.note && <span className="mt-1 block text-foreground">«{m.note}»</span>}
            <span className="mt-0.5 block text-xs opacity-80">Tocca per correggere e inviarlo di nuovo.</span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      ))}
      {lastNeedsSending && (
        <Link
          href={href(lastCompletedMonth)}
          className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold transition-colors hover:bg-gold/15"
        >
          <span>
            <span className="font-medium">Rivedi le ore di {label(lastCompletedMonth)}</span>
            <span className="mt-0.5 block text-xs opacity-80">Controlla che sia tutto giusto e invia.</span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}
    </div>
  );
}
