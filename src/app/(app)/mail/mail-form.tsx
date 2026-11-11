"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  applyHeader,
  guessColumns,
  HEADER_TAG,
  mailFooter,
  parseRecipients,
  tableToRecipients,
  type MailFooterInfo,
  type Recipient,
} from "@/lib/mail-text";
import { readXlsx, type Sheet } from "@/lib/xlsx";
import { sendMailChunk, sendMailTest, startMailSend } from "./actions";

const CHUNK = 50;
const DEFAULT_BODY = `Spett.le ${HEADER_TAG},\n\n`;
const SAMPLE_CSV = "\uFEFFemail;intestazione\nmario.rossi@esempio.it;Dott. Rossi\nlaura.bianchi@esempio.it;Laura\n";

const field =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-base text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none sm:text-sm";
const card = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40";
const ghostBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40";

const STEPS = ["Destinatari", "Messaggio", "Invio"];

// Ultimo indirizzo usato per la prova, ricordato solo in questo browser (può mancare: finestra
// privata, dati cancellati). Letto con useSyncExternalStore: niente differenze col server.
const LAST_TEST_KEY = "mail-ultima-prova";
function readLastTest(): string {
  try {
    return localStorage.getItem(LAST_TEST_KEY) ?? "";
  } catch {
    return "";
  }
}
const noSubscribe = () => () => {};

type Quota = { available: number; reserve: number; limit: number };
// Invio interrotto a metà: «Riprova» riparte dallo stesso gruppo, con lo stesso invio nel registro.
type Resume = { sendId: string; list: Recipient[]; from: number; sent: number };

