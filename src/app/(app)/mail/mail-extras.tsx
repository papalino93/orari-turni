"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consentShort, OPTOUT_LABEL } from "@/lib/mail-rubrica";
import { markOptOutAction, saveMailSenderAction } from "./actions";
import { sendPeople } from "./rubrica-actions";

const field =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-base text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none sm:text-sm";
const card = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
const ghostBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40";

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

type SendRow = { id: string; at: string; by: string; subject: string; recipients: number; sent: number; failed: number; excluded: number; status: string; basis: string | null };

const STATUS: Record<string, { label: string; tone: string }> = {
  INVIATA: { label: "Inviata", tone: "bg-success-bg text-success" },
  PARZIALE: { label: "Non tutte partite", tone: "bg-accent/15 text-accent-ink" },
  NON_PARTITA: { label: "Non partita", tone: "bg-danger-bg text-danger" },
  IN_CORSO: { label: "Interrotta o in corso", tone: "bg-surface-2 text-foreground-muted ring-1 ring-inset ring-border" },
};

// «Invii recenti»: chi ha mandato cosa, quando, a quanti, com'è andata (ultimi 20).
export function MailHistory({ sends }: { sends: SendRow[] }) {
  return (
    <section className={card} aria-labelledby="mail-history">
      <h2 id="mail-history" className="text-base font-semibold">
        Invii recenti
      </h2>
      {sends.length === 0 ? (
        <p className="mt-1 text-sm text-foreground-muted">Ancora nessun invio. Qui compariranno gli ultimi 20, con chi li ha mandati.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {sends.map((s) => {
            const st = STATUS[s.status] ?? STATUS.IN_CORSO;
            return (
              <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 break-words text-sm font-medium text-foreground">{s.subject}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{st.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  {dateFmt.format(new Date(s.at))} · {s.by} · partite {s.sent} su {s.recipients}
                  {s.failed > 0 && ` · ${s.failed} non partite`}
                  {s.excluded > 0 && ` · ${s.excluded} escluse perché cancellate`}
                  {s.basis && ` · motivo: ${consentShort(s.basis).toLowerCase()}`}
                </p>
                {s.basis && <SendPeople id={s.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const SOURCE = OPTOUT_LABEL;

const PEOPLE_STATUS: Record<string, string> = { sent: "", failed: "non partita", excluded: "esclusa: si era cancellata" };

// «A chi è andata»: l'elenco si legge quando lo si apre (gli invii fatti prima della rubrica non ce l'hanno).
function SendPeople({ id }: { id: string }) {
  const [people, setPeople] = useState<{ email: string; name: string; status: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <details
      className="mt-1 text-xs"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || people || pending) return;
        start(async () => {
          try {
            const res = await sendPeople({ id });
            if (res.ok) setPeople(res.data);
            else setError(res.error);
          } catch {
            setError("Non riesco a leggere l'elenco: controlla la connessione e riprova.");
          }
        });
      }}
    >
      <summary className="inline-flex min-h-9 cursor-pointer items-center text-accent-ink">A chi è andata</summary>
      {error ? (
        <p className="mt-1 text-danger">{error}</p>
      ) : !people ? (
        <p className="mt-1 text-foreground-muted">Un attimo…</p>
      ) : (
        <ul className="mt-1 max-h-64 divide-y divide-border overflow-y-auto rounded-xl bg-surface-2 px-3">
          {people.map((p) => (
            <li key={p.email} className="flex flex-wrap justify-between gap-x-3 py-2">
              <span className="min-w-0 break-all text-foreground">
                {p.name ? `${p.name} · ` : ""}
                {p.email}
              </span>
              {PEOPLE_STATUS[p.status] && <span className={p.status === "failed" ? "text-danger" : "text-foreground-muted"}>{PEOPLE_STATUS[p.status]}</span>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

// Indirizzi che non vogliono più ricevere le mail, e «Segna come cancellato» per chi ha risposto «cancellami».
export function OptOutBox({ optOuts }: { optOuts: { email: string; at: string; source: string }[] }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const res = await markOptOutAction({ email });
        if (res.ok) {
          setMsg({ ok: true, text: `${res.data.email} non riceverà più le mail della lista.` });
          setEmail("");
          router.refresh();
        } else setMsg({ ok: false, text: res.error });
      } catch {
        setMsg({ ok: false, text: "Non sono riuscito a salvare: controlla la connessione e riprova." });
      }
    });
  }
  return (
    <section className={card} aria-labelledby="mail-optout">
      <h2 id="mail-optout" className="text-base font-semibold">
        Chi non vuole più le nostre email
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Chi tocca «Non voglio più ricevere queste email» finisce qui da solo e viene tolto da ogni invio. Se qualcuno ti
        risponde «cancellami», segnalo tu: qui o dalla sua scheda nella Rubrica.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="optout-email" className="sr-only">
          Indirizzo da segnare come cancellato
        </label>
        <input
          id="optout-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="indirizzo@esempio.it"
          className={`${field} flex-1`}
        />
        <button type="submit" disabled={pending || !email.trim()} className={ghostBtn}>
          Segna come cancellato
        </button>
      </form>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-foreground" : "text-danger"}`} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      )}
      {optOuts.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer py-2 text-accent-ink">
            {optOuts.length} {optOuts.length === 1 ? "indirizzo cancellato" : "indirizzi cancellati"}
          </summary>
          <ul className="mt-1 max-h-64 divide-y divide-border overflow-y-auto rounded-xl bg-surface-2 px-3">
            {optOuts.map((o) => (
              <li key={o.email} className="flex flex-wrap justify-between gap-x-3 py-2 text-xs">
                <span className="min-w-0 break-all text-foreground">{o.email}</span>
                <span className="text-foreground-muted">
                  {dayFmt.format(new Date(o.at))}, {SOURCE[o.source] ?? o.source}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

type Sender = { company: string; vat: string; privacyUrl: string; testEmail: string };

// «Dati del mittente»: vanno nel piè di pagina di ogni mail (la legge chiede di sapere chi scrive).
export function SenderBox({ sender, address, from, replyTo }: { sender: Sender; address: string; from: string | null; replyTo: string | null }) {
  const [v, setV] = useState(sender);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof Sender) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const res = await saveMailSenderAction(v);
        setMsg(res.ok ? { ok: true, text: "Salvato: da ora è nel piè di pagina delle mail." } : { ok: false, text: res.error });
        if (res.ok) router.refresh();
      } catch {
        setMsg({ ok: false, text: "Non sono riuscito a salvare: controlla la connessione e riprova." });
      }
    });
  }
  const missing = !sender.company.trim() || !sender.vat.trim();
  return (
    <details className={card} open={missing}>
      <summary className="cursor-pointer text-base font-semibold">
        Dati del mittente
        {missing && <span className="ml-2 align-middle text-xs font-normal text-accent-ink">da completare</span>}
      </summary>
      <p className="mt-1 text-sm text-foreground-muted">
        Vanno in fondo a ogni mail, insieme a nome e indirizzo del locale ({address || "da scrivere in Gestione menù → Orari e contatti"}).
      </p>
      {from && (
        <dl className="mt-3 grid gap-x-3 gap-y-1 rounded-xl bg-surface-2/60 px-4 py-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-foreground-muted">Le mail partono da</dt>
          <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">{from}</dd>
          {replyTo && (
            <>
              <dt className="text-foreground-muted">Le risposte arrivano a</dt>
              <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">{replyTo}</dd>
            </>
          )}
        </dl>
      )}
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sender-company" className="mb-1 block text-sm font-medium">
            Ragione sociale
          </label>
          <input id="sender-company" value={v.company} onChange={set("company")} maxLength={120} placeholder="Es. Rossi Vini S.r.l." className={field} />
        </div>
        <div>
          <label htmlFor="sender-vat" className="mb-1 block text-sm font-medium">
            Partita IVA
          </label>
          <input id="sender-vat" value={v.vat} onChange={set("vat")} maxLength={30} inputMode="numeric" placeholder="Es. 01234567890" className={field} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="sender-privacy" className="mb-1 block text-sm font-medium">
            Link all&apos;informativa privacy <span className="font-normal text-foreground-muted">(facoltativo)</span>
          </label>
          <input id="sender-privacy" type="url" value={v.privacyUrl} onChange={set("privacyUrl")} placeholder="https://…" className={field} />
          <p className="mt-1 text-xs text-foreground-muted">Se lo lasci vuoto, il link porta a una breve informativa sul sito, con i dati qui sopra.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className={ghostBtn}>
            {pending ? "Salvo…" : "Salva i dati del mittente"}
          </button>
          {msg && (
            <p className={`text-sm ${msg.ok ? "text-foreground" : "text-danger"}`} role={msg.ok ? "status" : "alert"}>
              {msg.text}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}
