"use client";

// Grafici della pagina Statistiche: una sola tinta (il bordeaux del sito), spessori sottili,
// griglia appena visibile, valore al passaggio del dito/mouse e, per ogni grafico, una tabella
// equivalente. I colori sono var(--chart) e var(--chart-2) (oro, solo per gli eventi).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WEEKDAY_LABELS, WEEKDAY_NAMES } from "@/lib/menu-stats";

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
};
export const weekdayOf = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
export const fmtDayLong = (day: string) => `${WEEKDAY_NAMES[weekdayOf(day)]} ${fmtDay(day)}`;
// Numeri all'italiana (1.759 · 4,5) scritti a mano: toLocaleString dà risultati
// diversi sul server e nel browser, e la pagina si ridisegnerebbe.
export const n = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const dec = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "").replace(".", ",");
const apert = (c: number) => `apertur${c === 1 ? "a" : "e"}`;

// Larghezza reale di un contenitore (i grafici SVG si disegnano alla misura vera: testi mai stirati).
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [w, setW] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    obs.current?.disconnect();
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    obs.current = new ResizeObserver(() => setW(Math.round(el.getBoundingClientRect().width)));
    obs.current.observe(el);
  }, []);
  useEffect(() => () => obs.current?.disconnect(), []);
  return [ref, w];
}

// Estremo «tondo» dell'asse (1, 2, 5, 10, 20, 50…) sopra il valore massimo.
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  // Estremo pari, così anche la riga a metà ha un numero intero (60 → 30, non 7,5).
  for (const m of [1, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= v && (m * p) % 2 === 0) return m * p;
  return 10 * p;
}

function Tooltip({ left, top, children }: { left: number; top: number; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs leading-snug text-foreground shadow-lg"
      style={{ left, top }}
    >
      {children}
    </div>
  );
}

// «Vedi come tabella»: la stessa informazione del grafico, per chi non vede i colori o preferisce i numeri.
function TableToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      aria-pressed={on}
      className="min-h-9 shrink-0 rounded-full border border-border px-3 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
    >
      {on ? "Vedi il grafico" : "Vedi come tabella"}
    </button>
  );
}

export function Delta({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return null;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        up ? "bg-success-bg text-success" : "bg-surface-2 text-foreground-muted"
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden fill="currentColor">
        {flat ? <rect x="1" y="4" width="8" height="2" rx="1" /> : up ? <path d="M5 1l4 7H1z" /> : <path d="M5 9L1 2h8z" />}
      </svg>
      {up ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value)}%{label && <span className="font-normal opacity-80"> {label}</span>}
    </span>
  );
}

// Piccolo andamento senza assi: solo la forma. L'ultimo punto è segnato.
export function Sparkline({ values, width = 120, height = 36, label }: { values: number[]; width?: number; height?: number; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pad = 3;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), height - pad - (v / max) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="shrink-0 overflow-visible">
      <path d={`${line} L${last[0]} ${height - pad} L${pts[0][0]} ${height - pad} Z`} fill="var(--chart)" opacity="0.14" />
      <path d={line} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--chart)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

type Day = { day: string; count: number };

