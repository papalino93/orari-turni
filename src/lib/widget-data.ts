// Dati dei widget (solo server): pochi numeri e poche parole già pronti da disegnare.
// Ogni widget riceve solo quello che mostra; i link sono percorsi del sito.

import { prisma } from "@/lib/prisma";
import { romeParts } from "@/lib/menu-stats";
import { loadDaily, loadStatsSetting, loadVenue, loadVisibleBlocks } from "@/lib/menu";
import { businessDayKey, formatPrice, inPeriod, periodStatus } from "@/lib/menu-format";
import { openStatus, romeNow } from "@/lib/menu-venue";
import { blockHours, periodOf } from "@/lib/schedule";
import { employeeVisibleDates } from "@/lib/week-visibility";
import { parseDateKey } from "@/lib/week";
import { MENU_QR_URL } from "@/lib/widgets";

const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DAYS_SHORT = ["L", "M", "M", "G", "V", "S", "D"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (day: string) => (toDate(day).getUTCDay() + 6) % 7; // 0 = lunedì
const monday = (day: string) => addDays(day, -weekday(day));
const dayLong = (day: string) => `${DAYS[weekday(day)]} ${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const dayShort = (day: string) => `${DAYS[weekday(day)].slice(0, 3)} ${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1].slice(0, 3)}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
const hhmm = (t: string) => (t.endsWith(":00") ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}:${t.slice(3)}`);
// Variazione in percentuale, arrotondata; null se il confronto non ha senso (base zero).
const delta = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
const clockNow = () => {
  const { minutes } = romeNow(new Date());
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

async function opensPerDay(from: string): Promise<Map<string, number>> {
  const rows = await prisma.menuEvent.groupBy({ by: ["day"], where: { kind: "open", day: { gte: from } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.day, r._count._all]));
}

// ---------- Aperture di oggi
export async function dataAperture() {
  const today = romeParts().day;
  const { since } = await loadStatsSetting();
  const per = await opensPerDay(addDays(today, -63));
  const count = (d: string) => per.get(d) ?? 0;
  // Media dello stesso giorno della settimana nelle 8 settimane prima (solo giorni già contati).
  const same = Array.from({ length: 8 }, (_, i) => addDays(today, -7 * (i + 1))).filter((d) => !since || d >= since);
  const avg = same.length ? Math.round(same.reduce((s, d) => s + count(d), 0) / same.length) : null;
  const lastWeekDay = addDays(today, -7);
  return {
    aggiornato: clockNow(),
    giorno: dayLong(today),
    giornoSettimana: DAYS[weekday(today)].toLowerCase(),
    oggi: count(today),
    ieri: count(addDays(today, -1)),
    deltaIeri: delta(count(today), count(addDays(today, -1))),
    settimanaScorsa: count(lastWeekDay),
    deltaSettimanaScorsa: delta(count(today), count(lastWeekDay)),
    media: avg,
    ultimi14: Array.from({ length: 14 }, (_, i) => count(addDays(today, i - 13))),
    link: `/statistiche?dal=${today}&al=${today}`,
    linkIeri: `/statistiche?dal=${addDays(today, -1)}&al=${addDays(today, -1)}`,
    linkSettimanaScorsa: `/statistiche?dal=${lastWeekDay}&al=${lastWeekDay}`,
  };
}

// ---------- Statistiche della settimana
export async function dataSettimana() {
  const today = romeParts().day;
  const mon = monday(today);
  const prevMon = addDays(mon, -7);
  const per = await opensPerDay(prevMon);
  const count = (d: string) => per.get(d) ?? 0;
  const wd = weekday(today);
  const questa = Array.from({ length: wd + 1 }, (_, i) => count(addDays(mon, i)));
  const scorsa = Array.from({ length: 7 }, (_, i) => count(addDays(prevMon, i)));
  const totale = questa.reduce((a, b) => a + b, 0);
  const stessoPunto = scorsa.slice(0, wd + 1).reduce((a, b) => a + b, 0);
  const [hours, search, pick] = await Promise.all([
    prisma.menuEvent.groupBy({ by: ["hour"], where: { kind: "open", day: { gte: mon } }, _count: { _all: true } }),
    prisma.menuEvent.groupBy({ by: ["label"], where: { kind: "search", label: { not: null }, day: { gte: mon } }, _count: { _all: true }, orderBy: { _count: { label: "desc" } }, take: 1 }),
    prisma.menuEvent.groupBy({ by: ["label"], where: { kind: "pick", label: { not: null }, day: { gte: mon } }, _count: { _all: true }, orderBy: { _count: { label: "desc" } }, take: 1 }),
  ]);
  const peak = hours.reduce<{ hour: number; n: number } | null>((best, h) => (!best || h._count._all > best.n ? { hour: h.hour, n: h._count._all } : best), null);
  const peakIdx = scorsa.indexOf(Math.max(...scorsa));
  return {
    aggiornato: clockNow(),
    giorni: DAYS_SHORT,
    oggiIndice: wd,
    questa,
    scorsa,
    totale,
    stessoPunto,
    delta: delta(totale, stessoPunto),
    oraDiPunta: peak ? `${peak.hour}–${peak.hour + 1}` : null,
    piuCercato: search[0]?.label ?? null,
    piuGuardato: pick[0]?.label ?? null,
    piccoScorsa: Math.max(...scorsa) > 0 ? `${DAYS[peakIdx].slice(0, 3).toLowerCase()} ${Math.max(...scorsa)}` : null,
    link: `/statistiche?dal=${mon}&al=${today}`,
    linkCercati: `/statistiche?dal=${mon}&al=${today}#cercano`,
    linkGuardati: `/statistiche?dal=${mon}&al=${today}#guardano`,
  };
}

