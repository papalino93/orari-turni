"use client";

import { useMemo, useState, useTransition } from "react";
import { guessColumns, parseRecipients, tableToRecipients, type Recipient } from "@/lib/mail";
import { readXlsx, type Sheet } from "@/lib/xlsx";
import { sendMailChunk } from "./actions";

const CHUNK = 50;
const GREETING = "Buongiorno,";
const SAMPLE_CSV = "﻿email;intestazione\nmario.rossi@esempio.it;Gentile Dott. Rossi,\nlaura.bianchi@esempio.it;Cara Laura,\n";

const field =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-base text-foreground placeholder:text-foreground-muted/60 focus:border-accent focus:outline-none sm:text-sm";
const card = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40";
const ghostBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40";

const STEPS = ["Destinatari", "Messaggio", "Invio"];

export function MailForm({
  configured,
  limit,
  from,
  replyTo,
}: {
  configured: boolean;
  limit: number;
  from: string | null;
  replyTo: string | null;
}) {
  const [step, setStep] = useState(0);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [template, setTemplate] = useState("");
  const [groups, setGroups] = useState<string[] | null>(null);
  const [onlyDocumented, setOnlyDocumented] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [previewAt, setPreviewAt] = useState(0);
  const [testTo, setTestTo] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const cols = useMemo(() => (sheet ? guessColumns(sheet.headers) : null), [sheet]);
  const groupValues = useMemo(
    () => (sheet && cols?.group ? [...new Set(sheet.rows.map((r) => r[cols.group]).filter(Boolean))] : []),
    [sheet, cols],
  );
  const { recipients, skipped } = useMemo(
    () => (sheet ? tableToRecipients(sheet.rows, sheet.headers, { template, groups, onlyDocumented }) : parseRecipients(csv)),
    [sheet, template, groups, onlyDocumented, csv],
  );
  const hasList = Boolean(sheet) || csv.trim().length > 0;
  const excludedByBasis =
    sheet && cols?.basis && onlyDocumented
      ? tableToRecipients(sheet.rows, sheet.headers, { template, groups, onlyDocumented: false }).recipients.length - recipients.length
      : 0;
  const overLimit = recipients.length > limit;
  const sample: Recipient | undefined = recipients[Math.min(previewAt, Math.max(recipients.length - 1, 0))];
  const canSend = configured && recipients.length > 0 && !overLimit && consent && !pending;

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    if (/\.xlsx$/i.test(file.name)) {
      try {
        const parsed = readXlsx(await file.arrayBuffer());
        const g = guessColumns(parsed.headers);
        setSheet(parsed);
        setCsv("");
        setGroups(null);
        setOnlyDocumented(true);
        setTemplate(g.name ? `Spett.le {${g.name}},` : "");
        setFileName(file.name);
      } catch (e) {
        setNotice({ kind: "error", text: e instanceof Error ? e.message : "Non riesco a leggere questo file." });
      }
      return;
    }
    setSheet(null);
    setCsv(await file.text());
    setFileName(file.name);
  }

  function reset() {
    setStep(0);
    setCsv("");
    setSheet(null);
    setFileName("");
    setSubject("");
    setBody("");
    setConsent(false);
    setConfirming(false);
    setDone(null);
    setNotice(null);
  }

  function run(list: Recipient[], onFinish: (sent: number) => void) {
    setNotice(null);
    startTransition(async () => {
      let sent = 0;
      for (let i = 0; i < list.length; i += CHUNK) {
        setProgress({ sent, total: list.length });
        const res = await sendMailChunk({ recipients: list.slice(i, i + CHUNK), subject, body });
        if (!res.ok) {
          setProgress(null);
          setConfirming(false);
          setNotice({
            kind: "error",
            text: `${res.error} ${sent > 0 ? `Sono partite ${sent} mail su ${list.length}: non rinviare a chi l'ha già ricevuta.` : "Non è partita nessuna mail."}`,
          });
          return;
        }
        sent += res.data.sent;
      }
      setProgress(null);
      onFinish(sent);
    });
  }

  function sendTest() {
    if (!sample) return;
    run([{ email: testTo.trim(), header: sample.header }], () =>
      setNotice({ kind: "ok", text: `Prova inviata a ${testTo.trim()}. Controlla la posta (anche lo spam).` }),
    );
  }

  function sendAll() {
    run(recipients, (sent) => {
      setConfirming(false);
      setDone(sent);
    });
  }

  if (done !== null) {
    return (
      <div className={`${card} text-center`}>
        <p className="text-3xl">✓</p>
        <h2 className="mt-2 text-lg font-semibold">{done === 1 ? "Mail inviata" : `${done} mail inviate`}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
          Ogni persona ha ricevuto la sua mail con il proprio saluto. Le risposte arrivano a{" "}
          {replyTo ?? "chi ha l'indirizzo mittente"}. Non rinviare la stessa lista: arriverebbe due volte.
        </p>
        <button type="button" onClick={reset} className={`${ghostBtn} mt-5`}>
          Nuovo invio
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!configured && (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 px-5 py-4 text-sm">
          <p className="font-medium text-foreground">L&apos;invio non è ancora attivo</p>
          <p className="mt-1 text-foreground-muted">
            Manca il collegamento con il servizio di posta (chiave e indirizzo mittente). Puoi comunque
            preparare la lista e il messaggio e vedere l&apos;anteprima: il pulsante di invio si accende
            quando il collegamento è pronto.
          </p>
        </div>
      )}

      <ol className="grid grid-cols-3 gap-2" aria-label="Passaggi">
        {STEPS.map((label, i) => {
          const state = i === step ? "now" : i < step ? "past" : "next";
          return (
            <li key={label}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-sm ${
                  state === "now"
                    ? "border-accent bg-accent/10 text-foreground"
                    : state === "past"
                      ? "border-border bg-surface text-foreground hover:border-accent"
                      : "border-border bg-surface text-foreground-muted"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    state === "next" ? "bg-surface-2" : "bg-accent text-accent-foreground"
                  }`}
                >
                  {state === "past" ? "✓" : i + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">A chi vuoi scrivere?</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Carica un file con un indirizzo email per riga e, se vuoi, il saluto da mettere in cima alla
            mail di ognuno. Va bene un file Excel (come «Aziende Natale») o un file .csv.
          </p>

          <label className="mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface-2 px-4 py-5 text-center transition-colors hover:border-accent">
            <span className="text-sm font-medium">{fileName ? `File: ${fileName}` : "Scegli il file"}</span>
            <span className="text-xs text-foreground-muted">{fileName ? "Tocca per cambiarlo" : "Excel (.xlsx) o file di testo (.csv)"}</span>
            <input type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
          {notice?.kind === "error" && step === 0 && <p className="mt-2 text-sm text-danger" role="alert">{notice.text}</p>}

          <details className="mt-3 text-sm" open={!hasList}>
            <summary className="cursor-pointer text-accent">Come deve essere fatto il file?</summary>
            <div className="mt-2 rounded-xl bg-surface-2 p-3 text-xs text-foreground-muted">
              <p>Due colonne: la prima con l&apos;<b>email</b>, la seconda con l&apos;<b>intestazione</b> (il saluto). Esempio:</p>
              <table className="my-2 w-full text-left text-foreground">
                <thead>
                  <tr className="text-foreground-muted">
                    <th className="pr-3 font-medium">email</th>
                    <th className="font-medium">intestazione</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pr-3">mario.rossi@esempio.it</td>
                    <td>Gentile Dott. Rossi,</td>
                  </tr>
                  <tr>
                    <td className="pr-3">laura.bianchi@esempio.it</td>
                    <td>Cara Laura,</td>
                  </tr>
                </tbody>
              </table>
              <p>Se l&apos;intestazione manca, la mail inizia con «{GREETING}». Indirizzi sbagliati e doppioni vengono tolti da soli.</p>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`}
                download="esempio-destinatari.csv"
                className="mt-2 inline-block font-medium text-accent"
              >
                Scarica un file di esempio
              </a>
            </div>
          </details>

          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-accent">Oppure incolla l&apos;elenco</summary>
            <label className="sr-only" htmlFor="mail-csv">
              Elenco destinatari
            </label>
            <textarea
              id="mail-csv"
              value={csv}
              onChange={(e) => {
                setSheet(null);
                setFileName("");
                setCsv(e.target.value);
              }}
              rows={5}
              placeholder={"mario.rossi@esempio.it;Gentile Dott. Rossi,"}
              className={`${field} mt-2 font-mono`}
            />
          </details>

          {sheet && cols && (
            <div className="mt-5 flex flex-col gap-5 border-t border-border pt-5">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="mail-template">
                  Come saluti ognuno?
                </label>
                <p className="mb-2 text-xs text-foreground-muted">
                  Scrivi il saluto. Dove vuoi il dato della riga (ad esempio il nome dell&apos;azienda) tocca uno dei pulsanti qui sotto.
                </p>
                <input id="mail-template" value={template} onChange={(e) => setTemplate(e.target.value)} className={field} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sheet.headers.slice(0, 10).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setTemplate((t) => `${t}{${h}}`)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground-muted hover:border-accent hover:text-foreground"
                    >
                      + {h}
                    </button>
                  ))}
                </div>
                {sample && (
                  <p className="mt-2 text-xs text-foreground-muted">
                    Così, per la prima persona: <b className="text-foreground">{sample.header || GREETING}</b>
                  </p>
                )}
              </div>

              {groupValues.length > 0 && (
                <fieldset>
                  <legend className="mb-1 text-sm font-medium">Quali priorità includere?</legend>
                  <div className="flex flex-wrap gap-2">
                    {groupValues.map((g) => {
                      const on = groups ? groups.includes(g) : true;
                      return (
                        <label
                          key={g}
                          className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${on ? "border-accent bg-accent/10" : "border-border"}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => {
                              const cur = groups ?? groupValues;
                              setGroups(e.target.checked ? [...cur, g] : cur.filter((x) => x !== g));
                            }}
                          />
                          {g}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {cols.basis && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
                  <input type="checkbox" checked={onlyDocumented} onChange={(e) => setOnlyDocumented(e.target.checked)} className="mt-1" />
                  <span>
                    <b>Scrivi solo a chi ha il permesso documentato</b>
                    <span className="block text-xs text-foreground-muted">
                      Esclude le righe in cui la colonna «{cols.basis}» è vuota o dice «Da verificare».
                      {excludedByBasis > 0 && ` Ora ne esclude ${excludedByBasis}.`} Un indirizzo trovato online non basta per mandare
                      pubblicità.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {hasList && (
            <div className="mt-5 rounded-xl bg-surface-2 p-4 text-sm">
              <p>
                <b className="text-lg">{recipients.length}</b>{" "}
                {recipients.length === 1 ? "destinatario pronto" : "destinatari pronti"}
                {sheet && ` (su ${sheet.rows.length} righe del file)`}
              </p>
              {skipped.length > 0 && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {skipped.length} {skipped.length === 1 ? "riga scartata" : "righe scartate"} perché l&apos;email non è valida:{" "}
                  {skipped.slice(0, 3).join(", ")}
                  {skipped.length > 3 ? "…" : ""}
                </p>
              )}
              {recipients.length === 0 && sheet && onlyDocumented && cols?.basis && (
                <p className="mt-1 text-xs text-accent">
                  Nessuno ha il permesso documentato. Compila la colonna nel file e ricaricalo, oppure togli la spunta sopra se sai di poter scrivere a questi indirizzi.
                </p>
              )}
              {overLimit && (
                <p className="mt-1 text-xs text-accent">
                  Sono più di {limit}, il massimo che il servizio gratuito permette in un giorno: l&apos;invio si fermerebbe a metà.
                  Riduci la lista (ad esempio solo la priorità A) e scrivi agli altri nei giorni dopo.
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button type="button" disabled={recipients.length === 0} onClick={() => setStep(1)} className={primaryBtn}>
              Avanti: scrivi il messaggio
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Cosa vuoi dire?</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Il testo è lo stesso per tutti. Sopra ci va in automatico il saluto di ognuno, quindi non scriverlo tu.
          </p>

          <label className="mb-1 mt-4 block text-sm font-medium" htmlFor="mail-subject">
            Oggetto
          </label>
          <input
            id="mail-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="Es. Regali di Natale dall'Angolo del Vino"
            className={field}
          />

          <label className="mb-1 mt-4 block text-sm font-medium" htmlFor="mail-body">
            Testo della mail
          </label>
          <textarea
            id="mail-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder={"Scrivi qui il messaggio. Una riga vuota separa i paragrafi."}
            className={field}
          />

          <div className="mt-5">
            <MailPreview from={from} sample={sample} subject={subject} body={body} />
          </div>

          <div className="mt-5 flex justify-between gap-3">
            <button type="button" onClick={() => setStep(0)} className={ghostBtn}>
              Indietro
            </button>
            <button type="button" disabled={!subject.trim() || !body.trim()} onClick={() => setStep(2)} className={primaryBtn}>
              Avanti: controlla
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Controlla e invia</h2>
          <p className="mt-1 text-sm text-foreground-muted">Guarda come arriva, fai una prova su di te e poi invia a tutti.</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-surface-2 p-3">
              <dt className="text-xs text-foreground-muted">Destinatari</dt>
              <dd className="text-lg font-semibold">{recipients.length}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <dt className="text-xs text-foreground-muted">Limite di oggi</dt>
              <dd className={`text-lg font-semibold ${overLimit ? "text-danger" : ""}`}>
                {recipients.length} / {limit}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-foreground-muted">
              <span>Anteprima della mail di</span>
              <span className="flex items-center gap-1">
                <button type="button" aria-label="Destinatario precedente" disabled={previewAt === 0} onClick={() => setPreviewAt((i) => i - 1)} className="h-9 w-9 rounded-lg border border-border disabled:opacity-40">
                  ‹
                </button>
                <span>{Math.min(previewAt, recipients.length - 1) + 1} di {recipients.length}</span>
                <button type="button" aria-label="Destinatario successivo" disabled={previewAt >= recipients.length - 1} onClick={() => setPreviewAt((i) => i + 1)} className="h-9 w-9 rounded-lg border border-border disabled:opacity-40">
                  ›
                </button>
              </span>
            </div>
            <MailPreview from={from} sample={sample} subject={subject} body={body} />
          </div>

          <div className="mt-5 rounded-xl border border-border p-4">
            <h3 className="text-sm font-medium">Prova su di te</h3>
            <p className="mb-2 mt-0.5 text-xs text-foreground-muted">Invia una sola mail al tuo indirizzo per vedere come arriva. Non conta come invio alla lista.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Il tuo indirizzo email" aria-label="Il tuo indirizzo email" className={`${field} flex-1`} />
              <button type="button" disabled={!configured || !testTo.trim() || pending} onClick={sendTest} className={ghostBtn}>
                Invia la prova
              </button>
            </div>
            {notice?.kind === "ok" && <p className="mt-2 text-sm text-foreground" role="status">{notice.text}</p>}
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>
              Confermo che posso scrivere a queste persone (hanno dato il consenso o c&apos;è un altro motivo valido) e che
              possono chiedere di non ricevere più mail.
            </span>
          </label>

          {notice?.kind === "error" && <p className="mt-3 text-sm text-danger" role="alert">{notice.text}</p>}
          {overLimit && <p className="mt-3 text-sm text-danger">Troppi destinatari per oggi: torna indietro e riduci la lista.</p>}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setStep(1)} disabled={pending} className={ghostBtn}>
              Indietro
            </button>
            {!confirming ? (
              <button type="button" disabled={!canSend} onClick={() => setConfirming(true)} className={primaryBtn}>
                Invia a {recipients.length} {recipients.length === 1 ? "persona" : "persone"}
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl border border-accent p-3 sm:items-end">
                <p className="text-sm font-medium">Sicuro? Dopo l&apos;invio non si può annullare.</p>
                <div className="flex gap-2">
                  <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={ghostBtn}>
                    Annulla
                  </button>
                  <button type="button" disabled={pending} onClick={sendAll} className={primaryBtn}>
                    {pending ? "Invio in corso…" : "Sì, invia"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {progress && (
            <div className="mt-4" role="status">
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((progress.sent / progress.total) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-foreground-muted">Inviate {progress.sent} di {progress.total}. Non chiudere la pagina.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MailPreview({ from, sample, subject, body }: { from: string | null; sample?: Recipient; subject: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border text-sm">
      <div className="space-y-0.5 border-b border-border bg-surface-2 px-4 py-3 text-xs text-foreground-muted">
        <p>Da: {from ?? "indirizzo mittente (da attivare)"}</p>
        <p>A: {sample?.email ?? "—"}</p>
        <p className="font-medium text-foreground">Oggetto: {subject.trim() || "—"}</p>
      </div>
      <div className="whitespace-pre-wrap px-4 py-4">
        {(sample?.header || GREETING) + "\n\n" + (body.trim() || "Qui comparirà il tuo testo…")}
        <p className="mt-4 border-t border-border pt-2 text-xs text-foreground-muted">
          Se non vuoi più ricevere queste mail, rispondi scrivendo «cancellami».
        </p>
      </div>
    </div>
  );
}
