"use client";

import { ConfirmSheet } from "@/components/confirm-sheet";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { monthLabel } from "@/lib/week";
import { useToast, runWithToast } from "@/components/toast";
import { approveMonth, reopenMonth, undoReopenMonth } from "./actions";

export type PendingMonth = {
  year: number;
  month: number;
  submittedAt: string | null;
  /** Cosa ha cambiato il dipendente rispetto agli orari del titolare (turni corretti, aggiunti, tolti; permessi). */
  changes: string[];
};
export type ReopenedMonth = { year: number; month: number; reopenedAt: string | null; note: string | null };
export type ApprovedMonth = { year: number; month: number; approvedAt: string | null };

// Date nel fuso del locale: senza, un invio fatto dopo mezzanotte (ora
// italiana) poteva risultare del giorno prima.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
}

// Riquadro «Ore inviate» nella scheda del dipendente: i mesi inviati da
// controllare (con quello che il dipendente ha cambiato) e quelli rimandati
// indietro, in attesa che il dipendente li corregga e li invii di nuovo.
export function PendingMonths({
  employeeId,
  employeeName,
  submissions,
  reopened = [],
}: {
  employeeId: string;
  employeeName: string;
  submissions: PendingMonth[];
  reopened?: ReopenedMonth[];
}) {
  return (
    <div className="border-t border-gold/30 bg-gold/[0.06] px-4 py-3">
      {submissions.length > 0 && (
        <>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gold">
            📥 Ore inviate, da controllare
          </p>
          <div className="space-y-2">
            {submissions.map((s) => (
              <PendingMonthRow key={`${s.year}-${s.month}`} employeeId={employeeId} employeeName={employeeName} {...s} />
            ))}
          </div>
        </>
      )}
      {reopened.length > 0 && (
        <div className={`space-y-1.5 ${submissions.length > 0 ? "mt-3" : ""}`}>
          {reopened.map((r) => (
            <ReopenedMonthRow key={`${r.year}-${r.month}`} employeeId={employeeId} {...r} />
          ))}
        </div>
      )}
    </div>
  );
}

// Mese rimandato al dipendente: si può annullare il rimando se è stato un errore.
function ReopenedMonthRow({ employeeId, year, month, reopenedAt, note }: ReopenedMonth & { employeeId: string }) {
  const [ask, setAsk] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const label = `${monthLabel(month - 1)} ${year}`;

  function undo() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => undoReopenMonth(employeeId, year, month), `${label}: rimando annullato`);
      if (result !== null) {
        setAsk(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-foreground-muted">
      <p>
        <span className="font-medium text-foreground">{label}</span>
        : rimandato{reopenedAt ? ` il ${formatDate(reopenedAt)}` : ""}, in attesa di correzione
        {note && <span className="mt-0.5 block italic">«{note}»</span>}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => setAsk(true)}
        className="-my-1 min-h-10 shrink-0 rounded-full border border-border px-3 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
      >
        Annulla il rimando
      </button>
      {ask && (
        <ConfirmSheet
          title={`Annullare il rimando di ${label.toLowerCase()}?`}
          confirmLabel="Sì, annulla il rimando"
          busyLabel="Annullo…"
          busy={pending}
          onConfirm={undo}
          onCancel={() => setAsk(false)}
        >
          <p>
            Il mese torna com&apos;era prima di rimandarlo: approvato, se l&apos;avevi già approvato, oppure di nuovo tra le ore da controllare. Il
            dipendente non potrà più modificarlo.
          </p>
        </ConfirmSheet>
      )}
    </div>
  );
}

