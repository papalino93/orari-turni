"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runWithToast, useToast } from "@/components/toast";
import { Field, Sheet, inputClass } from "../gestione-menu/sheet";
import { pausedNow, type BookingSettings } from "@/lib/booking/rules";
import { saveSettings } from "./actions";
import { clock } from "./format";
import { Switch } from "./device";

const selectClass = `${inputClass} appearance-none`;

// Impostazioni del titolare: orari prenotabili, limiti, avvisi, link per Google.
export function SettingsSheet({
  settings,
  mailReady,
  googleLink,
  onToggle,
  onReopen,
  busy = false,
  onClose,
}: {
  settings: BookingSettings;
  mailReady: boolean;
  googleLink: string;
  // Tocco su uno dei due interruttori: la conferma (e la domanda sulle prove) la fa la pagina.
  onToggle: (which: "agenda" | "online") => void;
  // «Riapri ora» dopo la pausa automatica.
  onReopen: () => void;
  busy?: boolean;
  onClose: () => void;
}) {
  const paused = pausedNow(settings);
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(settings.step);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const ok = await runWithToast(
      toast,
      () =>
        saveSettings({
          firstTime: String(f.get("firstTime") ?? ""),
          lastBeforeClose: Number(f.get("lastBeforeClose")),
          step,
          maxPeople: Number(f.get("maxPeople")),
          leadMinutes: Number(f.get("leadMinutes")),
          daysAhead: Number(f.get("daysAhead")),
          notifyEmail: String(f.get("notifyEmail") ?? ""),
          capacityHint: Number(f.get("capacityHint") || 0),
          todayUntil: String(f.get("todayUntil") ?? ""),
        }),
      "Impostazioni salvate",
    );
    setSaving(false);
    if (ok !== null) {
      router.refresh();
      onClose();
    }
  }

  function copy(link: string) {
    navigator.clipboard
      ?.writeText(link)
      .then(() => toast.showSuccess("Link copiato"))
      .catch(() => toast.showError("Non riesco a copiare: tieni premuto sul link e copialo a mano."));
  }

  const leadOptions = [0, 30, 60, 90, 120, 180, 240];
  const closeOptions = [0, 30, 60, 90, 120];

  return (
    <Sheet title="Impostazioni delle prenotazioni" onClose={onClose}>
      <div className="space-y-5">
        <div data-unsaved-ignore className="divide-y divide-border rounded-xl border border-border">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Agenda {settings.agendaEnabled ? "accesa" : "spenta"}</p>
              <p className="text-xs text-foreground-muted">
                {settings.agendaEnabled
                  ? "Chi ha il permesso segna le prenotazioni al telefono e vede Agenda, Stasera e Prossimi giorni. Sono prenotazioni vere."
                  : "Solo tu la vedi, per provarla: quello che segni è «di prova» e non conta."}
              </p>
            </div>
            <Switch on={settings.agendaEnabled} disabled={busy} label="Agenda accesa" onToggle={() => onToggle("agenda")} />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Richieste online dai clienti {settings.enabled ? "accese" : "spente"}</p>
              <p className="text-xs text-foreground-muted">
                {settings.enabled
                  ? "I clienti chiedono un tavolo dal menù, dagli eventi e dal link per Google. Spegnendole l'agenda resta com'è."
                  : "I clienti non vedono la pagina per chiedere un tavolo: puoi provarla solo tu."}
              </p>
            </div>
            <Switch on={settings.enabled} disabled={busy} label="Richieste online dai clienti accese" onToggle={() => onToggle("online")} />
          </div>
          {paused && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-gold/10 px-4 py-3">
              <p className="min-w-0 text-sm text-foreground">
                <span className="font-semibold">Pausa automatica fino alle {clock(paused.getTime())}</span>
                <span className="block text-xs text-foreground-muted">Sono arrivate troppe richieste in pochi minuti: il modulo dice ai clienti di chiamare.</span>
              </p>
              <button type="button" disabled={busy} onClick={onReopen} className="min-h-10 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
                Riapri ora
              </button>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prima ora prenotabile" hint="Prima di quest'ora non si prenota.">
              <input name="firstTime" type="time" required defaultValue={settings.firstTime} className={inputClass} />
            </Field>
            <Field label="Ultima richiesta" hint="L'ultimo orario prenotabile, prima della chiusura.">
              <select name="lastBeforeClose" defaultValue={String(settings.lastBeforeClose)} className={selectClass}>
                {[...new Set([...closeOptions, settings.lastBeforeClose])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "fino alla chiusura" : `${m} min prima`}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-foreground-muted">Orari proposti ogni</span>
            <div role="radiogroup" aria-label="Orari proposti ogni" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
              {[15, 30, 60].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={step === s}
                  onClick={() => setStep(s)}
                  className={`min-h-10 rounded-lg text-sm font-medium ${step === s ? "bg-surface text-foreground shadow-sm ring-1 ring-accent" : "text-foreground-muted hover:text-foreground"}`}
                >
                  {s === 60 ? "1 ora" : `${s} minuti`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Persone massime" hint="Oltre, il cliente vede «chiamaci».">
              <input name="maxPeople" type="number" inputMode="numeric" min={1} max={40} required defaultValue={settings.maxPeople} className={inputClass} />
            </Field>
            <Field label="Giorni in avanti" hint="Fin quando si può chiedere.">
              <input name="daysAhead" type="number" inputMode="numeric" min={1} max={180} required defaultValue={settings.daysAhead} className={inputClass} />
            </Field>
            <Field label="Anticipo minimo" hint="Es. 1 ora: alle 19 si può chiedere un tavolo dalle 20 in poi.">
              <select name="leadMinutes" defaultValue={String(settings.leadMinutes)} className={selectClass}>
                {[...new Set([...leadOptions, settings.leadMinutes])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "nessuno" : m < 60 ? `${m} minuti` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} ${m === 60 ? "ora" : "ore"}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Di solito pieni oltre" hint="Quante persone ci stanno in una sera: lo vedi accanto a ogni giorno. Lascia 0 se non ti serve.">
              <input name="capacityHint" type="number" inputMode="numeric" min={0} max={500} defaultValue={settings.capacityHint} className={inputClass} />
            </Field>
          </div>

          <Field label="Per stasera online fino alle" hint="Es. 19:00: dopo, chi vuole un tavolo per la sera stessa trova «Per stasera chiamaci». Lascia vuoto per nessun limite.">
            <input name="todayUntil" type="time" defaultValue={settings.todayUntil} className={`${inputClass} w-40!`} />
          </Field>

          <Field label="Email per gli avvisi (facoltativa)" hint="Ti arriva un'email per ogni nuova richiesta.">
            <input name="notifyEmail" type="email" autoComplete="email" defaultValue={settings.notifyEmail} placeholder="nome@esempio.it" className={inputClass} />
          </Field>
          {!mailReady && <p className="-mt-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-foreground">L&apos;invio delle email non è ancora collegato: per ora gli avvisi arrivano solo sul telefono.</p>}

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="min-h-11 rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
              {saving ? "Salvo…" : "Salva"}
            </button>
          </div>
        </form>

        <section className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Il pulsante «Prenota» su Google</h3>
          {/* Sul telefono il link va a capo dentro il riquadro (prima usciva dal bordo), «Copia» sotto. */}
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-foreground [overflow-wrap:anywhere] select-all">{googleLink}</code>
            <button type="button" onClick={() => copy(googleLink)} className="min-h-11 shrink-0 self-end rounded-full border border-border px-4 text-sm font-medium text-foreground hover:border-accent sm:self-auto">
              Copia
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground-muted">
            <li>Cerca «L&apos;Angolo del Vino» su Google con il tuo account e tocca «Modifica profilo».</li>
            <li>Apri «Prenotazioni» (a volte si chiama «Link per le prenotazioni»).</li>
            <li>Tocca «Aggiungi link», incolla questo link e salva.</li>
            <li>Google può metterci qualche giorno. Poi cerca il locale dal telefono e prova «Prenota».</li>
          </ol>
          {!settings.enabled && <p className="text-xs text-foreground-muted">Prima accendi le prenotazioni online: da spente, chi tocca il link trova una pagina che non c&apos;è.</p>}
        </section>

        <section className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Instagram e Facebook</h3>
          <p className="text-sm text-foreground-muted">
            Ogni link ha il suo segno: nelle richieste vedi «da Instagram» o «da Facebook» e capisci da dove arrivano i clienti.
          </p>
          {SOCIAL_LINKS.map((s) => {
            const link = googleLink.replace("da=google", `da=${s.source}`);
            return (
              <div key={s.source} className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-foreground [overflow-wrap:anywhere] select-all">{link}</code>
                  <button type="button" onClick={() => copy(link)} className="min-h-11 shrink-0 self-end rounded-full border border-border px-4 text-sm font-medium text-foreground hover:border-accent sm:self-auto">
                    Copia
                  </button>
                </div>
                <p className="text-xs text-foreground-muted">{s.hint}</p>
              </div>
            );
          })}
        </section>
      </div>
    </Sheet>
  );
}

const SOCIAL_LINKS = [
  { source: "instagram", title: "Link nella bio di Instagram", hint: "Profilo → «Modifica profilo» → «Link» → «Aggiungi link esterno»: incolla, come titolo «Prenota un tavolo»." },
  { source: "facebook", title: "Pulsante «Prenota» su Facebook", hint: "Pagina → «Modifica» sul pulsante blu → «Prenota ora» → «Link a sito web»: incolla e salva." },
];
