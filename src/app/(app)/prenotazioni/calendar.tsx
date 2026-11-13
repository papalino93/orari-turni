"use client";

// Agenda delle prenotazioni a calendario: Giorno · Settimana · Mese, come il librone ma da sfogliare.
// Dal calendario un tocco su un giorno lo «apre» nella vista Giorno. I dati del periodo in vista
// arrivano da /prenotazioni/agenda (solo quei giorni, senza cronologia) e si ricaricano a ogni
// aggiornamento della pagina (dopo un salvataggio, ogni 75 secondi, al ritorno in primo piano).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, businessDay, romeParts, type BookingSettings } from "@/lib/booking/rules";
import { rangesFor, type Hours } from "@/lib/menu-venue";
import {
  byTime,
  capacityOf,
  daysBetween,
  eventsOn,
  fullness,
  FULLNESS_TEXT,
  inMonth,
  isOpenRequest,
  PERIOD_WORD,
  periodRange,
  periodTitle,
  shiftPeriod,
  summarize,
  WEEKDAY_SHORT,
  type AgendaBooking,
  type AgendaData,
  type AgendaView,
  type DaySummary,
} from "@/lib/booking/agenda";
import { DayView } from "./calendar-day";

const VIEW_KEY = "prenotazioni-agenda-vista";
const VIEWS: { id: AgendaView; label: string }[] = [
  { id: "day", label: "Giorno" },
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
];
// Nella vista Settimana, per ogni giorno: le prime prenotazioni, poi «N in più».
const WEEK_CHIPS = 8;

export type CalendarProps = {
  today: string;
  now: number;
  // Cambia a ogni aggiornamento della pagina: si ricaricano i dati del periodo in vista.
  version: number;
  settings: BookingSettings;
  hours: Hours;
  countTests: boolean;
  isOwner: boolean;
  phoneUA: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: (day: string) => void;
  onCloseRequests: (day: string) => void;
  onReopenRequests: (day: string) => void;
  // Il giorno in vista (per «+ Nuova prenotazione» in cima alla pagina).
  onDayChange?: (day: string) => void;
};

// ---------- Dati del periodo

type Loaded = { key: string; data: AgendaData; version: number };

function agendaUrl(view: AgendaView, from: string, to: string) {
  return `/prenotazioni/agenda?dal=${from}&al=${to}${view === "month" ? "" : "&righe=1"}${view === "day" ? "&servizio=1" : ""}`;
}

function useAgendaData(view: AgendaView, anchor: string, version: number) {
  const { from, to } = periodRange(view, anchor);
  const key = `${view}:${from}:${to}`;
  // Periodi già letti (anche quelli accanto, letti in anticipo): le frecce rispondono subito.
  const [store, setStore] = useState<Record<string, Loaded>>({});
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const [retry, setRetry] = useState(0);

  const fetchRange = useCallback(async (v: AgendaView, f: string, t: string, ver: number) => {
    const r = await fetch(agendaUrl(v, f, t), { cache: "no-store", headers: { accept: "application/json" } });
    const json = (await r.json().catch(() => null)) as (AgendaData & { error?: string }) | null;
    if (!r.ok || !json || json.error) throw new Error(json?.error ?? "Non riesco a caricare l'agenda.");
    const l: Loaded = { key: `${v}:${f}:${t}`, data: json, version: ver };
    setStore((s) => {
      const next = { ...s, [l.key]: l };
      const keys = Object.keys(next);
      // Non più di una trentina di periodi in memoria.
      if (keys.length > 30) delete next[keys[0]];
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    if (storeRef.current[key]?.version === version) return;
    fetchRange(view, from, to, version)
      .then(() => {
        if (!alive) return;
        setError(null);
        if (view !== "month") {
          for (const dir of [1, -1] as const) {
            const near = periodRange(view, shiftPeriod(view, from, dir));
            if (storeRef.current[`${view}:${near.from}:${near.to}`]?.version !== version) fetchRange(view, near.from, near.to, version).catch(() => {});
          }
        }
      })
      .catch((e: unknown) => {
        if (alive) setError({ key, text: e instanceof Error ? e.message : "Non riesco a caricare l'agenda." });
      });
    return () => {
      alive = false;
    };
  }, [key, view, from, to, version, retry, fetchRange]);

  const current = store[key]?.data ?? null;
  return { data: current, from, to, error: !current && error?.key === key ? error.text : null, retry: () => setRetry((n) => n + 1) };
}

// ---------- Vista scelta (ricordata su questo dispositivo)

function useView(phoneUA: boolean): [AgendaView, (v: AgendaView) => void] {
  const [view, setViewState] = useState<AgendaView>(phoneUA ? "day" : "week");
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(VIEW_KEY);
    } catch {
      stored = null;
    }
    const phone = window.matchMedia("(max-width: 767px)").matches;
    const next: AgendaView = stored === "day" || stored === "week" || stored === "month" ? stored : phone ? "day" : "week";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la vista ricordata è solo nel browser
    setViewState(next);
  }, []);
  const setView = useCallback((v: AgendaView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* resta per questa volta */
    }
  }, []);
  return [view, setView];
}

