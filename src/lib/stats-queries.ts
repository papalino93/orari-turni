// Letture per la pagina Statistiche (solo server). Tutto è calcolato dagli
// eventi anonimi di MenuEvent: aperture, ricerche, voci guardate, contatti.

import { prisma } from "@/lib/prisma";
import { romeParts } from "@/lib/menu-stats";

export type Period = "7" | "30" | "90" | "all";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7 giorni" },
  { value: "30", label: "30 giorni" },
  { value: "90", label: "3 mesi" },
  { value: "all", label: "Tutto" },
];

export function parsePeriod(v: unknown): Period {
  return v === "7" || v === "90" || v === "all" ? v : "30";
}

// Giorni YYYY-MM-DD (date di calendario, senza fuso: si lavora in UTC sulle stringhe).
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);
export function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}
// Lunedì della settimana di quel giorno.
function weekStart(day: string): string {
  const d = toDate(day);
  const wd = (d.getUTCDay() + 6) % 7; // 0 = lunedì
  d.setUTCDate(d.getUTCDate() - wd);
  return toKey(d);
}

type Ranked = { label: string; count: number }[];

async function ranked(kind: string, from: string | null, to: string, take = 10): Promise<Ranked> {
  const rows = await prisma.menuEvent.groupBy({
    by: ["label"],
    where: { kind, label: { not: null }, day: { lte: to, ...(from ? { gte: from } : {}) } },
    _count: { _all: true },
    orderBy: { _count: { label: "desc" } },
    take,
  });
  return rows.map((r) => ({ label: r.label ?? "", count: r._count._all }));
}

export async function loadStats(period: Period, since: string | null) {
  const today = romeParts().day;
  const days = period === "all" ? null : Number(period);
  // Dal primo giorno del periodo (mai prima di «Inizia a contare»).
  let from = days ? addDays(today, -(days - 1)) : since;
  if (since && from && from < since) from = since;
  const prevTo = from ? addDays(from, -1) : null;
  const prevFrom = days && from ? addDays(from, -days) : null;
  const range = { lte: today, ...(from ? { gte: from } : {}) };

  const [opens, prevOpens, byHour, byDay, searches, empty, picks, pairs, sections, events, contacts] = await Promise.all([
    prisma.menuEvent.count({ where: { kind: "open", day: range } }),
    // Il confronto vale solo se anche il periodo prima era tutto già contato.
    prevFrom && prevTo && (!since || prevFrom >= since) ? prisma.menuEvent.count({ where: { kind: "open", day: { gte: prevFrom, lte: prevTo } } }) : Promise.resolve(null),
    prisma.menuEvent.groupBy({ by: ["weekday", "hour"], where: { kind: "open", day: range }, _count: { _all: true } }),
    // Per l'andamento e «giorno per giorno della settimana»: tutte le aperture per giorno.
    prisma.menuEvent.groupBy({ by: ["day"], where: { kind: "open" }, _count: { _all: true }, orderBy: { day: "asc" } }),
    ranked("search", from, today),
    ranked("search_empty", from, today),
    ranked("pick", from, today),
    ranked("pair", from, today),
    ranked("section", from, today),
    ranked("event", from, today),
    ranked("contact", from, today),
  ]);

  // Griglia giorni × ore: heat[weekday 0–6][hour 0–23].
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of byHour) if (r.weekday >= 1 && r.weekday <= 7) heat[r.weekday - 1][r.hour] += r._count._all;

  const perDay = new Map(byDay.map((r) => [r.day, r._count._all]));
  const firstDay = since ?? byDay[0]?.day ?? today;

  // Andamento: aperture per settimana, dalle prime 26 settimane più recenti.
  const weeks: { start: string; count: number }[] = [];
  for (let w = weekStart(today), i = 0; i < 26 && w >= weekStart(firstDay); w = addDays(w, -7), i++) {
    let count = 0;
    for (let d = 0; d < 7; d++) count += perDay.get(addDays(w, d)) ?? 0;
    weeks.unshift({ start: w, count });
  }

  // Giorno per giorno della settimana: gli ultimi 8 lunedì, martedì… (dal primo giorno contato).
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const list: { day: string; count: number }[] = [];
    const wdToday = (toDate(today).getUTCDay() + 6) % 7;
    let d = addDays(today, -((wdToday - i + 7) % 7));
    while (list.length < 8 && d >= firstDay) {
      list.unshift({ day: d, count: perDay.get(d) ?? 0 });
      d = addDays(d, -7);
    }
    return list;
  });

  // Orario più forte e giorno più forte del periodo.
  let best = { weekday: -1, hour: -1, count: 0 };
  heat.forEach((row, wd) => row.forEach((c, h) => c > best.count && (best = { weekday: wd, hour: h, count: c })));
  const dayTotals = heat.map((row) => row.reduce((a, b) => a + b, 0));
  const bestDay = dayTotals.some((c) => c > 0) ? dayTotals.indexOf(Math.max(...dayTotals)) : -1;

  return { today, from, opens, prevOpens, heat, weeks, weekdays, best, bestDay, searches, empty, picks, pairs, sections, events, contacts };
}

export type StatsData = Awaited<ReturnType<typeof loadStats>>;
