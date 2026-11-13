"use client";

// Vista Giorno dell'agenda («esplosa»): intestazione con orari, eventi, note e totali, la striscia del
// carico per fascia, le prenotazioni raggruppate per mezz'ora con le intestazioni che restano in vista,
// le richieste online ancora da confermare al loro posto (tratteggiate), le annullate barrate in fondo
// e «In servizio» chiuso in fondo.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { bookingsText, missingText, peopleText, romeParts, tableText } from "@/lib/booking/rules";
import {
  byTime,
  eventsOn,
  eventTime,
  groupByTime,
  isOpenRequest,
  matchesSearch,
  minutesOf,
  slotLabel,
  summarize,
  type AgendaBooking,
  type AgendaData,
  type AgendaNote,
} from "@/lib/booking/agenda";
import { rangesFor } from "@/lib/menu-venue";
import { deleteDayNote, saveDayNote, setArrival } from "./actions";
import { AgendaPrint } from "./agenda";
import { ClosedChip, EventPill, FullnessBar, PeriodEmpty, type CalendarProps } from "./calendar";
import { MoreMenu } from "./panel";
import { clock, originShort, phoneDisplay, telLink } from "./format";

type DayProps = CalendarProps & { day: string; data: AgendaData; capacity: number };

// Le fasce passate di oggi si possono chiudere (restano un tocco più in là).
export function DayView({ day, data, capacity, today, now, hours, countTests, onOpen, onNew, onImport, onCloseRequests, onReopenRequests }: DayProps) {
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [noteEdit, setNoteEdit] = useState<{ note: AgendaNote | null } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => (data.bookings ?? []).filter((b) => b.day === day), [data.bookings, day]);
  const live = useMemo(() => all.filter((b) => b.status === "CONFIRMED" || isOpenRequest(b, now)).sort(byTime), [all, now]);
  const cancelled = useMemo(() => all.filter((b) => b.status === "CANCELLED").sort(byTime), [all]);
  const sum = useMemo(() => summarize(all, countTests, now), [all, countTests, now]);
  const shown = useMemo(() => live.filter((b) => matchesSearch(b, query)), [live, query]);
  const groups = useMemo(() => groupByTime(shown, countTests), [shown, countTests]);
  const strip = useMemo(() => groupByTime(live.filter((b) => b.status === "CONFIRMED" && !b.timeUnknown), countTests), [live, countTests]);

  const closure = data.closures[day] ?? null;
  const ranges = rangesFor(hours, day);
  const closed = closure?.kind === "closed" || !ranges.length;
  const requestsClosed = closure?.kind === "full";
  const events = eventsOn(data.events, day);
  const notes = data.notes.filter((n) => n.day === day);
  const staff = data.staff[day] ?? null;
  const isToday = day === today;
  const past = day < today;

  // Adesso, in minuti del giorno commerciale (dopo mezzanotte si va oltre le 24:00).
  const nowParts = romeParts(new Date(now));
  const nowMin = isToday ? (nowParts.minutes < 300 ? nowParts.minutes + 1440 : nowParts.minutes) : null;
  // Fasce finite da più di un'ora (solo oggi): si possono nascondere.
  const pastGroups = nowMin === null ? [] : groups.filter((g) => g.minutes >= 0 && g.minutes + 90 <= nowMin && !g.rows.some((b) => b.status === "CONFIRMED" && !b.arrivedAt && !b.noShowAt));
  const hidePast = pastGroups.length >= 2 && !showPast && !query;
  const visibleGroups = hidePast ? groups.filter((g) => !pastGroups.includes(g)) : groups;
  const nowIndex = nowMin === null ? -1 : visibleGroups.findIndex((g) => g.minutes >= 0 && g.minutes > nowMin);

  function scrollTo(key: string) {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-gruppo="${key}"]`);
    if (!el) {
      setShowPast(true);
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-gruppo="${key}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
      return;
    }
    el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  const totalsText = sum.count ? `${bookingsText(sum.count)} · ${peopleText(sum.people)}` : "Nessuna prenotazione";
  const printList = live.filter((b) => b.status === "CONFIRMED");

  return (
    <div className="space-y-3">
      {/* Intestazione del giorno */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="flex items-start gap-2">
          <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className={`inline-flex items-center gap-1.5 tabular-nums ${closed ? "font-semibold text-danger" : "text-foreground-muted"}`} data-testid="agenda-orari">
              <ClockIcon />
              {closed ? `Chiuso${closure?.kind === "closed" && closure.reason ? ` · ${closure.reason}` : ""}` : ranges.map((r) => `${r.open}–${r.close}`).join(" · ")}
            </span>
            {requestsClosed && !closed && <ClosedChip />}
          </div>
          {/* Le azioni del giorno: stampa, chiudere o riaprire le richieste online, una nota. */}
          <MoreMenu
            small
            label="Azioni del giorno"
            items={[
              { label: "+ Nota del giorno", hint: "Un promemoria in cima al giorno", onSelect: () => setNoteEdit({ note: null }) },
              ...(printList.length ? [{ label: "Stampa il giorno", hint: "Il foglio con tutte le prenotazioni", onSelect: () => window.print() }] : []),
              ...(!past && !closed
                ? [
                    { kind: "separator" as const },
                    requestsClosed
                      ? { label: "Riapri le richieste online", hint: "I clienti possono di nuovo chiedere un tavolo per questo giorno", onSelect: () => onReopenRequests(day), testId: "riapri-richieste" }
                      : {
                          label: "Chiudi le richieste online per questo giorno",
                          hint: isToday ? "Stasera siete al completo: i clienti vedono «Completo»" : "I clienti vedono questo giorno come «Completo»",
                          onSelect: () => onCloseRequests(day),
                          testId: "chiudi-richieste",
                        },
                  ]
                : []),
            ]}
          />
        </div>

        {events.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {events.map((e) => (
              <a key={e.slug} href={`/menu/p/${e.slug}`} target="_blank" rel="noopener noreferrer" className="min-w-0 max-w-full hover:opacity-90" title="Apri la pagina dell'evento">
                <EventPill title={e.title} time={eventTime(e) || undefined} />
              </a>
            ))}
          </div>
        )}

        {/* Note del giorno */}
        <div className="mt-3 space-y-1.5">
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNoteEdit({ note: n })}
              className="flex w-full items-start gap-2 rounded-xl bg-gold/[0.08] px-3 py-2 text-left ring-1 ring-inset ring-gold/35 hover:ring-gold"
              aria-label={`Nota del giorno: ${n.text}. Tocca per cambiarla`}
            >
              <span aria-hidden className="pt-0.5 text-gold">✎</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{n.text}</span>
                <span className="block text-[11px] text-foreground-muted">{n.author}</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setNoteEdit({ note: null })} className="min-h-9 rounded-full px-1 text-xs font-semibold text-foreground-muted underline decoration-dotted underline-offset-4 hover:text-foreground">
            + Nota del giorno
          </button>
        </div>

        {/* Totali (senza prenotazioni lo dice già il riquadro vuoto qui sotto) */}
        <div className={`mt-3 border-t border-border pt-3 ${live.length === 0 && cancelled.length === 0 ? "hidden" : ""}`}>
          <p className="text-foreground" data-testid="agenda-totali">
            <span className="text-lg font-semibold tabular-nums">{totalsText}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-foreground-muted" data-testid="agenda-totali-extra">
            {isToday && sum.count > 0 && (
              <span>
                arrivati {sum.arrived} su {sum.count}
              </span>
            )}
            {sum.pending > 0 && <span className="font-semibold text-gold">+ {sum.pending} da confermare</span>}
            {sum.peopleUnknown > 0 && <span className="font-semibold text-gold">+ {sum.peopleUnknown} con persone da definire</span>}
            {sum.timeUnknown > 0 && <span className="font-semibold text-gold">{sum.timeUnknown} con l&apos;ora da definire</span>}
          </p>
          {sum.count > 0 && (
            <div className="mt-2 flex items-center gap-3">
              <FullnessBar people={sum.people} capacity={capacity} className="flex-1" />
              <span className="shrink-0 text-xs tabular-nums text-foreground-muted">di solito pieni oltre {capacity}</span>
            </div>
          )}
          {strip.length > 1 && <LoadStrip groups={strip} capacity={capacity} nowMin={nowMin} onPick={scrollTo} />}
        </div>
      </div>

      {/* Cerca nel giorno: utile nelle serate piene. */}
      {live.length > 8 && (
        <label className="relative block">
          <span className="sr-only">Cerca nel giorno: nome, telefono, nota o menù</span>
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nel giorno" className={`${inputClass} min-h-11 rounded-full! pl-10`} />
        </label>
      )}

      {/* Prenotazioni per fascia oraria */}
      <div ref={listRef} className="space-y-3">
        {live.length === 0 && cancelled.length === 0 ? (
          <PeriodEmpty what={isToday ? "today" : "day"} past={past} onNew={() => onNew(day)} onImport={onImport} />
        ) : shown.length === 0 && query ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-center text-sm text-foreground-muted">Nessuna prenotazione trovata per «{query.trim()}».</p>
        ) : null}

        {hidePast && (
          <button type="button" onClick={() => setShowPast(true)} className="min-h-11 w-full rounded-xl border border-dashed border-border px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground">
            Mostra le fasce già passate ({pastGroups.reduce((s, g) => s + g.rows.length, 0)})
          </button>
        )}

        {visibleGroups.map((g, i) => (
          <div key={g.key}>
            {i === nowIndex && <NowLine minutes={nowMin!} />}
            <section data-gruppo={g.key} aria-label={`${g.label}: ${bookingsText(g.rows.length)}`} className="scroll-mt-[calc(4.5rem+env(safe-area-inset-top))]">
              <h3
                className={`sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-1 flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1.5 backdrop-blur-md ${g.minutes < 0 ? "bg-gold/15" : "bg-background/85"}`}
              >
                <span className={`whitespace-nowrap font-serif text-lg font-semibold tabular-nums ${g.minutes < 0 ? "text-gold" : "text-foreground"}`}>
                  {g.label}
                  {g.minutes >= 1440 && <span className="ml-1 font-sans text-xs font-normal text-foreground-muted">dopo mezzanotte</span>}
                </span>
                <span className="text-sm text-foreground-muted tabular-nums">
                  · {bookingsText(g.count)} · {peopleText(g.people)}
                  {g.unknownPeople > 0 && ` + ${g.unknownPeople} da definire`}
                </span>
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {g.rows.map((b) => (
                  <DayRow key={b.id} b={b} slot={g.minutes} isToday={isToday} now={now} countTests={countTests} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          </div>
        ))}
        {nowIndex === -1 && nowMin !== null && visibleGroups.some((g) => g.minutes >= 0) && <NowLine minutes={nowMin} />}

        {cancelled.length > 0 && (
          <section aria-label="Annullate" className="pt-1">
            <h3 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">Annullate ({cancelled.length})</h3>
            <ul className="space-y-1.5">
              {cancelled.map((b) => (
                <DayRow key={b.id} b={b} slot={null} isToday={false} now={now} countTests={countTests} onOpen={onOpen} cancelled />
              ))}
            </ul>
          </section>
        )}
      </div>

      <InServizio staff={staff} />

      <AgendaPrint day={day} list={printList} totals={totalsText} countTests={countTests} notes={notes.map((n) => n.text)} events={events.map((e) => e.title)} />

      {noteEdit && <DayNoteSheet day={day} note={noteEdit.note} onClose={() => setNoteEdit(null)} />}
    </div>
  );
}

// ---------- Una prenotazione

function DayRow({
  b,
  slot,
  isToday,
  now,
  countTests,
  onOpen,
  cancelled = false,
}: {
  b: AgendaBooking;
  slot: number | null;
  isToday: boolean;
  now: number;
  countTests: boolean;
  onOpen: (id: string) => void;
  cancelled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const request = b.status === "PENDING" || b.status === "PROPOSED";
  const missing = missingText(b);
  const m = minutesOf(b);
  // L'ora esatta sulla riga quando non è quella della fascia (20:45 nella fascia delle 20:30).
  const ownTime = slot !== null && m >= 0 && m !== slot ? (b.status === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time) : null;
  const late = isToday && !cancelled && !request && !b.timeUnknown && !b.arrivedAt && !b.noShowAt && b.startsAt < now && b.startsAt > now - 3 * 3600000;
  // «Di prova» sempre in vista; con l'agenda accesa (le prove non contano) anche più chiara.
  const test = b.isTest;
  const faded = b.isTest && !countTests;
  const label = `${b.name}, ${b.peopleUnknown ? "persone da definire" : peopleText(b.people)}${b.timeUnknown ? ", ora da definire" : `, alle ${b.status === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time}`}${request ? ", da confermare" : ""}${cancelled ? ", annullata" : ""}`;

  async function mark(value: boolean | null) {
    setBusy(true);
    try {
      const res = await setArrival(b.id, value);
      if (!res.ok) toast.showError(res.error);
      else toast.showSuccess(value ? `${b.name}: arrivati` : `${b.name}: segno tolto`);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  // Contorni con ring/outline: nell'app il colore dei bordi è fissato per tutti.
  const frame = request
    ? "outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-gold/75 bg-gold/[0.04]"
    : missing && !cancelled
      ? "ring-1 ring-inset ring-gold/55 bg-surface"
      : b.arrivedAt
        ? "ring-1 ring-inset ring-success/40 bg-surface"
        : "ring-1 ring-inset ring-border bg-surface";
  return (
    <li className={`relative flex items-stretch gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-2/50 ${frame} ${cancelled ? "opacity-55" : b.noShowAt || faded ? "opacity-65" : ""}`} data-testid="agenda-riga">
      {missing && !cancelled && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gold" />}
      {/* Persone, grandi (come sul librone) */}
      <span className={`flex w-11 shrink-0 flex-col items-center justify-center self-start rounded-lg py-1.5 ${b.peopleUnknown ? "bg-gold/15 text-gold" : "bg-surface-2 text-foreground"} ${cancelled ? "line-through" : ""}`}>
        <span className="font-serif text-2xl font-semibold leading-none tabular-nums">{b.peopleUnknown ? "?" : b.people}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide opacity-75">pers.</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {/* Il pulsante copre tutta la riga (il telefono resta toccabile sopra). */}
          <button type="button" onClick={() => onOpen(b.id)} aria-label={label} className={`min-w-0 truncate text-left text-[15px] font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl after:content-[''] ${cancelled ? "line-through" : ""}`}>
            {b.name}
          </button>
          {ownTime && <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground-muted">{ownTime}</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {b.phone ? (
            <a href={telLink(b.phone)} className="relative z-[1] inline-flex min-h-6 items-center tabular-nums text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground" aria-label={`Chiama ${b.name}: ${phoneDisplay(b.phone)}`}>
              {phoneDisplay(b.phone)}
            </a>
          ) : (
            !cancelled && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold ring-1 ring-inset ring-gold/30">Manca il numero</span>
          )}
          {b.table && !cancelled && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent-ink">{tableText(b.table)}</span>}
          {b.menu && !cancelled && <span className="rounded-md bg-gold/10 px-1.5 py-0.5 text-xs font-semibold text-gold ring-1 ring-inset ring-gold/25">{b.menu}</span>}
          {b.allergies && !cancelled && <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger">⚠ Allergie</span>}
          {missing && !cancelled && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold ring-1 ring-inset ring-gold/40">{missing}</span>}
          {request && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold ring-1 ring-inset ring-gold/30">{b.status === "PROPOSED" ? `Proposto alle ${b.proposedTime}: aspetta il cliente` : "Da confermare"}</span>}
          {test && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground-muted ring-1 ring-inset ring-border">Di prova</span>}
          {cancelled && <span className="text-xs font-semibold text-foreground-muted">Annullata</span>}
          {b.arrivedAt && !cancelled && <span className="text-xs font-semibold text-success">✓ Arrivati alle {clock(b.arrivedAt)}</span>}
          {b.noShowAt && !cancelled && <span className="text-xs font-semibold text-danger">Non venuti</span>}
          {late && <span className="text-xs font-medium text-gold">non ancora arrivati</span>}
          <span className="text-xs text-foreground-muted">{request ? "Online" : originShort(b)}</span>
        </span>
        {b.note && !cancelled && <span className="mt-0.5 block truncate text-sm text-foreground-muted">«{b.note}»</span>}
      </span>
      {/* Oggi: «arrivati» con un tocco, senza aprire la prenotazione. */}
      {isToday && b.status === "CONFIRMED" && !cancelled && !b.noShowAt && (
        <button
          type="button"
          disabled={busy}
          onClick={() => mark(b.arrivedAt ? null : true)}
          aria-pressed={Boolean(b.arrivedAt)}
          aria-label={b.arrivedAt ? `Togli «arrivati» a ${b.name}` : `Segna arrivati: ${b.name}`}
          title={b.arrivedAt ? "Togli il segno «arrivati»" : "Segna arrivati"}
          className={`relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full text-lg ring-1 ring-inset disabled:opacity-50 ${b.arrivedAt ? "bg-success text-white ring-success" : "text-success ring-success/45 hover:bg-success-bg"}`}
        >
          ✓
        </button>
      )}
    </li>
  );
}

function NowLine({ minutes }: { minutes: number }) {
  return (
    <div role="presentation" data-testid="agenda-adesso" className="relative my-1 flex items-center gap-2 px-1">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent/15" />
      <span className="h-0.5 flex-1 rounded-full bg-accent/70" />
      <span className="shrink-0 text-xs font-semibold tabular-nums text-accent-ink">adesso · {slotLabel(minutes)}</span>
    </div>
  );
}

// Carico per fascia: persone confermate ogni mezz'ora, come piccole colonne. Un tocco porta alla fascia.
function LoadStrip({ groups, capacity, nowMin, onPick }: { groups: ReturnType<typeof groupByTime>; capacity: number; nowMin: number | null; onPick: (key: string) => void }) {
  const first = groups[0].minutes;
  const last = groups[groups.length - 1].minutes;
  const slots: { slot: number; key: string; people: number; count: number }[] = [];
  for (let s = first; s <= last && slots.length < 48; s += 30) {
    const g = groups.find((x) => x.minutes === s);
    slots.push({ slot: s, key: g?.key ?? "", people: g?.people ?? 0, count: g?.count ?? 0 });
  }
  const peak = Math.max(...slots.map((s) => s.people), Math.round(capacity / 3), 1);
  return (
    <div className="mt-3" aria-label="Persone per fascia oraria">
      <div className="flex h-14 items-end gap-[3px]">
        {slots.map((s) => {
          const h = s.people ? Math.max(10, Math.round((s.people / peak) * 100)) : 4;
          const nowHere = nowMin !== null && nowMin >= s.slot && nowMin < s.slot + 30;
          return (
            <button
              key={s.slot}
              type="button"
              disabled={!s.count}
              onClick={() => s.key && onPick(s.key)}
              aria-label={`${slotLabel(s.slot)}: ${peopleText(s.people)}`}
              title={`${slotLabel(s.slot)} · ${s.count ? `${bookingsText(s.count)} · ${peopleText(s.people)}` : "nessuna"}`}
              className="group flex h-full min-w-0 flex-1 items-end disabled:cursor-default"
            >
              <span
                className={`block w-full rounded-t-[3px] transition-colors ${s.people ? "bg-gold/70 group-hover:bg-accent" : "bg-border/70"} ${nowHere ? "outline outline-2 outline-offset-1 outline-accent/60" : ""}`}
                style={{ height: `${h}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[3px] text-[10px] tabular-nums text-foreground-muted">
        {slots.map((s) => (
          <span key={s.slot} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-left">
            {s.slot % 60 === 0 && (slots.length <= 12 || (s.slot / 60) % 2 === 0) ? slotLabel(s.slot) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// «In servizio (3)»: chiuso all'inizio, in fondo al giorno.
function InServizio({ staff }: { staff: AgendaData["staff"][string] | null }) {
  const working = staff?.working ?? [];
  const away = staff?.away ?? [];
  const hidden = staff !== null && staff.working === null;
  return (
    <details className="group rounded-2xl border border-border bg-surface px-4 py-1" data-testid="in-servizio">
      <summary className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-2 text-sm font-semibold text-foreground">
        <span>
          In servizio ({working.length})
          {away.length > 0 && <span className="font-normal text-foreground-muted"> · {away.length} in ferie o permesso</span>}
        </span>
        <span aria-hidden className="text-foreground-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="pb-3 pt-1 text-sm">
        {hidden ? (
          <p className="text-foreground-muted">L&apos;orario di quel giorno non è ancora confermato.</p>
        ) : working.length === 0 && away.length === 0 ? (
          <p className="text-foreground-muted">Nessun turno segnato per questo giorno.</p>
        ) : (
          <ul className="divide-y divide-border">
            {working.map((w) => (
              <li key={w.name} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="font-medium text-foreground">{w.name}</span>
                <span className="text-right tabular-nums text-foreground-muted">{w.ranges.join(" · ")}</span>
              </li>
            ))}
            {away.map((a) => (
              <li key={`${a.name}-${a.what}`} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="text-foreground-muted">{a.name}</span>
                <span className="text-right text-foreground-muted">{a.what}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

// ---------- Nota del giorno: aggiungi, cambia, togli

function DayNoteSheet({ day, note, onClose }: { day: string; note: AgendaNote | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(note?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const res = await saveDayNote({ id: note?.id ?? null, day, text });
      if (!res.ok) {
        toast.showError(res.error);
        return;
      }
      toast.showSuccess(note ? "Nota cambiata" : "Nota aggiunta");
      router.refresh();
      onClose();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!note) return;
    setBusy(true);
    try {
      const res = await deleteDayNote(note.id);
      if (!res.ok) toast.showError(res.error);
      else toast.showSuccess("Nota tolta");
      router.refresh();
      onClose();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={note ? "Nota del giorno" : "Nuova nota del giorno"} onClose={onClose} dirty={text.trim() !== (note?.text ?? "")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">Nota</span>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoFocus placeholder="es. EVENTO DAINELLI, sala piccola riservata" className={inputClass} />
          <span className="mt-1 block text-xs text-foreground-muted">Si vede in cima al giorno, nella settimana, nel mese e sul foglio stampato.</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {note && (
            <button type="button" disabled={busy} onClick={() => setAskRemove(true)} className="min-h-11 rounded-full px-3 text-sm font-medium text-danger hover:bg-danger-bg">
              Togli la nota
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-medium text-foreground-muted hover:text-foreground">
            Annulla
          </button>
          <button type="submit" disabled={busy || !text.trim()} className="min-h-11 rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
            {busy ? "Un attimo…" : "Salva la nota"}
          </button>
        </div>
      </form>
      {askRemove && (
        <ConfirmSheet title="Togliere la nota del giorno?" confirmLabel="Togli la nota" danger busy={busy} onConfirm={remove} onCancel={() => setAskRemove(false)}>
          <p>«{note?.text}» sparisce dall&apos;agenda di questo giorno.</p>
        </ConfirmSheet>
      )}
    </Sheet>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
