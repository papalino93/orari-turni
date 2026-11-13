"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { compareContacts, n, shortDay, SORTS, type RContact, type SortBy } from "@/lib/mail-rubrica";
import { useMail } from "./mail-store";
import { deleteContacts, restoreContacts } from "./rubrica-actions";
import { ContactSheet, ExportSheet, GroupsSheet, PickGroupSheet } from "./rubrica-sheets";
import { ImportSheet } from "./import-sheet";
import {
  card,
  checkbox,
  dangerBtn,
  DisplayName,
  field,
  filterIndex,
  ghostBtn,
  GroupChips,
  groupCounts,
  GroupSelect,
  OutBadge,
  plural,
  primaryBtn,
  SearchBox,
  STATUSES,
  type Status,
} from "./rubrica-ui";

const PAGE = 100;

type Open =
  | { kind: "contact"; id: string | null }
  | { kind: "import" }
  | { kind: "groups" }
  | { kind: "add" }
  | { kind: "remove" }
  | { kind: "export" }
  | { kind: "delete" }
  | null;

// Scheda «Rubrica»: chi c'è, cerca e filtra, scegli e fai qualcosa (scrivere, gruppi, eliminare).
export function Rubrica() {
  const { tab, data, index, loadError, ensureLoaded, reload, writeTo } = useMail();
  const toast = useToast();
  const active = tab === "rubrica";
  useEffect(() => {
    if (active) ensureLoaded();
  }, [active, ensureLoaded]);

  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState<Status>("tutti");
  const [sort, setSort] = useState<SortBy>("nome");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const query = useDeferredValue(q);
  // Sul telefono gruppo, ordine e «chi» stanno dietro «Filtri»: la lista comincia subito.
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = Number(Boolean(group)) + Number(status !== "tutti") + Number(sort !== "nome");

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const counts = useMemo(() => groupCounts(data?.contacts ?? []), [data]);
  const filtered = useMemo(() => {
    const list = filterIndex(index, { q: query, group, status });
    // L'indice è già in ordine di nome: si riordina solo per gli altri ordini.
    return sort === "nome" ? list : [...list].sort((a, b) => compareContacts(a.c, b.c, sort));
  }, [index, query, group, status, sort]);
  const byId = useMemo(() => new Map((data?.contacts ?? []).map((c) => [c.id, c])), [data]);
  // La scelta tiene solo chi c'è ancora (dopo un'eliminazione o un ricaricamento).
  const chosen = useMemo(() => [...selected].map((id) => byId.get(id)).filter((c): c is RContact => Boolean(c)), [selected, byId]);
  const canReceive = chosen.filter((c) => !c.out);
  const allShownOn = filtered.length > 0 && filtered.every((x) => selected.has(x.c.id));
  const total = data?.contacts.length ?? 0;
  const receivable = useMemo(() => (data ? data.contacts.filter((c) => !c.out).length : 0), [data]);
  const filtersOn = Boolean(q.trim() || group || status !== "tutti");

  const resetPage = () => setLimit(PAGE);
  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  }
  function toggleAll() {
    const next = new Set(selected);
    for (const x of filtered) {
      if (allShownOn) next.delete(x.c.id);
      else next.add(x.c.id);
    }
    setSelected(next);
  }

  // Eliminare: si conferma, poi «Annulla» nel messaggio per qualche secondo.
  async function confirmDelete() {
    const ids = chosen.map((c) => c.id);
    setBusy(true);
    try {
      const res = await deleteContacts({ ids });
      if (!res.ok) return toast.showError(res.error);
      setSelected(new Set());
      setOpen(null);
      await reload();
      toast.showSuccess(ids.length === 1 ? "Contatto eliminato" : `${n(ids.length)} contatti eliminati`, {
        label: "Annulla",
        onClick: async () => {
          const back = await restoreContacts({ ids }).catch(() => null);
          if (back?.ok) {
            await reload();
            toast.showSuccess(ids.length === 1 ? "Contatto rimesso in rubrica" : `${n(ids.length)} contatti rimessi in rubrica`);
          } else toast.showError(back?.ok === false ? back.error : "Non sono riuscito a rimetterli: riprova.");
        },
      });
    } catch {
      toast.showError("Non sono riuscito a eliminarli: controlla la connessione e riprova.");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="sr-only">Rubrica</h2>
        <p className="text-sm text-foreground-muted">
          {data
            ? total === 0
              ? "Le persone a cui scrivi, in un posto solo."
              : `${plural(total, "contatto", "contatti")} · ${n(receivable)} ${receivable === 1 ? "può" : "possono"} ricevere le mail`
            : "Le persone a cui scrivi, in un posto solo."}
        </p>
      </div>
      {data && total > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button type="button" onClick={() => setOpen({ kind: "contact", id: null })} className={`${primaryBtn} px-2 sm:order-last sm:px-4`}>
            + Nuovo<span className="hidden sm:inline">&nbsp;contatto</span>
          </button>
          <button type="button" onClick={() => setOpen({ kind: "import" })} className={`${ghostBtn} px-2 sm:px-4`}>
            Importa
          </button>
          <button type="button" onClick={() => setOpen({ kind: "groups" })} className={`${ghostBtn} px-2 sm:px-4`}>
            Gruppi
          </button>
          <button type="button" onClick={() => setOpen({ kind: "export" })} className={`${ghostBtn} px-2 sm:px-4`}>
            Scarica
          </button>
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (!data) {
    body = (
      <div className={`${card} text-sm`} role="status">
        {loadError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-danger">{loadError}</p>
            <button type="button" className={ghostBtn} onClick={() => void reload()}>
              Riprova
            </button>
          </div>
        ) : (
          <p className="text-foreground-muted">Apro la rubrica…</p>
        )}
      </div>
    );
  } else if (total === 0) {
    body = <EmptyRubrica onImport={() => setOpen({ kind: "import" })} onNew={() => setOpen({ kind: "contact", id: null })} />;
  } else {
    body = (
      <>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <SearchBox id="rubrica-cerca" labelText="Cerca nella rubrica" value={q} onChange={(v) => (setQ(v), resetPage())} />
            </div>
            <button
              type="button"
              aria-expanded={showFilters}
              aria-controls="rubrica-filtri"
              onClick={() => setShowFilters((x) => !x)}
              className={`${ghostBtn} shrink-0 px-3 sm:hidden ${activeFilters ? "border-accent text-accent-ink" : ""}`}
            >
              Filtri{activeFilters ? ` (${activeFilters})` : ""}
            </button>
          </div>
          <div id="rubrica-filtri" className={`${showFilters ? "grid" : "hidden"} grid-cols-2 gap-2 sm:grid sm:grid-cols-3`}>
            <div className="min-w-0">
              <label htmlFor="rubrica-gruppo" className="mb-1 block text-xs font-medium text-foreground-muted">
                Gruppo
              </label>
              <GroupSelect id="rubrica-gruppo" value={group} onChange={(v) => (setGroup(v), resetPage())} groups={groups} counts={counts} />
            </div>
            <div className="min-w-0">
              <label htmlFor="rubrica-ordine" className="mb-1 block text-xs font-medium text-foreground-muted">
                In ordine di
              </label>
              <select id="rubrica-ordine" value={sort} onChange={(e) => setSort(e.target.value as SortBy)} className={field}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <label htmlFor="rubrica-stato" className="mb-1 block text-xs font-medium text-foreground-muted">
                Chi
              </label>
              <select id="rubrica-stato" value={status} onChange={(e) => (setStatus(e.target.value as Status), resetPage())} className={field}>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 pl-3 text-sm font-medium">
            <input type="checkbox" checked={allShownOn} onChange={toggleAll} disabled={filtered.length === 0} className={checkbox} />
            {allShownOn ? `Togli tutti (${n(filtered.length)})` : `Seleziona tutti (${n(filtered.length)})`}
          </label>
          <p className="text-xs text-foreground-muted" aria-live="polite">
            {filtersOn ? `${plural(filtered.length, "contatto trovato", "contatti trovati")}` : `${plural(filtered.length, "contatto", "contatti")}`}
          </p>
        </div>

        {filtered.length > 0 && (
          <div aria-hidden className="hidden items-center gap-1 pt-2 text-xs font-medium text-foreground-muted sm:flex">
            <span className="w-11 shrink-0" />
            <span className="grid flex-1 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem] gap-x-4 px-2">
              <span>Nome o azienda ed email</span>
              <span>Gruppi</span>
              <span className="text-right">Ultima mail</span>
            </span>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="mt-4 rounded-xl bg-surface-2 px-4 py-8 text-center text-sm">
            <p className="text-foreground">{q.trim() ? `Nessun contatto per «${q.trim()}».` : "Nessun contatto con questi filtri."}</p>
            <button
              type="button"
              onClick={() => {
                setQ("");
                setGroup("");
                setStatus("tutti");
              }}
              className={`${ghostBtn} mt-3`}
            >
              Togli i filtri
            </button>
          </div>
        ) : (
          <ul aria-label="Contatti" className="divide-y divide-border">
            {filtered.slice(0, limit).map(({ c }) => (
              <ContactRow key={c.id} c={c} on={selected.has(c.id)} onToggle={(v) => toggle(c.id, v)} onOpen={() => setOpen({ kind: "contact", id: c.id })} groupMap={groupMap} />
            ))}
          </ul>
        )}
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE * 4)} className={`${ghostBtn} mt-3 w-full`}>
            Mostra altri ({n(filtered.length - limit)} ancora)
          </button>
        )}

        {chosen.length > 0 && (
          <div
            role="region"
            aria-label="Contatti scelti"
            className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-4 rounded-2xl border border-border bg-surface/95 p-3 shadow-[var(--shadow-raised)] backdrop-blur md:bottom-4"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-label="Togli la scelta"
                title="Togli la scelta"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground-muted hover:bg-surface-2 hover:text-foreground"
              >
                <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
              <p className="shrink-0 text-sm font-semibold">{plural(chosen.length, "scelto", "scelti")}</p>
              <button type="button" disabled={canReceive.length === 0} onClick={() => writeTo(canReceive.map((c) => c.id))} className={`${primaryBtn} ml-auto min-w-0 flex-1 sm:flex-none`}>
                Scrivi a questi ({n(canReceive.length)})
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:justify-end">
              <button type="button" onClick={() => setOpen({ kind: "add" })} className={`${ghostBtn} px-2 text-[13px] leading-tight sm:px-4 sm:text-sm`}>
                Aggiungi a un gruppo
              </button>
              <button type="button" disabled={!chosen.some((c) => c.groups.length)} onClick={() => setOpen({ kind: "remove" })} className={`${ghostBtn} px-2 text-[13px] leading-tight sm:px-4 sm:text-sm`}>
                Togli dal gruppo
              </button>
              <button type="button" onClick={() => setOpen({ kind: "delete" })} className={`${dangerBtn} px-2 text-[13px] sm:px-4 sm:text-sm`}>
                Elimina
              </button>
            </div>
            {canReceive.length < chosen.length && (
              <p className="mt-2 text-xs text-foreground-muted">
                {plural(chosen.length - canReceive.length, "non vuole", "non vogliono")} più email: non riceverà{chosen.length - canReceive.length === 1 ? "" : "nno"} la mail.
              </p>
            )}
          </div>
        )}
      </>
    );
  }

  const openContact = open?.kind === "contact" ? (open.id ? byId.get(open.id) ?? null : null) : null;
  return (
    <section aria-labelledby="rubrica-titolo">
      <span id="rubrica-titolo" className="sr-only">
        Rubrica
      </span>
      {header}
      {body}

      {open?.kind === "contact" && data && (
        <ContactSheet key={open.id ?? "nuovo"} contact={openContact} groups={groups} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "import" && data && <ImportSheet onClose={() => setOpen(null)} />}
      {open?.kind === "groups" && data && (
        <GroupsSheet
          groups={groups}
          counts={counts}
          onClose={() => setOpen(null)}
          onShow={(id) => {
            setGroup(id);
            setStatus("tutti");
            setOpen(null);
          }}
        />
      )}
      {(open?.kind === "add" || open?.kind === "remove") && data && (
        <PickGroupSheet mode={open.kind} contacts={chosen} groups={groups} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "export" && data && <ExportSheet contacts={chosen.length ? chosen : filtered.map((x) => x.c)} chosen={chosen.length > 0} filtersOn={filtersOn} groups={groupMap} onClose={() => setOpen(null)} />}
      {open?.kind === "delete" && (
        <ConfirmSheet
          title={chosen.length === 1 ? `Eliminare ${chosen[0].name || chosen[0].email}?` : `Eliminare ${n(chosen.length)} contatti?`}
          confirmLabel="Elimina"
          busyLabel="Elimino…"
          busy={busy}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setOpen(null)}
        >
          <p>Escono dalla rubrica e dai gruppi. Per qualche secondo puoi ancora annullare.</p>
          <p>Chi ti ha chiesto di cancellare i suoi dati va eliminato dalla sua scheda, con «Elimina e non scrivergli più».</p>
        </ConfirmSheet>
      )}
    </section>
  );
}