// ---------- Prossimo evento (non nascosto, non finito)
async function nextEvent(today: string) {
  const ev = await prisma.menuPromo.findFirst({
    where: { kind: "EVENT", deletedAt: null, hidden: false, endDate: { gte: today } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    select: { title: true, slug: true, startDate: true, endDate: true, startTime: true },
  });
  if (!ev) return null;
  const inCorso = ev.startDate <= today;
  const giorni = inCorso ? 0 : Math.round((toDate(ev.startDate).getTime() - toDate(today).getTime()) / 86_400_000);
  return {
    titolo: ev.title,
    quando: inCorso ? (ev.startTime ? `oggi dalle ${hhmm(ev.startTime)}` : "in corso") : dayShort(ev.startDate),
    giorno: Number(ev.startDate.slice(8)),
    mese: MONTHS[Number(ev.startDate.slice(5, 7)) - 1].slice(0, 3).toUpperCase(),
    giorni,
    oggi: inCorso,
    ora: ev.startTime ? hhmm(ev.startTime) : null,
    link: `/menu/p/${ev.slug}`,
  };
}

// Ore in turno della settimana (dipendenti attivi, giorni non chiusi).
async function weekHours(mon: string) {
  const sun = addDays(mon, 6);
  const [blocks, closures] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { date: { gte: parseDateKey(mon), lte: parseDateKey(sun) }, employee: { active: true } }, select: { date: true, startTime: true, endTime: true } }),
    prisma.closureDay.findMany({ where: { date: { gte: parseDateKey(mon), lte: parseDateKey(sun) } }, select: { date: true } }),
  ]);
  const closed = new Set(closures.map((c) => c.date.toISOString().slice(0, 10)));
  return Math.round(blocks.filter((b) => !closed.has(b.date.toISOString().slice(0, 10))).reduce((s, b) => s + blockHours(b), 0));
}

// ---------- Riepilogo
export async function dataRiepilogo() {
  const today = romeParts().day;
  const [ap, st, ore, ev] = await Promise.all([dataAperture(), dataSettimana(), weekHours(monday(today)), nextEvent(today)]);
  return {
    aggiornato: clockNow(),
    giorno: ap.giorno,
    oggi: ap.oggi,
    deltaOggi: ap.deltaSettimanaScorsa,
    giornoSettimana: ap.giornoSettimana,
    settimana: st.totale,
    deltaSettimana: st.delta,
    oreSettimana: ore,
    evento: ev,
    ultimi14: ap.ultimi14,
    link: "/statistiche",
    linkOre: `/orari?date=${monday(today)}`,
  };
}

// ---------- Oggi al locale
export async function dataOggi() {
  const now = new Date();
  const { dateKey } = romeNow(now);
  const venue = await loadVenue();
  const status = openStatus({ ...venue.hours, showStatus: true }, now);
  const [blocks, closure, ev] = await Promise.all([
    prisma.shiftBlock.findMany({
      where: { date: parseDateKey(dateKey), employee: { active: true } },
      select: { startTime: true, endTime: true, employee: { select: { name: true, sortOrder: true } } },
      orderBy: [{ startTime: "asc" }],
    }),
    prisma.closureDay.findUnique({ where: { date: parseDateKey(dateKey) }, select: { reason: true } }),
    nextEvent(businessDayKey(now)),
  ]);
  const fascia = (p: "mattina" | "pomeriggio") => {
    const list = closure ? [] : blocks.filter((b) => periodOf(b) === p).sort((a, b) => a.employee.sortOrder - b.employee.sortOrder);
    if (list.length === 0) return null;
    const start = list.map((b) => b.startTime).sort()[0];
    const end = list.map((b) => b.endTime).sort().at(-1)!;
    return {
      orario: `${hhmm(start)}–${hhmm(end)}`,
      persone: list.map((b) => ({ nome: firstName(b.employee.name), iniziali: initials(b.employee.name) })),
    };
  };
  return {
    aggiornato: clockNow(),
    giorno: dayLong(dateKey),
    aperto: status?.open ?? false,
    stato: status?.label ?? "",
    chiusoOggi: closure ? closure.reason || "Locale chiuso" : null,
    mattina: fascia("mattina"),
    sera: fascia("pomeriggio"),
    evento: ev && ev.oggi ? ev : null,
    link: `/orari?date=${dateKey}`,
  };
}

