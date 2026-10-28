"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { useToast, runWithToast } from "@/components/toast";
import { formatDayMonth, parseDateKey, addDays } from "@/lib/week";
import { setWeekPublished } from "./actions";

// «Conferma orari della settimana»: solo una settimana confermata compare ai dipendenti
// in «Le mie ore» (il passato e la settimana in corso si vedono sempre). Se dopo la
// conferma si cambia un turno, la conferma si toglie da sola e va rifatta.
export function ConfirmWeekButton({
  weekStartKey,
  confirmed,
  changedAfterConfirm,
}: {
  weekStartKey: string;
  confirmed: boolean;
  changedAfterConfirm: boolean;
}) {
  const [ask, setAsk] = useState<"confirm" | "undo" | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const start0 = parseDateKey(weekStartKey);
  const range = `${formatDayMonth(start0)} – ${formatDayMonth(addDays(start0, 6))}`;

  function run(value: boolean) {
    start(async () => {
      const result = await runWithToast(
        toast,
        () => setWeekPublished(weekStartKey, value),
        value ? "Orari confermati: i dipendenti li vedono in «Le mie ore»" : "Conferma tolta: i dipendenti non vedono più questa settimana",
      );
      setAsk(null);
      if (result !== null) router.refresh();
    });
  }

  return (
    <>
      {confirmed ? (
        <button
          type="button"
          onClick={() => setAsk("undo")}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-4 text-sm font-medium text-success hover:bg-success/15"
          title="I dipendenti vedono questa settimana in «Le mie ore»"
        >
          ✓ Orari confermati
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAsk("confirm")}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-gold/50 bg-gold/15 px-4 text-sm font-semibold text-gold hover:bg-gold/25"
        >
          {changedAfterConfirm ? "Modificati: conferma di nuovo" : "Conferma orari della settimana"}
        </button>
      )}
      {ask === "confirm" && (
        <ConfirmSheet
          title="Confermare gli orari della settimana?"
          confirmLabel="Sì, conferma"
          busyLabel="Confermo…"
          busy={pending}
          onConfirm={() => run(true)}
          onCancel={() => setAsk(null)}
        >
          <p>
            Settimana <b className="text-foreground">{range}</b>. Da adesso i dipendenti vedono i loro turni di questa
            settimana in «Le mie ore».
          </p>
          <p>Se poi cambi un turno, la conferma si toglie da sola e va rifatta.</p>
        </ConfirmSheet>
      )}
      {ask === "undo" && (
        <ConfirmSheet
          title="Togliere la conferma?"
          confirmLabel="Sì, togli la conferma"
          busyLabel="Tolgo…"
          busy={pending}
          danger
          onConfirm={() => run(false)}
          onCancel={() => setAsk(null)}
        >
          <p>
            Settimana <b className="text-foreground">{range}</b>: i dipendenti non la vedranno più in «Le mie ore» finché non
            la confermi di nuovo.
          </p>
        </ConfirmSheet>
      )}
    </>
  );
}
