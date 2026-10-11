// Letture per la pagina Statistiche (solo server). Tutto è calcolato dagli
// eventi anonimi di MenuEvent: aperture, ricerche, voci guardate, contatti.

import { prisma } from "@/lib/prisma";
import { romeParts } from "@/lib/menu-stats";

export type Period = "7" | "30" | "90" | "all" | "custom";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7 giorni" },
  { value: "30", label: "30 giorni" },
  { value: "90", label: "3 mesi" },
  { value: "all", label: "Tutto il tempo" },
  { value: "custom", label: "Dal… al…" },
];

// Se non si sceglie nulla: tutto il tempo.
export function parsePeriod(v: unknown): Period {
  return v === "7" || v === "30" || v === "90" || v === "custom" ? v : "all";
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function parseDay(v: unknown): string | null {
  return typeof v === "string" && DAY.test(v) ? v : null;
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

export async function loadStats(period: Period, since: string | null, custom?: { from: string | null; to: string | null }) {
  const today = romeParts().day;
  // Periodo a scelta (dal… al…): si confronta con un periodo lungo uguale subito prima.
  const customTo = period === "custom" && custom?.to && custom.to < today ? custom.to : today;
  const customFrom = period === "custom" ? (custom?.from ?? since) : null;
  const days =
    period === "all"
      ? null
      : period === "custom"
        ? customFrom
          ? Math.round((Date.parse(customTo) - Date.parse(customFrom)) / 86_400_000) + 1
          : null
        : Number(period);
  const to = period === "custom" ? customTo : today;
  // Dal primo giorno del periodo (mai prima di «Inizia a contare»).
  let from = period === "custom" ? customFrom : days ? addDays(today, -(days - 1)) : since;
  if (since && from && from < since) from = since;
  const prevTo = from ? addDays(from, -1) : null;
  const prevFrom = days && from ? addDays(from, -days) : null;
  const range = { lte: to, ...(from ? { gte: from } : {}) };

  const [opens, prevOpens, byHour, byDay, searches, empty, picks, pairs, sections, events, contacts] = await Promise.all([
    prisma.menuEvent.count({ where: { kind: "open", day: range } }),
    // Il confronto vale solo se anche il periodo prima era tutto già contato.
    prevFrom && prevTo && (!since || prevFrom >= since) ? prisma.menuEvent.count({ where: { kind: "open", day: { gte: prevFrom, lte: prevTo } } }) : Promise.resolve(null),
    prisma.menuEvent.groupBy({ by: ["weekday", "hour"], where: { kind: "open", day: range }, _count: { _all: true } }),
    // Per l'andamento e «giorno per giorno della settimana»: tutte le aperture per giorno.
    prisma.menuEvent.groupBy({ by: ["day"], where: { kind: "open" }, _count: { _all: true }, orderBy: { day: "asc" } }),
    ranked("search", from, to),
    ranked("search_empty", from, to),
    ranked("pick", from, to),
    ranked("pair", from, to),
    ranked("section", from, to),
    ranked("event", from, to),
    ranked("contact", from, to),
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

  // Classifica dei giorni della settimana nel periodo: totale e media per giorno
  // (quanti lunedì, martedì… ci sono stati dal primo giorno contato).
  const start = from ?? firstDay;
  const occurrences = Array.from({ length: 7 }, () => 0);
  for (let d = start; d <= to; d = addDays(d, 1)) occurrences[(toDate(d).getUTCDay() + 6) % 7] += 1;
  const dayRanking = dayTotals
    .map((total, wd) => ({ weekday: wd, total, average: occurrences[wd] ? total / occurrences[wd] : 0, days: occurrences[wd] }))
    .sort((a, b) => b.total - a.total || b.average - a.average);

  // Stessa classifica per i mesi dell'anno (gennaio di tutti gli anni insieme…),
  // solo i mesi che cadono nel periodo.
  const monthTotals = Array.from({ length: 12 }, () => 0);
  const monthDays = Array.from({ length: 12 }, () => 0);
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const m = Number(d.slice(5, 7)) - 1;
    monthDays[m] += 1;
    monthTotals[m] += perDay.get(d) ?? 0;
  }
  const monthRanking = monthTotals
    .map((total, month) => ({ month, total, average: monthDays[month] ? total / monthDays[month] : 0, days: monthDays[month] }))
    .filter((m) => m.days > 0)
    .sort((a, b) => b.total - a.total || b.average - a.average);

  // Giorno per giorno: ogni giorno del periodo scelto, dal più recente (anche quelli a zero).
  const daily: { day: string; count: number }[] = [];
  for (let d = to; d >= start; d = addDays(d, -1)) daily.push({ day: d, count: perDay.get(d) ?? 0 });

  // Oggi, ieri e lo stesso giorno della settimana scorsa: sempre in vista in cima alla pagina.
  const todayStats = { today: perDay.get(today) ?? 0, yesterday: perDay.get(addDays(today, -1)) ?? 0, lastWeek: perDay.get(addDays(today, -7)) ?? 0 };

  // Gli ultimi 14 giorni (oggi compreso), per il piccolo grafico accanto alle aperture di oggi.
  const recent = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    return { day, count: perDay.get(day) ?? 0 };
  });

  // Scorciatoie per scegliere un periodo con un tocco.
  const mondayNow = weekStart(today);
  const monthFirst = `${today.slice(0, 8)}01`;
  const prevMonthLast = addDays(monthFirst, -1);
  const shortcuts = [
    { label: "Oggi", dal: today, al: today },
    { label: "Ieri", dal: addDays(today, -1), al: addDays(today, -1) },
    { label: "Questa settimana", dal: mondayNow, al: today },
    { label: "Settimana scorsa", dal: addDays(mondayNow, -7), al: addDays(mondayNow, -1) },
    { label: "Questo mese", dal: monthFirst, al: today },
    { label: "Mese scorso", dal: `${prevMonthLast.slice(0, 8)}01`, al: prevMonthLast },
  ];

  // Eventi (non gli annunci) che cadono nel periodo: servono al grafico (fascia colorata) e alla
  // scheda «Gli eventi funzionano?». Per ognuno: pagina aperta e contatti dalla sua pagina.
  const promos = await prisma.menuPromo.findMany({
    where: { kind: "EVENT", deletedAt: null, startDate: { lte: to }, endDate: { gte: start } },
    select: { title: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
  const pageOpens = new Map(
    (await prisma.menuEvent.groupBy({ by: ["label"], where: { kind: "event", label: { not: null }, day: range }, _count: { _all: true } })).map((r) => [r.label ?? "", r._count._all]),
  );
  const contactRows = await prisma.menuEvent.groupBy({ by: ["label"], where: { kind: "contact", label: { not: null }, day: range }, _count: { _all: true } });
  const contactOf = (verb: string, title: string) => contactRows.find((r) => r.label === `${verb} · ${title}`)?._count._all ?? 0;
  const eventCards = promos.map((e) => {
    const first = e.startDate < start ? start : e.startDate;
    const last = e.endDate > to ? to : e.endDate;
    let during = 0;
    let dayCount = 0;
    for (let d = first; d <= last; d = addDays(d, 1)) {
      during += perDay.get(d) ?? 0;
      dayCount += 1;
    }
    return {
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      pageOpens: pageOpens.get(e.title) ?? 0,
      book: contactOf("Prenota", e.title),
      calendar: contactOf("Calendario", e.title),
      share: contactOf("Condividi", e.title),
      menuOpens: during,
      days: dayCount,
    };
  });
  // Effetto degli eventi: aperture medie al giorno nei giorni di un evento e negli altri giorni.
  const eventDays = new Set<string>();
  for (const e of promos) for (let d = e.startDate < start ? start : e.startDate; d <= (e.endDate > to ? to : e.endDate); d = addDays(d, 1)) eventDays.add(d);
  let onSum = 0;
  let offSum = 0;
  let offDays = 0;
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const c = perDay.get(d) ?? 0;
    if (eventDays.has(d)) onSum += c;
    else {
      offSum += c;
      offDays += 1;
    }
  }
  const effect = eventDays.size && offDays ? { onAvg: onSum / eventDays.size, offAvg: offSum / offDays, onDays: eventDays.size, offDays } : null;

  return { today, to, from, start, recent, eventCards, eventDays: [...eventDays], effect, daily, todayStats, shortcuts, dayRanking, monthRanking, opens, prevOpens, heat, weeks, weekdays, best, bestDay, searches, empty, picks, pairs, sections, events, contacts };
}

export type StatsData = Awaited<ReturnType<typeof loadStats>>;