// Voci da compilare per gli allergeni: le stesse che chiede «Compila allergeni».
async function allergensToDo(day: string) {
  const items = await prisma.menuItem.findMany({
    where: {
      deletedAt: null,
      textOnly: false,
      allergensReviewed: false,
      group: { deletedAt: null, section: { kind: "FOOD", deletedAt: null } },
      OR: [{ onlyDay: null }, { onlyDay: day }],
    },
    select: { availableFrom: true, availableTo: true, onlyDay: true, group: { select: { section: { select: { dailyOnly: true, promo: { select: { hidden: true, deletedAt: true, endDate: true } } } } } } },
  });
  return items.filter((i) => {
    const promo = i.group.section.promo;
    if (promo && (promo.hidden || promo.deletedAt || promo.endDate < day)) return false;
    if (i.group.section.dailyOnly && i.onlyDay !== day) return false;
    return periodStatus(i, day) !== "after";
  }).length;
}

// ---------- Da fare
export async function dataDaFare() {
  const day = businessDayKey(new Date());
  const today = romeParts().day;
  const nextMon = addDays(monday(today), 7);
  const [allergeni, esauriti, nextBlocks, nextPlan, mesi] = await Promise.all([
    allergensToDo(day),
    prisma.menuItem.count({ where: { deletedAt: null, soldOutDay: day } }),
    prisma.shiftBlock.count({ where: { date: { gte: parseDateKey(nextMon), lte: parseDateKey(addDays(nextMon, 6)) } } }),
    prisma.weekPlan.findUnique({ where: { weekStart: parseDateKey(nextMon) }, select: { publishedAt: true } }),
    prisma.monthlySubmission.count({ where: { status: "SUBMITTED" } }),
  ]);
  const daConfermare = nextBlocks > 0 && !nextPlan?.publishedAt ? 1 : 0;
  const righe = [
    { n: allergeni, testo: allergeni === 1 ? "allergeni da compilare" : "allergeni da compilare", breve: "allergeni", livello: allergeni > 0 ? "rosso" : "verde", link: "/gestione-menu" },
    { n: daConfermare, testo: "settimana da confermare", breve: "da confermare", livello: daConfermare > 0 ? "ambra" : "verde", link: `/orari?date=${nextMon}` },
    { n: esauriti, testo: esauriti === 1 ? "esaurito oggi" : "esauriti oggi", breve: "esauriti", livello: esauriti > 0 ? "ambra" : "verde", link: "/gestione-menu" },
    { n: mesi, testo: mesi === 1 ? "mese da approvare" : "mesi da approvare", breve: "da approvare", livello: mesi > 0 ? "ambra" : "verde", link: "/dipendenti" },
  ];
  return { aggiornato: clockNow(), tuttoAPosto: righe.every((r) => r.n === 0), righe, link: "/gestione-menu" };
}

type MenuLine = { nome: string; dettaglio: string; prezzo: string; link: string };

async function dailyLines(day: string): Promise<{ piatti: MenuLine[]; vini: MenuLine[] }> {
  const sections = await loadDaily(day);
  const lines = (kind: "FOOD" | "WINE") =>
    sections
      .filter((s) => s.kind === kind)
      .flatMap((s) => s.groups.flatMap((g) => g.items))
      .filter((i) => !i.textOnly)
      .map((i) => ({
        nome: i.name,
        dettaglio: kind === "WINE" ? [i.priceGlassCents !== null ? `Calice ${formatPrice(i.priceGlassCents)}` : null, i.priceBottleCents !== null ? `Bottiglia ${formatPrice(i.priceBottleCents)}` : null].filter(Boolean).join(" · ") : i.description ?? "",
        prezzo: kind === "WINE" ? [i.priceGlassCents, i.priceBottleCents].filter((c) => c !== null).map((c) => formatPrice(c)).join(" · ") : i.priceCents !== null ? formatPrice(i.priceCents) : "",
        link: `/menu#v-${i.id}`,
      }));
  return { piatti: lines("FOOD"), vini: lines("WINE") };
}

async function soldOutNames(day: string) {
  const rows = await prisma.menuItem.findMany({ where: { deletedAt: null, soldOutDay: day, textOnly: false }, select: { name: true }, take: 6 });
  return rows.map((r) => r.name);
}

