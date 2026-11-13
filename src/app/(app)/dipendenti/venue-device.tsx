"use client";

// «Telefono enoteca» in Dipendenti: il pulsante per crearlo già pronto, il foglio «Come collegarlo»
// e la sua scheda, a parte rispetto alle persone (niente orari, ore, ferie né foto).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { runWithToast, useToast } from "@/components/toast";
import { Sheet } from "../gestione-menu/sheet";
import { createVenueDevice, deleteEmployee, setEmployeeBookingsAccess, setEmployeeMenuAccess, setEmployeeVenueDevice } from "./actions";
import { EmployeeCredentials } from "./employee-credentials";

export const VENUE_SWITCH_LABEL = "Accesso del telefono enoteca";
export const VENUE_SWITCH_HINT = "Per il telefono che resta in sala: niente orari né ore, solo prenotazioni";
const MENU_WARNING = "Chiunque abbia in mano il telefono dell'enoteca potrà cambiare prezzi e voci del menù. Accenderlo?";

export type VenueRow = { id: string; name: string; username: string | null; password: string | null; canEditMenu: boolean; canManageBookings: boolean; active: boolean };

export function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

// «+ Telefono dell'enoteca» (finché non c'è) oppure, piccolo, «Aggiungi un altro telefono».
export function VenueDeviceButton({ exists }: { exists: boolean }) {
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [askAnother, setAskAnother] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const create = (another: boolean) =>
    start(async () => {
      const r = await runWithToast(toast, () => createVenueDevice(another), "Telefono dell'enoteca pronto");
      setAskAnother(false);
      if (r) {
        setCreated(r);
        router.refresh();
      }
    });
  return (
    <>
      {exists ? (
        <div className="mb-5 flex justify-end">
          <button type="button" disabled={pending} onClick={() => setAskAnother(true)} className="min-h-10 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
            Aggiungi un altro telefono
          </button>
        </div>
      ) : (
        <div className="-mt-2 mb-5 flex flex-col gap-2 rounded-2xl bg-surface-2/60 px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2 text-sm text-foreground-muted">
            <PhoneIcon className="mt-0.5 shrink-0 text-accent-ink" />
            <span>Il telefono che resta in sala: un accesso solo per le prenotazioni, da cui partono i WhatsApp ai clienti.</span>
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => create(false)}
            className="min-h-11 shrink-0 rounded-full bg-surface px-4 text-sm font-semibold text-foreground ring-1 ring-inset ring-border hover:ring-accent disabled:opacity-60"
          >
            {pending ? "Un attimo…" : "+ Telefono dell'enoteca"}
          </button>
        </div>
      )}
      {askAnother && (
        <ConfirmSheet title="Aggiungere un altro telefono dell'enoteca?" confirmLabel="Sì, aggiungi" busy={pending} onConfirm={() => create(true)} onCancel={() => setAskAnother(false)}>
          <p>Serve solo se in sala ci sono due telefoni. Ognuno ha il suo accesso; i WhatsApp ai clienti partono dal telefono che li apre.</p>
        </ConfirmSheet>
      )}
      {created && <HowToConnect username={created.username} password={created.password} onClose={() => setCreated(null)} />}
    </>
  );
}