function ContactRow({ c, on, onToggle, onOpen, groupMap }: { c: RContact; on: boolean; onToggle: (v: boolean) => void; onOpen: () => void; groupMap: Map<string, import("@/lib/mail-rubrica").RGroup> }) {
  const last = c.lastSentAt ? `ultima mail ${shortDay(c.lastSentAt)}` : "nessuna mail";
  return (
    <li className={`flex items-start gap-1 py-1 ${on ? "bg-accent/[0.06]" : ""}`}>
      <label className="flex h-12 w-11 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} aria-label={`Scegli ${c.name || c.email}`} className={checkbox} />
      </label>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Apri ${c.name || c.email}`}
        className="grid min-h-12 min-w-0 flex-1 grid-cols-1 items-center gap-x-4 gap-y-1 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2/70 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem]"
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <DisplayName c={c} className="min-w-0 truncate text-sm font-semibold" />
            {c.out && <OutBadge />}
          </span>
          <span className="block truncate text-xs text-foreground-muted">{c.email}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <GroupChips ids={c.groups} groups={groupMap} />
          <span className="text-[11px] text-foreground-muted sm:hidden">{last}</span>
        </span>
        <span className="hidden text-right text-xs text-foreground-muted sm:block">{c.lastSentAt ? shortDay(c.lastSentAt) : "—"}</span>
      </button>
    </li>
  );
}

function EmptyRubrica({ onImport, onNew }: { onImport: () => void; onNew: () => void }) {
  const ways = [
    { t: "Da sola, con gli invii", d: "Chi riceve una mail dalla scheda «Scrivi» entra in rubrica dopo l'invio, con la data dell'ultima mail." },
    { t: "Dal sito", d: "Chi prenota un tavolo e spunta «Voglio ricevere via email le novità» entra nel gruppo «Clienti dal sito»." },
    { t: "Da te", d: "Importa i contatti del telefono o un file Excel, oppure aggiungi una persona alla volta." },
  ];
  return (
    <div className={card}>
      <h3 className="text-base font-semibold">La rubrica è vuota</h3>
      <p className="mt-1 text-sm text-foreground-muted">
        Qui trovi le persone a cui scrivi: nome o azienda, email, gruppi e quando hanno ricevuto l&apos;ultima mail. Si riempie in tre modi:
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {ways.map((w, i) => (
          <li key={w.t} className="rounded-xl bg-surface-2 p-3.5">
            <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              {i + 1}
            </span>
            <p className="mt-2 text-sm font-semibold">{w.t}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">{w.d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onImport} className={primaryBtn}>
          Importa contatti
        </button>
        <button type="button" onClick={onNew} className={ghostBtn}>
          + Nuovo contatto
        </button>
      </div>
    </div>
  );
}
