"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  applyHeader,
  checkTypedRows,
  guessColumns,
  HEADER_TAG,
  HEADER_TAG_RE,
  mailFooter,
  parseRecipients,
  tableToRecipients,
  type MailFooterInfo,
  type Recipient,
} from "@/lib/mail-text";
import { readXlsx, type Sheet } from "@/lib/xlsx";
import { sendMailChunk, sendMailTest, startMailSend } from "./actions";
import { newRow, PasteReading, RecipientsTable, type Row } from "./recipients-table";

const CHUNK = 50;
const DEFAULT_BODY = `Spett.le ${HEADER_TAG},\n\n`;
const SAMPLE_CSV = "\uFEFFemail;nome\nmario.rossi@esempio.it;Dott. Rossi\nlaura.bianchi@esempio.it;Laura\n";

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

// Le righe di «Scrivili qui», ricordate in questa scheda del browser finché non si invia: se la pagina
// si ricarica non si perdono. Può mancare (finestra privata, dati bloccati): allora si riparte vuoti.
const TYPED_KEY = "mail-destinatari-scritti";
function readTyped(): string | null {
  try {
    return sessionStorage.getItem(TYPED_KEY);
  } catch {
    return null;
  }
}
function saveTyped(rows: Row[]) {
  try {
    if (rows.some((r) => r.email.trim() || r.header.trim()))
      sessionStorage.setItem(TYPED_KEY, JSON.stringify(rows.map((r) => ({ e: r.email, h: r.header }))));
    else sessionStorage.removeItem(TYPED_KEY);
  } catch {}
}
function typedFrom(saved: string | null): Row[] {
  try {
    const list = saved ? (JSON.parse(saved) as { e?: unknown; h?: unknown }[]) : [];
    const rows = Array.isArray(list)
      ? list.slice(0, 200).map((x, i) => ({ id: `s${i}`, email: typeof x?.e === "string" ? x.e : "", header: typeof x?.h === "string" ? x.h : "" }))
      : [];
    return rows.length ? rows : [{ id: "s0", email: "", header: "" }];
  } catch {
    return [{ id: "s0", email: "", header: "" }];
  }
}

// I tre modi di dire a chi scrivere. Ognuno tiene il suo elenco: si spedisce quello scelto.
type Mode = "tabella" | "file" | "incolla";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "tabella", label: "Scrivili qui", hint: "Pochi indirizzi, o una prova" },
  { id: "file", label: "Carica un file", hint: "Excel o .csv" },
  { id: "incolla", label: "Incolla un elenco", hint: "Copiato da un foglio o da una mail" },
];
const PASTE_EXAMPLE = "mario.rossi@esempio.it; Dott. Rossi\nlaura.bianchi@esempio.it; Laura";

