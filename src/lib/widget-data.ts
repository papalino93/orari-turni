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

// Aperture fino a quest'ora, per i giorni indicati: i confronti si fanno alla stessa ora, altrimenti
// una giornata appena iniziata contro giornate intere sembra sempre un crollo.
async function opensSoFar(days: string[], hour: number): Promise<Map<string, number>> {
  const rows = await prisma.menuEvent.groupBy({ by: ["day"], where: { kind: "open", day: { in: days }, hour: { lte: hour } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.day, r._count._all]));
}

// ---------- Aperture di oggi
export async function dataAperture() {
  const { day: today, hour } = romeParts();
  const { since } = await loadStatsSetting();
  const per = await opensPerDay(addDays(today, -63));
  const count = (d: string) => per.get(d) ?? 0;
  // Stesso giorno della settimana nelle 8 settimane prima (solo giorni già contati), alla stessa ora.
  const same = Array.from({ length: 8 }, (_, i) => addDays(today, -7 * (i + 1))).filter((d) => !since || d >= since);
  const yesterday = addDays(today, -1);
  const lastWeekDay = addDays(today, -7);
  const soFar = await opensSoFar([yesterday, ...same], hour);
  const at = (d: string) => soFar.get(d) ?? 0;
  const avg = same.length ? Math.round(same.reduce((s, d) => s + at(d), 0) / same.length) : null;
  return {
    aggiornato: clockNow(),
    giorno: dayLong(today),
    giornoSettimana: DAYS[weekday(today)].toLowerCase(),
    oggi: count(today),
    ieri: at(yesterday),
    deltaIeri: delta(count(today), at(yesterday)),
    settimanaScorsa: at(lastWeekDay),
    deltaSettimanaScorsa: delta(count(today), at(lastWeekDay)),
    ieriTotale: count(yesterday),
    settimanaScorsaTotale: count(lastWeekDay),
    media: avg,
    ultimi14: Array.from({ length: 14 }, (_, i) => count(addDays(today, i - 13))),
    link: `/statistiche?dal=${today}&al=${today}`,
    linkIeri: `/statistiche?dal=${yesterday}&al=${yesterday}`,
    linkSettimanaScorsa: `/statistiche?dal=${lastWeekDay}&al=${lastWeekDay}`,
  };
}