// Andamento giorno per giorno del periodo: linea con area, fasce oro nei giorni di un evento,
// il giorno più forte segnato, valore al passaggio (o al tocco) con la linea guida.
export function TrendChart({ daily, eventDays, eventNames }: { daily: Day[]; eventDays: string[]; eventNames: Record<string, string> }) {
  const rows = useMemo(() => [...daily].reverse(), [daily]);
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ev = useMemo(() => new Set(eventDays), [eventDays]);
  const H = 220;
  const L = 36;
  const R = 10;
  const T = 16;
  const B = 26;
  const N = rows.length;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = niceMax(max);
  const x = (i: number) => (N === 1 ? L + (w - L - R) / 2 : L + (i / (N - 1)) * (w - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const step = N > 1 ? (w - L - R) / (N - 1) : 0;

  const peak = rows.reduce((b, r, i) => (r.count > rows[b].count ? i : b), 0);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r.count).toFixed(1)}`).join(" ");
  const area = N > 1 ? `${line} L${x(N - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : "";

  // Fasce degli eventi: gruppi di giorni vicini.
  const bands: { a: number; b: number }[] = [];
  rows.forEach((r, i) => {
    if (!ev.has(r.day)) return;
    const last = bands[bands.length - 1];
    if (last && last.b === i - 1) last.b = i;
    else bands.push({ a: i, b: i });
  });

  // Etichette dell'asse orizzontale: poche, ben distanziate (ogni ~70 px).
  const ticks = useMemo(() => {
    const count = Math.max(2, Math.min(7, Math.floor((w - L - R) / 70)));
    const out = new Set<number>();
    for (let k = 0; k < count; k++) out.add(Math.round((k / (count - 1)) * (N - 1)));
    return [...out];
  }, [w, N]);
  const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (N < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - L) / (w - L - R)) * (N - 1));
    setHover(Math.max(0, Math.min(N - 1, i)));
  }

  const h = hover === null ? null : rows[hover];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: "var(--chart)" }} /> Aperture al giorno
        </span>
        {bands.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm" style={{ background: "color-mix(in srgb, var(--chart-2) 28%, transparent)", borderTop: "2px solid var(--chart-2)" }} /> Giorni con un evento
          </span>
        )}
        <span className="ml-auto">
          <TableToggle on={table} set={setTable} />
        </span>
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-foreground-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Giorno</th>
                <th className="px-3 py-2 text-right font-medium">Aperture</th>
                <th className="px-3 py-2 font-medium">Evento</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.day} className="border-t border-border/60">
                  <td className="px-3 py-1.5 first-letter:uppercase">{fmtDayLong(r.day)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{n(r.count)}</td>
                  <td className="px-3 py-1.5 text-foreground-muted">{eventNames[r.day] ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" style={{ height: H }}>
          {w > 0 && (
            <>
              <svg
                width={w}
                height={H}
                role="img"
                aria-label={`Aperture del menù giorno per giorno, dal ${fmtDay(rows[0].day)} al ${fmtDay(rows[N - 1].day)}. Il giorno più forte è ${fmtDayLong(rows[peak].day)} con ${n(rows[peak].count)} aperture.`}
                className="block touch-pan-y select-none"
                onPointerMove={move}
                onPointerDown={move}
                onPointerLeave={() => setHover(null)}
              >
                <defs>
                  <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--chart)" stopOpacity="0.28" />
                    <stop offset="1" stopColor="var(--chart)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {/* Griglia: tre righe appena visibili e i valori a sinistra */}
                {[0, 0.5, 1].map((f) => (
                  <g key={f}>
                    <line x1={L} x2={w - R} y1={y(top * f)} y2={y(top * f)} stroke="var(--border)" strokeWidth="1" strokeDasharray={f === 0 ? undefined : "2 4"} />
                    <text x={L - 8} y={y(top * f) + 4} textAnchor="end" fontSize="11" fill="var(--foreground-muted)" className="tabular-nums">
                      {n(top * f)}
                    </text>
                  </g>
                ))}
                {bands.map((b) => (
                  <g key={b.a}>
                    <rect x={x(b.a) - Math.max(step / 2, 3)} width={x(b.b) - x(b.a) + Math.max(step, 6)} y={T} height={H - T - B} fill="var(--chart-2)" opacity="0.16" />
                    <rect x={x(b.a) - Math.max(step / 2, 3)} width={x(b.b) - x(b.a) + Math.max(step, 6)} y={T} height="3" fill="var(--chart-2)" />
                  </g>
                ))}
                {N > 1 && <path d={area} fill="url(#trend-fill)" />}
                {N > 1 ? (
                  <path d={line} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                ) : (
                  <circle cx={x(0)} cy={y(rows[0].count)} r="4" fill="var(--chart)" />
                )}
                {/* Il giorno più forte, segnato con il suo valore */}
                {max > 0 && N > 1 && (
                  <g>
                    <circle cx={x(peak)} cy={y(rows[peak].count)} r="4.5" fill="var(--chart)" stroke="var(--surface)" strokeWidth="2" />
                    <text
                      x={Math.max(L + 10, Math.min(w - R - 10, x(peak)))}
                      y={Math.max(T + 4, y(rows[peak].count) - 10)}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="var(--foreground)"
                      stroke="var(--surface)"
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {n(rows[peak].count)}
                    </text>
                  </g>
                )}
                {ticks.map((i, k) => (
                  <text key={i} x={x(i)} y={H - 7} textAnchor={k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--foreground-muted)">
                    {short(rows[i].day)}
                  </text>
                ))}
                {h && hover !== null && (
                  <g>
                    <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--foreground-muted)" strokeWidth="1" />
                    <circle cx={x(hover)} cy={y(h.count)} r="5" fill="var(--chart)" stroke="var(--surface)" strokeWidth="2" />
                  </g>
                )}
              </svg>
              {h && hover !== null && (
                <Tooltip left={Math.max(70, Math.min(w - 70, x(hover)))} top={Math.max(34, y(h.count) - 12)}>
                  <b className="font-semibold first-letter:uppercase">{fmtDayLong(h.day)}</b>
                  <br />
                  <span className="tabular-nums">
                    {n(h.count)} {apert(h.count)}
                  </span>
                  {eventNames[h.day] && (
                    <>
                      <br />
                      <span style={{ color: "var(--chart-2)" }}>●</span> {eventNames[h.day]}
                    </>
                  )}
                </Tooltip>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Colonne verticali (settimane): l'ultima in colore pieno, le altre un po' più chiare; il valore si legge toccando.
export function Bars({ data, label, height = 132, edges }: { data: { key: string; count: number; tip: string }[]; label?: (i: number) => string; height?: number; edges?: [string, string] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const [hover, setHover] = useState<number | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const box = useRef<HTMLDivElement>(null);
  function show(i: number, el: HTMLElement) {
    const b = box.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!b) return;
    setHover(i);
    setPos({ left: Math.max(60, Math.min(b.width - 60, r.left - b.left + r.width / 2)), top: r.top - b.top - 6 });
  }
  return (
    <div>
      <div ref={box} className="relative" onPointerLeave={() => setHover(null)}>
        <div className="flex items-end gap-[3px] border-b border-border" style={{ height }}>
          {data.map((d, i) => (
            <div
              key={d.key}
              className="flex h-full flex-1 cursor-default items-end"
              title={d.tip}
              onPointerEnter={(e) => show(i, e.currentTarget.firstElementChild as HTMLElement)}
              onPointerDown={(e) => show(i, e.currentTarget.firstElementChild as HTMLElement)}
            >
              <div
                className="w-full rounded-t-[4px] transition-opacity"
                style={{
                  height: `${Math.max(d.count ? 4 : 0, (d.count / max) * 100)}%`,
                  background: "var(--chart)",
                  opacity: hover === i ? 1 : i === data.length - 1 ? 1 : 0.55,
                }}
              />
            </div>
          ))}
        </div>
        {hover !== null && <Tooltip left={pos.left} top={pos.top}>{data[hover].tip}</Tooltip>}
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

// Giorni × ore: più intenso = più aperture (una sola tinta). L'ora più forte è cerchiata,
// il valore si legge toccando la casella.
export function Heatmap({ heat }: { heat: number[][] }) {
  const max = Math.max(1, ...heat.flat());
  // Le ore partono dalle 5 del mattino, come la giornata del locale (dopo mezzanotte
  // si continua con 0, 1…), e restano solo quelle in cui il menù è stato aperto:
  // la sera e il dopo-mezzanotte stanno vicini, senza ore vuote in mezzo da scorrere.
  const order = Array.from({ length: 24 }, (_, i) => (i + 5) % 24);
  const used = order.map((h) => heat.some((row) => row[h] > 0));
  const first = used.indexOf(true);
  const last = used.lastIndexOf(true);
  const hours = first === -1 ? order.slice(12, 19) : order.slice(first, last + 1);
  let peak = { wd: -1, h: -1, c: 0 };
  heat.forEach((row, wd) => row.forEach((c, h) => c > peak.c && (peak = { wd, h, c })));
  const [tip, setTip] = useState<{ wd: number; h: number; left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  function show(wd: number, h: number, el: HTMLElement) {
    const b = box.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!b) return;
    setTip({ wd, h, left: Math.max(80, Math.min(b.width - 80, r.left - b.left + r.width / 2)), top: r.top - b.top - 4 });
  }
  const tint = (c: number) => `color-mix(in srgb, var(--chart) ${Math.round(14 + Math.sqrt(c / max) * 86)}%, transparent)`;
  return (
    <div>
      <div ref={box} className="relative overflow-x-auto" onPointerLeave={() => setTip(null)}>
        <table className="w-full border-separate [border-spacing:3px] text-[11px]">
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th key={h} scope="col" className="font-normal tabular-nums text-foreground-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heat.map((row, wd) => (
              <tr key={wd}>
                <th scope="row" className="pr-1.5 text-left font-medium text-foreground-muted">
                  {WEEKDAY_LABELS[wd]}
                </th>
                {hours.map((h) => {
                  const c = row[h];
                  const isPeak = peak.wd === wd && peak.h === h;
                  return (
                    <td
                      key={h}
                      title={`${WEEKDAY_NAMES[wd]} ${h}:00–${h + 1}:00 · ${n(c)} ${apert(c)}`}
                      onPointerEnter={(e) => show(wd, h, e.currentTarget)}
                      onPointerDown={(e) => show(wd, h, e.currentTarget)}
                      className={`h-8 min-w-6 rounded-md ${c ? "" : "bg-surface-2/60"} ${isPeak ? "outline outline-2 outline-offset-1 outline-foreground" : ""}`}
                      style={c ? { background: tint(c) } : undefined}
                    >
                      <span className="sr-only">{n(c)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {tip && (
          <Tooltip left={tip.left} top={tip.top}>
            <b className="font-semibold capitalize">{WEEKDAY_NAMES[tip.wd]}</b> {tip.h}:00–{tip.h + 1}:00
            <br />
            <span className="tabular-nums">
              {n(heat[tip.wd][tip.h])} {apert(heat[tip.wd][tip.h])}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-foreground-muted">
        <span className="flex items-center gap-2">
          meno
          <span className="h-2.5 w-28 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in srgb, var(--chart) 14%, transparent), var(--chart))" }} />
          più aperture
        </span>
        {peak.c > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] outline outline-2 outline-foreground" /> momento più forte: <b className="font-semibold capitalize text-foreground">{WEEKDAY_NAMES[peak.wd]}</b> {peak.h}–{peak.h + 1} ({n(peak.c)})
          </span>
        )}
      </div>
    </div>
  );
}

// Elenco ordinato con barra proporzionale: nome e numero sopra, barra sottile sotto.
// La prima riga è piena, le altre un po' più chiare (si capisce chi vince senza leggere).
export function RankedList({ rows, empty, unit }: { rows: { label: string; count: number; note?: string }[]; empty: React.ReactNode; unit?: string }) {
  if (rows.length === 0) return <>{empty}</>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} title={`${r.label}: ${n(r.count)}${unit ? ` ${unit}` : ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-foreground-muted">{i + 1}</span>
              <span className={`min-w-0 truncate ${i === 0 ? "font-semibold" : ""} text-foreground`}>{r.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className={`${i === 0 ? "font-semibold" : "font-medium"} text-foreground`}>{n(r.count)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2 ml-6">
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--chart)", opacity: i === 0 ? 1 : 0.6 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// Classifica dei giorni/mesi: in ordine di media per giorno (un mese lungo o un giorno che ricorre più volte
// non deve vincere solo perché ha più giorni); sotto, il totale delle aperture.
export function Ranking({ rows, empty }: { rows: { key: string; label: string; total: number; average: number; days: number }[]; empty: React.ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  const max = Math.max(0.0001, rows[0].average);
  return (
    <ol className="space-y-3">
      {rows.map((d, i) => (
        <li key={d.key} title={`${d.label}: ${dec(d.average)} aperture al giorno (${n(d.total)} in ${d.days} giorni)`}>
          <div className="flex items-center gap-3 text-sm">
            <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-foreground-muted">{i + 1}</span>
            <span className={`min-w-0 flex-1 capitalize text-foreground ${i === 0 ? "font-semibold" : ""}`}>{d.label}</span>
            {/* Media sopra, totale sotto: il nome del giorno o del mese resta intero anche sul telefono. */}
            <span className="shrink-0 text-right leading-tight">
              <span className="block tabular-nums font-medium text-foreground">
                {d.days ? dec(d.average) : "—"} <span className="text-xs font-normal text-foreground-muted">al giorno</span>
              </span>
              <span className="block text-[11px] tabular-nums text-foreground-muted">
                {n(d.total)} {apert(d.total)}
              </span>
            </span>
          </div>
          <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(d.average / max) * 100}%`, background: "var(--chart)", opacity: i === 0 ? 1 : 0.6 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// Confronto a due barre: aperture medie al giorno nei giorni con un evento e negli altri.
export function EffectBars({ onAvg, offAvg, onDays, offDays }: { onAvg: number; offAvg: number; onDays: number; offDays: number }) {
  const max = Math.max(onAvg, offAvg, 1);
  const rows = [
    { label: `Giorni con un evento (${n(onDays)})`, v: onAvg, color: "var(--chart-2)" },
    { label: `Altri giorni (${n(offDays)})`, v: offAvg, color: "var(--chart)" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-foreground">{r.label}</span>
            <span className="tabular-nums">
              <b className="text-lg font-semibold text-foreground">{dec(r.v)}</b> <span className="text-xs text-foreground-muted">al giorno</span>
            </span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(r.v / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Un passaggio dell'imbuto dell'evento: quanti hanno aperto la pagina, quanti hanno toccato Prenota…
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const base = Math.max(1, steps[0]?.value ?? 1);
  return (
    <dl className="space-y-2">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="flex items-baseline justify-between text-sm">
            <dt className="text-foreground-muted">{s.label}</dt>
            <dd className={`tabular-nums ${i === 0 ? "font-semibold" : "font-medium"} text-foreground`}>{n(s.value)}</dd>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.value / base) * 100)}%`, background: "var(--chart-2)", opacity: i === 0 ? 1 : 0.7 }} />
          </div>
        </div>
      ))}
    </dl>
  );
}
