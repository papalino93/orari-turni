"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { MONTH_NAMES, WEEKDAY_LABELS, WEEKDAY_NAMES } from "@/lib/menu-stats";
import { PERIODS, type Period, type StatsData } from "@/lib/stats-queries";
import type { StatsSetting } from "@/lib/menu";
import { setStatsEnabled } from "./actions";
import { Bars, Delta, EffectBars, Funnel, Heatmap, RankedList, Ranking, Sparkline, TrendChart, dec, fmtDay, fmtDayLong, n, weekdayOf } from "./stats-charts";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Gruppi della pagina, per tipo di statistica: si raggiungono dalla barra in alto.
const GROUPS = [
  { id: "panoramica", label: "Panoramica" },
  { id: "quando", label: "Quando" },
  { id: "cercano", label: "Cosa cercano" },
  { id: "guardano", label: "Cosa guardano" },
  { id: "eventi", label: "Eventi e contatti" },
] as const;

const icon = (d: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const ICONS = {
  panoramica: icon(<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />),
  quando: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  cercano: icon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>,
  ),
  guardano: icon(
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  ),
  eventi: icon(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
  ),
};

// Intestazione di un gruppo: icona, titolo e a cosa serve, così la pagina si legge per argomenti.
function Group({ id, title, text, children }: { id: (typeof GROUPS)[number]["id"]; title: string; text: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titolo`} className={`scroll-mt-32 space-y-4 pt-2 ${id === "eventi" ? "min-h-[calc(100svh-10rem)]" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-accent/5 text-chart ring-1 ring-accent/25">{ICONS[id]}</span>
        <div className="min-w-0">
          <h2 id={`${id}-titolo`} className="text-lg font-semibold text-foreground">
            {title}
          </h2>
          <p className="text-xs text-foreground-muted">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

// Numero grande con il piccolo andamento a fianco: la cifra che si legge per prima.
function HeroKpi({ label, value, note, change, values }: { label: string; value: string; note: string; change: number | null; values: number[] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 via-accent/[0.06] to-transparent p-5 col-span-2 sm:col-span-3 lg:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{label}</p>
      <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
        <p className="text-6xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
        <Delta value={change} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-xs text-foreground-muted">{note}</p>
        <Sparkline values={values} width={140} height={40} label={`Andamento delle aperture: da ${n(values[0] ?? 0)} a ${n(values[values.length - 1] ?? 0)} al giorno`} />
      </div>
    </div>
  );
}

function Kpi({ label, value, note, icon, className = "" }: { label: string; value: string; note?: string; icon: React.ReactNode; className?: string }) {
  return (
    <div className={`${className} rounded-2xl border border-border bg-surface p-4 shadow-sm`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-chart [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {label}
      </p>
      <p className="mt-3 break-words text-2xl font-semibold capitalize leading-tight tabular-nums text-foreground">{value}</p>
      {note && <p className="mt-1 text-xs text-foreground-muted">{note}</p>}
    </div>
  );
}

function Empty({ text = "Ancora nessun dato in questo periodo." }: { text?: string }) {
  return <p className="py-3 text-sm text-foreground-muted">{text}</p>;
}

// Aperture di oggi, sempre in cima: con ieri e lo stesso giorno della settimana scorsa a confronto.
function TodayCard({ stats, recent, today, counting, since }: { stats: StatsData["todayStats"]; recent: StatsData["recent"]; today: string; counting: boolean; since: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const vs = (v: number) => (v > 0 ? Math.round(((stats.today - v) / v) * 100) : null);
  return (
    <section aria-label="Aperture di oggi" className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 via-accent/[0.06] to-transparent px-5 py-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground-muted">
          Aperture di oggi · <span className="inline-block first-letter:uppercase">{fmtDayLong(today)}</span>
        </p>
        <p className="mt-1 text-5xl font-semibold leading-none tabular-nums text-foreground">{n(stats.today)}</p>
        {!counting && <p className="mt-2 text-xs text-foreground-muted">{since ? "Conteggio in pausa." : "Il conteggio non è ancora iniziato."}</p>}
      </div>
      <dl className="flex gap-6 text-sm">
        <div>
          <dt className="text-xs text-foreground-muted">Ieri</dt>
          <dd className="flex items-center gap-2 font-medium tabular-nums text-foreground">
            {n(stats.yesterday)}
            <Delta value={vs(stats.yesterday)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">
            {WEEKDAY_NAMES[weekdayOf(today)]} {weekdayOf(today) === 6 ? "scorsa" : "scorso"}
          </dt>
          <dd className="flex items-center gap-2 font-medium tabular-nums text-foreground">
            {n(stats.lastWeek)}
            <Delta value={vs(stats.lastWeek)} />
          </dd>
        </div>
      </dl>
      <div className="ml-auto flex items-end gap-4">
        {recent.some((r) => r.count > 0) && (
          <div className="hidden sm:block">
            <p className="mb-0.5 text-[11px] text-foreground-muted">Ultimi 14 giorni</p>
            <Sparkline values={recent.map((r) => r.count)} width={150} height={40} label="Aperture degli ultimi 14 giorni" />
          </div>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
          className="min-h-10 rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-60"
        >
          {pending ? "Aggiorno…" : "Aggiorna"}
        </button>
      </div>
    </section>
  );
}

// Ogni giorno del periodo scelto, dal più recente: si tocca un giorno per vederlo da solo.
const FIRST = 10;
const MORE = 30;
function DayByDay({ data, exportHref }: { data: StatsData; exportHref: string }) {
  const [shown, setShown] = useState(FIRST);
  const rows = data.daily;
  const total = rows.reduce((a, r) => a + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title="Giorno per giorno" hint="Gli ultimi giorni del periodo scelto, dal più recente: si aprono e si richiudono con i pulsanti in fondo. Tocca un giorno per vederlo da solo.">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm text-foreground">
          <span className="font-semibold tabular-nums">{n(total)}</span> <span className="text-foreground-muted">apertur{total === 1 ? "a" : "e"} in {n(rows.length)} giorn{rows.length === 1 ? "o" : "i"}</span>
          {rows.length > 1 && <span className="text-foreground-muted"> · {dec(total / rows.length)} al giorno</span>}
        </p>
        <a href={exportHref} download className="ml-auto flex min-h-10 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground">
          Scarica per Excel
        </a>
      </div>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <ol className="space-y-1">
            {rows.slice(0, shown).map((r) => (
              <li key={r.day}>
                <Link
                  href={`/statistiche?dal=${r.day}&al=${r.day}`}
                  title={`${fmtDayLong(r.day)}: ${n(r.count)} apertur${r.count === 1 ? "a" : "e"}`}
                  className="block rounded-lg px-2.5 py-2 hover:bg-surface-2"
                >
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground first-letter:uppercase">
                      {fmtDayLong(r.day)}
                      {r.day === data.today && <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-medium normal-case text-chart">oggi</span>}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-foreground">{n(r.count)}</span>
                  </span>
                  <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--chart)", opacity: 0.7 }} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            {rows.length > shown && (
              <button type="button" onClick={() => setShown((v) => v + MORE)} className="min-h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground">
                Mostra altri giorni ({n(rows.length - shown)})
              </button>
            )}
            {shown > FIRST && rows.length > FIRST && (
              <button type="button" onClick={() => setShown(FIRST)} className="min-h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground">
                Comprimi (solo gli ultimi {FIRST})
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function StatsView({
  period,
  setting,
  data,
  custom,
}: {
  period: Period;
  setting: StatsSetting;
  data: StatsData;
  custom: { from: string | null; to: string | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(setting.enabled);
  // Gruppo in vista, evidenziato nella barra in alto.
  const [current, setCurrent] = useState<string>(GROUPS[0].id);
  // Dopo un tocco sulla barra il gruppo scelto resta evidenziato mentre la pagina scorre.
  const lockUntil = useRef(0);
  useEffect(() => {
    function onScroll() {
      if (Date.now() < lockUntil.current) return;
      let id: string = GROUPS[0].id;
      for (const g of GROUPS) {
        const el = document.getElementById(g.id);
        if (el && el.getBoundingClientRect().top < 160) id = g.id;
      }
      setCurrent(id);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Su telefono la barra scorre di lato: il gruppo in vista resta sempre visibile.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Tipi di statistiche"]');
    const chip = nav?.querySelector<HTMLElement>(`a[href="#${current}"]`);
    if (nav && chip) nav.scrollTo({ left: chip.offsetLeft - 16, behavior: "smooth" });
  }, [current]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await setStatsEnabled(next);
      if (!res.ok) {
        setEnabled(!next);
        toast.showError(res.error);
        return;
      }
      toast.showSuccess(next ? "Le statistiche ora contano le aperture del menù" : "Statistiche in pausa: non si conta più nulla");
      router.refresh();
    });
  }

  const change =
    data.prevOpens === null || data.prevOpens === 0 ? null : Math.round(((data.opens - data.prevOpens) / data.prevOpens) * 100);
  // «Scarica per Excel»: lo stesso periodo della pagina.
  const exportHref = period === "custom" && data.from ? `/statistiche/giorni?dal=${data.from}&al=${data.to}` : `/statistiche/giorni?p=${period}`;
  const trend = [...data.daily].reverse().map((d) => d.count);
  const eventNames: Record<string, string> = {};
  for (const e of data.eventCards) for (const d of data.eventDays) if (d >= e.startDate && d <= e.endDate && !eventNames[d]) eventNames[d] = e.title;
  const hasData = data.opens > 0 || data.weeks.some((w) => w.count > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pb-16 pt-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Statistiche del menù</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Quante persone aprono il menù dal QR, quando, cosa cercano e cosa guardano. Tutto anonimo: niente nomi, niente cookie, nessun dato personale.
        </p>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Inizia a contare</p>
          <p className="text-xs text-foreground-muted">
            {enabled
              ? `Si contano le aperture del menù${setting.since ? ` dal ${fmtDay(setting.since)}` : ""}. Non contano il personale con l'accesso fatto né l'Anteprima.`
              : "Spento: accendilo il giorno in cui il QR stampato porta al nuovo menù."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Inizia a contare"
          disabled={pending}
          onClick={toggle}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-accent" : "bg-surface-2 ring-1 ring-border"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-7" : "left-1"}`} />
        </button>
      </section>

      <TodayCard stats={data.todayStats} recent={data.recent} today={data.today} counting={enabled} since={setting.since} />

      {/* Prima di «Inizia a contare» non c'è nulla da filtrare: niente periodi. */}
      {setting.since && (
      <nav aria-label="Periodo" className="flex flex-wrap items-center gap-2">
        {PERIODS.filter((p) => p.value !== "custom").map((p) => (
          <Link
            key={p.value}
            href={`/statistiche?p=${p.value}`}
            aria-current={p.value === period ? "page" : undefined}
            className={`flex min-h-10 items-center rounded-full border px-4 text-sm ${
              p.value === period ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground-muted hover:border-accent hover:text-foreground"
            }`}
          >
            {p.label}
          </Link>
        ))}
        {/* Periodo a scelta: un normale modulo con le due date (funziona anche senza JavaScript). */}
        <form action="/statistiche" className={`flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 ${period === "custom" ? "border-accent" : "border-border"}`}>
          <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
            Dal
            <input type="date" name="dal" defaultValue={custom.from ?? setting.since ?? ""} max={data.today} className="min-h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
            al
            <input type="date" name="al" defaultValue={custom.to ?? data.today} max={data.today} className="min-h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
          </label>
          <button type="submit" className="min-h-9 rounded-full bg-surface-2 px-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground">
            Mostra
          </button>
        </form>
      </nav>
      )}
      {setting.since && (
        <nav aria-label="Scorciatoie" className="-mt-2 flex flex-wrap items-center gap-2">
          {data.shortcuts.map((c) => {
            const on = period === "custom" && data.from === c.dal && data.to === c.al;
            return (
              <Link
                key={c.label}
                href={`/statistiche?dal=${c.dal}&al=${c.al}`}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-9 items-center rounded-full border px-3 text-sm ${on ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground-muted hover:border-accent hover:text-foreground"}`}
              >
                {c.label}
              </Link>
            );
          })}
        </nav>
      )}
      {period === "custom" && data.from && (
        <p className="-mt-2 text-xs text-foreground-muted">
          {data.from === data.to ? (
            <>
              Giorno: <span className="inline-block first-letter:uppercase">{fmtDayLong(data.from)}</span>.
            </>
          ) : (
            <>
              Periodo: dal {fmtDay(data.from)} al {fmtDay(data.to)}.
            </>
          )}
        </p>
      )}

      {!hasData ? (
        <Card title="Ancora niente da mostrare">
          <Empty text={enabled ? "Le prime aperture compariranno qui appena qualcuno inquadra il QR." : "Accendi «Inizia a contare» per raccogliere i dati."} />
        </Card>
      ) : (
        <>
          {/* Barra dei gruppi: resta in vista scorrendo e porta al tipo di statistica. */}
          <nav aria-label="Tipi di statistiche" className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur [scrollbar-width:none]">
            {GROUPS.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                onClick={() => {
                  lockUntil.current = Date.now() + 1200;
                  setCurrent(g.id);
                }}
                aria-current={current === g.id ? "true" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium ${
                  current === g.id
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-foreground-muted hover:border-accent hover:text-foreground"
                }`}
              >
                <span className={`[&_svg]:h-4 [&_svg]:w-4 ${current === g.id ? "" : "text-chart"}`}>{ICONS[g.id]}</span>
                {g.label}
              </a>
            ))}
          </nav>

          <Group id="panoramica" title="Panoramica" text="I numeri chiave del periodo scelto e come sta andando settimana dopo settimana.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <HeroKpi
                label="Aperture del menù"
                value={n(data.opens)}
                note={change === null ? "nel periodo scelto" : "rispetto al periodo prima"}
                change={change}
                values={trend}
              />
              <Kpi icon={ICONS.eventi} label="Giorno più forte" value={data.bestDay >= 0 ? WEEKDAY_NAMES[data.bestDay] : "—"} note="nel periodo scelto" />
              <Kpi
                icon={ICONS.quando}
                label="Orario più forte"
                value={data.best.hour >= 0 ? `${WEEKDAY_LABELS[data.best.weekday]} ${data.best.hour}–\u2060${data.best.hour + 1}` : "—"}
                note={data.best.count ? `${n(data.best.count)} aperture` : undefined}
              />
              <Kpi
                className="col-span-2 sm:col-span-1"
                icon={ICONS.cercano}
                label="Parola più cercata"
                value={data.searches[0]?.label ?? "—"}
                note={data.searches[0] ? `${n(data.searches[0].count)} ricerche` : "nessuna ricerca"}
              />
            </div>
            {data.daily.length > 1 && (
              <Card title="Giorno per giorno nel grafico" hint="Quante aperture ogni giorno del periodo scelto. Tocca o passa sul grafico per leggere un giorno; le fasce dorate sono i giorni con un evento.">
                <TrendChart daily={data.daily} eventDays={data.eventDays} eventNames={eventNames} />
              </Card>
            )}
            <Card title="Settimana per settimana" hint="Aperture del menù per settimana (da lunedì a domenica). L'ultima colonna è la settimana in corso.">
              {data.weeks.length === 0 ? (
                <Empty />
              ) : (
                <Bars
                  data={data.weeks.map((w) => ({ key: w.start, count: w.count, tip: `Settimana dal ${fmtDay(w.start)}: ${n(w.count)} aperture` }))}
                  label={(i) => (i % Math.max(1, Math.ceil(data.weeks.length / 6)) === 0 ? `${Number(data.weeks[i].start.slice(8))}/${Number(data.weeks[i].start.slice(5, 7))}` : "")}
                />
              )}
            </Card>
            <DayByDay data={data} exportHref={exportHref} />
          </Group>

          <Group id="quando" title="Quando" text="In che giorni e a che ore i clienti aprono il menù: utile per turni, eventi e «Oggi fuori menù».">
            <Card title="Giorni e orari" hint="Quando viene aperto il menù: più intenso il colore, più aperture. Tocca una casella per leggere il numero.">
              <Heatmap heat={data.heat} />
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Classifica dei giorni della settimana" hint="In ordine di media: dal giorno in cui il menù si apre di più, in media, a quello in cui si apre di meno. Sotto, il totale delle aperture nel periodo.">
                <Ranking empty={<Empty />} rows={data.dayRanking.map((d) => ({ key: String(d.weekday), label: WEEKDAY_NAMES[d.weekday], total: d.total, average: d.average, days: d.days }))} />
              </Card>
              <Card title="Classifica dei mesi" hint="In ordine di media al giorno, così un mese più lungo non vince solo perché ha più giorni (lo stesso mese di anni diversi conta insieme). Sotto, il totale.">
                <Ranking empty={<Empty />} rows={data.monthRanking.map((m) => ({ key: String(m.month), label: MONTH_NAMES[m.month], total: m.total, average: m.average, days: m.days }))} />
              </Card>
            </div>
            <Card title="Ogni giorno della settimana nel tempo" hint="Gli ultimi lunedì, martedì… a confronto: si vede se un giorno sta crescendo o calando.">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                {data.weekdays.map((list, wd) => (
                  <div key={wd}>
                    <p className="mb-1 text-xs font-medium capitalize text-foreground">{WEEKDAY_NAMES[wd]}</p>
                    {list.length === 0 ? (
                      <p className="text-[11px] text-foreground-muted">—</p>
                    ) : (
                      <Bars
                        height={56}
                        data={list.map((d) => ({ key: d.day, count: d.count, tip: `${WEEKDAY_NAMES[wd]} ${fmtDay(d.day)}: ${n(d.count)} aperture` }))}
                        edges={[list[0], list[list.length - 1]].map((d) => `${Number(d.day.slice(8))}/${Number(d.day.slice(5, 7))}`) as [string, string]}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </Group>

          <Group id="cercano" title="Cosa cercano" text="Le parole scritte nella ricerca del menù: cosa interessa e cosa manca.">
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Le parole più cercate">
                <RankedList rows={data.searches} empty={<Empty />} />
              </Card>
              <Card title="Cercate ma non trovate" hint="Ciò che i clienti si aspettano e non c'è (o è scritto diversamente): idee per la carta.">
                <RankedList rows={data.empty} empty={<Empty text="Nessuna ricerca andata a vuoto." />} />
              </Card>
            </div>
            <Card title="Vini e piatti più aperti dalla ricerca">
              <RankedList rows={data.picks} empty={<Empty />} />
            </Card>
          </Group>

          <Group id="guardano" title="Cosa guardano" text="Le parti del menù che i clienti aprono di più e gli abbinamenti che toccano.">
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Sezioni più aperte" hint="Tocchi sulla barra delle sezioni in alto.">
                <RankedList rows={data.sections} empty={<Empty />} />
              </Card>
              <Card title="Abbinamenti toccati" hint="Il vino consigliato sotto un piatto, toccato per vederlo.">
                <RankedList rows={data.pairs} empty={<Empty />} />
              </Card>
            </div>
          </Group>

          <Group id="eventi" title="Eventi e contatti" text="Gli eventi portano gente? Quanti aprono la pagina, prenotano, aggiungono al calendario, e quanti chiamano, scrivono o cercano la strada.">
            <Card
              title="Gli eventi funzionano?"
              hint="Le aperture medie del menù nei giorni in cui c'era un evento, a confronto con tutti gli altri giorni del periodo scelto."
            >
              {data.effect ? (
                <div className="grid items-center gap-5 md:grid-cols-[1fr_auto]">
                  <EffectBars {...data.effect} />
                  <div className="md:text-center">
                    {data.effect.offAvg > 0 ? (
                      <p className="text-4xl font-semibold tabular-nums text-foreground">
                        {data.effect.onAvg >= data.effect.offAvg ? "+" : "−"}
                        {Math.abs(Math.round(((data.effect.onAvg - data.effect.offAvg) / data.effect.offAvg) * 100))}%
                      </p>
                    ) : (
                      <p className="text-4xl font-semibold text-foreground">—</p>
                    )}
                    <p className="mt-1 max-w-[16rem] text-xs text-foreground-muted">
                      {data.effect.onDays < 3 ? "Pochi giorni con un evento: prendila come un'indicazione, non come una regola." : "aperture al giorno nei giorni di un evento rispetto agli altri"}
                    </p>
                  </div>
                </div>
              ) : (
                <Empty text="Nel periodo scelto non ci sono eventi: scegli un periodo più lungo per vedere se portano più gente." />
              )}
            </Card>
            {data.eventCards.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {data.eventCards.map((e) => (
                  <section key={e.title + e.startDate} aria-label={`Evento: ${e.title}`} className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--chart-2)" }} />
                      {e.title}
                    </h3>
                    <p className="text-xs text-foreground-muted">
                      {e.startDate === e.endDate ? fmtDay(e.startDate) : `${fmtDay(e.startDate)} – ${fmtDay(e.endDate)}`}
                      {" · "}menù aperto {n(e.menuOpens)} {e.menuOpens === 1 ? "volta" : "volte"} in {n(e.days)} giorn{e.days === 1 ? "o" : "i"}
                    </p>
                    <div className="mt-4">
                      <Funnel
                        steps={[
                          { label: "Hanno aperto la pagina", value: e.pageOpens },
                          { label: "Prenota", value: e.book },
                          { label: "Calendario", value: e.calendar },
                          { label: "Condividi", value: e.share },
                        ]}
                      />
                    </div>
                  </section>
                ))}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Pagine degli eventi aperte">
                <RankedList rows={data.events} empty={<Empty text="Nessuna pagina evento aperta in questo periodo." />} />
              </Card>
              <Card title="Contatti toccati" hint="Chiama, WhatsApp, Come arrivare, Recensione, Instagram e, dalle pagine degli eventi, Prenota, Calendario e Condividi.">
                <RankedList rows={data.contacts} empty={<Empty text="Nessun contatto toccato in questo periodo." />} />
              </Card>
            </div>
          </Group>
        </>
      )}
    </div>
  );
}