// ---------- Statistiche della settimana
export async function dataSettimana() {
  const { day: today, hour } = romeParts();
  const mon = monday(today);
  const prevMon = addDays(mon, -7);
  const per = await opensPerDay(prevMon);
  const count = (d: string) => per.get(d) ?? 0;
  const wd = weekday(today);
  const questa = Array.from({ length: wd + 1 }, (_, i) => count(addDays(mon, i)));
  const scorsa = Array.from({ length: 7 }, (_, i) => count(addDays(prevMon, i)));
  const totale = questa.reduce((a, b) => a + b, 0);
  // La settimana scorsa fino allo stesso giorno e alla stessa ora.
  const oggiScorso = (await opensSoFar([addDays(prevMon, wd)], hour)).get(addDays(prevMon, wd)) ?? 0;
  const stessoPunto = scorsa.slice(0, wd).reduce((a, b) => a + b, 0) + oggiScorso;
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

// =====================================================================================
// Widget pensati per i momenti della giornata: in sala, prima di aprire, stasera,
// l'andamento, cosa dire ai clienti, il pannello con le scorciatoie.

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
// Un turno che finisce a mezzanotte (o dopo) è scritto «00:00»: vale 24:00.
const endMin = (start: string, end: string) => (toMin(end) <= toMin(start) ? toMin(end) + 24 * 60 : toMin(end));

// I nomi brevi sul widget: basta il nome; se due persone della giornata hanno lo stesso nome si aggiunge
// l'iniziale del cognome («Andrea R.» e «Andrea B.»), e più lettere se anche quella è uguale.
export function shortNames(people: { id: string; name: string }[]) {
  const unici = [...new Map(people.map((p) => [p.id, p.name.trim().split(/\s+/)])).entries()];
  const out = new Map<string, string>();
  for (const [id, parti] of unici) {
    const nome = parti[0] ?? "";
    const cognome = parti.slice(1).join(" ");
    const omonimi = unici.filter(([altro, p]) => altro !== id && (p[0] ?? "").toLowerCase() === nome.toLowerCase());
    if (!omonimi.length || !cognome) {
      out.set(id, nome);
      continue;
    }
    let n = 1;
    const pezzo = (p: string[], k: number) => p.slice(1).join(" ").slice(0, k).toLowerCase();
    while (n < cognome.length && omonimi.some(([, p]) => pezzo(p, n) === cognome.slice(0, n).toLowerCase())) n++;
    out.set(id, `${nome} ${cognome.slice(0, n)}.`);
  }
  return out;
}

// Chi è al lavoro adesso (e fino a quando), e chi arriva più tardi oggi.
async function staffNow() {
  const now = new Date();
  const { dateKey, minutes } = romeNow(now);
  const [blocks, closure] = await Promise.all([
    prisma.shiftBlock.findMany({
      where: { date: parseDateKey(dateKey), employee: { active: true } },
      select: { startTime: true, endTime: true, employee: { select: { id: true, name: true, sortOrder: true } } },
      orderBy: [{ startTime: "asc" }],
    }),
    prisma.closureDay.findUnique({ where: { date: parseDateKey(dateKey) }, select: { reason: true } }),
  ]);
  if (closure) return { chiuso: closure.reason || "Locale chiuso", adesso: [], dopo: [], stasera: [] };
  const corti = shortNames(blocks.map((b) => b.employee));
  const person = (b: (typeof blocks)[number]) => ({
    nome: corti.get(b.employee.id) ?? firstName(b.employee.name),
    iniziali: initials(b.employee.name),
    dalle: hhmm(b.startTime),
    alle: b.endTime === "00:00" ? "24" : hhmm(b.endTime),
    fine: endMin(b.startTime, b.endTime),
  });
  const adesso = blocks.filter((b) => toMin(b.startTime) <= minutes && minutes < endMin(b.startTime, b.endTime)).map(person);
  const dopo = blocks.filter((b) => toMin(b.startTime) > minutes).map(person);
  // Una persona sola volta anche se la sera ha due pezzi di turno: dal primo inizio all'ultima fine.
  const perPersona = new Map<string, ReturnType<typeof person>>();
  for (const b of blocks.filter((x) => periodOf(x) === "pomeriggio")) {
    const p = person(b);
    const prima = perPersona.get(b.employee.id);
    if (!prima) perPersona.set(b.employee.id, p);
    else if (p.fine > prima.fine) perPersona.set(b.employee.id, { ...prima, alle: p.alle, fine: p.fine });
  }
  const stasera = [...perPersona.values()];
  return { chiuso: null, adesso, dopo, stasera };
}

async function notFoundToday(day: string) {
  const rows = await prisma.menuEvent.groupBy({ by: ["label"], where: { kind: "search_empty", label: { not: null }, day }, _count: { _all: true }, orderBy: { _count: { label: "desc" } }, take: 2 });
  return rows.map((r) => ({ parola: r.label as string, volte: r._count._all }));
}

// ---------- In sala, dal vivo
export async function dataSala() {
  const { day: today, hour } = romeParts();
  const yesterday = addDays(today, -1);
  const business = businessDayKey(new Date());
  const [rows, staff, esauriti, nonTrovati] = await Promise.all([
    prisma.menuEvent.groupBy({ by: ["day", "hour"], where: { kind: "open", day: { in: [today, yesterday] } }, _count: { _all: true } }),
    staffNow(),
    soldOutNames(business),
    notFoundToday(today),
  ]);
  const at = (d: string, h: number) => rows.find((r) => r.day === d && r.hour === h)?._count._all ?? 0;
  // La giornata del locale sul grafico: dalle 10 alle 24, aperture accumulate ora per ora.
  const ORE = Array.from({ length: 15 }, (_, i) => 10 + i);
  const cumul = (d: string, fino: number) => {
    let s = Array.from({ length: 10 }, (_, h) => at(d, h)).reduce((a, b) => a + b, 0);
    return ORE.filter((h) => h <= fino).map((h) => (s += at(d, h)));
  };
  const oggi = Array.from({ length: 24 }, (_, h) => at(today, h)).reduce((a, b) => a + b, 0);
  const ieriFinora = Array.from({ length: hour + 1 }, (_, h) => at(yesterday, h)).reduce((a, b) => a + b, 0);
  return {
    aggiornato: clockNow(),
    oggi,
    ieriFinora,
    delta: delta(oggi, ieriFinora),
    ultimaOra: at(today, hour),
    oraPrima: hour > 0 ? at(today, hour - 1) : 0,
    serieOggi: cumul(today, hour),
    serieIeri: cumul(yesterday, 24),
    ore: ORE,
    alLavoro: staff.adesso,
    arrivano: staff.dopo,
    chiuso: staff.chiuso,
    esauriti,
    nonTrovati,
    link: `/statistiche?dal=${today}&al=${today}`,
    linkTurni: `/orari?date=${today}`,
    linkMenu: "/gestione-menu",
  };
}

// ---------- Prima di aprire (la mattina)
export async function dataMattina() {
  const { day: today } = romeParts();
  const yesterday = addDays(today, -1);
  const business = businessDayKey(new Date());
  const nextMon = addDays(monday(today), 7);
  const [per, hours, pick, daily, allergeni, staff, ev, nextBlocks, nextPlan] = await Promise.all([
    opensPerDay(addDays(today, -8)),
    prisma.menuEvent.groupBy({ by: ["hour"], where: { kind: "open", day: yesterday }, _count: { _all: true } }),
    prisma.menuEvent.groupBy({ by: ["label"], where: { kind: "pick", label: { not: null }, day: yesterday }, _count: { _all: true }, orderBy: { _count: { label: "desc" } }, take: 1 }),
    dailyLines(business),
    allergensToDo(business),
    staffNow(),
    nextEvent(business),
    prisma.shiftBlock.count({ where: { date: { gte: parseDateKey(nextMon), lte: parseDateKey(addDays(nextMon, 6)) } } }),
    prisma.weekPlan.findUnique({ where: { weekStart: parseDateKey(nextMon) }, select: { publishedAt: true } }),
  ]);
  const count = (d: string) => per.get(d) ?? 0;
  const peak = hours.reduce<{ hour: number; n: number } | null>((best, h) => (!best || h._count._all > best.n ? { hour: h.hour, n: h._count._all } : best), null);
  const fuori = daily.piatti.length + daily.vini.length;
  const persone = [...staff.adesso, ...staff.dopo];
  const cose = [
    // Il fuori menù è facoltativo: se c'è lo si ricorda, se manca non è una cosa da fare.
    fuori > 0 ? { testo: `Fuori menù: ${[...daily.piatti, ...daily.vini].map((x) => x.nome).slice(0, 2).join(", ")}`, fatto: true, link: "/gestione-menu" } : null,
    allergeni > 0 ? { testo: `${allergeni} ${allergeni === 1 ? "piatto" : "piatti"} senza allergeni`, fatto: false, link: "/gestione-menu" } : null,
    nextBlocks > 0 && !nextPlan?.publishedAt ? { testo: "Settimana prossima da confermare", fatto: false, link: `/orari?date=${nextMon}` } : null,
  ].filter(Boolean);
  return {
    aggiornato: clockNow(),
    giorno: dayLong(today),
    ieri: { aperture: count(yesterday), delta: delta(count(yesterday), count(addDays(yesterday, -7))), giorno: DAYS[weekday(yesterday)].toLowerCase(), oraDiPunta: peak ? `${peak.hour}–${peak.hour + 1}` : null, piuGuardato: pick[0]?.label ?? null },
    oggi: {
      chiuso: staff.chiuso,
      persone: persone.map((p) => ({ nome: p.nome, iniziali: p.iniziali, dalle: p.dalle })),
      evento: ev && ev.oggi ? { titolo: ev.titolo, ora: ev.ora } : null,
    },
    cose,
    link: `/statistiche?dal=${yesterday}&al=${yesterday}`,
    linkTurni: `/orari?date=${today}`,
  };
}

// ---------- Stasera: l'evento di oggi, o il prossimo
export async function dataStasera() {
  const day = businessDayKey(new Date());
  const ev = await prisma.menuPromo.findFirst({
    where: { kind: "EVENT", deletedAt: null, hidden: false, endDate: { gte: day } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, label: true, slug: true, startDate: true, endDate: true, startTime: true, endTime: true, showFrom: true, imageUpdatedAt: true, hasMenu: true },
  });
  if (!ev) return { aggiornato: clockNow(), evento: null, link: "/gestione-menu" };
  const oggi = ev.startDate <= day;
  const giorni = oggi ? 0 : Math.round((toDate(ev.startDate).getTime() - toDate(day).getTime()) / 86_400_000);
  const { minutes } = romeNow(new Date());
  const inCorso = oggi && (!ev.startTime || toMin(ev.startTime) <= minutes);
  const tra = inCorso ? "in corso" : oggi && ev.startTime ? (() => { const m = toMin(ev.startTime) - minutes; return m < 60 ? `tra ${m} min` : `tra ${Math.round(m / 60)} ${Math.round(m / 60) === 1 ? "ora" : "ore"}`; })() : giorni === 1 ? "domani" : `tra ${giorni} giorni`;
  const [views, viewsToday, items] = await Promise.all([
    prisma.menuEvent.count({ where: { kind: "event", target: ev.slug, day: { gte: ev.showFrom ?? addDays(ev.startDate, -7) } } }),
    prisma.menuEvent.count({ where: { kind: "event", target: ev.slug, day: romeParts().day } }),
    ev.hasMenu
      ? prisma.menuItem.findMany({ where: { deletedAt: null, textOnly: false, group: { deletedAt: null, section: { promoId: ev.id, deletedAt: null } } }, select: { name: true, priceCents: true, priceGlassCents: true }, orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }], take: 3 })
      : Promise.resolve([]),
  ]);
  return {
    aggiornato: clockNow(),
    evento: {
      titolo: ev.title,
      tipo: ev.label || "Evento",
      oggi,
      tra,
      giorno: Number(ev.startDate.slice(8)),
      mese: MONTHS[Number(ev.startDate.slice(5, 7)) - 1].slice(0, 3).toUpperCase(),
      quando: oggi ? (ev.startTime ? `Oggi ${hhmm(ev.startTime)}${ev.endTime ? `–${hhmm(ev.endTime)}` : ""}` : "Oggi") : `${dayShort(ev.startDate)}${ev.startTime ? ` · ${hhmm(ev.startTime)}` : ""}`,
      locandina: ev.imageUpdatedAt ? `/menu/p/${ev.slug}/immagine?v=${ev.imageUpdatedAt.getTime()}` : null,
      menu: items.map((i) => ({ nome: i.name, prezzo: i.priceCents !== null ? formatPrice(i.priceCents) : i.priceGlassCents !== null ? formatPrice(i.priceGlassCents) : "" })),
      visite: views,
      visiteOggi: viewsToday,
    },
    link: `/menu/p/${ev.slug}`,
  };
}

