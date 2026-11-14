"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/app/(app)/gestione-menu/sheet";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { useToast } from "@/components/toast";
import {
  CONSENTS,
  consentShort,
  GROUP_COLORS,
  longDay,
  n,
  OPTOUT_LABEL,
  sourceLabel,
  type Consent,
  type RContact,
  type RGroup,
} from "@/lib/mail-rubrica";
import { writeCsv, writeXlsx } from "@/lib/xlsx-write";
import { useMail } from "./mail-store";
import { addToGroup, deleteContacts, deleteGroup, eraseContact, markContactOptOut, removeFromGroup, restoreContacts, saveContact, saveGroup } from "./rubrica-actions";
import { dangerBtn, field, ghostBtn, GroupDot, label, OutBadge, plural, primaryBtn } from "./rubrica-ui";

const CONNECTION = "Non sono riuscito a salvare: controlla la connessione e riprova.";
const nextColor = (groups: RGroup[]) => GROUP_COLORS[groups.length % GROUP_COLORS.length].id;

// Gruppi come pulsanti da accendere e spegnere, con «+ Nuovo gruppo» lì accanto.
function GroupToggles({ groups, value, onChange }: { groups: RGroup[]; value: Set<string>; onChange: (next: Set<string>) => void }) {
  const { reload } = useMail();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function create() {
    if (!name.trim()) return;
    start(async () => {
      try {
        const res = await saveGroup({ name, color: nextColor(groups) });
        if (!res.ok) return setError(res.error);
        await reload();
        onChange(new Set([...value, res.data.id]));
        setName("");
        setAdding(false);
        setError(null);
      } catch {
        setError(CONNECTION);
      }
    });
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const on = value.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(value);
                if (on) next.delete(g.id);
                else next.add(g.id);
                onChange(next);
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${
                on ? "border-accent bg-accent/10 font-medium text-foreground" : "border-border text-foreground-muted hover:border-accent"
              }`}
            >
              <GroupDot color={g.color} />
              {g.name}
              {on && <span aria-hidden>✓</span>}
            </button>
          );
        })}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-11 items-center rounded-full border border-dashed border-border px-3.5 text-sm text-foreground hover:border-accent">
            + Nuovo gruppo
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 flex gap-2" data-unsaved-ignore>
          <label htmlFor="nuovo-gruppo-nome" className="sr-only">
            Nome del nuovo gruppo
          </label>
          <input
            id="nuovo-gruppo-nome"
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
            placeholder="Es. Aziende, Amici del giovedì"
            className={`${field} flex-1`}
          />
          <button type="button" disabled={pending || !name.trim()} onClick={create} className={ghostBtn}>
            Crea
          </button>
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConsentRadios({ value, onChange, name, plural: many = false }: { value: Consent | null; onChange: (c: Consent) => void; name: string; plural?: boolean }) {
  return (
    <div className="grid gap-2">
      {CONSENTS.map((c) => (
        <label
          key={c.id}
          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
            value === c.id ? "border-accent bg-accent/10" : "border-border hover:border-accent"
          }`}
        >
          <input type="radio" name={name} checked={value === c.id} onChange={() => onChange(c.id)} className="h-4 w-4 shrink-0 accent-accent" />
          {many ? c.plural : c.label}
        </label>
      ))}
    </div>
  );
}

// ---------- Scheda di un contatto (nuovo o da modificare)

