"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { MONTH_NAMES, WEEKDAY_LABELS, WEEKDAY_NAMES } from "@/lib/menu-stats";
import { PERIODS, type Period, type StatsData } from "@/lib/stats-queries";
import type { StatsSetting } from "@/lib/menu";
import { setStatsEnabled } from "./actions";

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
};
// Numeri all'italiana (1.759 · 4,5) scritti a mano: toLocaleString dà risultati
// diversi sul server e nel browser, e la pagina si ridisegnerebbe.
const n = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dec = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "").replace(".", ",");

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-foreground-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
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
    <section id={id} aria-labelledby={`${id}-titolo`} className="scroll-mt-32 space-y-4 pt-2">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-hover">{ICONS[id]}</span>
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

function Kpi({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${strong ? "border-accent/40 bg-gradient-to-br from-accent/15 to-accent/[0.03]" : "border-border bg-surface"}`}>
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className={`mt-1 font-semibold capitalize tabular-nums text-foreground ${strong ? "text-3xl" : "text-2xl"}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-foreground-muted">{note}</p>}
    </div>
  );
}

function Empty({ text = "Ancora nessun dato in questo periodo." }: { text?: string }) {
  return <p className="py-3 text-sm text-foreground-muted">{text}</p>;
}

// Elenco ordinato con barra proporzionale: nome a sinistra, numero a destra.
function RankedList({ rows, empty }: { rows: { label: string; count: number }[]; empty?: string }) {
  if (rows.length === 0) return <Empty text={empty} />;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="relative overflow-hidden rounded-lg px-2.5 py-1.5" title={`${r.label}: ${n(r.count)}`}>
          <span aria-hidden className="absolute inset-y-0 left-0 rounded-lg bg-accent/15" style={{ width: `${(r.count / max) * 100}%` }} />
          <span className="relative flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">{r.label}</span>
            <span className="shrink-0 tabular-nums text-foreground-muted">{n(r.count)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// Griglia giorni × ore: più scuro = più aperture (una sola tinta, chiaro → scuro).
// Classifica dal migliore al peggiore: aperture del menù e media per giorno.
function Ranking({ rows }: { rows: { key: string; label: string; total: number; average: number; days: number }[] }) {
  if (rows.length === 0) return <Empty />;
  const max = Math.max(1, rows[0].total);
  return (
    <ol className="space-y-1.5">
      {rows.map((d, i) => (
        <li key={d.key} className="relative overflow-hidden rounded-lg px-2.5 py-2" title={`${d.label}: ${n(d.total)} aperture in ${d.days} giorni`}>
          <span aria-hidden className="absolute inset-y-0 left-0 rounded-lg bg-accent/15" style={{ width: `${(d.total / max) * 100}%` }} />
          <span className="relative flex items-center gap-3 text-sm">
            <span className="w-5 shrink-0 tabular-nums text-foreground-muted">{i + 1}.</span>
            <span className="min-w-0 flex-1 capitalize text-foreground">{d.label}</span>
            {/* Totale sopra, media sotto: il nome del giorno o del mese resta intero anche sul telefono. */}
            <span className="shrink-0 text-right leading-tight">
              <span className="block tabular-nums font-medium text-foreground">
                {n(d.total)} <span className="text-xs font-normal text-foreground-muted">apertur{d.total === 1 ? "a" : "e"}</span>
              </span>
              <span className="block text-[11px] tabular-nums text-foreground-muted">
                {d.days ? `${dec(d.average)} al giorno` : "—"}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Heatmap({ heat }: { heat: number[][] }) {
  const max = Math.max(1, ...heat.flat());
  // Le ore partono dalle 5 del mattino, come la giornata del locale (dopo mezzanotte
  // si continua con 0, 1…), e restano solo quelle in cui il menù è stato aperto:
  // la sera e il dopo-mezzanotte stanno vicini, senza ore vuote in mezzo da scorrere.
  const order = Array.from({ length: 24 }, (_, i) => (i + 5) % 24);
  const used = order.map((h) => heat.some((row) => row[h] > 0));
  const first = used.indexOf(true);
  const last = used.lastIndexOf(true);
  const hours = first === -1 ? order.slice(12, 19) : order.slice(first, last + 1);
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-separate [border-spacing:3px] text-[11px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} scope="col" className="font-normal text-foreground-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.map((row, wd) => (
            <tr key={wd}>
              <th scope="row" className="pr-1 text-left font-normal text-foreground-muted">
                {WEEKDAY_LABELS[wd]}
              </th>
              {hours.map((h) => {
                const c = row[h];
                return (
                  <td
                    key={h}
                    title={`${WEEKDAY_NAMES[wd]} ${h}:00–${h + 1}:00 · ${n(c)} apertur${c === 1 ? "a" : "e"}`}
                    className="h-7 min-w-6 rounded-md border border-border/40"
                    style={{ background: c ? `color-mix(in srgb, var(--accent) ${Math.round(18 + (c / max) * 82)}%, transparent)` : undefined }}
                  >
                    <span className="sr-only">{n(c)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-foreground-muted">
        <span>meno</span>
        {[20, 45, 70, 100].map((p) => (
          <span key={p} className="h-3 w-5 rounded" style={{ background: `color-mix(in srgb, var(--accent) ${p}%, transparent)` }} />
        ))}
        <span>più aperture</span>
      </div>
    </div>
  );
}

// Colonne verticali con il valore al passaggio del dito/mouse (title) e le etichette sotto.
function Bars({ data, label, height = 120, edges }: { data: { key: string; count: number; tip: string }[]; label?: (i: number) => string; height?: number; edges?: [string, string] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end" title={d.tip}>
            <div className="w-full rounded-t-[4px] bg-accent/80 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(d.count ? 4 : 0, (d.count / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      {edges ? (
        <div className="mt-1 flex justify-between text-[10px] text-foreground-muted">
          <span>{edges[0]}</span>
          <span>{edges[1]}</span>
        </div>
      ) : (
        <div className="mt-1 flex gap-[3px] text-[10px] text-foreground-muted">
          {data.map((d, i) => (
            <span key={d.key} className="flex-1 overflow-visible whitespace-nowrap text-left">
              {label?.(i)}
            </span>
          ))}
        </div>
      )}
    </div>
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
  useEffect(() => {
    function onScroll() {
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
      {period === "custom" && data.from && (
        <p className="-mt-2 text-xs text-foreground-muted">
          Periodo: dal {fmtDay(data.from)} al {fmtDay(data.to)}.
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
                aria-current={current === g.id ? "true" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium ${
                  current === g.id
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-foreground-muted hover:border-accent hover:text-foreground"
                }`}
              >
                <span className={`[&_svg]:h-4 [&_svg]:w-4 ${current === g.id ? "" : "text-accent-hover"}`}>{ICONS[g.id]}</span>
                {g.label}
              </a>
            ))}
          </nav>

          <Group id="panoramica" title="Panoramica" text="I numeri chiave del periodo scelto e come sta andando settimana dopo settimana.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                strong
                label="Aperture del menù"
                value={n(data.opens)}
                note={change === null ? "nel periodo scelto" : `${change >= 0 ? "+" : ""}${change}% rispetto al periodo prima`}
              />
              <Kpi label="Giorno più forte" value={data.bestDay >= 0 ? WEEKDAY_NAMES[data.bestDay] : "—"} note="nel periodo scelto" />
              <Kpi
                label="Orario più forte"
                value={data.best.hour >= 0 ? `${WEEKDAY_LABELS[data.best.weekday]} ${data.best.hour}–${data.best.hour + 1}` : "—"}
                note={data.best.count ? `${n(data.best.count)} aperture` : undefined}
              />
              <Kpi
                label="Parola più cercata"
                value={data.searches[0]?.label ?? "—"}
                note={data.searches[0] ? `${n(data.searches[0].count)} ricerche` : "nessuna ricerca"}
              />
            </div>
            <Card title="Andamento settimana per settimana" hint="Aperture del menù per settimana (da lunedì a domenica).">
              {data.weeks.length === 0 ? (
                <Empty />
              ) : (
                <Bars
                  data={data.weeks.map((w) => ({ key: w.start, count: w.count, tip: `Settimana dal ${fmtDay(w.start)}: ${n(w.count)} aperture` }))}
                  label={(i) => (i % Math.max(1, Math.ceil(data.weeks.length / 6)) === 0 ? `${Number(data.weeks[i].start.slice(8))}/${Number(data.weeks[i].start.slice(5, 7))}` : "")}
                />
              )}
            </Card>
          </Group>

          <Group id="quando" title="Quando" text="In che giorni e a che ore i clienti aprono il menù: utile per turni, eventi e «Oggi fuori menù».">
            <Card title="Giorni e orari" hint="Quando viene aperto il menù: più scuro, più aperture.">
              <Heatmap heat={data.heat} />
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Classifica dei giorni della settimana" hint="Dal giorno con più aperture del menù a quello con meno, nel periodo scelto. A fianco la media per singolo giorno.">
                <Ranking rows={data.dayRanking.map((d) => ({ key: String(d.weekday), label: WEEKDAY_NAMES[d.weekday], total: d.total, average: d.average, days: d.days }))} />
              </Card>
              <Card title="Classifica dei mesi" hint="Dal mese con più aperture del menù a quello con meno, nel periodo scelto (lo stesso mese di anni diversi conta insieme).">
                <Ranking rows={data.monthRanking.map((m) => ({ key: String(m.month), label: MONTH_NAMES[m.month], total: m.total, average: m.average, days: m.days }))} />
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
                <RankedList rows={data.searches} />
              </Card>
              <Card title="Cercate ma non trovate" hint="Ciò che i clienti si aspettano e non c'è (o è scritto diversamente): idee per la carta.">
                <RankedList rows={data.empty} empty="Nessuna ricerca andata a vuoto." />
              </Card>
            </div>
            <Card title="Vini e piatti più aperti dalla ricerca">
              <RankedList rows={data.picks} />
            </Card>
          </Group>

          <Group id="guardano" title="Cosa guardano" text="Le parti del menù che i clienti aprono di più e gli abbinamenti che toccano.">
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Sezioni più aperte" hint="Tocchi sulla barra delle sezioni in alto.">
                <RankedList rows={data.sections} />
              </Card>
              <Card title="Abbinamenti toccati" hint="Il vino consigliato sotto un piatto, toccato per vederlo.">
                <RankedList rows={data.pairs} />
              </Card>
            </div>
          </Group>

          <Group id="eventi" title="Eventi e contatti" text="Quanto interessano gli eventi e quanti clienti chiamano, scrivono o cercano la strada.">
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Pagine degli eventi aperte">
                <RankedList rows={data.events} empty="Nessuna pagina evento aperta in questo periodo." />
              </Card>
              <Card title="Contatti toccati" hint="Chiama, WhatsApp, Come arrivare, Recensione, Instagram e, dalle pagine degli eventi, Prenota, Calendario e Condividi.">
                <RankedList rows={data.contacts} empty="Nessun contatto toccato in questo periodo." />
              </Card>
            </div>
          </Group>
        </>
      )}
    </div>
  );
}