// ---------- Andamento (per il consulente e il titolare)
export async function dataAndamento() {
  const { day: today, hour } = romeParts();
  const mon = monday(today);
  const wd = weekday(today);
  const { since } = await loadStatsSetting();
  // Si guarda indietro al massimo 8 settimane, e mai prima del giorno da cui si conta.
  const from = since && since > addDays(mon, -7 * 7) ? since : addDays(mon, -7 * 7);
  const counted = (d: string) => !since || d >= since;
  const monthStart = `${today.slice(0, 8)}01`;
  const prevStart = (() => { const d = toDate(monthStart); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const dom = Number(today.slice(8));
  const monthBefore = (start: string) => { const d = toDate(start); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };
  const monthAfter = (start: string) => { const d = toDate(start); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
  const threeBack = monthBefore(monthBefore(prevStart));
  const daysInPrev = Number(addDays(monthStart, -1).slice(8));
  // Lo stesso giorno del mese scorso (il 31 marzo non c'è a febbraio: allora febbraio intero).
  const prevSameDay = dom <= daysInPrev ? addDays(prevStart, dom - 1) : null;
  const [per, soFar, byWd, byHour, events, oreQuesta, oreScorsa] = await Promise.all([
    opensPerDay(from < threeBack ? from : threeBack),
    // Oggi è a metà: i confronti prendono lo stesso giorno di prima solo fino a quest'ora.
    opensSoFar([addDays(today, -7), ...(prevSameDay ? [prevSameDay] : [])], hour),
    prisma.menuEvent.groupBy({ by: ["weekday"], where: { kind: "open", day: { gte: from, lt: today } }, _count: { _all: true } }),
    prisma.menuEvent.groupBy({ by: ["hour"], where: { kind: "open", day: { gte: from, lt: today } }, _count: { _all: true } }),
    prisma.menuPromo.findMany({ where: { kind: "EVENT", deletedAt: null, hidden: false, startDate: { lte: today }, endDate: { gte: from } }, select: { startDate: true, endDate: true } }),
    weekHours(mon),
    weekHours(addDays(mon, -7)),
  ]);
  const count = (d: string) => (counted(d) ? (per.get(d) ?? 0) : 0);
  const sum = (days: string[]) => days.reduce((s, d) => s + count(d), 0);
  const range = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));
  const shortDay = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}`;

  // Settimana in corso (da lunedì a oggi) contro la scorsa fino allo stesso giorno e alla stessa ora.
  const questa = sum(range(mon, wd + 1));
  const scorsaGiorni = range(addDays(mon, -7), wd);
  const scorsaConfrontabile = counted(addDays(mon, -7));
  const scorsa = sum(scorsaGiorni) + (soFar.get(addDays(today, -7)) ?? 0);
  const GIORNI3 = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

  // Il mese in corso contro gli stessi giorni del mese prima, fino alla stessa ora (il 5 novembre:
  // 1–5 novembre contro 1–5 ottobre). Il confronto c'è solo se quei giorni del mese prima sono stati contati tutti.
  const monthName = (start: string) => MONTHS[Number(start.slice(5, 7)) - 1];
  const dalNel = (start: string) => (since && since > start ? `dal ${Number(since.slice(8))} ${monthName(start)}` : null);
  const n = sum(range(monthStart, dom));
  const primaGiorni = prevSameDay ? range(prevStart, dom - 1) : range(prevStart, daysInPrev);
  const primaContati = counted(prevStart);
  const prima = primaContati ? sum(primaGiorni) + (prevSameDay ? (soFar.get(prevSameDay) ?? 0) : 0) : null;
  // Da quando il confronto sarà possibile: il mese dopo il primo mese contato tutto.
  const primoIntero = !since ? null : since.slice(8) === "01" ? `${since.slice(0, 8)}01` : monthAfter(`${since.slice(0, 8)}01`);
  const mese = {
    nome: monthName(monthStart),
    n,
    giorni: dom === 1 ? `1 ${monthName(monthStart).slice(0, 3)}` : `1–${dom} ${monthName(monthStart).slice(0, 3)}`,
    dal: dalNel(monthStart),
    nomePrima: monthName(prevStart),
    giorniPrima: prevSameDay ? (dom === 1 ? `1 ${monthName(prevStart).slice(0, 3)}` : `1–${dom} ${monthName(prevStart).slice(0, 3)}`) : monthName(prevStart),
    prima,
    delta: prima === null ? null : delta(n, prima),
    confrontoDa: prima === null && primoIntero ? monthName(monthAfter(primoIntero)) : null,
  };
  const monthDays = (start: string, end: string) => range(start, Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86400000));
  // I mesi finiti, a consuntivo: gli ultimi tre contati, dal più recente.
  const mesi = [prevStart, monthBefore(prevStart), threeBack]
    .filter((start) => counted(addDays(monthAfter(start), -1)))
    .map((start) => ({ nome: monthName(start), n: sum(monthDays(start, monthAfter(start))), dal: since && since > start ? `dal ${Number(since.slice(8))}` : null }));

  // Le settimane da quando si conta (al massimo 8, compresa quella in corso).
  const settimane = Array.from({ length: 8 }, (_, i) => addDays(mon, -7 * (7 - i)))
    .filter((start) => counted(addDays(start, 6)))
    .map((start) => {
      // La prima settimana può essere contata solo da metà: lo dice l'etichetta, «dal 3 ott».
      const parziale = Boolean(since && start < since);
      return { da: parziale ? `dal ${shortDay(since as string)}` : shortDay(start), n: sum(range(start, 7).filter((d) => d <= today)), inCorso: start === mon, parziale };
    });

  // Giorni con un evento contro gli altri (solo giornate già finite e contate).
  const evDays = new Set<string>();
  for (const e of events) for (let d = e.startDate; d <= e.endDate; d = addDays(d, 1)) evDays.add(d);
  const past = range(from, Math.round((toDate(today).getTime() - toDate(from).getTime()) / 86400000)).filter(counted);
  const avg = (list: string[]) => (list.length ? Math.round(list.reduce((s, d) => s + count(d), 0) / list.length) : null);
  const conEvento = avg(past.filter((d) => evDays.has(d)));
  const senza = avg(past.filter((d) => !evDays.has(d)));
  const bestWd = byWd.reduce<{ w: number; n: number } | null>((b, r) => (!b || r._count._all > b.n ? { w: r.weekday, n: r._count._all } : b), null);
  const bestHour = byHour.reduce<{ h: number; n: number } | null>((b, r) => (!b || r._count._all > b.n ? { h: r.hour, n: r._count._all } : b), null);
  const dalGiorno = since && since >= addDays(mon, -7 * 7) ? `${Number(since.slice(8))} ${MONTHS[Number(since.slice(5, 7)) - 1]}` : null;
  return {
    aggiornato: clockNow(),
    // «dal 3 ottobre» se si conta da poco: le medie e i «più forte» valgono da lì, non da 8 settimane.
    periodo: dalGiorno ? `dal ${dalGiorno}` : "ultime 8 settimane",
    settimana: {
      n: questa,
      giorni: wd === 0 ? "oggi, lunedì" : `lun–${GIORNI3[wd]}`,
      prima: scorsaConfrontabile ? scorsa : null,
      delta: scorsaConfrontabile ? delta(questa, scorsa) : null,
    },
    mese,
    mesi,
    settimane,
    eventi: conEvento !== null && senza !== null ? { conEvento, senza, delta: delta(conEvento, senza) } : null,
    giornoForte: bestWd ? DAYS[(bestWd.w + 6) % 7] : null,
    oraForte: bestHour ? `${bestHour.h}–${bestHour.h + 1}` : null,
    ore: { questa: oreQuesta, scorsa: oreScorsa },
    link: "/statistiche",
    linkOre: `/orari?date=${mon}`,
  };
}

// ---------- Cosa dire ai clienti (per chi è in sala)
export async function dataClienti() {
  const day = businessDayKey(new Date());
  const [daily, esauriti, ev, consigli] = await Promise.all([
    dailyLines(day),
    soldOutNames(day),
    nextEvent(day),
    prisma.menuItem.findMany({
      where: { deletedAt: null, recommended: true, textOnly: false, group: { deletedAt: null, section: { deletedAt: null, promoId: null, dailyOnly: false } } },
      select: { name: true, availableFrom: true, availableTo: true, soldOutDay: true },
      orderBy: { updatedAt: "asc" },
    }),
  ]);
  return {
    aggiornato: clockNow(),
    fuori: [...daily.piatti, ...daily.vini].slice(0, 3).map((x) => ({ nome: x.nome, prezzo: x.prezzo })),
    esauriti,
    consigli: consigli.filter((c) => inPeriod(c, day) && c.soldOutDay !== day).slice(0, 3).map((c) => c.name),
    evento: ev && ev.oggi ? { titolo: ev.titolo, ora: ev.ora } : ev ? { titolo: ev.titolo, quando: ev.quando } : null,
    link: "/menu",
  };
}

// La prima cosa da fare, detta per intero sotto il numero.
const TODO_TEXT: Record<string, (n: number) => string> = {
  allergeni: (n) => `${n} ${n === 1 ? "piatto" : "piatti"} senza allergeni`,
  "da confermare": () => "orari da confermare",
  "da approvare": (n) => `${n} ${n === 1 ? "mese" : "mesi"} da approvare`,
};

// ---------- Pannello: sei scorciatoie, ognuna con il suo dato
export async function dataPannello(owner: { kind: "admin" } | { kind: "employee"; employeeId: string }) {
  const day = businessDayKey(new Date());
  const today = romeParts().day;
  if (owner.kind === "employee") {
    const [turni, daily, esauriti] = await Promise.all([dataTurni(owner.employeeId), dailyLines(day), soldOutNames(day)]);
    return {
      aggiornato: clockNow(),
      ruolo: "dipendente",
      turno: turni.prossimo ? { quando: turni.prossimo.quando, orario: `${hhmm(turni.prossimo.inizio)}–${hhmm(turni.prossimo.fine)}`, tra: turni.prossimo.tra, link: turni.prossimo.link } : null,
      fuori: [...daily.piatti, ...daily.vini].map((x) => x.nome).slice(0, 2),
      esauriti: esauriti.length,
      link: "/menu",
      linkTurni: turni.link,
      linkOre: "/mie-ore",
    };
  }
  const [ap, staff, daily, todo] = await Promise.all([dataAperture(), staffNow(), dailyLines(day), dataDaFare()]);
  const daFare = todo.righe.filter((r) => r.n > 0 && r.breve !== "esauriti");
  return {
    aggiornato: clockNow(),
    ruolo: "titolare",
    aperture: ap.oggi,
    delta: ap.deltaIeri,
    ieriFinora: ap.ieri,
    ultimi14: ap.ultimi14,
    stasera: {
      chiuso: staff.chiuso,
      persone: staff.stasera.map((p) => ({ nome: p.nome, orario: `${p.dalle}–${p.alle}` })),
      orario: staff.stasera.length ? `${staff.stasera[0].dalle}–${[...staff.stasera].sort((a, b) => b.fine - a.fine)[0].alle}` : null,
    },
    fuori: [...daily.piatti, ...daily.vini].map((x) => x.nome).slice(0, 2),
    daFare: daFare.reduce((s, r) => s + r.n, 0),
    daFarePrimo: daFare[0] ? { testo: TODO_TEXT[daFare[0].breve]?.(daFare[0].n) ?? `${daFare[0].n} ${daFare[0].breve}`, link: daFare[0].link } : null,
    link: "/menu",
    linkStatistiche: `/statistiche?dal=${today}&al=${today}`,
    linkTurni: `/orari?date=${today}`,
  };
}
