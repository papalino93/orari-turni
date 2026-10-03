"use client";

import { useState, useTransition } from "react";
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs text-foreground-muted">Aperture del menù</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{n(data.opens)}</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {change === null ? "nel periodo scelto" : `${change >= 0 ? "+" : ""}${change}% rispetto al periodo prima`}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs text-foreground-muted">Giorno più forte</p>
              <p className="mt-1 text-2xl font-semibold capitalize text-foreground">{data.bestDay >= 0 ? WEEKDAY_NAMES[data.bestDay] : "—"}</p>
              <p className="mt-1 text-xs text-foreground-muted">nel periodo scelto</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs text-foreground-muted">Orario più forte</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {data.best.hour >= 0 ? `${WEEKDAY_LABELS[data.best.weekday]} ${data.best.hour}–${data.best.hour + 1}` : "—"}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">{data.best.count ? `${n(data.best.count)} aperture` : ""}</p>
            </div>
          </div>

          {/* Su schermo largo le due classifiche stanno affiancate. */}
          <div className="grid gap-4 md:grid-cols-2">
          <Card title="Classifica dei giorni della settimana" hint="Dal giorno con più aperture del menù a quello con meno, nel periodo scelto. A fianco la media per singolo giorno.">
            <Ranking rows={data.dayRanking.map((d) => ({ key: String(d.weekday), label: WEEKDAY_NAMES[d.weekday], total: d.total, average: d.average, days: d.days }))} />
          </Card>

          <Card title="Classifica dei mesi" hint="Dal mese con più aperture del menù a quello con meno, nel periodo scelto (lo stesso mese di anni diversi conta insieme).">
            <Ranking rows={data.monthRanking.map((m) => ({ key: String(m.month), label: MONTH_NAMES[m.month], total: m.total, average: m.average, days: m.days }))} />
          </Card>
          </div>

          <Card title="Giorni e orari" hint="Quando viene aperto il menù: più scuro, più aperture.">
            <Heatmap heat={data.heat} />
          </Card>

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

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Le parole più cercate">
              <RankedList rows={data.searches} />
            </Card>
            <Card title="Cercate ma non trovate" hint="Ciò che i clienti si aspettano e non c'è (o è scritto diversamente).">
              <RankedList rows={data.empty} empty="Nessuna ricerca andata a vuoto." />
            </Card>
            <Card title="Vini e piatti più aperti dalla ricerca">
              <RankedList rows={data.picks} />
            </Card>
            <Card title="Abbinamenti toccati">
              <RankedList rows={data.pairs} />
            </Card>
            <Card title="Sezioni più aperte" hint="Tocchi sulla barra delle sezioni in alto.">
              <RankedList rows={data.sections} />
            </Card>
            <Card title="Eventi e contatti" hint="Pagine degli eventi aperte e tocchi su Chiama, WhatsApp, Come arrivare…">
              <RankedList rows={[...data.events.map((e) => ({ ...e, label: `Evento · ${e.label}` })), ...data.contacts]} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
