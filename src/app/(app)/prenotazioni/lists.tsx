"use client";

// Pezzi comuni degli elenchi di Prenotazioni: la scheda di una richiesta (pannello «Richieste»,
// «Cerca»), le persone, i riquadri vuoti e i piccoli segni («Mancano: ora»).

import { missingText, peopleText, tableText } from "@/lib/booking/rules";
import { ALLERGY_TEXT, StatusChip, TestChip } from "./booking-sheet";
import { dayLabel, duration, originShort, sourceText, viewOf } from "./format";
import type { BookingItem } from "./types";

export function CardList({ children, single = false }: { children: React.ReactNode; single?: boolean }) {
  return <ul className={`grid grid-cols-[minmax(0,1fr)] gap-2 ${single ? "" : "lg:grid-cols-[repeat(2,minmax(0,1fr))]"}`}>{children}</ul>;
}

// Numero di persone accanto al nome: sul telefono compatto («4» con l'omino), così il nome
// ha spazio; da tablet in su per esteso («4 persone»).
export function People({ n, unknown = false }: { n: number; unknown?: boolean }) {
  if (unknown) return <span className="shrink-0 text-sm font-semibold text-gold">persone ?</span>;
  return (
    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
      <span className="inline-flex items-center gap-1 sm:hidden" aria-hidden>
        {n}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </span>
      <span className="max-sm:sr-only">{peopleText(n)}</span>
    </span>
  );
}

// Riquadro vuoto, con eventuali pulsanti («+ Prenotazione», «Importa dal librone»).
export function Empty({ title, text, icon, children }: { title: string; text?: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-5 py-8 text-center" data-testid="vuoto">
      {icon && <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent-ink">{icon}</div>}
      <p className="font-serif text-lg font-semibold text-foreground">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">{text}</p>}
      {children && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

// «Mancano: ora, persone» in giallo: prenotazione vera da completare.
export function MissingChip({ b }: { b: Pick<BookingItem, "timeUnknown" | "peopleUnknown"> }) {
  return <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold ring-1 ring-inset ring-gold/40">{missingText(b)}</span>;
}

// Una richiesta nell'elenco: tutta toccabile, apre il dettaglio con le risposte.
export function RequestCard({ b, now, today, onOpen, showStatus = false }: { b: BookingItem; now: number; today: string; onOpen: (id: string) => void; showStatus?: boolean }) {
  const v = viewOf(b, now);
  const waiting = (now - b.createdAt) / 60000;
  const day = dayLabel(b.day, today);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(b.id)}
        className={`flex w-full items-stretch gap-3 rounded-2xl border bg-surface p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:border-accent ${
          v === "PENDING" && waiting >= 30 ? "border-danger/40" : "border-border"
        }`}
      >
        <span className={`flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl px-1 py-2 ${day === "Oggi" ? "bg-accent/15" : "bg-surface-2"}`}>
          <span className={`text-center text-[11px] font-semibold uppercase leading-tight tracking-wide ${day === "Oggi" ? "text-accent-ink" : "text-foreground-muted"}`}>{day}</span>
          {b.timeUnknown ? (
            <span className="text-center text-[12px] font-semibold leading-tight text-gold">ora da definire</span>
          ) : (
            <span className="text-lg font-semibold tabular-nums leading-tight text-foreground">{v === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:truncate">{b.name}</span>
            <People n={b.people} unknown={b.peopleUnknown} />
          </span>
          {b.note && <span className="mt-0.5 block truncate text-sm text-foreground-muted">«{b.note}»</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {(showStatus || v === "PROPOSED") && <StatusChip b={b} now={now} />}
            {missingText(b) && b.status === "CONFIRMED" && <MissingChip b={b} />}
            {b.menu && <span className="rounded-md bg-gold/10 px-1.5 py-0.5 font-semibold text-gold ring-1 ring-inset ring-gold/25">{b.menu}</span>}
            {b.isTest && <TestChip />}
            {b.allergies && <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">{ALLERGY_TEXT}</span>}
            {v === "PENDING" &&
              (waiting >= 30 ? (
                <span className="font-semibold text-danger">in attesa da {duration(waiting)}</span>
              ) : (
                <span className="text-foreground-muted">arrivata {duration(waiting)} fa</span>
              ))}
            {v === "PROPOSED" && <span className="text-foreground-muted">aveva chiesto le {b.time}</span>}
            {b.table && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-semibold text-accent-ink">{tableText(b.table)}</span>}
            {b.manual ? (
              <span className="text-foreground-muted">{originShort(b)}</span>
            ) : (
              b.source && b.source !== "altro" && <span className="text-foreground-muted">{sourceText(b.source, b.promoTitle)}</span>
            )}
          </span>
        </span>
        <span aria-hidden className="self-center text-foreground-muted">
          ›
        </span>
      </button>
    </li>
  );
}

// Icone semplici, nello stile delle altre (tratto 2, angoli tondi).
export function InboxIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5.5h13L21 13v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-5z" />
    </svg>
  );
}
export function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
export function DotsIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}
export function CalendarPlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M12 13.2v4.6M9.7 15.5h4.6" />
    </svg>
  );
}
