"use client";

import { useMemo, useState, useSyncExternalStore, type DragEvent } from "react";
import { Sheet } from "@/app/(app)/gestione-menu/sheet";
import { useToast } from "@/components/toast";
import { FORMAT_LABEL, fromPicker, parseContactsText, parsePasted, parseTable, planImport, type ParsedImport, type PickedContact } from "@/lib/contact-import";
import { GROUP_COLORS, n, type Consent, type ContactSource } from "@/lib/mail-rubrica";
import { readXlsxGrid } from "@/lib/xlsx";
import { useMail } from "./mail-store";
import { importContacts, saveGroup } from "./rubrica-actions";
import { ConsentRadios } from "./rubrica-sheets";
import { checkbox, field, ghostBtn, GroupDot, label, plural, primaryBtn } from "./rubrica-ui";

const CHUNK = 500;

// Contact Picker di Chrome su Android: c'è solo lì (altrove il pulsante non compare).
type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]>; getProperties?: () => Promise<string[]> };
const pickerAvailable = () => typeof navigator !== "undefined" && "contacts" in navigator && typeof window !== "undefined" && "ContactsManager" in window;
const noSubscribe = () => () => {};

// Un .csv salvato da un Excel vecchio non è sempre UTF-8: se non lo è, lo si legge come Windows-1252.
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

