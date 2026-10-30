"use client";

import { ConfirmSheet } from "@/components/confirm-sheet";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { monthLabel } from "@/lib/week";
import { useToast, runWithToast } from "@/components/toast";
import { approveMonth, reopenMonth } from "./actions";

// Solo gli invii "in attesa" arrivano qui (vedi dipendenti/page.tsx) — bozze
// e mesi già approvati non richiedono nessuna azione dal titolare.
export function PendingMonths({
  employeeId,
  submissions,
}: {
  employeeId: string;
  submissions: { year: number; month: number; submittedAt: string | null }[];
}) {
  return (
    <div className="border-t border-gold/30 bg-gold/[0.06] px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gold">
        📥 Ore inviate, da controllare
      </p>
      <div className="space-y-2">
        {submissions.map((s) => (
          <PendingMonthRow key={`${s.year}-${s.month}`} employeeId={employeeId} year={s.year} month={s.month} submittedAt={s.submittedAt} />
        ))}
      </div>
    </div>
  );
}

function PendingMonthRow({
  employeeId,
  year,
  month,
  submittedAt,
}: {
  employeeId: string;
  year: number;
  month: number;
  submittedAt: string | null;
}) {
  const [reopening, setReopening] = useState(false);
  const [note, setNote] = useState("");
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

  return (
    <div className="rounded-lg bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          {monthLabel(month - 1)} {year}
          {submittedAt && (
            <span className="ml-1.5 font-normal text-foreground-muted">
              — inviato il {new Date(submittedAt).toLocaleDateString("it-IT")}
            </span>
          )}
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
            <p>Il mese si chiude: il dipendente non potrà più modificarlo. Se serve, potrai riaprirlo.</p>
          </ConfirmSheet>
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
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-muted"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirmReopen}
              className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? "…" : "Rimanda al dipendente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