function PendingMonthRow({
  employeeId,
  employeeName,
  year,
  month,
  submittedAt,
  changes,
}: PendingMonth & { employeeId: string; employeeName: string }) {
  const [reopening, setReopening] = useState(false);
  const [note, setNote] = useState("");
  const [showAllChanges, setShowAllChanges] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  // Approvare chiude il mese per il dipendente: prima si chiede conferma.
  const [askApprove, setAskApprove] = useState(false);
  function approve() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => approveMonth(employeeId, year, month), `${monthLabel(month - 1)} approvato`);
      setAskApprove(false);
      if (result !== null) router.refresh();
    });
  }

  function confirmReopen() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => reopenMonth(employeeId, year, month, note), "Mese rimandato indietro");
      if (result !== null) {
        setReopening(false);
        setNote("");
        router.refresh();
      }
    });
  }

  const visibleChanges = showAllChanges ? changes : changes.slice(0, 6);
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          {monthLabel(month - 1)} {year}
          {submittedAt && <span className="ml-1.5 font-normal text-foreground-muted">— inviato il {formatDate(submittedAt)}</span>}
        </p>
        {!reopening && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setReopening(true)}
              className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              Riapri
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setAskApprove(true)}
              className="min-h-11 rounded-full bg-gold px-4 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : "Approva"}
            </button>
          </div>
        )}
        {askApprove && (
          <ConfirmSheet
            title={`Approvare ${monthLabel(month - 1).toLowerCase()} ${year}?`}
            confirmLabel="Sì, approva"
            busyLabel="Approvo…"
            busy={pending}
            onConfirm={approve}
            onCancel={() => setAskApprove(false)}
          >
            <p>Il mese si chiude: il dipendente non potrà più modificarlo. Se serve, potrai riaprirlo dalla sua scheda.</p>
          </ConfirmSheet>
        )}
      </div>

      {/* Quello che il dipendente ha cambiato rispetto agli orari pianificati:
          prima i turni tolti («Riposo», «Svuota giornata») sparivano senza
          traccia e chi approvava non sapeva che c'era un turno. */}
      <div className="mt-1.5 text-[11px] text-foreground-muted">
        {changes.length === 0 ? (
          <p>Nessuna modifica agli orari pianificati.</p>
        ) : (
          <>
            <p className="font-medium text-foreground">
              {changes.length === 1 ? "1 modifica" : `${changes.length} modifiche`} di {employeeName.split(" ")[0]}:
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {visibleChanges.map((c, i) => (
                <li key={i}>· {c}</li>
              ))}
            </ul>
            {changes.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllChanges((v) => !v)}
                className="-my-2 min-h-10 font-medium text-accent-ink hover:underline"
              >
                {showAllChanges ? "Mostra meno" : `Mostra tutte (${changes.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {reopening && (
        <div className="mt-2">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cosa non torna? (facoltativo, il dipendente lo vedrà)"
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReopening(false);
                setNote("");
              }}
              className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirmReopen}
              className="min-h-11 rounded-full bg-accent px-4 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? "…" : "Rimanda al dipendente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Ultimi mesi già approvati, nella scheda del dipendente: «Approva» promette
// «se serve, potrai riaprirlo», e da qui si può davvero (con conferma e una
// nota per il dipendente).
export function ApprovedMonths({ employeeId, months }: { employeeId: string; months: ApprovedMonth[] }) {
  return (
    <div className="border-t border-border px-4 py-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Mesi approvati</p>
      <div className="divide-y divide-border">
        {months.map((m) => (
          <ApprovedMonthRow key={`${m.year}-${m.month}`} employeeId={employeeId} {...m} />
        ))}
      </div>
    </div>
  );
}

function ApprovedMonthRow({ employeeId, year, month, approvedAt }: ApprovedMonth & { employeeId: string }) {
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function reopen() {
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => reopenMonth(employeeId, year, month, note),
        `${monthLabel(month - 1)} riaperto: il dipendente può correggerlo`,
      );
      if (result !== null) {
        setAsk(false);
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <p className="text-xs text-foreground">
        {monthLabel(month - 1)} {year}
        {approvedAt && <span className="ml-1.5 text-foreground-muted">— approvato il {formatDate(approvedAt)}</span>}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => setAsk(true)}
        className="min-h-11 shrink-0 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
      >
        Riapri
      </button>
      {ask && (
        <ConfirmSheet
          title={`Riaprire ${monthLabel(month - 1).toLowerCase()} ${year}?`}
          confirmLabel="Sì, riapri"
          busyLabel="Riapro…"
          busy={pending}
          onConfirm={reopen}
          onCancel={() => {
            setAsk(false);
            setNote("");
          }}
        >
          <p>Il mese non è più approvato: il dipendente potrà correggere le ore e dovrà inviarlo di nuovo.</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cosa va corretto? (facoltativo, il dipendente lo vedrà)"
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </ConfirmSheet>
      )}
    </div>
  );
}