// ---------- Anteprima menù
export async function dataMenu() {
  const day = businessDayKey(new Date());
  const [daily, recommended, esauriti, blocks, ev] = await Promise.all([
    dailyLines(day),
    prisma.menuItem.findMany({
      where: { deletedAt: null, recommended: true, textOnly: false, group: { deletedAt: null, section: { deletedAt: null, promoId: null, dailyOnly: false } } },
      select: { id: true, name: true, availableFrom: true, availableTo: true, soldOutDay: true },
      orderBy: { updatedAt: "asc" },
    }),
    soldOutNames(day),
    loadVisibleBlocks(day),
    nextEvent(day),
  ]);
  return {
    aggiornato: clockNow(),
    piatti: daily.piatti.slice(0, 2),
    vini: daily.vini.slice(0, 2),
    consigli: recommended.filter((r) => inPeriod(r, day)).slice(0, 4).map((r) => ({ nome: r.name, link: `/menu#v-${r.id}` })),
    esauriti,
    vetrina: blocks.filter((b) => b.kind === "HIGHLIGHT" && b.title).map((b) => b.title as string).slice(0, 2),
    evento: ev,
    link: "/menu",
  };
}

// ---------- Oggi fuori menù ed eventi
export async function dataFuoriMenu() {
  const day = businessDayKey(new Date());
  const [daily, esauriti, ev] = await Promise.all([dailyLines(day), soldOutNames(day), nextEvent(day)]);
  return { aggiornato: clockNow(), piatti: daily.piatti.slice(0, 3), vini: daily.vini.slice(0, 3), esauriti, evento: ev, link: "/menu#oggi" };
}

// ---------- QR
export function dataQr() {
  return { aggiornato: clockNow(), url: MENU_QR_URL, link: "/menu" };
}

// ---------- I miei prossimi orari (solo orari visibili al dipendente: confermati)
export async function dataTurni(employeeId: string) {
  const now = new Date();
  const { dateKey, minutes } = romeNow(now);
  const mon = monday(dateKey);
  const visible = await employeeVisibleDates();
  const until = addDays(dateKey, 28);
  const [blocks, leaves, closures] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { employeeId, date: { gte: parseDateKey(mon), lte: parseDateKey(until) } }, select: { date: true, startTime: true, endTime: true }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.leaveEntry.findMany({ where: { employeeId, date: { gte: parseDateKey(mon), lte: parseDateKey(addDays(mon, 6)) } }, select: { date: true, type: true } }),
    prisma.closureDay.findMany({ where: { date: { gte: parseDateKey(mon), lte: parseDateKey(until) } }, select: { date: true } }),
  ]);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const closed = new Set(closures.map((c) => key(c.date)));
  const shifts = blocks.filter((b) => visible(b.date) && !closed.has(key(b.date)));
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const next = shifts.find((b) => key(b.date) > dateKey || (key(b.date) === dateKey && toMin(b.endTime) > minutes));
  let prossimo = null;
  if (next) {
    const d = key(next.date);
    const startAt = toDate(d).getTime() + (toMin(next.startTime) - 12 * 60) * 60_000;
    const nowAt = toDate(dateKey).getTime() + (minutes - 12 * 60) * 60_000;
    const hoursTo = Math.round((startAt - nowAt) / 3_600_000);
    const inCorso = d === dateKey && toMin(next.startTime) <= minutes;
    const quando = d === dateKey ? "Oggi" : d === addDays(dateKey, 1) ? "Domani" : DAYS[weekday(d)];
    prossimo = {
      quando,
      giorno: dayShort(d),
      inizio: next.startTime,
      fine: next.endTime,
      ore: Math.round(blockHours(next) * 10) / 10,
      tra: inCorso ? "in corso" : hoursTo < 1 ? "tra poco" : hoursTo < 48 ? `tra ${hoursTo} ${hoursTo === 1 ? "ora" : "ore"}` : `tra ${Math.round(hoursTo / 24)} giorni`,
      link: `/mie-ore?date=${d}`,
    };
  }
  const leaveLabel: Record<string, string> = { FERIE: "ferie", PERMESSO: "permesso", LIBERO: "riposo", MALATTIA: "malattia" };
  const settimana = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i);
    const own = shifts.filter((b) => key(b.date) === d);
    const leave = leaves.find((l) => key(l.date) === d);
    return {
      lettera: DAYS_SHORT[i],
      numero: Number(d.slice(8)),
      oggi: d === dateKey,
      lavoro: own.length > 0,
      inizio: own[0]?.startTime ?? null,
      testo: closed.has(d) ? "chiuso" : own.length ? `${hhmm(own[0].startTime)}–${hhmm(own.at(-1)!.endTime)}` : leave ? leaveLabel[leave.type] : "riposo",
      prossimo: !!next && key(next.date) === d,
    };
  });
  return { aggiornato: clockNow(), prossimo, settimana, link: `/mie-ore?date=${dateKey}` };
}
