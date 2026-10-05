"use client";

import { useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { parseRecipients } from "@/lib/mail";
import { sendMailChunk } from "./actions";

const CHUNK = 50;
const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

export function MailForm({
  configured,
  limit,
  replyTo,
}: {
  configured: boolean;
  limit: number;
  replyTo: string | null;
}) {
  const [csv, setCsv] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const { recipients, skipped } = useMemo(() => parseRecipients(csv), [csv]);
  const overLimit = recipients.length > limit;
  const ready = configured && recipients.length > 0 && subject.trim() && body.trim();
  const sample = recipients[0];

  async function loadFile(file: File | undefined) {
    if (file) setCsv(await file.text());
  }

  function run(list: { email: string; header: string }[], label: string) {
    setError(null);
    startTransition(async () => {
      let sent = 0;
      for (let i = 0; i < list.length; i += CHUNK) {
        setProgress(`Invio in corso: ${sent} di ${list.length}…`);
        const res = await sendMailChunk({ recipients: list.slice(i, i + CHUNK), subject, body });
        if (!res.ok) {
          setError(`${res.error} Inviate ${sent} su ${list.length}: non rinviare chi l'ha già ricevuta.`);
          setProgress(null);
          return;
        }
        sent += res.data.sent;
      }
      setProgress(null);
      toast.showSuccess(`${label}: ${sent} ${sent === 1 ? "mail inviata" : "mail inviate"}`);
    });
  }

  function sendAll() {
    if (!window.confirm(`Inviare ${recipients.length} mail? L'invio non si può annullare.`)) return;
    run(recipients, "Fatto");
  }

  function sendTest() {
    if (!sample) return;
    run([{ email: testTo.trim(), header: sample.header }], "Prova");
  }

  return (
    <div className="flex flex-col gap-5">
      {!configured && (
        <p className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm text-foreground-muted">
          L&apos;invio non è ancora attivo: servono la chiave del servizio di posta e l&apos;indirizzo
          mittente (vedi docs/mail.md). Intanto puoi preparare la lista e vedere l&apos;anteprima.
        </p>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-medium">1. Destinatari</h2>
        <p className="mb-3 text-xs text-foreground-muted">
          File CSV con due colonne: <b>email</b> e <b>intestazione</b> (il saluto, ad esempio «Gentile
          Dott. Rossi,»). Oppure incolla le righe qui sotto.
        </p>
        <input type="file" accept=".csv,.txt" onChange={(e) => loadFile(e.target.files?.[0])} className="mb-3 text-sm" />
        <label className="sr-only" htmlFor="mail-csv">
          Elenco destinatari
        </label>
        <textarea
          id="mail-csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={5}
          placeholder={"email;intestazione\nmario@esempio.it;Gentile Dott. Rossi,"}
          className={`${field} font-mono`}
        />
        {csv.trim() && (
          <p className="mt-2 text-xs text-foreground-muted">
            {recipients.length} {recipients.length === 1 ? "destinatario valido" : "destinatari validi"}
            {skipped.length > 0 && ` · ${skipped.length} righe scartate (${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""})`}
          </p>
        )}
        {overLimit && (
          <p className="mt-2 text-sm text-accent">
            Sono più del limite giornaliero del piano gratuito ({limit} mail al giorno): l&apos;invio si
            fermerebbe a metà. Dividi la lista su più giorni.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium">2. Messaggio</h2>
        <label className="mb-1 block text-xs text-foreground-muted" htmlFor="mail-subject">
          Oggetto
        </label>
        <input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={`${field} mb-3`} />
        <label className="mb-1 block text-xs text-foreground-muted" htmlFor="mail-body">
          Testo (uguale per tutti, sotto l&apos;intestazione di ognuno)
        </label>
        <textarea id="mail-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={field} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium">3. Anteprima e invio</h2>
        {sample ? (
          <div className="mb-4 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">
            <p className="mb-2 text-xs text-foreground-muted">
              A: {sample.email} · Oggetto: {subject || "—"}
            </p>
            {(sample.header || "Buongiorno,") + "\n\n" + (body.trim() || "…")}
            <p className="mt-3 text-xs text-foreground-muted">
              Se non vuoi più ricevere queste mail, rispondi scrivendo «cancellami».
              {replyTo ? "" : " (Senza MAIL_REPLY_TO le risposte non arrivano a nessuno.)"}
            </p>
          </div>
        ) : (
          <p className="mb-4 text-sm text-foreground-muted">Carica i destinatari per vedere l&apos;anteprima.</p>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="Tuo indirizzo per la prova"
            aria-label="Indirizzo per la mail di prova"
            className={`${field} flex-1`}
          />
          <button
            type="button"
            disabled={!ready || !testTo.trim() || pending}
            onClick={sendTest}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Invia prova
          </button>
        </div>

        <button
          type="button"
          disabled={!ready || overLimit || pending}
          onClick={sendAll}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Invia a {recipients.length} {recipients.length === 1 ? "persona" : "persone"}
        </button>
        {progress && <p className="mt-2 text-sm text-foreground-muted">{progress}</p>}
        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      </section>
    </div>
  );
}
