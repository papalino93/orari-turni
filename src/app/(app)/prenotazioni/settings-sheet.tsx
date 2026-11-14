"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runWithToast, showActionError, useToast } from "@/components/toast";
import { Field, Sheet, inputClass } from "../gestione-menu/sheet";
import { pausedNow, type BookingSettings } from "@/lib/booking/rules";
import { DEFAULT_CAPACITY } from "@/lib/booking/agenda";
import { removePushDevice, saveSettings, sendTestPushToDevices } from "./actions";
import { clock } from "./format";
import type { PushDevice } from "@/lib/booking/push";
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
  venueExists = false,
  devices = [],
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
  // C'è già un «Telefono enoteca» collegato (Dipendenti → «+ Telefono dell'enoteca»)?
  venueExists?: boolean;
  // «Telefoni che ricevono gli avvisi»: chi, che apparecchio, quando ha ricevuto l'ultimo; «Togli».
  devices?: PushDevice[];
  onClose: () => void;
}) {
  const paused = pausedNow(settings);
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(settings.step);
  const [senders, setSenders] = useState(settings.whatsappSenders);

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
          whatsappSenders: senders,
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
                  ? "Chi ha il permesso vede l'agenda e segna le prenotazioni al telefono. Sono prenotazioni vere."
                  : "Solo tu la vedi, per provarla: quello che segni è «di prova» e non conta."}
              </p>
            </div>
            <Switch on={settings.agendaEnabled} disabled={busy} label="Agenda accesa" onToggle={() => onToggle("agenda")} />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Prenotazioni online dei clienti {settings.enabled ? "accese" : "spente"}</p>
              <p className="text-xs text-foreground-muted">
                {settings.enabled
                  ? "I clienti chiedono un tavolo dal menù, dagli eventi e dal link per Google. Spegnendole l'agenda resta com'è."
                  : "I clienti non vedono la pagina per chiedere un tavolo: puoi provarla solo tu."}
              </p>
            </div>
            <Switch on={settings.enabled} disabled={busy} label="Prenotazioni online dei clienti" onToggle={() => onToggle("online")} />
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
            {/* Vuoto = il valore di partenza (scritto in grigio), invece di uno «0» che sembrava «nessuno». */}
            <Field label="Di solito pieni oltre (persone)" hint={`Quante persone ci stanno in una sera: serve per colorare i giorni dell'agenda. Se lo lasci vuoto, ${DEFAULT_CAPACITY}.`}>
              <input name="capacityHint" type="number" inputMode="numeric" min={0} max={500} defaultValue={settings.capacityHint || ""} placeholder={String(DEFAULT_CAPACITY)} className={inputClass} />
            </Field>
          </div>

          <Field label="Per stasera online fino alle" hint="Es. 19:00: dopo, chi vuole un tavolo per la sera stessa trova «Per stasera chiamaci». Lascia vuoto per nessun limite.">
            <input name="todayUntil" type="time" defaultValue={settings.todayUntil} className={`${inputClass} w-40!`} />
          </Field>

          <Field label="Email per gli avvisi (facoltativa)" hint="Ti arriva un'email per ogni nuova richiesta.">
            <input name="notifyEmail" type="email" autoComplete="email" defaultValue={settings.notifyEmail} placeholder="nome@esempio.it" className={inputClass} />
          </Field>
          {!mailReady && <p className="-mt-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-foreground">L&apos;invio delle email non è ancora collegato: per ora gli avvisi arrivano solo sul telefono.</p>}

          <fieldset className="space-y-2" data-testid="chi-manda-whatsapp">
            <legend className="mb-1 text-sm font-semibold text-foreground">Chi manda i WhatsApp ai clienti</legend>
            {(
              [
                ["venue", "Solo il telefono enoteca (consigliato)", "Il cliente riceve sempre i messaggi dal numero dell'enoteca. Tu li vedi e, se serve, puoi mandarli lo stesso dal tuo WhatsApp."],
                ["all", "Anche titolare e consulente", "Il primo che tocca «Apri WhatsApp» la prende: gli altri vedono «In invio da…» e non la mandano due volte."],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset ${senders === v ? "bg-accent/[0.06] ring-accent/50" : "ring-border"}`}>
                <input type="radio" name="whatsappSenders" value={v} checked={senders === v} onChange={() => setSenders(v)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
                <span className="text-sm text-foreground">
                  {label}
                  <span className="block text-xs text-foreground-muted">{hint}</span>
                </span>
              </label>
            ))}
            {senders === "venue" && !venueExists && (
              <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-foreground">Non c&apos;è ancora un telefono enoteca collegato: finché non lo aggiungi (Dipendenti → «+ Telefono dell&apos;enoteca»), i WhatsApp li mandate tu e il consulente.</p>
            )}
          </fieldset>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="min-h-11 rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
              {saving ? "Salvo…" : "Salva"}
            </button>
          </div>
        </form>

        <PushDevices devices={devices} />

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
          {!settings.enabled && <p className="text-xs text-foreground-muted">Prima accendi le prenotazioni online: da spente, chi tocca il link trova solo «Prenota chiamandoci».</p>}
        </section>

        <section className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Instagram e Facebook</h3>
          <p className="text-sm text-foreground-muted">
            Ogni link ha il suo segno: nelle richieste vedi «da Instagram» o «da Facebook» e capisci da dove arrivano i clienti.
          </p>
          {SOCIAL_LINKS.map((s) => {
            // Link brevi: /ig e /fb (portano al modulo con la provenienza giusta).
            const link = googleLink.replace(/\/g$/, s.source === "instagram" ? "/ig" : "/fb");
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

// «Telefoni che ricevono gli avvisi»: un telefono perso o passato a un altro si toglie da qui.
function PushDevices({ devices }: { devices: PushDevice[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const list = devices.filter((d) => !gone.includes(d.id));
  async function remove(d: PushDevice) {
    setBusy(d.id);
    const ok = await runWithToast(toast, () => removePushDevice(d.id), `Avvisi tolti: ${d.kind} di ${d.who}`);
    setBusy(null);
    if (ok !== null) {
      setGone((g) => [...g, d.id]);
      router.refresh();
    }
  }
  // «Prova»: un avviso a quel telefono (o «Prova su tutti»). Se il sito lo consegna ma sul telefono non
  // compare, il problema è lì: permesso delle notifiche, «Non disturbare», o (iPhone) sito non aperto dall'icona.
  async function test(target: string, label: string) {
    setBusy(`t:${target}`);
    try {
      const res = await sendTestPushToDevices(target);
      if (!res.ok) return toast.showError(res.error);
      const { sent, failed, total } = res.data;
      if (sent === total)
        toast.showSuccess(`Avviso di prova mandato ${target === "all" ? `a ${total === 1 ? "1 telefono" : `${total} telefoni`}` : `a ${label}`}: deve arrivare entro qualche secondo.`);
      else if (sent > 0) toast.showError(`Arrivato a ${sent} su ${total}. Sugli altri gli avvisi vanno riaccesi da quel telefono (⋯ → «Avvisi su questo telefono»).`);
      else toast.showError(`Non è partito${failed ? "" : " niente"}: su ${target === "all" ? "quei telefoni" : "quel telefono"} gli avvisi vanno riaccesi (⋯ → «Avvisi su questo telefono» → «Attiva gli avvisi»).`);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" data-testid="telefoni-avvisi" data-unsaved-ignore>
      <div>
        <h3 className="text-sm font-semibold text-foreground">Telefoni che ricevono gli avvisi</h3>
        <p className="mt-0.5 text-xs text-foreground-muted">Se un telefono si perde o passa a un altro, toglilo da qui. Cambiare la password di un accesso li toglie da sola.</p>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nessun telefono riceve gli avvisi: si accendono da ⋯ → «Avvisi su questo telefono».</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl ring-1 ring-inset ring-border">
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="telefono-avvisi">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground-muted">
                {d.kind === "Computer" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4.5" width="18" height="12" rx="2" />
                    <path d="M8 20h8M12 16.5V20" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                    <path d="M10.5 18.5h3" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {d.who}{" "}
                  {d.venue && <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">sala</span>}
                </span>
                <span className="block text-xs text-foreground-muted">
                  {d.kind} · {d.lastUsed ? `ultimo avviso ${whenText(d.lastUsed)}` : `attivato ${whenText(d.createdAt)}, ancora nessun avviso`}
                </span>
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => test(d.id, `${d.who} (${d.kind})`)}
                aria-label={`Prova un avviso: ${d.kind} di ${d.who}`}
                className="min-h-10 shrink-0 rounded-full px-3.5 text-sm font-medium text-foreground ring-1 ring-inset ring-border hover:ring-accent disabled:opacity-60"
              >
                {busy === `t:${d.id}` ? "…" : "Prova"}
              </button>
              <button
                type="button"
                disabled={busy === d.id}
                onClick={() => remove(d)}
                aria-label={`Togli gli avvisi: ${d.kind} di ${d.who}`}
                className="min-h-10 shrink-0 rounded-full px-3.5 text-sm font-medium text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger-bg disabled:opacity-60"
              >
                {busy === d.id ? "…" : "Togli"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 1 && (
        <button type="button" disabled={busy !== null} onClick={() => test("all", "")} className="min-h-10 w-full rounded-full text-sm font-medium text-accent-ink ring-1 ring-inset ring-border hover:ring-accent disabled:opacity-60">
          {busy === "t:all" ? "Mando…" : "Prova su tutti i telefoni"}
        </button>
      )}
      <p className="text-xs text-foreground-muted">
        Se «Prova» dice che l&apos;avviso è partito ma sul telefono non compare: sull&apos;iPhone il sito va aperto dall&apos;icona sulla schermata Home; controlla poi che le notifiche del sito siano permesse e che non sia attivo «Non disturbare».
      </p>
    </section>
  );
}

const DAY_FMT = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" });
// «oggi alle 20:14», «ieri alle 19:02», «il 3 nov».
function whenText(ms: number): string {
  const d = new Date(ms);
  const key = (x: Date) => x.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  const now = new Date();
  if (key(d) === key(now)) return `oggi alle ${clock(ms)}`;
  if (key(d) === key(new Date(now.getTime() - 86400000))) return `ieri alle ${clock(ms)}`;
  return `il ${DAY_FMT.format(d)}`;
}
