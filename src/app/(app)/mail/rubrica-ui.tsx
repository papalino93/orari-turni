"use client";

import { groupHex, matches, type RContact, type RGroup } from "@/lib/mail-rubrica";
import type { Indexed } from "./mail-store";

// Pezzi comuni alla scheda «Rubrica», a «Dalla rubrica» del passo 1 e alle finestre della rubrica.

export const field =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-base text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none sm:py-2.5 sm:text-sm";
export const card = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
export const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40";
export const ghostBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40";
export const dangerBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-danger/40 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-40";
export const label = "mb-1 block text-sm font-medium text-foreground";
export const checkbox = "h-5 w-5 shrink-0 cursor-pointer accent-accent";

export type Status = "tutti" | "possono" | "no";
export const STATUSES: { id: Status; label: string }[] = [
  { id: "tutti", label: "Tutti" },
  { id: "possono", label: "Possono ricevere" },
  { id: "no", label: "Non vogliono più email" },
];
export const NO_GROUP = "__senza";

// Ricerca e filtri sull'indice già pronto (senza accenti, telefono per cifre).
export function filterIndex(index: Indexed[], { q, group, status }: { q: string; group: string; status: Status }): Indexed[] {
  const query = q.trim();
  return index.filter(({ c, key, digits }) => {
    if (status === "possono" && c.out) return false;
    if (status === "no" && !c.out) return false;
    if (group === NO_GROUP ? c.groups.length > 0 : group && !c.groups.includes(group)) return false;
    return !query || matches(key, digits, query);
  });
}

export function GroupDot({ color, className = "" }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ background: groupHex(color) }} />;
}

export function GroupChip({ group }: { group: RGroup }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-inset ring-border">
      <GroupDot color={group.color} className="h-2 w-2" />
      <span className="truncate">{group.name}</span>
    </span>
  );
}

export function GroupChips({ ids, groups }: { ids: string[]; groups: Map<string, RGroup> }) {
  const list = ids.map((id) => groups.get(id)).filter((g): g is RGroup => Boolean(g));
  if (list.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {list.map((g) => (
        <GroupChip key={g.id} group={g} />
      ))}
    </span>
  );
}

export function OutBadge() {
  return <span className="inline-flex shrink-0 items-center rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-medium text-danger">Non vuole più email</span>;
}

// Il nome come si mostra: chi non ce l'ha mostra l'email, in corsivo.
export function DisplayName({ c, className = "" }: { c: RContact; className?: string }) {
  return c.name ? <span className={className}>{c.name}</span> : <span className={`${className} italic text-foreground-muted`}>Senza nome</span>;
}

export function SearchBox({ value, onChange, id, labelText }: { value: string; onChange: (v: string) => void; id: string; labelText: string }) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {labelText}
      </label>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-muted">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cerca nome, email, telefono, note"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className={`${field} pl-10`}
      />
    </div>
  );
}

export function GroupSelect({ id, value, onChange, groups, counts }: { id: string; value: string; onChange: (v: string) => void; groups: RGroup[]; counts?: Map<string, number> }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      <option value="">Tutti i gruppi</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
          {counts ? ` (${counts.get(g.id) ?? 0})` : ""}
        </option>
      ))}
      <option value={NO_GROUP}>Senza gruppo</option>
    </select>
  );
}

// Quanti contatti per gruppo.
export function groupCounts(contacts: RContact[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of contacts) for (const g of c.groups) m.set(g, (m.get(g) ?? 0) + 1);
  return m;
}

export const plural = (count: number, one: string, many: string) => `${count.toLocaleString("it-IT")} ${count === 1 ? one : many}`;