export function ContactSheet({ contact, groups, onClose }: { contact: RContact | null; groups: RGroup[]; onClose: () => void }) {
  const { reload } = useMail();
  const toast = useToast();
  const [email, setEmail] = useState(contact?.email ?? "");
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [gids, setGids] = useState<Set<string>>(() => new Set(contact?.groups ?? []));
  const [consent, setConsent] = useState<Consent | null>((contact?.consent as Consent | undefined) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "erase" | "optout">(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) return setError("Scegli perché possiamo scrivergli.");
    setError(null);
    start(async () => {
      try {
        const res = await saveContact({ id: contact?.id, email, name, phone, notes, groups: [...gids], consent });
        if (!res.ok) return setError(res.error);
        await reload();
        toast.showSuccess(contact ? "Contatto salvato" : res.data.revived ? "Contatto rimesso in rubrica" : "Contatto aggiunto alla rubrica");
        onClose();
      } catch {
        setError(CONNECTION);
      }
    });
  }

  function run(kind: "delete" | "erase" | "optout") {
    if (!contact) return;
    start(async () => {
      try {
        if (kind === "delete") {
          const res = await deleteContacts({ ids: [contact.id] });
          if (!res.ok) return toast.showError(res.error);
          await reload();
          onClose();
          toast.showSuccess("Contatto eliminato", {
            label: "Annulla",
            onClick: async () => {
              const back = await restoreContacts({ ids: [contact.id] }).catch(() => null);
              if (back?.ok) {
                await reload();
                toast.showSuccess("Contatto rimesso in rubrica");
              } else toast.showError("Non sono riuscito a rimetterlo: riprova.");
            },
          });
        } else if (kind === "erase") {
          const res = await eraseContact({ id: contact.id });
          if (!res.ok) return toast.showError(res.error);
          await reload();
          onClose();
          toast.showSuccess(`Dati cancellati: ${res.data.email} non riceverà più mail`);
        } else {
          const res = await markContactOptOut({ id: contact.id });
          if (!res.ok) return toast.showError(res.error);
          await reload();
          setConfirm(null);
          toast.showSuccess(`${res.data.email} non riceverà più le mail`);
        }
      } catch {
        toast.showError(CONNECTION);
      }
    });
  }

  const title = contact ? contact.name || contact.email : "Nuovo contatto";
  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        {contact?.out && (
          <div className="rounded-xl border border-danger/30 bg-danger-bg/60 px-3.5 py-3 text-sm">
            <OutBadge />
            <p className="mt-1.5 text-foreground">
              Dal {longDay(contact.out.at)} ({OPTOUT_LABEL[contact.out.source] ?? contact.out.source}): non riceve più le mail della lista e non si può
              scegliere per un invio.
            </p>
          </div>
        )}
        <div>
          <label htmlFor="contatto-nome" className={label}>
            Nome o azienda
          </label>
          <input id="contatto-nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" placeholder="Es. Dott. Rossi, Cantina Bianchi" className={field} />
          <p className="mt-1 text-xs text-foreground-muted">Va dopo il saluto, in cima alla mail: «Gentile {name.trim() || "Dott. Rossi"},».</p>
        </div>
        <div>
          <label htmlFor="contatto-email" className={label}>
            Email
          </label>
          <input
            id="contatto-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            placeholder="nome@esempio.it"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="contatto-telefono" className={label}>
            Telefono <span className="font-normal text-foreground-muted">(facoltativo)</span>
          </label>
          <input id="contatto-telefono" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="Es. 333 123 4567" className={field} />
        </div>
        <div>
          <p className={label} id="contatto-gruppi">
            Gruppi
          </p>
          <div role="group" aria-labelledby="contatto-gruppi">
            <GroupToggles groups={groups} value={gids} onChange={setGids} />
          </div>
        </div>
        <div>
          <label htmlFor="contatto-note" className={label}>
            Note <span className="font-normal text-foreground-muted">(facoltative, le vedi solo tu)</span>
          </label>
          <textarea id="contatto-note" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Es. preferisce i rossi, viene il giovedì" className={field} />
        </div>
        <fieldset>
          <legend className={label}>Perché puoi scrivere a questa persona?</legend>
          <ConsentRadios name="contatto-consenso" value={consent} onChange={setConsent} />
        </fieldset>

        {contact && (
          <dl className="grid gap-x-3 gap-y-1 rounded-xl bg-surface-2 px-3.5 py-3 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-foreground-muted">In rubrica</dt>
            <dd>
              dal {longDay(contact.createdAt)}, {sourceLabel(contact.source)}
            </dd>
            <dt className="text-foreground-muted">Mail ricevute</dt>
            <dd>{contact.sentCount === 0 ? "nessuna" : `${n(contact.sentCount)}${contact.lastSentAt ? `, l'ultima il ${longDay(contact.lastSentAt)}` : ""}`}</dd>
            <dt className="text-foreground-muted">Motivo</dt>
            <dd className="[overflow-wrap:anywhere]">
              {consentShort(contact.consent)}, dal {longDay(contact.consentAt)}
              {contact.consentNote && <span className="block text-foreground-muted">{contact.consentNote}</span>}
            </dd>
          </dl>
        )}

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Annulla
          </button>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? "Salvo…" : contact ? "Salva" : "Aggiungi alla rubrica"}
          </button>
        </div>
      </form>

      {contact && (
        <div className="mt-6 border-t border-border pt-4" data-unsaved-ignore>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Altro</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {!contact.out && (
              <button type="button" disabled={pending} onClick={() => setConfirm("optout")} className={ghostBtn}>
                Non vuole più email
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => setConfirm("delete")} className={ghostBtn}>
              Elimina
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirm("erase")} className={dangerBtn}>
              Elimina e non scrivergli più
            </button>
          </div>
          <p className="mt-2 text-xs text-foreground-muted">«Elimina e non scrivergli più» è per chi ti chiede di cancellare i suoi dati.</p>
        </div>
      )}

      {confirm === "delete" && contact && (
        <ConfirmSheet title={`Eliminare ${contact.name || contact.email}?`} confirmLabel="Elimina" busyLabel="Elimino…" busy={pending} danger onConfirm={() => run("delete")} onCancel={() => setConfirm(null)}>
          <p>Esce dalla rubrica e dai gruppi. Per qualche secondo puoi ancora annullare.</p>
        </ConfirmSheet>
      )}
      {confirm === "erase" && contact && (
        <ConfirmSheet
          title="Cancellare i suoi dati?"
          confirmLabel="Cancella i dati"
          busyLabel="Cancello…"
          busy={pending}
          danger
          onConfirm={() => run("erase")}
          onCancel={() => setConfirm(null)}
        >
          <p>
            Cancello nome, telefono, note, gruppi e l&apos;elenco delle mail ricevute da <b className="text-foreground">{contact.email}</b>.
          </p>
          <p>Resta solo l&apos;indirizzo tra chi non vuole più email, così non gli scriverai più, nemmeno per sbaglio da un file. Non si può annullare.</p>
        </ConfirmSheet>
      )}
      {confirm === "optout" && contact && (
        <ConfirmSheet title="Non vuole più email?" confirmLabel="Sì, non scrivergli più" busyLabel="Salvo…" busy={pending} onConfirm={() => run("optout")} onCancel={() => setConfirm(null)}>
          <p>
            {contact.email} resta in rubrica ma non riceverà più le mail della lista. Usalo per chi ti risponde «cancellami».
          </p>
        </ConfirmSheet>
      )}
    </Sheet>
  );
}