export function MailForm({
  blocked,
  blockedTitle,
  quota,
  from,
  replyTo,
  footer,
  savedTestEmail,
  optedOut,
}: {
  blocked: string | null;
  blockedTitle: string;
  quota: Quota;
  from: string | null;
  replyTo: string | null;
  footer: MailFooterInfo;
  savedTestEmail: string;
  optedOut: string[];
}) {
  const configured = !blocked;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [headerColumn, setHeaderColumn] = useState("");
  const [groups, setGroups] = useState<string[] | null>(null);
  const [onlyDocumented, setOnlyDocumented] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(DEFAULT_BODY);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [previewAt, setPreviewAt] = useState(0);
  const [typedTest, setTestTo] = useState<string | null>(null);
  const lastTest = useSyncExternalStore(noSubscribe, readLastTest, () => "");
  const testTo = typedTest ?? (savedTestEmail || lastTest);
  // La spunta «Confermo…» vale per la lista per cui è stata data: se la lista cambia, si azzera.
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [done, setDone] = useState<{ sent: number; failed: number; excluded: number; warning: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  const cols = useMemo(() => (sheet ? guessColumns(sheet.headers) : null), [sheet]);
  const groupValues = useMemo(
    () => (sheet && cols?.group ? [...new Set(sheet.rows.map((r) => r[cols.group]).filter(Boolean))] : []),
    [sheet, cols],
  );
  const { recipients: parsed, skipped } = useMemo(
    () => (sheet ? tableToRecipients(sheet.rows, sheet.headers, { headerColumn, groups, onlyDocumented }) : parseRecipients(csv)),
    [sheet, headerColumn, groups, onlyDocumented, csv],
  );
  // Chi si è cancellato non riceve più nulla (il server li toglie comunque).
  const optedOutSet = useMemo(() => new Set(optedOut), [optedOut]);
  const recipients = useMemo(() => parsed.filter((r) => !optedOutSet.has(r.email)), [parsed, optedOutSet]);
  const excludedOptOut = parsed.length - recipients.length;
  const listKey = useMemo(() => recipients.map((r) => `${r.email}\u0000${r.header}`).join("\n"), [recipients]);
  const consent = consentFor === listKey;
  const hasList = Boolean(sheet) || csv.trim().length > 0;
  const excludedByBasis =
    sheet && cols?.basis && onlyDocumented
      ? tableToRecipients(sheet.rows, sheet.headers, { headerColumn, groups, onlyDocumented: false }).recipients.length - recipients.length
      : 0;
  const overLimit = recipients.length > quota.available;
  const quotaText =
    quota.available > 0
      ? `Oggi puoi mandare ancora ${quota.available} mail (${quota.reserve} sono tenute per le prenotazioni).`
      : `Per oggi le mail della lista sono finite (${quota.reserve} restano tenute per le prenotazioni): riprova domani.`;
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
        setHeaderColumn(g.name);
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

  // Trascinare il file sul riquadro (o su tutta la scheda) vale come sceglierlo.
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }
  function onDragLeave(e: DragEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }
  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 1) {
      setNotice({ kind: "error", text: "Trascina un file solo, non più di uno." });
    } else if (files[0] && !/\.(xlsx|csv|txt)$/i.test(files[0].name)) {
      setNotice({ kind: "error", text: `«${files[0].name}» non va bene: serve un file Excel (.xlsx) o un file .csv.` });
    } else {
      void loadFile(files[0]);
    }
  }

  // Inserisce il segnaposto dove si trova il cursore nel testo.
  function insertTag() {
    const el = bodyRef.current;
    const at = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? at;
    setBody(body.slice(0, at) + HEADER_TAG + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + HEADER_TAG.length, at + HEADER_TAG.length);
    });
  }

  function reset() {
    setStep(0);
    setCsv("");
    setSheet(null);
    setFileName("");
    setSubject("");
    setBody(DEFAULT_BODY);
    setConsentFor(null);
    setConfirming(false);
    setResume(null);
    setDone(null);
    setNotice(null);
  }

  // Spedisce a gruppi da 50. Ogni gruppo ha il suo numero: se la rete cade e si preme «Riprova»,
  // il server non rispedisce i gruppi già partiti.
  function run(job: Resume) {
    setNotice(null);
    setResume(null);
    startTransition(async () => {
      let { sent } = job;
      let failed = 0;
      let excluded = 0;
      const warnings: string[] = [];
      for (let i = job.from; i < job.list.length; i += CHUNK) {
        setProgress({ sent: i, total: job.list.length });
        let res: Awaited<ReturnType<typeof sendMailChunk>>;
        try {
          res = await sendMailChunk({ sendId: job.sendId, index: i / CHUNK, recipients: job.list.slice(i, i + CHUNK), subject, body });
        } catch {
          res = { ok: false, error: "La connessione si è interrotta." };
        }
        if (!res.ok) {
          setProgress(null);
          setConfirming(false);
          setResume({ ...job, from: i, sent });
          setNotice({
            kind: "error",
            text: `${res.error} ${sent > 0 ? `Sono partite ${sent} mail su ${job.list.length}: «Riprova» continua da dove si è fermato, senza rimandarle a chi le ha già ricevute.` : "Non è partita nessuna mail."}`,
          });
          router.refresh();
          return;
        }
        sent += res.data.sent;
        failed += res.data.failed;
        excluded += res.data.excluded;
        if (res.data.warning) warnings.push(res.data.warning);
      }
      setProgress(null);
      setConfirming(false);
      setDone({ sent, failed, excluded, warning: warnings[0] ?? null });
      router.refresh();
    });
  }

  function sendTest() {
    if (!sample) return;
    const to = testTo.trim();
    setNotice(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof sendMailTest>>;
      try {
        res = await sendMailTest({ to, header: sample.header, subject, body });
      } catch {
        res = { ok: false, error: "La connessione si è interrotta: riprova." };
      }
      if (!res.ok) {
        setNotice({ kind: "error", text: res.error });
        return;
      }
      try {
        localStorage.setItem(LAST_TEST_KEY, to);
      } catch {}
      setNotice({ kind: "ok", text: `Prova inviata a ${to}. Controlla la posta (anche lo spam).` });
      router.refresh();
    });
  }

  function sendAll() {
    const list = recipients;
    setNotice(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof startMailSend>>;
      try {
        res = await startMailSend({ subject, recipients: list.length });
      } catch {
        res = { ok: false, error: "La connessione si è interrotta: riprova." };
      }
      if (!res.ok) {
        setConfirming(false);
        setNotice({ kind: "error", text: `${res.error} Non è partita nessuna mail.` });
        return;
      }
      run({ sendId: res.data.id, list, from: 0, sent: 0 });
    });
  }

  if (done !== null) {
    return (
      <div className={`${card} text-center`}>
        <p className="text-3xl">✓</p>
        <h2 className="mt-2 text-lg font-semibold">{done.sent === 1 ? "Mail inviata" : `${done.sent} mail inviate`}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
          Ogni persona ha ricevuto la sua mail con il proprio saluto. Le risposte arrivano a{" "}
          {replyTo ?? "chi ha l'indirizzo mittente"}. Non rinviare la stessa lista: arriverebbe due volte.
        </p>
        {done.failed > 0 && (
          <p className="mx-auto mt-2 max-w-sm text-sm text-danger" role="alert">
            {done.failed === 1 ? "1 mail non è partita" : `${done.failed} mail non sono partite`}. {done.warning?.replace(/^\d+ non (è partita|sono partite): /, "")}
          </p>
        )}
        {done.excluded > 0 && (
          <p className="mx-auto mt-2 max-w-sm text-xs text-foreground-muted">
            {done.excluded} {done.excluded === 1 ? "indirizzo escluso perché si è cancellato" : "indirizzi esclusi perché si sono cancellati"}.
          </p>
        )}
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
          <p className="font-medium text-foreground">{blockedTitle}</p>
          <p className="mt-1 text-foreground-muted">{blocked}</p>
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
        <section className={card} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          <h2 className="text-base font-semibold">A chi vuoi scrivere?</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Carica un file con un indirizzo email per riga e, se vuoi, il saluto da mettere in cima alla
            mail di ognuno. Va bene un file Excel (come «Aziende Natale») o un file .csv.
          </p>
          {!hasList && <p className="mt-2 text-xs text-foreground-muted">{quotaText}</p>}

          <label
            className={`mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors hover:border-accent ${
              dragging ? "border-accent bg-accent/10" : "border-border bg-surface-2"
            }`}
          >
            <span className="text-sm font-medium">
              {dragging ? "Rilascia qui il file" : fileName ? `File: ${fileName}` : "Scegli il file"}
            </span>
            <span className="text-xs text-foreground-muted">
              {dragging ? "Excel (.xlsx) o .csv" : fileName ? "Tocca per cambiarlo, o trascina qui un altro file" : "Excel (.xlsx) o file di testo (.csv) · puoi anche trascinarlo qui"}
            </span>
            <input type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
          {notice?.kind === "error" && step === 0 && <p className="mt-2 text-sm text-danger" role="alert">{notice.text}</p>}

          <details className="mt-3 text-sm" open={!hasList}>
            <summary className="cursor-pointer py-2.5 text-accent-ink">Come deve essere fatto il file?</summary>
            <div className="mt-2 rounded-xl bg-surface-2 p-3 text-xs text-foreground-muted">
              <p>Due colonne: la prima con l&apos;<b>email</b>, la seconda con l&apos;<b>intestazione</b>, cioè solo la parte di ognuno (nome o azienda). Esempio:</p>
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
                    <td>Dott. Rossi</td>
                  </tr>
                  <tr>
                    <td className="pr-3">laura.bianchi@esempio.it</td>
                    <td>Laura</td>
                  </tr>
                </tbody>
              </table>
              <p>Il saluto («Spett.le», «Gentile», «Cara»…) lo scrivi tu nel testo, uguale per tutti. Indirizzi sbagliati e doppioni vengono tolti da soli.</p>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`}
                download="esempio-destinatari.csv"
                className="mt-1 inline-flex min-h-10 items-center font-medium text-accent-ink"
              >
                Scarica un file di esempio
              </a>
            </div>
          </details>

          <details className="mt-2 text-sm">
            <summary className="cursor-pointer py-2.5 text-accent-ink">Oppure incolla l&apos;elenco</summary>
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
              placeholder={"mario.rossi@esempio.it;Dott. Rossi"}
              className={`${field} mt-2 font-mono`}
            />
          </details>

          {sheet && cols && (
            <div className="mt-5 flex flex-col gap-5 border-t border-border pt-5">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="mail-header-col">
                  Quale colonna contiene l&apos;intestazione?
                </label>
                <p className="mb-2 text-xs text-foreground-muted">
                  È la parte diversa per ognuno, ad esempio il nome dell&apos;azienda o «Dott. Rossi». «Spett.le», «Gentile» e simili
                  li scrivi dopo, nel testo, uguali per tutti.
                </p>
                <select id="mail-header-col" value={headerColumn} onChange={(e) => setHeaderColumn(e.target.value)} className={field}>
                  <option value="">Nessuna (stessa mail per tutti)</option>
                  {sheet.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {sample && headerColumn && (
                  <p className="mt-2 text-xs text-foreground-muted">
                    Per la prima persona: <b className="text-foreground">{sample.header || "(vuota)"}</b>
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
              {excludedOptOut > 0 && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {excludedOptOut === 1 ? "1 indirizzo escluso perché si è cancellato" : `${excludedOptOut} indirizzi esclusi perché si sono cancellati`}.
                </p>
              )}
              {skipped.length > 0 && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {skipped.length} {skipped.length === 1 ? "riga scartata" : "righe scartate"} perché l&apos;email non è valida:{" "}
                  {skipped.slice(0, 3).join(", ")}
                  {skipped.length > 3 ? "…" : ""}
                </p>
              )}
              {recipients.length === 0 && sheet && onlyDocumented && cols?.basis && (
                <p className="mt-1 text-xs text-accent-ink">
                  Nessuno ha il permesso documentato. Compila la colonna nel file e ricaricalo, oppure togli la spunta sopra se sai di poter scrivere a questi indirizzi.
                </p>
              )}
              <p className={`mt-1 text-xs ${overLimit ? "text-accent-ink" : "text-foreground-muted"}`}>
                {quotaText}
                {overLimit && quota.available > 0 && " Riduci la lista (ad esempio solo la priorità A) e scrivi agli altri nei giorni dopo."}
              </p>
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
            Il testo è uguale per tutti, saluto compreso. Dove vuoi l&apos;intestazione di ognuno (il nome o l&apos;azienda) metti
            il segnaposto <b>{HEADER_TAG}</b>: nell&apos;invio viene sostituito con quella della persona.
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
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder={"Scrivi qui il messaggio. Una riga vuota separa i paragrafi."}
            className={field}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={insertTag} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-accent">
              + Inserisci l&apos;intestazione
            </button>
            {!/\{intestazione\}/i.test(body) && (
              <span className="text-xs text-accent-ink">Nel testo non c&apos;è {HEADER_TAG}: nessuno vedrà il proprio nome.</span>
            )}
          </div>

          <div className="mt-5">
            <MailPreview from={from} sample={sample} subject={subject} body={body} footer={footer} />
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
              <dt className="text-xs text-foreground-muted">Puoi mandarne ancora oggi</dt>
              <dd className={`text-lg font-semibold ${overLimit ? "text-danger" : ""}`}>{quota.available}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-foreground-muted">{quotaText}</p>

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
            <MailPreview from={from} sample={sample} subject={subject} body={body} footer={footer} />
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
            <input type="checkbox" checked={consent} onChange={(e) => setConsentFor(e.target.checked ? listKey : null)} className="mt-1" />
            <span>
              Confermo che posso scrivere a queste persone (hanno dato il consenso o c&apos;è un altro motivo valido) e che
              possono chiedere di non ricevere più mail.
            </span>
          </label>

          {notice?.kind === "error" && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-danger" role="alert">
                {notice.text}
              </p>
              {resume && (
                <button type="button" disabled={pending} onClick={() => run(resume)} className={`${ghostBtn} shrink-0`}>
                  Riprova
                </button>
              )}
            </div>
          )}
          {overLimit && <p className="mt-3 text-sm text-danger">Troppi destinatari per oggi: torna indietro e riduci la lista.</p>}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setStep(1)} disabled={pending} className={ghostBtn}>
              Indietro
            </button>
            {!confirming ? (
              <button type="button" disabled={!canSend || Boolean(resume)} onClick={() => setConfirming(true)} className={primaryBtn}>
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

function MailPreview({
  from,
  sample,
  subject,
  body,
  footer,
}: {
  from: string | null;
  sample?: Recipient;
  subject: string;
  body: string;
  footer: MailFooterInfo;
}) {
  // Lo stesso piè di pagina della mail vera (mail-text.ts), con link finti.
  const foot = mailFooter(footer, "#");
  return (
    <div className="overflow-hidden rounded-xl border border-border text-sm">
      <div className="space-y-0.5 border-b border-border bg-surface-2 px-4 py-3 text-xs text-foreground-muted">
        <p className="break-words">Da: {from ?? "indirizzo mittente (da attivare)"}</p>
        <p className="break-words">A: {sample?.email ?? "—"}</p>
        <p className="break-words font-medium text-foreground">Oggetto: {subject.trim() || "—"}</p>
      </div>
      <div className="whitespace-pre-wrap break-words px-4 py-4">
        {body.trim() ? applyHeader(body.trim(), sample?.header ?? "") : "Qui comparirà il tuo testo…"}
        <div className="mt-4 whitespace-normal border-t border-border pt-2 text-xs text-foreground-muted">
          {foot.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="mt-1.5">
            <span className="underline">Informativa sulla privacy</span> · <span className="underline">Non voglio più ricevere queste email</span>
          </p>
        </div>
      </div>
    </div>
  );
}