// «Come collegarlo»: accesso con i pulsanti per copiare e tre passi.
export function HowToConnect({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  const toast = useToast();
  const copy = (what: string, value: string) =>
    navigator.clipboard
      ?.writeText(value)
      .then(() => toast.showSuccess(`${what} copiato`))
      .catch(() => toast.showError("Non riesco a copiare: scrivilo a mano."));
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
        <p className="font-mono text-base font-semibold text-foreground [overflow-wrap:anywhere]" data-testid={`collega-${label.toLowerCase()}`}>
          {value}
        </p>
      </div>
      <button type="button" onClick={() => copy(label, value)} className="min-h-10 shrink-0 rounded-full px-3.5 text-xs font-semibold text-foreground ring-1 ring-inset ring-border hover:ring-accent">
        Copia
      </button>
    </div>
  );
  return (
    <Sheet title="Come collegarlo" onClose={onClose}>
      <div className="space-y-4" data-testid="come-collegarlo">
        <p className="text-sm text-foreground">Il telefono dell&apos;enoteca è pronto. Ecco con che cosa entra:</p>
        <div className="divide-y divide-border rounded-xl ring-1 ring-inset ring-border">
          {row("Username", username)}
          {row("Password", password)}
        </div>
        <ol className="space-y-2.5 text-sm text-foreground">
          {[
            "Sul telefono della sala apri orari-turni.vercel.app ed entra con username e password.",
            "Aggiungilo alla schermata Home (su iPhone: Condividi → «Aggiungi alla schermata Home») e aprilo da lì.",
            "Apri Prenotazioni, tocca la campanella e accendi gli avvisi: arrivano le nuove richieste e i WhatsApp da mandare.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
        <p className="rounded-xl bg-gold/10 px-3 py-2.5 text-sm text-foreground">
          <strong>Metti un codice di sblocco sul telefono:</strong> chi lo prende in mano vede le prenotazioni dei clienti.
        </p>
        <p className="text-sm text-foreground-muted">Se il telefono si perde: cambia la password qui, nella sua scheda («Nuova password»). Il vecchio accesso smette subito di funzionare.</p>
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
          Fatto
        </button>
      </div>
    </Sheet>
  );
}

function Toggle({ on, label, hint, onToggle, disabled }: { on: boolean; label: string; hint: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-foreground-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"}`}
      >
        <span aria-hidden className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

// La scheda del telefono enoteca: mai mescolata alle persone.
export function VenueDeviceCard({ device }: { device: VenueRow }) {
  const [pending, start] = useTransition();
  const [askMenu, setAskMenu] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      const r = await runWithToast(toast, fn as never, ok);
      if (r !== null) router.refresh();
    });
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-surface ${device.active ? "" : "opacity-70"}`} data-testid="telefono-enoteca">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-ink">
          <PhoneIcon />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{device.name}</p>
          <p className="text-xs text-foreground-muted">Telefono enoteca · solo prenotazioni</p>
        </div>
      </div>
      <EmployeeCredentials employeeId={device.id} username={device.username} password={device.password} />
      <p className="border-t border-border px-4 py-2 text-[11px] text-foreground-muted">Se il telefono si perde: «Nuova password» qui sopra, e il vecchio accesso smette di funzionare.</p>
      <Toggle
        on={device.canManageBookings}
        label="Può gestire le prenotazioni"
        hint="Vede le richieste, segna i tavoli, manda i WhatsApp ai clienti"
        disabled={pending}
        onToggle={() => run(() => setEmployeeBookingsAccess(device.id, !device.canManageBookings), device.canManageBookings ? "Prenotazioni spente su questo telefono" : "Prenotazioni accese su questo telefono")}
      />
      <Toggle
        on={device.canEditMenu}
        label="Può modificare il menù"
        hint="Per esempio per segnare «esaurito» durante il servizio"
        disabled={pending}
        onToggle={() => (device.canEditMenu ? run(() => setEmployeeMenuAccess(device.id, false), "Il telefono non può più modificare il menù") : setAskMenu(true))}
      />
      <Toggle
        on
        label={VENUE_SWITCH_LABEL}
        hint={`${VENUE_SWITCH_HINT}. Spento torna un dipendente normale.`}
        disabled={pending}
        onToggle={() => run(() => setEmployeeVenueDevice(device.id, false), "Torna un dipendente normale")}
      />
      <div className="flex justify-end border-t border-border px-4 py-2.5">
        <button type="button" disabled={pending} onClick={() => setAskDelete(true)} className="min-h-10 rounded-full px-3 text-xs font-medium text-danger hover:bg-danger-bg">
          Elimina il telefono
        </button>
      </div>
      {askMenu && (
        <ConfirmSheet title={MENU_WARNING} confirmLabel="Sì, accendi" cancelLabel="Annulla" busy={pending} onConfirm={() => { setAskMenu(false); run(() => setEmployeeMenuAccess(device.id, true), "Il telefono può modificare il menù"); }} onCancel={() => setAskMenu(false)}>
          <p>Si spegne con lo stesso interruttore, quando vuoi.</p>
        </ConfirmSheet>
      )}
      {askDelete && (
        <ConfirmSheet title="Eliminare il telefono dell'enoteca?" confirmLabel="Elimina" danger busy={pending} onConfirm={() => { setAskDelete(false); run(() => deleteEmployee(device.id), "Telefono eliminato"); }} onCancel={() => setAskDelete(false)}>
          <p>Il telefono non entra più. Le prenotazioni segnate da lì restano, con il nome di chi le ha segnate.</p>
        </ConfirmSheet>
      )}
    </div>
  );
}