// «Importa»: dal telefono (.vcf o, su Android, scegliendo i contatti), da un file (Excel, CSV di
// Google, Outlook, Brevo) o incollando un elenco. Prima l'anteprima con i conti, i nomi diversi da
// confermare, i gruppi e il motivo per scrivergli (obbligatorio); poi l'importazione.
export function ImportSheet({ onClose }: { onClose: () => void }) {
  const { data, reload } = useMail();
  const toast = useToast();
  const hasPicker = useSyncExternalStore(noSubscribe, pickerAvailable, () => false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [origin, setOrigin] = useState<{ source: ContactSource; what: string }>({ source: "file", what: "" });
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [updateNames, setUpdateNames] = useState(false);
  const [extra, setExtra] = useState<Set<string>>(() => new Set());
  const [consent, setConsent] = useState<Consent | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const existing = useMemo(() => new Map((data?.contacts ?? []).map((c) => [c.email, { name: c.name }])), [data]);
  const optedOut = useMemo(() => new Set(data?.optOuts ?? []), [data]);
  const plan = useMemo(
    () => (parsed ? planImport(parsed, choice, existing, optedOut, groups.map((g) => g.name)) : null),
    [parsed, choice, existing, optedOut, groups],
  );

  function show(result: ParsedImport, source: ContactSource, what: string) {
    setChoice({});
    setUpdateNames(false);
    setError(null);
    if (result.rows.length === 0) {
      setReadError(
        result.noEmail.length
          ? `Ho trovato ${plural(result.noEmail.length, "contatto", "contatti")} ma nessuno con un'email: la rubrica serve per scrivere mail.`
          : "Non ho trovato nessun indirizzo email qui dentro.",
      );
      return;
    }
    setReadError(null);
    setParsed(result);
    setOrigin({ source, what });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setReadError(null);
    try {
      if (/\.xlsx$/i.test(file.name)) return show(parseTable(readXlsxGrid(await file.arrayBuffer())), "file", file.name);
      if (/\.(xls|numbers|ods)$/i.test(file.name)) return setReadError("Questo tipo di file non lo leggo: da Excel o Numeri salvalo come .xlsx o .csv.");
      const text = await readText(file);
      const result = parseContactsText(file.name, text);
      show(result, result.format === "vcard" ? "telefono" : "file", file.name);
    } catch (e) {
      setReadError(e instanceof Error && e.message ? e.message : "Non riesco a leggere questo file.");
    }
  }

  async function pickFromPhone() {
    try {
      const mgr = (navigator as unknown as { contacts: ContactsManager }).contacts;
      const props = (await mgr.getProperties?.()) ?? ["name", "email"];
      const list = await mgr.select(["name", "email", ...(props.includes("tel") ? ["tel"] : [])], { multiple: true });
      if (list.length) show(fromPicker(list), "telefono", "rubrica del telefono");
    } catch {
      setReadError("Non sono riuscito ad aprire la rubrica del telefono: usa il file .vcf.");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  }

  const items = plan ? plan.items.filter((it) => it.kind !== "nonvuole") : [];
  const newFileGroups = plan ? plan.fileGroups.filter((g) => g.isNew) : [];
  const touched = plan ? plan.counts.uguale + plan.counts.riempie + plan.counts.diverso : 0;

  async function run() {
    if (!plan || !consent) return;
    setError(null);
    const payload = items.map((it) => ({ email: it.email, name: it.name, phone: it.phone, groups: it.groups, updateName: it.kind === "diverso" && updateNames }));
    let added = 0;
    let updated = 0;
    setProgress({ done: 0, total: payload.length });
    try {
      for (let i = 0; i < payload.length; i += CHUNK) {
        const res = await importContacts({ items: payload.slice(i, i + CHUNK), groups: [...extra], consent, source: origin.source });
        if (!res.ok) {
          setError(`${res.error}${i > 0 ? ` Ne ho già importati ${n(i)}: se riprovi, quelli non si ripetono.` : ""}`);
          setProgress(null);
          await reload();
          return;
        }
        added += res.data.added;
        updated += res.data.updated;
        setProgress({ done: Math.min(i + CHUNK, payload.length), total: payload.length });
      }
    } catch {
      setError("La connessione si è interrotta: riprova (chi è già entrato non si ripete).");
      setProgress(null);
      await reload();
      return;
    }
    await reload();
    toast.showSuccess(
      [added ? `${plural(added, "contatto aggiunto", "contatti aggiunti")}` : "", updated ? `${plural(updated, "aggiornato", "aggiornati")}` : ""].filter(Boolean).join(" · ") ||
        "Rubrica già aggiornata",
    );
    onClose();
  }

  async function createGroup() {
    if (!newGroup.trim()) return;
    const res = await saveGroup({ name: newGroup, color: GROUP_COLORS[groups.length % GROUP_COLORS.length].id }).catch(() => null);
    if (!res?.ok) return setError(res?.error ?? "Non sono riuscito a creare il gruppo.");
    await reload();
    setExtra(new Set([...extra, res.data.id]));
    setNewGroup("");
  }

  // ---------- Passo 1: da dove
  if (!parsed || !plan) {
    return (
      <Sheet title="Importa contatti" onClose={onClose} dirty={false}>
        <p className="text-sm text-foreground-muted">Chi c&apos;è già non si ripete, e chi non vuole più email non viene aggiunto.</p>
        <div className="mt-4 flex flex-col gap-2">
          {hasPicker && (
            <button type="button" onClick={pickFromPhone} className={`${primaryBtn} min-h-14 justify-start px-4 text-left`}>
              <span>
                Scegli dalla rubrica del telefono
                <span className="block text-xs font-normal opacity-90">Tocca le persone da aggiungere</span>
              </span>
            </button>
          )}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors hover:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              dragging ? "border-accent bg-accent/10" : "border-border bg-surface-2"
            }`}
          >
            <span className="text-sm font-semibold">{dragging ? "Rilascia qui il file" : "Scegli un file"}</span>
            <span className="text-xs text-foreground-muted">
              Contatti del telefono (.vcf), Excel (.xlsx) o .csv — anche da Google Contatti, Outlook o Brevo
            </span>
            <input
              type="file"
              accept=".vcf,.vcard,text/vcard,text/x-vcard,.csv,.txt,text/csv,.xlsx"
              className="sr-only"
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {!pasting ? (
            <button type="button" onClick={() => setPasting(true)} className={ghostBtn}>
              Incolla un elenco
            </button>
          ) : (
            <div className="rounded-xl border border-border p-3">
              <label htmlFor="importa-incolla" className={label}>
                Il tuo elenco
              </label>
              <textarea
                id="importa-incolla"
                autoFocus
                rows={5}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                spellCheck={false}
                autoCapitalize="none"
                placeholder={"mario.rossi@esempio.it; Mario Rossi\nLaura Bianchi <laura@esempio.it>"}
                className={`${field} font-mono`}
              />
              <p className="mt-1 text-xs text-foreground-muted">Una persona per riga, oppure copiato dal campo «A:» di una mail.</p>
              <button type="button" disabled={!pasted.trim()} onClick={() => show(parsePasted(pasted), "incollato", "elenco incollato")} className={`${primaryBtn} mt-2`}>
                Avanti
              </button>
            </div>
          )}
        </div>
        {readError && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {readError}
          </p>
        )}
        <PhoneHowTo />
      </Sheet>
    );
  }

  // ---------- Passo 2: anteprima e scelte
  const c = plan.counts;
  const already = c.uguale + c.riempie + c.diverso;
  const summary = [
    `${n(c.nuovo)} ${c.nuovo === 1 ? "nuovo" : "nuovi"}`,
    already ? `${n(already)} già in rubrica` : "",
    c.senzaEmail ? `${n(c.senzaEmail)} senza email valida` : "",
    c.nonvuole ? `${n(c.nonvuole)} ${c.nonvuole === 1 ? "non vuole" : "non vogliono"} più email` : "",
    c.doppi ? `${plural(c.doppi, "ripetuto", "ripetuti")} nel file` : "",
  ].filter(Boolean);
  const different = plan.items.filter((it) => it.kind === "diverso");
  const nothing = c.nuovo === 0 && touched === 0;
  const action = c.nuovo > 0 ? `Importa ${plural(c.nuovo, "contatto", "contatti")}` : `Aggiorna ${plural(touched, "contatto", "contatti")}`;

  return (
    <Sheet title="Importa contatti" onClose={onClose} dirty={!progress && Boolean(consent || extra.size || updateNames || Object.keys(choice).length)}>
      <p className="text-xs text-foreground-muted">
        Da {origin.what ? `«${origin.what}»` : "elenco"} · {FORMAT_LABEL[parsed.format]}
      </p>
      <div className="mt-2 rounded-xl bg-surface-2 p-4" aria-live="polite">
        <p className="text-base font-semibold" data-testid="anteprima-conti">
          {summary.map((part, i) => (
            <span key={part}>
              <span className="whitespace-nowrap">{part}</span>
              {i < summary.length - 1 && " · "}
            </span>
          ))}
        </p>
        {c.riempie > 0 && <p className="mt-1 text-xs text-foreground-muted">{plural(c.riempie, "contatto in rubrica senza nome prende", "contatti in rubrica senza nome prendono")} quello del file.</p>}
        {c.nonvuole > 0 && <p className="mt-1 text-xs text-foreground-muted">Chi non vuole più email non viene aggiunto né riattivato.</p>}
        {c.senzaEmail > 0 && (
          <details className="mt-1 text-xs text-foreground-muted">
            <summary className="cursor-pointer py-1">Chi è senza email, o con un&apos;email sbagliata</summary>
            <p className="break-words">
              {parsed.noEmail.slice(0, 20).join(", ")}
              {parsed.noEmail.length > 20 ? ` e altri ${n(parsed.noEmail.length - 20)}` : ""}
            </p>
          </details>
        )}
      </div>

      {plan.items.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm" aria-label="I primi contatti del file">
          {plan.items.slice(0, 4).map((it) => (
            <li key={it.email} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
              <span className="min-w-0">
                <span className={it.name ? "font-medium" : "italic text-foreground-muted"}>{it.name || "Senza nome"}</span>
                <span className="block truncate text-xs text-foreground-muted">{it.email}</span>
              </span>
              <span className="text-xs text-foreground-muted">
                {it.kind === "nuovo" ? "nuovo" : it.kind === "nonvuole" ? "non vuole più email" : "già in rubrica"}
              </span>
            </li>
          ))}
          {plan.items.length > 4 && <li className="px-3 py-2 text-xs text-foreground-muted">e altri {n(plan.items.length - 4)}</li>}
        </ul>
      )}

      {different.length > 0 && (
        <div className="mt-4 rounded-xl border border-border p-3.5">
          <p className="text-sm font-medium">
            {plural(different.length, "contatto è", "contatti sono")} già in rubrica con un nome diverso. Aggiorno il nome?
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {different.slice(0, 5).map((it) => (
              <li key={it.email} className="break-words">
                <span className="text-foreground-muted">«{it.current}»</span> → <b>«{it.name}»</b>
              </li>
            ))}
            {different.length > 5 && <li className="text-foreground-muted">e altri {n(different.length - 5)}</li>}
          </ul>
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={updateNames} onChange={(e) => setUpdateNames(e.target.checked)} className={checkbox} />
            Sì, usa il nome del file
          </label>
          {!updateNames && <p className="text-xs text-foreground-muted">Senza spunta resta il nome che c&apos;è già.</p>}
        </div>
      )}

      {plan.multi.length > 0 && (
        <details className="mt-4 rounded-xl border border-border p-3.5">
          <summary className="cursor-pointer text-sm font-medium">
            {plural(plan.multi.length, "contatto ha", "contatti hanno")} più di un&apos;email: uso la prima. Vuoi sceglierla tu?
          </summary>
          <ul className="mt-3 space-y-3">
            {plan.multi.slice(0, 50).map((row) => {
              const r = parsed.rows[row];
              const current = choice[row] ?? r.emails[0];
              return (
                <li key={row}>
                  <p className="text-sm font-medium">{r.name || "Senza nome"}</p>
                  <div className="mt-1 flex flex-col gap-1">
                    {r.emails.map((e) => (
                      <label key={e} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface-2">
                        <input type="radio" name={`email-${row}`} checked={current === e} onChange={() => setChoice({ ...choice, [row]: e })} className="h-4 w-4 accent-accent" />
                        <span className="break-all">{e}</span>
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div className="mt-4">
        <p className={label}>Gruppi</p>
        {plan.fileGroups.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Gruppi dal file">
            {plan.fileGroups.map((g) => (
              <li key={g.name} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs ring-1 ring-inset ring-border">
                {g.isNew ? <b className="text-accent-ink">Nuovo gruppo: {g.name}</b> : <span className="font-medium">{g.name}</span>}
                <span className="text-foreground-muted">· {n(g.count)}</span>
              </li>
            ))}
          </ul>
        )}
        {newFileGroups.length > 0 && (
          <p className="mb-2 text-xs text-foreground-muted">
            Dalla colonna dei gruppi del file: {newFileGroups.length === 1 ? "il gruppo nuovo si crea" : "i gruppi nuovi si creano"} importando.
          </p>
        )}
        <p className="mb-1.5 text-xs text-foreground-muted">{plan.fileGroups.length ? "Puoi metterli tutti anche in:" : "Mettili in un gruppo (facoltativo):"}</p>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => {
            const on = extra.has(g.id);
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(extra);
                  if (on) next.delete(g.id);
                  else next.add(g.id);
                  setExtra(next);
                }}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm ${on ? "border-accent bg-accent/10 font-medium" : "border-border text-foreground-muted hover:border-accent"}`}
              >
                <GroupDot color={g.color} />
                {g.name}
                {on && <span aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <label htmlFor="importa-gruppo-nuovo" className="sr-only">
            Nuovo gruppo
          </label>
          <input id="importa-gruppo-nuovo" value={newGroup} maxLength={40} onChange={(e) => setNewGroup(e.target.value)} placeholder="Nuovo gruppo, es. Clienti storici" className={`${field} flex-1`} />
          <button type="button" disabled={!newGroup.trim()} onClick={createGroup} className={ghostBtn}>
            Crea
          </button>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className={label}>Perché puoi scrivere a queste persone?</legend>
        <ConsentRadios name="importa-consenso" value={consent} onChange={setConsent} plural />
        <p className="mt-1.5 text-xs text-foreground-muted">Vale per i nuovi. Chi è già in rubrica tiene il motivo che ha.</p>
      </fieldset>

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {progress && (
        <div className="mt-3" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-foreground-muted">
            Importo… {n(progress.done)} di {n(progress.total)}
          </p>
        </div>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button type="button" disabled={Boolean(progress)} onClick={() => setParsed(null)} className={ghostBtn}>
          Indietro
        </button>
        {!consent && !nothing && <p className="text-center text-xs text-foreground-muted sm:mr-auto sm:text-left">Scegli perché puoi scrivergli per andare avanti.</p>}
        {nothing && <p className="text-center text-xs text-foreground-muted sm:mr-auto sm:text-left">Non c&apos;è niente da importare.</p>}
        <button type="button" disabled={!consent || nothing || Boolean(progress)} onClick={run} className={primaryBtn}>
          {progress ? "Importo…" : action}
        </button>
      </div>
    </Sheet>
  );
}

// «Come esportare i contatti dal telefono», chiuso finché non serve.
function PhoneHowTo() {
  return (
    <details className="mt-5 rounded-xl bg-surface-2 px-4 py-1 text-sm">
      <summary className="cursor-pointer py-2.5 font-medium text-accent-ink">Come esportare i contatti dal telefono</summary>
      <div className="pb-3 text-foreground">
        <p className="mt-1 font-semibold">iPhone</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-foreground-muted">
          <li>Apri l&apos;app <b className="text-foreground">Contatti</b> e tocca <b className="text-foreground">Liste</b> in alto a sinistra.</li>
          <li>
            Tieni premuto su <b className="text-foreground">Tutti i contatti</b> (o su una tua lista) e scegli <b className="text-foreground">Esporta</b>. Per
            poche persone: tieni premuto un contatto e tocca <b className="text-foreground">Condividi</b>.
          </li>
          <li>
            Tocca <b className="text-foreground">Salva su File</b>. Poi qui: <b className="text-foreground">Scegli un file</b> e prendi il file .vcf appena salvato.
          </li>
        </ol>
        <p className="mt-3 font-semibold">Android</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-foreground-muted">
          <li>
            Da Chrome, qui sopra c&apos;è <b className="text-foreground">Scegli dalla rubrica del telefono</b>: tocchi le persone e hai finito.
          </li>
          <li>
            Oppure, nell&apos;app <b className="text-foreground">Contatti</b> di Google: <b className="text-foreground">Correggi e gestisci</b> →{" "}
            <b className="text-foreground">Esporta in file</b>. Sui Samsung: menu ☰ → <b className="text-foreground">Gestisci contatti</b> →{" "}
            <b className="text-foreground">Importa o esporta</b> → <b className="text-foreground">Esporta</b>.
          </li>
          <li>
            Poi qui: <b className="text-foreground">Scegli un file</b> e prendi il file .vcf (di solito nella cartella Download).
          </li>
        </ol>
        <p className="mt-3 text-xs text-foreground-muted">
          Dal computer: su contacts.google.com scegli <b>Esporta</b> → <b>Google CSV</b> o <b>vCard</b>; su icloud.com/contacts seleziona i contatti e scegli{" "}
          <b>Esporta vCard</b>.
        </p>
      </div>
    </details>
  );
}