type Quota = { available: number; reserve: number; limit: number };
// Invio interrotto a metà: «Riprova» riparte dallo stesso gruppo, con lo stesso invio nel registro.
type Resume = { sendId: string; list: Recipient[]; from: number; sent: number; mode: Mode };

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
  const [mode, setMode] = useState<Mode>("tabella");
  const [fileText, setFileText] = useState(""); // un .csv caricato
  const [pasted, setPasted] = useState("");
  const [typed, setTyped] = useState<Row[] | null>(null);
  const savedTyped = useSyncExternalStore(noSubscribe, readTyped, () => null);
  const rows = useMemo(() => typed ?? typedFrom(savedTyped), [typed, savedTyped]);
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
  // Un elenco per modo, letto sempre (servono i conteggi sulle linguette); si usa quello scelto.
  const typedList = useMemo(() => checkTypedRows(rows), [rows]);
  const fileList = useMemo(
    () => (sheet ? tableToRecipients(sheet.rows, sheet.headers, { headerColumn, groups, onlyDocumented }) : parseRecipients(fileText)),
    [sheet, headerColumn, groups, onlyDocumented, fileText],
  );
  const pasteList = useMemo(() => parseRecipients(pasted), [pasted]);
  const lists = { tabella: typedList, file: fileList, incolla: pasteList };
  const has = {
    tabella: typedList.states.some((st) => st.kind !== "vuota"),
    file: Boolean(fileName),
    incolla: pasted.trim().length > 0,
  };
  const active = mode === "tabella" ? typedList : mode === "file" ? fileList : pasteList;
  const { recipients: parsed, skipped, duplicates } = active;
  // Chi si è cancellato non riceve più nulla (il server li toglie comunque).
  const optedOutSet = useMemo(() => new Set(optedOut), [optedOut]);
  const ready = (list: Recipient[]) => list.filter((r) => !optedOutSet.has(r.email));
  const recipients = useMemo(() => parsed.filter((r) => !optedOutSet.has(r.email)), [parsed, optedOutSet]);
  const excludedOptOut = parsed.length - recipients.length;
  const listKey = useMemo(() => recipients.map((r) => `${r.email}\u0000${r.header}`).join("\n"), [recipients]);
  const consent = consentFor === listKey;
  const hasList = has[mode];
  // Gli altri elenchi preparati e messi da parte: si dice che non verranno usati.
  const aside = MODES.filter((m) => m.id !== mode && has[m.id]);
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
        setFileText("");
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
    setFileText(await file.text());
    setFileName(file.name);
  }

  function setRows(next: Row[]) {
    setTyped(next);
    saveTyped(next);
  }

  // Trascinare il file sul riquadro (o su tutta la scheda) vale come sceglierlo.
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setMode("file");
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
    setFileText("");
    setPasted("");
    setRows([newRow()]);
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
      // Partito l'elenco scritto a mano: non serve più ricordarlo.
      if (job.mode === "tabella") setRows([newRow()]);
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
      run({ sendId: res.data.id, list, from: 0, sent: 0, mode });
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
            Scegli come aggiungere le persone. Per ognuna puoi indicare il nome o l&apos;azienda, che comparirà in cima
            alla sua mail.
          </p>

          <fieldset className="mt-4">
            <legend className="sr-only">Come vuoi aggiungere i destinatari?</legend>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
              {MODES.map((m) => {
                const on = mode === m.id;
                const n = ready(lists[m.id].recipients).length;
                return (
                  <label
                    key={m.id}
                    className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl px-1.5 py-2 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                      on ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mail-mode"
                      value={m.id}
                      checked={on}
                      onChange={() => {
                        setMode(m.id);
                        setNotice(null);
                      }}
                      className="sr-only"
                    />
                    <span className="text-[13px] font-semibold leading-tight sm:text-sm">{m.label}</span>
                    <span className="mt-0.5 hidden text-xs leading-tight sm:block">{m.hint}</span>
                    {has[m.id] && (
                      <span className={`mt-1 rounded-full px-1.5 text-[11px] font-medium ${n > 0 ? "bg-accent/15 text-accent-ink" : "bg-surface-2 text-foreground-muted"}`}>
                        {n} {n === 1 ? "pronto" : "pronti"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {mode === "tabella" && (
            <>
              <p className="mt-4 text-sm text-foreground-muted">Una persona per riga. Per una prova veloce bastano 2 o 3 indirizzi.</p>
              <RecipientsTable rows={rows} states={typedList.states} optedOut={optedOutSet} onChange={setRows} />
              <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-foreground-muted">
                In cima a ogni mail: il saluto che scrivi nel testo + questo nome (es. «Gentile Dott. Rossi»). Se lo lasci
                vuoto, resta solo il saluto.
              </p>
            </>
          )}

          {mode === "file" && (
            <>
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
              {notice?.kind === "error" && <p className="mt-2 text-sm text-danger" role="alert">{notice.text}</p>}

              <details className="mt-3 text-sm" open={!hasList}>
                <summary className="cursor-pointer py-2.5 text-accent-ink">Come deve essere fatto il file?</summary>
                <div className="mt-2 rounded-xl bg-surface-2 p-3 text-xs text-foreground-muted">
                  <p>Due colonne: la prima con l&apos;<b>email</b>, la seconda con il <b>nome o l&apos;azienda</b> di ognuno. Esempio:</p>
                  <table className="my-2 w-full text-left text-foreground">
                    <thead>
                      <tr className="text-foreground-muted">
                        <th className="pr-3 font-medium">email</th>
                        <th className="font-medium">nome</th>
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
            </>
          )}

          {mode === "incolla" && (
            <>
              <p className="mt-4 text-sm font-medium">Una persona per riga: email, poi punto e virgola, poi il nome.</p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Va bene anche la virgola, o due colonne copiate da Excel. Il nome si può lasciare vuoto. Esempio:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">{PASTE_EXAMPLE}</pre>
              <label className="mb-1 mt-4 block text-sm font-medium" htmlFor="mail-csv">
                Il tuo elenco
              </label>
              <textarea
                id="mail-csv"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                spellCheck={false}
                autoCapitalize="none"
                placeholder="Incolla o scrivi qui, una persona per riga"
                className={`${field} font-mono`}
              />
              {has.incolla && <PasteReading ready={recipients} skipped={skipped} titleRow={pasteList.titleRow} duplicates={duplicates} />}
            </>
          )}

          {mode === "file" && sheet && cols && (
            <div className="mt-5 flex flex-col gap-5 border-t border-border pt-5">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="mail-header-col">
                  Quale colonna contiene il nome (o l&apos;azienda)?
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

          {hasList ? (
            <div className="mt-5 rounded-xl bg-surface-2 p-4 text-sm" aria-live="polite">
              <p>
                <b className="text-lg">{recipients.length}</b>{" "}
                {recipients.length === 1 ? "destinatario pronto" : "destinatari pronti"}
                {mode === "file" && sheet && ` (su ${sheet.rows.length} righe del file)`}
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                {mode === "tabella" ? "Si userà l'elenco scritto qui." : mode === "file" ? `Si userà il file «${fileName}».` : "Si userà l'elenco incollato."}
              </p>
              {excludedOptOut > 0 && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {excludedOptOut === 1 ? "1 indirizzo escluso perché si è cancellato" : `${excludedOptOut} indirizzi esclusi perché si sono cancellati`}.
                </p>
              )}
              {mode === "file" && skipped.length > 0 && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {skipped.length} {skipped.length === 1 ? "riga scartata" : "righe scartate"} perché l&apos;email non è valida:{" "}
                  {skipped.slice(0, 3).join(", ")}
                  {skipped.length > 3 ? "…" : ""}
                </p>
              )}
              {mode === "file" && duplicates > 0 && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {duplicates === 1 ? "1 indirizzo ripetuto: riceverà una mail sola." : `${duplicates} indirizzi ripetuti: ognuno riceverà una mail sola.`}
                </p>
              )}
              {mode === "tabella" && skipped.length > 0 && (
                <p className="mt-1 text-xs text-danger">
                  {skipped.length === 1 ? "1 riga da correggere: così com'è non riceve la mail." : `${skipped.length} righe da correggere: così come sono non ricevono la mail.`}
                </p>
              )}
              {recipients.length === 0 && mode === "file" && sheet && onlyDocumented && cols?.basis && (
                <p className="mt-1 text-xs text-accent-ink">
                  Nessuno ha il permesso documentato. Compila la colonna nel file e ricaricalo, oppure togli la spunta sopra se sai di poter scrivere a questi indirizzi.
                </p>
              )}
              <p className={`mt-1 text-xs ${overLimit ? "text-accent-ink" : "text-foreground-muted"}`}>
                {quotaText}
                {overLimit && quota.available > 0 && " Riduci la lista (ad esempio solo la priorità A) e scrivi agli altri nei giorni dopo."}
              </p>
              {aside.length > 0 && <AsideNote aside={aside} fileName={fileName} />}
            </div>
          ) : (
            <div className="mt-5 text-xs text-foreground-muted">
              <p>{quotaText}</p>
              {aside.length > 0 && <AsideNote aside={aside} fileName={fileName} />}
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            {recipients.length === 0 && (
              <p className="text-center text-xs text-foreground-muted sm:mr-auto sm:text-left">
                {mode === "tabella"
                  ? "Scrivi almeno un indirizzo per andare avanti."
                  : mode === "file"
                    ? "Carica un file per andare avanti."
                    : "Incolla almeno un indirizzo per andare avanti."}
              </p>
            )}
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
            Il testo è uguale per tutti. Se vuoi che ognuno veda <b>il suo nome</b> (quello scritto nell&apos;elenco, es. «Dott. Rossi»,
            «Studio Lenzi»), metti il cursore dove va e tocca <b>«+ Nome della persona»</b>.
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
            <button type="button" onClick={insertTag} className="min-h-11 rounded-full border border-border px-4 text-sm font-medium hover:border-accent">
              + Nome della persona
            </button>
            <span className="text-xs text-foreground-muted">Nel testo compare come {HEADER_TAG}: al momento dell&apos;invio diventa il nome di ognuno.</span>
          </div>
          {body.trim() && (
            <div className="mt-3 rounded-xl bg-surface-2/60 px-4 py-3 text-sm" aria-live="polite">
              {HEADER_TAG_RE.test(body) ? (
                <>
                  <p className="text-xs text-foreground-muted">
                    Così inizia la mail{sample?.header ? <> per <b className="text-foreground">{sample.email}</b></> : null}:
                  </p>
                  <p className="mt-1 font-medium [overflow-wrap:anywhere]">
                    «{applyHeader(body.split(/\n/).find((l) => HEADER_TAG_RE.test(l)) ?? "", sample?.header || "Dott. Rossi").trim()}»
                  </p>
                  {sample && !sample.header && <p className="mt-1 text-xs text-foreground-muted">Chi nell&apos;elenco non ha un nome riceve la riga senza nome.</p>}
                </>
              ) : (
                <p className="text-foreground-muted">
                  Tutti riceveranno lo <b className="text-foreground">stesso identico testo</b>, senza il loro nome. Va bene così, oppure tocca «+ Nome della persona».
                </p>
              )}
            </div>
          )}

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
            <p className="mb-2 mt-0.5 text-xs text-foreground-muted">
              Scrivi qui la <b>tua</b> email: ti arriva una sola mail, uguale a quella vera{from ? ` e mandata da ${from}` : ""}, per vedere come arriva. Non conta come invio alla lista e la prossima volta l&apos;indirizzo è già scritto.
            </p>
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

// Gli altri elenchi preparati: restano da parte, ma non partono.
function AsideNote({ aside, fileName }: { aside: { id: Mode; label: string }[]; fileName: string }) {
  const what = aside.map((m) => (m.id === "file" ? `il file «${fileName}»` : m.id === "tabella" ? "gli indirizzi scritti qui" : "l'elenco incollato"));
  const them = aside.length > 1 || aside[0].id === "tabella" ? "usarli" : "usarlo";
  return (
    <p className="mt-2 border-t border-border pt-2 text-xs text-foreground-muted">
      Restano da parte e non partono con questo invio: {what.join(" e ")}. Per {them}, scegli {aside.map((m) => `«${m.label}»`).join(" o ")} qui sopra.
    </p>
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