// ---------- Gruppi: crea, rinomina, colore, elimina

export function GroupsSheet({ groups, counts, onClose, onShow }: { groups: RGroup[]; counts: Map<string, number>; onClose: () => void; onShow: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null); // id, o "nuovo"
  const [removing, setRemoving] = useState<RGroup | null>(null);
  const { reload } = useMail();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Sheet title="Gruppi" onClose={onClose} dirty={false}>
      <p className="text-sm text-foreground-muted">
        Per scrivere a una parte della rubrica (es. «Aziende») e ritrovarla in un tocco. Un contatto può stare in più gruppi. Eliminare un
        gruppo non elimina i contatti.
      </p>
      {groups.length === 0 && editing !== "nuovo" && <p className="mt-4 rounded-xl bg-surface-2 px-4 py-5 text-center text-sm text-foreground-muted">Ancora nessun gruppo.</p>}
      <ul className="mt-4 divide-y divide-border" aria-label="Gruppi">
        {groups.map((g) =>
          editing === g.id ? (
            <li key={g.id} className="py-3">
              <GroupEditor group={g} groups={groups} onDone={() => setEditing(null)} onDelete={() => setRemoving(g)} />
            </li>
          ) : (
            <li key={g.id} className="flex items-center gap-3 py-2">
              <GroupDot color={g.color} className="h-3 w-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{g.name}</span>
                <span className="text-xs text-foreground-muted">{plural(counts.get(g.id) ?? 0, "contatto", "contatti")}</span>
              </span>
              <button type="button" onClick={() => onShow(g.id)} className="min-h-11 rounded-xl px-3 text-sm font-medium text-accent-ink hover:bg-surface-2">
                Mostra
              </button>
              <button type="button" onClick={() => setEditing(g.id)} aria-label={`Modifica il gruppo ${g.name}`} className="min-h-11 rounded-xl px-3 text-sm font-medium text-foreground hover:bg-surface-2">
                Modifica
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === "nuovo" ? (
        <div className="mt-3 rounded-xl border border-border p-3">
          <GroupEditor group={null} groups={groups} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <button type="button" onClick={() => setEditing("nuovo")} className={`${ghostBtn} mt-3 w-full border-dashed`}>
          + Nuovo gruppo
        </button>
      )}
      {removing && (
        <ConfirmSheet
          title={`Eliminare il gruppo «${removing.name}»?`}
          confirmLabel="Elimina il gruppo"
          busy={pending}
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            start(async () => {
              try {
                const res = await deleteGroup({ id: removing.id });
                if (!res.ok) return toast.showError(res.error);
                await reload();
                toast.showSuccess(`Gruppo «${removing.name}» eliminato`);
                setRemoving(null);
                setEditing(null);
              } catch {
                toast.showError(CONNECTION);
              }
            })
          }
        >
          <p>
            {(counts.get(removing.id) ?? 0) > 0
              ? `I suoi ${plural(counts.get(removing.id) ?? 0, "contatto resta", "contatti restano")} in rubrica: escono solo dal gruppo.`
              : "Il gruppo è vuoto."}
          </p>
        </ConfirmSheet>
      )}
    </Sheet>
  );
}