// ---------- Agenda

export function AgendaCalendar(props: CalendarProps) {
  const { today, now, version, settings, hours, countTests, phoneUA, onDayChange } = props;
  const [view, setView] = useView(phoneUA);
  const [anchor, setAnchorState] = useState(today);
  // Da settimana o mese un tocco su un giorno lo «apre»: piccola animazione da dove si è toccato.
  const [explode, setExplode] = useState<{ x: number; y: number; n: number } | null>(null);
  const { data, from, to, error, retry } = useAgendaData(view, anchor, version);
  const capacity = capacityOf(settings.capacityHint);
  const min = addDays(today, -183);
  const max = addDays(today, 730);

  const setAnchor = useCallback(
    (d: string) => {
      const day = d < min ? min : d > max ? max : d;
      setAnchorState(day);
      onDayChange?.(day);
    },
    [min, max, onDayChange],
  );
  const go = useCallback((dir: 1 | -1) => setAnchor(shiftPeriod(view, anchor, dir)), [setAnchor, view, anchor]);
  const openDay = useCallback(
    (day: string, e?: { clientX: number; clientY: number }) => {
      setAnchor(day);
      setView("day");
      setExplode(e ? { x: e.clientX, y: e.clientY, n: Date.now() } : null);
    },
    [setAnchor, setView],
  );

  // Tastiera: ← → periodo prima/dopo, «t» oggi (non mentre si scrive o con un foglio aperto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.closest("[role=dialog], [role=alertdialog]"))) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "t" || e.key === "T") setAnchor(today);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, setAnchor, today]);

  const title = periodTitle(view, anchor, today);
  const night = romeParts(new Date(now)).dateKey !== today;
  const near = view === "day" ? (anchor === today ? "Oggi" : anchor === addDays(today, 1) && !night ? "Domani" : anchor === addDays(today, -1) ? "Ieri" : null) : null;
  const showsToday = today >= from && today <= to;

  return (
    <section aria-label="Agenda" className="space-y-3" data-vista={view}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
        {/* Titolo del periodo: un tocco apre il calendario per saltare a un giorno. */}
        <div className="relative order-1 min-w-0 flex-1 md:order-2 md:flex-none">
          <span className="flex min-h-11 items-center gap-1.5 rounded-xl px-1 md:px-2">
            <span className="min-w-0">
              {near && <span className="block text-[11px] font-semibold uppercase tracking-wider text-accent-ink">{near}</span>}
              <span data-testid="agenda-titolo" className="block font-serif text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground md:text-2xl">
                {title}
              </span>
            </span>
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="mt-1 shrink-0 text-foreground-muted">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
          <input
            type="date"
            value={anchor}
            min={min}
            max={max}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            onClick={(e) => {
              try {
                (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {
                /* il calendario si apre da solo */
              }
            }}
            aria-label="Scegli la data"
            title="Scegli la data"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="order-2 flex shrink-0 items-center gap-1 md:order-1">
          <button
            type="button"
            onClick={() => setAnchor(today)}
            aria-current={showsToday ? "date" : undefined}
            title="Oggi (tasto T)"
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-inset ${showsToday ? "bg-surface text-foreground-muted ring-border" : "bg-surface text-foreground ring-accent/60 hover:ring-accent"}`}
          >
            Oggi
          </button>
          <NavButton label={PERIOD_WORD[view].prev} disabled={anchor <= min} onClick={() => go(-1)}>
            <path d="M15 6l-6 6 6 6" />
          </NavButton>
          <NavButton label={PERIOD_WORD[view].next} disabled={anchor >= max} onClick={() => go(1)}>
            <path d="M9 6l6 6-6 6" />
          </NavButton>
        </div>
        <div role="radiogroup" aria-label="Vista dell'agenda" className="order-3 grid w-full grid-cols-3 rounded-full border border-border bg-surface-2/70 p-1 md:ml-auto md:w-auto">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setView(v.id)}
              className={`min-h-9 rounded-full px-4 text-sm font-semibold transition-colors ${view === v.id ? "bg-accent text-accent-foreground shadow-sm" : "text-foreground-muted hover:text-foreground"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && !data ? (
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-bg px-4 py-4 text-sm text-foreground">
          <p className="font-semibold text-danger">{error}</p>
          <p className="mt-1 text-foreground-muted">Controlla la connessione e riprova.</p>
          <button type="button" onClick={retry} className="mt-3 min-h-11 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:border-accent">
            Riprova
          </button>
        </div>
      ) : !data ? (
        <Skeleton view={view} />
      ) : view === "day" ? (
        <div
          key={explode ? `${anchor}-${explode.n}` : anchor}
          className={explode ? "motion-safe:animate-[agenda-explode_220ms_ease-out]" : ""}
          style={explode ? { transformOrigin: `${explode.x}px ${Math.max(0, explode.y - 120)}px` } : undefined}
        >
          <DayView {...props} day={anchor} data={data} capacity={capacity} />
        </div>
      ) : view === "week" ? (
        <WeekView data={data} from={from} today={today} now={now} hours={hours} countTests={countTests} capacity={capacity} onDay={openDay} onOpen={props.onOpen} />
      ) : (
        <MonthView data={data} from={from} to={to} anchor={anchor} today={today} hours={hours} capacity={capacity} onDay={openDay} />
      )}
    </section>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (tasto ${label.endsWith("prima") ? "←" : "→"})`}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-foreground ring-1 ring-inset ring-border hover:ring-accent disabled:opacity-40"
    >
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function Skeleton({ view }: { view: AgendaView }) {
  return (
    <div aria-busy="true" aria-label="Carico l'agenda" className="space-y-2">
      {Array.from({ length: view === "day" ? 4 : 3 }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2/70 motion-reduce:animate-none" />
      ))}
    </div>
  );
}

// ---------- Pezzi comuni

// «16:30–22:00», «10:00–13:00 · 16:30–22:00», «Chiuso».
export function hoursText(hours: Hours, day: string): string {
  const r = rangesFor(hours, day);
  return r.length ? r.map((x) => `${x.open}–${x.close}`).join(" · ") : "Chiuso";
}

const BAR = ["bg-transparent", "bg-gold/45", "bg-gold", "bg-accent", "bg-danger"];
const TINT = ["", "bg-gold/[0.05]", "bg-gold/[0.12]", "bg-accent/[0.13]", "bg-danger/[0.14]"];

export function FullnessBar({ people, capacity, className = "" }: { people: number; capacity: number; className?: string }) {
  const level = fullness(people, capacity);
  const pct = Math.min(100, Math.round((people / capacity) * 100));
  return (
    <span
      role="img"
      aria-label={`${FULLNESS_TEXT[level]}: ${people} persone su ${capacity}`}
      title={`${people} persone · di solito pieni oltre ${capacity}`}
      className={`block h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border/60 ${className}`}
    >
      <span className={`block h-full rounded-full ${BAR[level]}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function dayInfo(data: AgendaData, day: string, hours: Hours) {
  const closure = data.closures[day] ?? null;
  const ranges = rangesFor(hours, day);
  const closed = closure?.kind === "closed" || !ranges.length;
  return {
    closure,
    closed,
    closedText: closure?.kind === "closed" ? `Chiuso${closure.reason ? ` · ${closure.reason}` : ""}` : "Chiuso",
    requestsClosed: closure?.kind === "full",
    hours: closed ? null : ranges.map((x) => `${x.open}–${x.close}`).join(" · "),
    events: eventsOn(data.events, day),
    notes: data.notes.filter((n) => n.day === day),
  };
}

const EMPTY: DaySummary = { count: 0, people: 0, peopleUnknown: 0, timeUnknown: 0, incomplete: 0, arrived: 0, allergies: 0, pending: 0 };

// ---------- Settimana

function WeekView({
  data,
  from,
  today,
  now,
  hours,
  countTests,
  capacity,
  onDay,
  onOpen,
}: {
  data: AgendaData;
  from: string;
  today: string;
  now: number;
  hours: Hours;
  countTests: boolean;
  capacity: number;
  onDay: (day: string, e?: { clientX: number; clientY: number }) => void;
  onOpen: (id: string) => void;
}) {
  const days = daysBetween(from, addDays(from, 6));
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaBooking[]>();
    for (const b of data.bookings ?? []) {
      if (b.status === "CANCELLED") continue;
      if (b.status !== "CONFIRMED" && !isOpenRequest(b, now)) continue;
      const l = m.get(b.day) ?? [];
      l.push(b);
      m.set(b.day, l);
    }
    for (const l of m.values()) l.sort(byTime);
    return m;
  }, [data.bookings, now]);
  const sums = useMemo(() => Object.fromEntries(days.map((d) => [d, summarize(byDay.get(d) ?? [], countTests, now)])), [days, byDay, countTests, now]);
  const week = days.map((d) => ({ day: d, info: dayInfo(data, d, hours), sum: sums[d] ?? EMPTY, rows: byDay.get(d) ?? [] }));

  return (
    <>
      {/* Telefono: un giorno per riga. */}
      <ul className="space-y-2 md:hidden" aria-label="Giorni della settimana">
        {week.map(({ day, info, sum }) => {
          const isToday = day === today;
          return (
            <li key={day}>
              <button
                type="button"
                onClick={(e) => onDay(day, e)}
                aria-label={`Apri ${dayAria(day)}: ${sumAria(sum)}`}
                className={`flex w-full items-stretch gap-3 rounded-2xl bg-surface p-3 text-left shadow-[var(--shadow-card)] ring-1 ring-inset hover:ring-accent/60 ${isToday ? "ring-accent/60" : "ring-border"} ${day < today ? "opacity-80" : ""}`}
              >
                <DateBadge day={day} today={today} />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-foreground-muted tabular-nums">
                    <span className={info.closed ? "font-semibold text-danger" : ""}>{info.closed ? info.closedText : info.hours}</span>
                    {info.requestsClosed && <span>· Richieste chiuse</span>}
                  </span>
                  {info.events.map((ev) => (
                    <EventPill key={ev.slug} title={ev.title} compact />
                  ))}
                  {info.notes.map((n) => (
                    <span key={n.id} className="block truncate text-xs font-medium text-gold">
                      ✎ {n.text}
                    </span>
                  ))}
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground">
                    <span className="font-semibold tabular-nums">{sum.count ? `${sum.count} pren. · ${sum.people} pers.` : "Nessuna prenotazione"}</span>
                    {sum.pending > 0 && <span className="text-xs font-semibold text-gold">+{sum.pending} da confermare</span>}
                    {sum.incomplete > 0 && <IncompleteDot n={sum.incomplete} />}
                  </span>
                  {sum.count > 0 && <FullnessBar people={sum.people} capacity={capacity} />}
                </span>
                <span aria-hidden className="self-center text-foreground-muted">
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Tablet e computer: sette colonne. */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block" role="grid" aria-label="Settimana">
        <div role="row" className="grid grid-cols-7 border-b border-border">
          {week.map(({ day }, i) => {
            const isToday = day === today;
            return (
              <div role="columnheader" key={day} className={i ? "border-l border-border" : ""}>
                <button
                  type="button"
                  onClick={(e) => onDay(day, e)}
                  aria-label={`Apri ${dayAria(day)}`}
                  className="flex w-full flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 hover:bg-surface-2/60"
                >
                  <span className={`text-[11px] font-semibold tracking-wider ${isToday ? "text-accent-ink" : "text-foreground-muted"}`}>{WEEKDAY_SHORT[i]}</span>
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full font-serif text-[1.45rem] font-semibold tabular-nums ${isToday ? "bg-accent text-accent-foreground" : day < today ? "text-foreground-muted" : "text-foreground"}`}
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {/* Fascia «tutto il giorno»: orari, chiusure, eventi del menù, note del giorno. */}
        <div role="row" className="grid grid-cols-7 border-b border-border bg-surface-2/40">
          {week.map(({ day, info }, i) => (
            <div role="gridcell" key={day} className={`min-w-0 space-y-1 px-1.5 py-1.5 ${i ? "border-l border-border" : ""}`}>
              <p className={`truncate text-center text-[10.5px] tabular-nums ${info.closed ? "font-semibold text-danger" : "text-foreground-muted"}`} title={info.closed ? info.closedText : (info.hours ?? "")}>
                {info.closed ? info.closedText : info.hours}
              </p>
              {info.requestsClosed && <p className="truncate text-center text-[10.5px] text-foreground-muted">Richieste chiuse</p>}
              {info.events.map((ev) => (
                <EventPill key={ev.slug} title={ev.title} compact />
              ))}
              {info.notes.map((n) => (
                <p key={n.id} title={n.text} className="truncate rounded-md bg-gold/10 px-1.5 py-0.5 text-[11px] font-medium text-gold">
                  {n.text}
                </p>
              ))}
            </div>
          ))}
        </div>
        <div role="row" className="grid grid-cols-7">
          {week.map(({ day, sum, rows }, i) => {
            const shown = rows.length > WEEK_CHIPS ? rows.slice(0, WEEK_CHIPS - 1) : rows;
            const more = rows.length - shown.length;
            return (
              <div role="gridcell" key={day} className={`flex min-h-64 min-w-0 flex-col gap-1 px-1.5 pb-2 pt-2 ${i ? "border-l border-border" : ""} ${day < today ? "bg-surface-2/25" : ""}`}>
                <button type="button" onClick={(e) => onDay(day, e)} className="-mx-0.5 rounded-md px-0.5 pb-1 text-left hover:bg-surface-2/60" aria-label={`${dayAria(day)}: ${sumAria(sum)}`}>
                  <span className="flex items-baseline justify-between gap-1 text-[12px] tabular-nums">
                    <span className="truncate font-semibold text-foreground">{sum.count ? `${sum.count} · ${sum.people} pers.` : "—"}</span>
                    {sum.incomplete > 0 && <IncompleteDot n={sum.incomplete} />}
                  </span>
                  <FullnessBar people={sum.people} capacity={capacity} className="mt-1" />
                </button>
                {shown.map((b) => (
                  <WeekChip key={b.id} b={b} countTests={countTests} onOpen={onOpen} />
                ))}
                {more > 0 && (
                  <button type="button" onClick={(e) => onDay(day, e)} className="min-h-8 rounded-md px-1.5 text-left text-[12px] font-semibold text-accent-ink hover:bg-accent/10">
                    {more} in più
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function WeekChip({ b, countTests, onOpen }: { b: AgendaBooking; countTests: boolean; onOpen: (id: string) => void }) {
  const pending = b.status !== "CONFIRMED";
  const incomplete = b.timeUnknown || b.peopleUnknown;
  const time = b.timeUnknown ? "?" : b.status === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time;
  // (colori dei bordi con ombre e contorni: nell'app il colore dei bordi è fissato per tutti)
  const tone = pending
    ? "outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-gold/70 bg-gold/[0.05]"
    : incomplete
      ? "shadow-[inset_3px_0_0_var(--gold)] bg-gold/[0.12]"
      : "shadow-[inset_3px_0_0_var(--accent)] bg-accent/[0.07]";
  const label = `${b.timeUnknown ? "Ora da definire" : time}, ${b.peopleUnknown ? "persone da definire" : `${b.people} persone`}, ${b.name}${pending ? ", da confermare" : ""}${b.allergies ? ", allergie" : ""}${incomplete ? ", dati da completare" : ""}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(b.id)}
      aria-label={label}
      title={label}
      className={`flex min-h-7 w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[12px] leading-tight hover:brightness-95 dark:hover:brightness-125 ${tone} ${b.arrivedAt || (b.isTest && !countTests) ? "opacity-60" : ""}`}
    >
      <span className={`shrink-0 font-semibold tabular-nums ${b.timeUnknown ? "text-gold" : "text-foreground"}`}>{time}</span>
      <span className={`shrink-0 tabular-nums ${b.peopleUnknown ? "font-semibold text-gold" : "text-foreground-muted"}`}>{b.peopleUnknown ? "?" : b.people}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{b.name}</span>
      {b.allergies && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />}
      {b.arrivedAt && <span aria-hidden className="shrink-0 text-success">✓</span>}
    </button>
  );
}

// ---------- Mese

function MonthView({
  data,
  from,
  to,
  anchor,
  today,
  hours,
  capacity,
  onDay,
}: {
  data: AgendaData;
  from: string;
  to: string;
  anchor: string;
  today: string;
  hours: Hours;
  capacity: number;
  onDay: (day: string, e?: { clientX: number; clientY: number }) => void;
}) {
  const days = daysBetween(from, to);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="grid" aria-label="Mese">
      <div role="row" className="grid grid-cols-7 border-b border-border bg-surface-2/40">
        {WEEKDAY_SHORT.map((w) => (
          <div role="columnheader" key={w} className="py-1.5 text-center text-[10.5px] font-semibold tracking-wider text-foreground-muted">
            {w}
          </div>
        ))}
      </div>
      {Array.from({ length: days.length / 7 }, (_, r) => (
        <div role="row" key={r} className={`grid grid-cols-7 ${r ? "border-t border-border" : ""}`}>
          {days.slice(r * 7, r * 7 + 7).map((day, i) => {
            const sum = data.summary[day] ?? EMPTY;
            const info = dayInfo(data, day, hours);
            const out = !inMonth(day, anchor);
            const isToday = day === today;
            const level = fullness(sum.people, capacity);
            return (
              <div role="gridcell" key={day} className={`min-w-0 ${i ? "border-l border-border" : ""}`}>
                <button
                  type="button"
                  onClick={(e) => onDay(day, e)}
                  aria-label={`Apri ${dayAria(day)}: ${info.closed ? `${info.closedText}, ` : ""}${sumAria(sum)}${info.events.length ? `, evento: ${info.events.map((e) => e.title).join(", ")}` : ""}`}
                  className={`flex h-full min-h-[4.25rem] w-full flex-col items-stretch gap-0.5 px-1 pb-1.5 pt-1 text-left transition-colors hover:bg-surface-2/70 sm:min-h-[6.5rem] sm:px-1.5 ${TINT[level]} ${out ? "opacity-45" : ""}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span
                      className={`flex h-7 min-w-7 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums sm:text-sm ${isToday ? "bg-accent text-accent-foreground" : day < today ? "text-foreground-muted" : "text-foreground"}`}
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {sum.incomplete > 0 && <span aria-hidden title="Dati da completare" className="h-2 w-2 rounded-full bg-gold ring-2 ring-gold/25" />}
                      {info.notes.length > 0 && <span aria-hidden title="Nota del giorno" className="text-[10px] leading-none text-gold">✎</span>}
                    </span>
                  </span>
                  {info.closed ? (
                    <span className="truncate text-[10.5px] font-semibold text-danger sm:text-[11px]">Chiuso</span>
                  ) : sum.count ? (
                    <span className="text-[11px] leading-tight tabular-nums text-foreground sm:text-[12px]">
                      <span className="font-semibold">{sum.count}</span>
                      <span className="text-foreground-muted max-sm:block"> · {sum.people} p.</span>
                    </span>
                  ) : null}
                  {sum.pending > 0 && <span className="truncate text-[10.5px] font-semibold text-gold max-sm:hidden">+{sum.pending} da conf.</span>}
                  {info.events.slice(0, 1).map((ev) => (
                    <span key={ev.slug} className="mt-auto flex min-w-0 items-center gap-1 text-[10.5px] font-medium text-accent-ink">
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="truncate max-sm:hidden">{ev.title}</span>
                    </span>
                  ))}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------- Piccoli pezzi

function DateBadge({ day, today }: { day: string; today: string }) {
  const isToday = day === today;
  const wd = WEEKDAY_SHORT[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7];
  return (
    <span className={`flex w-12 shrink-0 flex-col items-center justify-center rounded-xl py-1 ${isToday ? "bg-accent text-accent-foreground" : "bg-surface-2"}`}>
      <span className={`text-[10.5px] font-semibold tracking-wider ${isToday ? "" : "text-foreground-muted"}`}>{wd}</span>
      <span className="font-serif text-xl font-semibold leading-tight tabular-nums">{Number(day.slice(8, 10))}</span>
    </span>
  );
}

export function EventPill({ title, time, compact = false }: { title: string; time?: string; compact?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-1 rounded-md bg-accent/[0.12] font-semibold text-accent-ink ring-1 ring-inset ring-accent/25 ${compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-sm"}`} title={title}>
      <span aria-hidden>★</span>
      <span className="truncate">{title}</span>
      {time && <span className="shrink-0 font-normal text-foreground-muted">· {time}</span>}
    </span>
  );
}

function IncompleteDot({ n }: { n: number }) {
  return (
    <span title={`${n} da completare`} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gold/15 px-1.5 text-[10.5px] font-semibold text-gold ring-1 ring-inset ring-gold/30">
      <span aria-hidden>!</span>
      {n}
      <span className="sr-only"> da completare</span>
    </span>
  );
}

const WEEKDAYS_LONG = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
function dayAria(day: string) {
  const wd = WEEKDAYS_LONG[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7];
  return `${wd} ${Number(day.slice(8, 10))} ${MONTHS_LONG[Number(day.slice(5, 7)) - 1]}`;
}
function sumAria(s: DaySummary) {
  if (!s.count && !s.pending) return "nessuna prenotazione";
  const parts = [s.count ? `${s.count} ${s.count === 1 ? "prenotazione" : "prenotazioni"}, ${s.people} persone` : "nessuna prenotazione confermata"];
  if (s.pending) parts.push(`${s.pending} da confermare`);
  if (s.incomplete) parts.push(`${s.incomplete} da completare`);
  return parts.join(", ");
}

// Giorno commerciale di adesso (per chi lo usa fuori).
export const businessToday = () => businessDay(new Date());
