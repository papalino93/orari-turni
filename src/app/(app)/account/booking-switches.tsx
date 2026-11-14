"use client";

// Impostazioni → «Prenotazioni»: i due interruttori, in vista e spiegati. Prima stavano dentro
// Prenotazioni → ⋯ → Impostazioni (quattro passi, e non si capiva dove fossero).
// 1. «Agenda delle prenotazioni»: per il personale; i clienti non vedono niente.
// 2. «Prenotazioni online dei clienti»: il modulo «Chiedi un tavolo» (sito, Google, Instagram, Facebook).
// Accendendo il secondo, prima un elenco di controllo: è il passo che non si può sbagliare.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { showActionError, useToast } from "@/components/toast";
import { setBookingSwitch } from "../prenotazioni/actions";
import { TestsDialog } from "../prenotazioni/bookings-view";
import { Switch } from "../prenotazioni/device";

type Which = "agenda" | "online";

export function BookingSwitches({ agendaEnabled, enabled, pending, hasVenueDevice }: { agendaEnabled: boolean; enabled: boolean; pending: number; hasVenueDevice: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<{ which: Which; on: boolean } | null>(null);
  const [askTests, setAskTests] = useState<{ which: Which; on: boolean; tests: number; keepable: number } | null>(null);

  async function apply(which: Which, on: boolean, tests?: "delete" | "keep") {
    setBusy(true);
    try {
      const res = await setBookingSwitch(which, on, tests);
      if (!res.ok) {
        toast.showError(res.error);
        return;
      }
      if (!res.data.done) {
        setAsk(null);
        setAskTests({ which, on, tests: res.data.tests, keepable: res.data.keepable });
        return;
      }
      toast.showSuccess(
        which === "agenda" ? (on ? "Agenda accesa" : "Agenda spenta") : on ? "Prenotazioni online accese: i clienti possono chiedere un tavolo" : "Prenotazioni online spente",
      );
      setAsk(null);
      setAskTests(null);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  const row = "flex items-center justify-between gap-3 px-5 py-4";
  const badge = (on: boolean) =>
    `ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? "bg-success-bg text-success" : "bg-surface-2 text-foreground-muted ring-1 ring-inset ring-border"}`;

  return (
    <section aria-labelledby="impostazioni-prenotazioni" className="mb-6">
      <h2 id="impostazioni-prenotazioni" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
        Prenotazioni
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface" data-testid="impostazioni-prenotazioni">
        <div className={row}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Agenda delle prenotazioni<span className={badge(agendaEnabled)}>{agendaEnabled ? "Accesa" : "Spenta"}</span>
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {agendaEnabled
                ? "Per voi: si segnano le prenotazioni prese al telefono. I clienti non vedono niente."
                : "Accendila per segnare le prenotazioni prese al telefono (al posto del librone). I clienti non vedono niente."}
            </p>
          </div>
          <Switch on={agendaEnabled} disabled={busy} label="Agenda delle prenotazioni" onToggle={() => setAsk({ which: "agenda", on: !agendaEnabled })} />
        </div>

        <div className={row}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Prenotazioni online dei clienti<span className={badge(enabled)}>{enabled ? "Accese" : "Spente"}</span>
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {enabled
                ? pending > 0
                  ? `I clienti chiedono un tavolo dal sito, da Google, Instagram e Facebook. Ora: ${pending === 1 ? "1 richiesta da confermare" : `${pending} richieste da confermare`}.`
                  : "I clienti chiedono un tavolo dal sito, da Google, Instagram e Facebook; voi confermate ognuna."
                : "Quando le accendi, i clienti possono chiedere un tavolo dal sito, da Google, Instagram e Facebook. Ogni richiesta la confermate voi."}
            </p>
          </div>
          <Switch on={enabled} disabled={busy} label="Prenotazioni online dei clienti" onToggle={() => setAsk({ which: "online", on: !enabled })} />
        </div>

        {/* Due righe separate, ognuna con la sua freccia: scritte una sotto l'altra sembravano un pulsante solo. */}
        <Link href="/prenotazioni" className={`${row} hover:bg-surface-2/60`}>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-accent-ink">{agendaEnabled ? "Apri l'agenda" : "Prova l'agenda"}</span>
            {!agendaEnabled && <span className="mt-0.5 block text-xs text-foreground-muted">Prima di accenderla: la vedi solo tu.</span>}
          </span>
          <Chevron />
        </Link>
        <Link href="/prenotazioni?apri=impostazioni" className={`${row} hover:bg-surface-2/60`}>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Impostazioni delle prenotazioni</span>
            <span className="mt-0.5 block text-xs text-foreground-muted">Orari prenotabili, persone massime, telefoni che ricevono gli avvisi, link per Instagram, Facebook e Google.</span>
          </span>
          <Chevron />
        </Link>
      </div>

      {ask && (
        <ConfirmSheet
          title={
            ask.which === "agenda"
              ? ask.on
                ? "Accendere l'agenda?"
                : "Spegnere l'agenda?"
              : ask.on
                ? "Accendere le prenotazioni online?"
                : "Spegnere le prenotazioni online?"
          }
          confirmLabel={ask.on ? "Accendi" : "Spegni"}
          danger={!ask.on}
          busy={busy}
          onConfirm={() => apply(ask.which, ask.on)}
          onCancel={() => setAsk(null)}
        >
          {ask.which === "agenda" ? (
            ask.on ? (
              <p>Da adesso le prenotazioni segnate sono vere e le vedono i dipendenti con il permesso «Può gestire le prenotazioni». I clienti non vedono ancora niente.</p>
            ) : (
              <>
                <p>I dipendenti non vedranno più le prenotazioni.</p>
                {enabled && <p>Si spengono anche le prenotazioni online dei clienti.</p>}
              </>
            )
          ) : ask.on ? (
            <>
              <p>I clienti potranno chiedere un tavolo. Prima controlla:</p>
              <ul className="mt-2 space-y-2" data-testid="prima-di-accendere">
                <li className="flex gap-2">
                  <Mark done={hasVenueDevice} />
                  {hasVenueDevice ? "C'è il telefono dell'enoteca" : "Il telefono dell'enoteca (Dipendenti → «+ Telefono dell'enoteca»): da lì si risponde su WhatsApp"}
                </li>
                <li className="flex gap-2">
                  <Mark done={false} />
                  Gli avvisi accesi sul telefono che risponde (Prenotazioni → ⋯ → «Avvisi su questo telefono» → «Prova un avviso»)
                </li>
                <li className="flex gap-2">
                  <Mark done={false} />
                  Qualcuno che sa di dover rispondere alle richieste
                </li>
              </ul>
              <p className="mt-2">Dopo, metti i link su Instagram, Facebook e Google.</p>
              {!agendaEnabled && <p className="mt-2">Si accende anche l&apos;agenda.</p>}
            </>
          ) : (
            <p>I clienti non vedranno più la pagina per chiedere un tavolo. L&apos;agenda resta accesa, e alle richieste già arrivate puoi ancora rispondere.</p>
          )}
        </ConfirmSheet>
      )}
      {askTests && (
        <TestsDialog
          tests={askTests.tests}
          keepable={askTests.keepable}
          busy={busy}
          onDelete={() => apply(askTests.which, askTests.on, "delete")}
          onKeep={() => apply(askTests.which, askTests.on, "keep")}
          onCancel={() => setAskTests(null)}
        />
      )}
    </section>
  );
}

function Mark({ done }: { done: boolean }) {
  return (
    <span aria-hidden className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-success text-white" : "border-[1.5px] border-foreground-muted/60"}`}>
      {done ? "✓" : ""}
    </span>
  );
}

function Chevron() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-foreground-muted">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
