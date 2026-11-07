// Letture per la pagina Statistiche (solo server). Tutto è calcolato dagli
// eventi anonimi di MenuEvent: aperture, ricerche, voci guardate, contatti.

import { prisma } from "@/lib/prisma";
import { romeParts } from "@/lib/menu-stats";
import { opensAtSameTime } from "@/lib/opens-same-time";
import { isValidDateKey } from "@/lib/week";

export type Period = "7" | "30" | "90" | "all" | "custom";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "Ultimi 7 giorni" },
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 3 mesi" },
  { value: "all", label: "Tutto il tempo" },
  { value: "custom", label: "Dal… al…" },
];

// Se non si sceglie nulla: tutto il tempo.
export function parsePeriod(v: unknown): Period {
  return v === "7" || v === "30" || v === "90" || v === "custom" ? v : "all";
}

// Solo date vere del calendario: «2026-13-45» o «2026-02-30» si ignorano (prima facevano
// cadere la pagina), come se non ci fossero.
export function parseDay(v: unknown): string | null {
  return typeof v === "string" && isValidDateKey(v) ? v : null;
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
const weekdayOf = (day: string) => (toDate(day).getUTCDay() + 6) % 7;
// Ultimo giorno del mese di quel giorno.
function monthLast(day: string): string {
  const d = toDate(`${day.slice(0, 8)}01`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return toKey(d);
}

// Il periodo con cui confrontare quello scelto, per la percentuale grande in cima:
// - un giorno solo (Oggi, Ieri, un giorno toccato): lo stesso giorno della settimana prima
//   (un sabato contro il venerdì prima non direbbe nulla);
// - da un lunedì dentro la stessa settimana (Questa settimana, Settimana scorsa): gli stessi
//   giorni della settimana prima, lun–sab contro lun–sab;
// - dal primo del mese dentro lo stesso mese (Questo mese, Mese scorso): gli stessi giorni del
//   mese prima, 1–7 novembre contro 1–7 ottobre (se il mese prima è più corto, tutto il mese);
// - altrimenti (e sempre per «Ultimi 7/30 giorni», «Ultimi 3 mesi») un periodo lungo uguale subito prima.
// «sameDay» è il giorno del periodo prima che corrisponde all'ultimo giorno di quello scelto:
// se il periodo arriva a oggi, quel giorno si conta solo fino a quest'ora.
function comparePeriod(from: string, to: string, days: number, calendar: boolean): { from: string; to: string; sameDay: string | null } {
  if (!calendar) return { from: addDays(from, -days), to: addDays(from, -1), sameDay: addDays(from, -1) };
  if (from === to) return { from: addDays(from, -7), to: addDays(to, -7), sameDay: addDays(to, -7) };
  if (weekdayOf(from) === 0 && to <= addDays(from, 6)) return { from: addDays(from, -7), to: addDays(to, -7), sameDay: addDays(to, -7) };
  if (from.endsWith("-01") && to.slice(0, 7) === from.slice(0, 7)) {
    const prevLast = addDays(from, -1);
    const prevFirst = `${prevLast.slice(0, 8)}01`;
    if (to === monthLast(to)) return { from: prevFirst, to: prevLast, sameDay: null };
    const same = addDays(prevFirst, Number(to.slice(8)) - 1);
    return same <= prevLast ? { from: prevFirst, to: same, sameDay: same } : { from: prevFirst, to: prevLast, sameDay: null };
  }
  return { from: addDays(from, -days), to: addDays(from, -1), sameDay: addDays(from, -1) };
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
  // Periodo a scelta (dal… al…): mai oltre oggi.
  const customTo = period === "custom" && custom?.to && custom.to < today ? custom.to : today;
  // Un «dal» nel futuro vale oggi (niente «dal 1 dic al 7 nov» con 0 giorni).
  let customFrom = period === "custom" ? (custom?.from ?? since) : null;
  if (customFrom && customFrom > customTo) customFrom = customTo;
  const days =
    period === "all"
      ? null
      : period === "custom"
        ? customFrom
          ? Math.round((Date.parse(customTo) - Date.parse(customFrom)) / 86_400_000) + 1
          : null
        : Number(period);
  let to = period === "custom" ? customTo : today;
  // Dal primo giorno del periodo (mai prima di «Inizia a contare»).
  let from = period === "custom" ? customFrom : days ? addDays(today, -(days - 1)) : since;
  if (since && from && from < since) from = since;
  // Un periodo tutto prima di «Inizia a contare»: si mostra il primo giorno contato, non 0 giorni.
  if (from && from > to) to = from;
  const range = { lte: to, ...(from ? { gte: from } : {}) };
  // Il confronto vale solo se anche il periodo prima era tutto già contato.
  const cmp = days && from && from <= to ? comparePeriod(from, to, days, period === "custom") : null;
  const compare = cmp && (!since || cmp.from >= since) ? { from: cmp.from, to: cmp.to, partial: to === today && cmp.sameDay !== null } : null;
  // Se il periodo arriva a oggi, il giorno corrispondente del periodo prima si conta solo fino a
  // quest'ora: una giornata a metà contro una giornata intera sembrerebbe sempre un calo.
  async function countPrev(): Promise<number | null> {
    if (!compare) return null;
    if (!compare.partial || !cmp?.sameDay) return prisma.menuEvent.count({ where: { kind: "open", day: { gte: compare.from, lte: compare.to } } });
    const same = cmp.sameDay;
    const [rest, soFar] = await Promise.all([
      prisma.menuEvent.count({ where: { kind: "open", day: { gte: compare.from, lte: compare.to, not: same } } }),
      opensAtSameTime([same]),
    ]);
    return rest + (soFar.get(same) ?? 0);
  }

  const [opens, prevOpens, byHour, byDay, searches, empty, picks, pairs, sections, events, contacts] = await Promise.all([
    prisma.menuEvent.count({ where: { kind: "open", day: range } }),
    countPrev(),
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

  // Andamento: aperture per settimana, le 26 settimane più recenti (qualunque sia il periodo scelto).
  // «from» è il primo giorno contato se la settimana è iniziata prima di «Inizia a contare»;
  // «current» la settimana in corso: tutte e due incomplete.
  const weeks: { start: string; count: number; from: string | null; current: boolean }[] = [];
  for (let w = weekStart(today), i = 0; i < 26 && w >= weekStart(firstDay); w = addDays(w, -7), i++) {
    let count = 0;
    for (let d = 0; d < 7; d++) count += perDay.get(addDays(w, d)) ?? 0;
    weeks.unshift({ start: w, count, from: firstDay > w ? firstDay : null, current: w === weekStart(today) });
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

  // Classifica dei giorni della settimana nel periodo: totale e media per giorno
  // (quanti lunedì, martedì… ci sono stati dal primo giorno contato).
  const start = from ?? firstDay;
  const occurrences = Array.from({ length: 7 }, () => 0);
  for (let d = start; d <= to; d = addDays(d, 1)) occurrences[(toDate(d).getUTCDay() + 6) % 7] += 1;
  const dayRanking = dayTotals
    .map((total, wd) => ({ weekday: wd, total, average: occurrences[wd] ? total / occurrences[wd] : 0, days: occurrences[wd] }))
    .sort((a, b) => b.average - a.average || b.total - a.total);
  // «Giorno più forte» in cima: il primo della classifica (per media, non per totale: un giorno
  // che nel periodo capita più volte non deve vincere solo per questo).
  const bestDay = dayRanking[0] && dayRanking[0].average > 0 ? dayRanking[0].weekday : -1;

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
    .sort((a, b) => b.average - a.average || b.total - a.total);

  // Giorno per giorno: ogni giorno del periodo scelto, dal più recente (anche quelli a zero).
  const daily: { day: string; count: number }[] = [];
  for (let d = to; d >= start; d = addDays(d, -1)) daily.push({ day: d, count: perDay.get(d) ?? 0 });

  // Oggi, ieri e lo stesso giorno della settimana scorsa: sempre in vista in cima alla pagina.
  // Il confronto si fa «alla stessa ora»: una giornata appena iniziata contro giornate intere
  // sembrerebbe sempre un crollo.
  // Fino alla stessa ora E minuto di adesso (non fino alla fine dell'ora in corso).
  const soFar = await opensAtSameTime([addDays(today, -1), addDays(today, -7)]);
  const soFarOf = (d: string) => soFar.get(d) ?? 0;
  const todayStats = {
    today: perDay.get(today) ?? 0,
    yesterday: perDay.get(addDays(today, -1)) ?? 0,
    lastWeek: perDay.get(addDays(today, -7)) ?? 0,
    yesterdaySoFar: soFarOf(addDays(today, -1)),
    lastWeekSoFar: soFarOf(addDays(today, -7)),
    hour: romeParts().hour,
  };

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

  // Eventi (non gli annunci, non quelli nascosti o tolti) che cadono nel periodo: servono al grafico
  // (fascia colorata) e alla scheda «Gli eventi funzionano?». Per ognuno: pagina aperta e contatti
  // dalla sua pagina. Ci sono anche gli eventi in arrivo la cui pagina è stata aperta nel periodo.
  const [allPromos, pageRows, contactRows] = await Promise.all([
    prisma.menuPromo.findMany({
      where: { kind: "EVENT", deletedAt: null, hidden: false, endDate: { gte: start } },
      select: { title: true, slug: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
    // Pagina dell'evento: si conta per indirizzo (slug), così rinominare l'evento non fa sparire i numeri.
    // Le aperture salvate prima, senza indirizzo, si riconoscono dal titolo.
    prisma.menuEvent.groupBy({ by: ["target", "label"], where: { kind: "event", day: range }, _count: { _all: true } }),
    prisma.menuEvent.groupBy({ by: ["label", "target"], where: { kind: "contact", label: { not: null }, day: range }, _count: { _all: true } }),
  ]);
  const pageOpensOf = (e: { slug: string; title: string }) =>
    pageRows.filter((r) => r.target === e.slug || (!r.target && r.label === e.title)).reduce((a, r) => a + r._count._all, 0);
  const promos = allPromos.filter((e) => e.startDate <= to);
  const upcoming = allPromos.filter((e) => e.startDate > to && pageOpensOf(e) > 0);
  // Prenota/Calendario/Condividi: per indirizzo dell'evento (rinominandolo i numeri restano); quelli salvati
  // prima, senza indirizzo, si riconoscono dal titolo.
  const contactOf = (verb: string, e: { slug: string; title: string }) =>
    contactRows
      .filter((r) => (r.target === e.slug && (r.label ?? "").startsWith(`${verb} · `)) || (!r.target && r.label === `${verb} · ${e.title}`))
      .reduce((a, r) => a + r._count._all, 0);
  const eventCards = [...promos, ...upcoming].map((e) => {
    const first = e.startDate < start ? start : e.startDate;
    const last = e.endDate > to ? to : e.endDate;
    let during = 0;
    let dayCount = 0;
    // (per un evento in arrivo il ciclo non gira: nessun giorno nel periodo)
    for (let d = first; d <= last; d = addDays(d, 1)) {
      during += perDay.get(d) ?? 0;
      dayCount += 1;
    }
    return {
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      pageOpens: pageOpensOf(e),
      book: contactOf("Prenota", e),
      calendar: contactOf("Calendario", e),
      share: contactOf("Condividi", e),
      menuOpens: during,
      days: dayCount,
      upcoming: e.startDate > to,
    };
  });
  // Effetto degli eventi: aperture medie nei giorni di un evento contro gli STESSI giorni della
  // settimana senza evento (un sabato con evento contro gli altri sabati, non contro i lunedì).
  // Solo giorni già finiti: oggi, a giornata in corso, abbasserebbe la media.
  const eventDays = new Set<string>();
  for (const e of promos) for (let d = e.startDate < start ? start : e.startDate; d <= (e.endDate > to ? to : e.endDate); d = addDays(d, 1)) eventDays.add(d);
  const lastDone = to < today ? to : addDays(today, -1);
  const offSum = Array.from({ length: 7 }, () => 0);
  const offCount = Array.from({ length: 7 }, () => 0);
  for (let d = start; d <= lastDone; d = addDays(d, 1)) {
    if (eventDays.has(d)) continue;
    offSum[weekdayOf(d)] += perDay.get(d) ?? 0;
    offCount[weekdayOf(d)] += 1;
  }
  let onSum = 0;
  let onDays = 0;
  let base = 0;
  const effectWeekdays = new Set<number>();
  for (const d of [...eventDays].sort()) {
    const wd = weekdayOf(d);
    if (d > lastDone || !offCount[wd]) continue;
    onSum += perDay.get(d) ?? 0;
    onDays += 1;
    base += offSum[wd] / offCount[wd];
    effectWeekdays.add(wd);
  }
  const effect = onDays
    ? { onAvg: onSum / onDays, offAvg: base / onDays, onDays, offDays: [...effectWeekdays].reduce((a, wd) => a + offCount[wd], 0), weekdays: [...effectWeekdays] }
    : null;

  return { today, to, from, start, compare, recent, eventCards, eventDays: [...eventDays], effect, daily, todayStats, shortcuts, dayRanking, monthRanking, opens, prevOpens, heat, weeks, weekdays, best, bestDay, searches, empty, picks, pairs, sections, events, contacts };
}

export type StatsData = Awaited<ReturnType<typeof loadStats>>;