function GroupEditor({ group, groups, onDone, onDelete }: { group: RGroup | null; groups: RGroup[]; onDone: () => void; onDelete?: () => void }) {
  const { reload } = useMail();
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState(group?.color ?? nextColor(groups));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const res = await saveGroup({ id: group?.id, name, color });
        if (!res.ok) return setError(res.error);
        await reload();
        toast.showSuccess(group ? "Gruppo salvato" : `Gruppo «${name.trim()}» creato`);
        onDone();
      } catch {
        setError(CONNECTION);
      }
    });
  }
  const id = group?.id ?? "nuovo";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label htmlFor={`gruppo-nome-${id}`} className={label}>
          Nome del gruppo
        </label>
        <input id={`gruppo-nome-${id}`} autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Es. Aziende" className={field} />
      </div>
      <fieldset>
        <legend className={label}>Colore</legend>
        <div className="flex flex-wrap gap-1">
          {GROUP_COLORS.map((c) => (
            <label key={c.id} title={c.label} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
              <input type="radio" name={`gruppo-colore-${id}`} checked={color === c.id} onChange={() => setColor(c.id)} aria-label={c.label} className="sr-only" />
              <span aria-hidden className={`h-7 w-7 rounded-full ${color === c.id ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c.hex }} />
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !name.trim()} className={primaryBtn}>
          {group ? "Salva" : "Crea il gruppo"}
        </button>
        <button type="button" onClick={onDone} className={ghostBtn}>
          Annulla
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className={`${dangerBtn} sm:ml-auto`}>
            Elimina il gruppo
          </button>
        )}
      </div>
    </form>
  );
}

// ---------- «Aggiungi a un gruppo» / «Togli dal gruppo» per i contatti scelti

export function PickGroupSheet({ mode, contacts, groups, onClose }: { mode: "add" | "remove"; contacts: RContact[]; groups: RGroup[]; onClose: () => void }) {
  const { reload } = useMail();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const inGroup = (g: string) => contacts.filter((c) => c.groups.includes(g)).length;
  const list = mode === "add" ? groups : groups.filter((g) => inGroup(g.id) > 0);
  const ids = contacts.map((c) => c.id);
  function act(g: { id: string; name: string }) {
    start(async () => {
      try {
        const res = mode === "add" ? await addToGroup({ ids, groupId: g.id }) : await removeFromGroup({ ids, groupId: g.id });
        if (!res.ok) return toast.showError(res.error);
        await reload();
        toast.showSuccess(
          mode === "add"
            ? res.data.count === 0
              ? `Erano già tutti in «${g.name}»`
              : `${plural(res.data.count, "contatto aggiunto", "contatti aggiunti")} a «${g.name}»`
            : `${plural(res.data.count, "contatto tolto", "contatti tolti")} da «${g.name}»`,
        );
        onClose();
      } catch {
        toast.showError(CONNECTION);
      }
    });
  }
  function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    start(async () => {
      try {
        const res = await saveGroup({ name: newName, color: nextColor(groups) });
        if (!res.ok) return toast.showError(res.error);
        const add = await addToGroup({ ids, groupId: res.data.id });
        if (!add.ok) return toast.showError(add.error);
        await reload();
        toast.showSuccess(`${plural(add.data.count, "contatto aggiunto", "contatti aggiunti")} al nuovo gruppo «${newName.trim()}»`);
        onClose();
      } catch {
        toast.showError(CONNECTION);
      }
    });
  }
  const who = plural(contacts.length, "contatto scelto", "contatti scelti");
  return (
    <Sheet title={mode === "add" ? "Aggiungi a un gruppo" : "Togli dal gruppo"} onClose={onClose} dirty={false}>
      <p className="text-sm text-foreground-muted">
        {mode === "add" ? `Scegli il gruppo per i ${who}.` : `Da quale gruppo togli i ${who}? Restano in rubrica.`}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {list.map((g) => {
          const k = inGroup(g.id);
          return (
            <li key={g.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(g)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border px-3.5 text-left text-sm transition-colors hover:border-accent disabled:opacity-50"
              >
                <GroupDot color={g.color} className="h-3 w-3" />
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                <span className="shrink-0 text-xs text-foreground-muted">
                  {mode === "add" ? (k > 0 ? `già dentro: ${n(k)}` : "") : `${n(k)} di ${n(contacts.length)}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {mode === "add" && (
        <form onSubmit={createAndAdd} className="mt-4 flex gap-2">
          <label htmlFor="gruppo-nuovo-scelti" className="sr-only">
            Nome del nuovo gruppo
          </label>
          <input id="gruppo-nuovo-scelti" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Oppure un gruppo nuovo…" className={`${field} flex-1`} />
          <button type="submit" disabled={pending || !newName.trim()} className={ghostBtn}>
            Crea e aggiungi
          </button>
        </form>
      )}
    </Sheet>
  );
}

// ---------- «Scarica»: i contatti che si vedono (o quelli scelti), in Excel o CSV

export function ExportSheet({
  contacts,
  chosen,
  filtersOn,
  groups,
  onClose,
}: {
  contacts: RContact[];
  chosen: boolean;
  filtersOn: boolean;
  groups: Map<string, RGroup>;
  onClose: () => void;
}) {
  function rows(): string[][] {
    const head = ["Nome o azienda", "Email", "Telefono", "Gruppi", "Note", "Stato", "Perché puoi scrivergli", "Aggiunto il", "Ultima mail", "Mail ricevute"];
    return [
      head,
      ...contacts.map((c) => [
        c.name,
        c.email,
        c.phone,
        c.groups.map((g) => groups.get(g)?.name ?? "").filter(Boolean).join(", "),
        c.notes,
        c.out ? `Non vuole più email (dal ${longDay(c.out.at)})` : "Può ricevere",
        consentShort(c.consent),
        longDay(c.createdAt),
        c.lastSentAt ? longDay(c.lastSentAt) : "",
        String(c.sentCount),
      ]),
    ];
  }
  function download(kind: "xlsx" | "csv") {
    const day = new Date().toISOString().slice(0, 10);
    const blob =
      kind === "xlsx"
        ? new Blob([writeXlsx(rows(), [28, 32, 18, 24, 30, 26, 24, 14, 14, 12]) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
        : new Blob([writeCsv(rows())], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rubrica-angolo-del-vino-${day}.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    onClose();
  }
  const what = chosen ? plural(contacts.length, "contatto scelto", "contatti scelti") : filtersOn ? plural(contacts.length, "contatto che vedi con i filtri", "contatti che vedi con i filtri") : `tutti i ${plural(contacts.length, "contatto", "contatti")}`;
  return (
    <Sheet title="Scarica la rubrica" onClose={onClose} dirty={false}>
      <p className="text-sm text-foreground-muted">
        Scarico {what}: nome, email, telefono, gruppi, note, se possono ricevere le mail e quando hanno ricevuto l&apos;ultima. Il file si può
        anche reimportare.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={contacts.length === 0} onClick={() => download("xlsx")} className={`${primaryBtn} flex-1`}>
          Excel (.xlsx)
        </button>
        <button type="button" disabled={contacts.length === 0} onClick={() => download("csv")} className={`${ghostBtn} flex-1`}>
          CSV (per altri programmi)
        </button>
      </div>
      <p className="mt-3 text-xs text-foreground-muted">Dentro ci sono dati personali: tienilo per te e cancellalo quando non serve più.</p>
    </Sheet>
  );
}
