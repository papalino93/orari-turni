"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { n } from "@/lib/mail-rubrica";
import { useMail } from "./mail-store";
import { checkbox, DisplayName, filterIndex, ghostBtn, GroupChips, groupCounts, GroupSelect, OutBadge, plural, SearchBox } from "./rubrica-ui";

const PAGE = 50;

// Passo 1, «Dalla rubrica»: cerca, filtra per gruppo, «Seleziona tutti (N)». Chi non vuole più
// email si vede ma non si sceglie; i contatti eliminati non ci sono.
export function RubricaPicker() {
  const { data, index, loadError, ensureLoaded, reload, picked, setPicked, setTab } = useMail();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const query = useDeferredValue(q);

  useEffect(() => ensureLoaded(), [ensureLoaded]);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const counts = useMemo(() => groupCounts(data?.contacts ?? []), [data]);
  const filtered = useMemo(() => {
    const list = filterIndex(index, { q: query, group, status: "tutti" });
    return onlyPicked ? list.filter((x) => picked.has(x.c.id)) : list;
  }, [index, query, group, onlyPicked, picked]);
  const pickable = filtered.filter((x) => !x.c.out);
  const outHere = filtered.length - pickable.length;
  const allOn = pickable.length > 0 && pickable.every((x) => picked.has(x.c.id));
  const pickedCount = useMemo(() => (data ? data.contacts.filter((c) => picked.has(c.id) && !c.out).length : picked.size), [data, picked]);

  if (!data) {
    return (
      <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-foreground-muted" role="status">
        {loadError ? (
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-danger">{loadError}</span>
            <button type="button" className={ghostBtn} onClick={() => void reload()}>
              Riprova
            </button>
          </span>
        ) : (
          "Apro la rubrica…"
        )}
      </div>
    );
  }

  if (data.contacts.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm">
        <p className="font-medium">La rubrica è ancora vuota.</p>
        <p className="mt-1 text-foreground-muted">
          Si riempie da sola: chi riceve una mail da qui ci entra dopo l&apos;invio, e chi prenota dal sito ci entra se chiede le
          novità. Puoi anche importare i contatti del telefono o di un file.
        </p>
        <button type="button" onClick={() => setTab("rubrica")} className={`${ghostBtn} mt-3`}>
          Vai alla Rubrica
        </button>
      </div>
    );
  }

  function toggle(id: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  }
  function toggleAll() {
    const next = new Set(picked);
    for (const x of pickable) {
      if (allOn) next.delete(x.c.id);
      else next.add(x.c.id);
    }
    setPicked(next);
  }

  return (
    <div className="mt-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <SearchBox id="mail-rubrica-cerca" labelText="Cerca nella rubrica" value={q} onChange={(v) => (setQ(v), setLimit(PAGE))} />
        <div>
          <label htmlFor="mail-rubrica-gruppo" className="sr-only">
            Gruppo
          </label>
          <GroupSelect id="mail-rubrica-gruppo" value={group} onChange={(v) => (setGroup(v), setLimit(PAGE))} groups={groups} counts={counts} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={toggleAll} disabled={pickable.length === 0} className={ghostBtn}>
          {allOn ? `Togli tutti (${n(pickable.length)})` : `Seleziona tutti (${n(pickable.length)})`}
        </button>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} className={checkbox} />
          Solo chi hai scelto
        </label>
        {picked.size > 0 && (
          <button type="button" onClick={() => (setPicked(new Set()), setOnlyPicked(false))} className="min-h-11 text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
            Togli la scelta
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-foreground-muted" aria-live="polite">
        <b className="text-foreground">{plural(pickedCount, "persona scelta", "persone scelte")}</b>
        {" · "}
        {query || group || onlyPicked ? `${plural(filtered.length, "contatto", "contatti")} in questo elenco` : `${plural(data.contacts.length, "contatto", "contatti")} in rubrica`}
        {outHere > 0 && ` · ${plural(outHere, "non vuole", "non vogliono")} più email e non ${outHere === 1 ? "si può" : "si possono"} scegliere`}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-foreground-muted">
          {onlyPicked ? "Non hai ancora scelto nessuno." : "Nessun contatto corrisponde alla ricerca."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border" aria-label="Contatti della rubrica">
          {filtered.slice(0, limit).map(({ c }) => (
            <li key={c.id}>
              <label className={`flex min-h-14 items-center gap-3 px-3 py-2 ${c.out ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-surface-2/60"}`}>
                <input
                  type="checkbox"
                  disabled={Boolean(c.out)}
                  checked={picked.has(c.id) && !c.out}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                  aria-label={`${c.name || c.email}${c.out ? " (non vuole più email)" : ""}`}
                  className={checkbox}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <DisplayName c={c} className="min-w-0 truncate text-sm font-medium" />
                    {c.out && <OutBadge />}
                  </span>
                  <span className="block truncate text-xs text-foreground-muted">{c.email}</span>
                </span>
                <span className="hidden max-w-[40%] sm:flex sm:justify-end">
                  <GroupChips ids={c.groups} groups={groupMap} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE * 4)} className={`${ghostBtn} mt-3 w-full`}>
          Mostra altri ({n(filtered.length - limit)} ancora)
        </button>
      )}
    </div>
  );
}
