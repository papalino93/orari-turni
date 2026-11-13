// Agenda a calendario: dati di un periodo (solo i giorni in vista, senza cronologia) e note del giorno.
// Solo server. La pagina /prenotazioni carica il resto (Da gestire, Stasera, …) come prima.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, businessDay } from "@/lib/booking/rules";
import { closuresBetween } from "@/lib/booking/service";
import { employeeVisibleDates } from "@/lib/week-visibility";
import { summarizeByDay, type AgendaBooking, type AgendaClosure, type AgendaData, type AgendaStaff } from "@/lib/booking/agenda";

// Al massimo sei settimane (la vista Mese) più un margine.
export const AGENDA_MAX_DAYS = 45;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const validDay = (d: unknown): d is string => typeof d === "string" && DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && addDays(d, 0) === d;

const LIGHT_SELECT = {
  id: true,
  status: true,
  day: true,
  time: true,
  startsAt: true,
  people: true,
  name: true,
  phone: true,
  note: true,
  allergies: true,
  table: true,
  menu: true,
  source: true,
  manual: true,
  createdBy: true,
  arrivedAt: true,
  noShowAt: true,
  isTest: true,
  timeUnknown: true,
  peopleUnknown: true,
  proposedTime: true,
  proposedStartsAt: true,
  createdAt: true,
  promo: { select: { title: true } },
  // Per le annullate: erano in agenda (confermate prima)?
  log: { where: { kind: { in: ["CONFIRMED", "ACCEPTED"] } }, select: { kind: true }, take: 1 },
} satisfies Prisma.BookingRequestSelect;

export async function loadAgenda(
  from: string,
  to: string,
  opts: { rows: boolean; staff: boolean; isOwner: boolean; countTests: boolean },
  now: Date = new Date(),
): Promise<AgendaData> {
  const [rows, events, notes, closures, staff] = await Promise.all([
    prisma.bookingRequest.findMany({
      where: { day: { gte: from, lte: to }, status: { in: ["CONFIRMED", "PENDING", "PROPOSED", "CANCELLED"] } },
      select: LIGHT_SELECT,
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.menuPromo.findMany({
      where: { kind: "EVENT", hidden: false, deletedAt: null, startDate: { lte: to }, endDate: { gte: from } },
      select: { title: true, slug: true, startDate: true, endDate: true, startTime: true, endTime: true },
      orderBy: [{ startDate: "asc" }, { startTime: "asc" }],
    }),
    prisma.bookingDayNote.findMany({ where: { day: { gte: from, lte: to } }, orderBy: { createdAt: "asc" } }),
    closuresBetween(from, to),
    opts.staff && from === to ? staffOn(from, opts.isOwner) : null,
  ]);
  const bookings: AgendaBooking[] = rows
    .map((b) => ({
      id: b.id,
      status: b.status,
      day: b.day,
      time: b.time,
      startsAt: b.startsAt.getTime(),
      people: b.people,
      name: b.name,
      phone: b.phone,
      note: b.note,
      allergies: b.allergies,
      table: b.table,
      menu: b.menu,
      source: b.source,
      promoTitle: b.promo?.title ?? null,
      manual: b.manual,
      createdBy: b.createdBy,
      arrivedAt: b.arrivedAt?.getTime() ?? null,
      noShowAt: b.noShowAt?.getTime() ?? null,
      isTest: b.isTest,
      timeUnknown: b.timeUnknown,
      peopleUnknown: b.peopleUnknown,
      proposedTime: b.proposedTime,
      proposedStartsAt: b.proposedStartsAt?.getTime() ?? null,
      createdAt: b.createdAt.getTime(),
      wasInAgenda: b.manual || b.log.length > 0,
    }))
    // Le annullate solo se erano in agenda (come sul librone: barrate in fondo al giorno).
    .filter((b) => b.status !== "CANCELLED" || b.wasInAgenda);
  const closureRecord: Record<string, AgendaClosure> = {};
  for (const [day, c] of closures) closureRecord[day] = { kind: c.kind, reason: c.reason };
  return {
    from,
    to,
    bookings: opts.rows ? bookings : null,
    summary: summarizeByDay(bookings, opts.countTests, now.getTime()),
    events,
    notes: notes.map((n) => ({ id: n.id, day: n.day, text: n.text, author: n.author, updatedAt: n.updatedAt.getTime() })),
    closures: closureRecord,
    staff: staff ? { [from]: staff } : {},
  };
}

const LEAVE_LABEL: Record<string, string> = { FERIE: "Ferie", PERMESSO: "Permesso" };
const hoursText = (h: number) => `${String(h).replace(".", ",")} ${h === 1 ? "ora" : "ore"}`;

// Chi lavora quel giorno (turni) e chi è in ferie o permesso. La malattia non si mostra (dato personale).
// Un dipendente vede i turni delle settimane future solo dopo la conferma degli orari (come in «Le mie ore»).
async function staffOn(day: string, isOwner: boolean): Promise<AgendaStaff> {
  const date = new Date(`${day}T00:00:00Z`);
  if (!isOwner) {
    const visible = await employeeVisibleDates();
    if (!visible(date)) return { working: null, away: null };
  }
  const [blocks, leaves] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { date, employee: { isVenueDevice: false } }, select: { startTime: true, endTime: true, employee: { select: { id: true, name: true, sortOrder: true } } }, orderBy: { startTime: "asc" } }),
    prisma.leaveEntry.findMany({ where: { date, type: { in: ["FERIE", "PERMESSO"] }, employee: { isVenueDevice: false } }, select: { type: true, quantity: true, employee: { select: { name: true } } } }),
  ]);
  const byEmployee = new Map<string, { name: string; first: string; ranges: string[] }>();
  for (const b of blocks) {
    const e = byEmployee.get(b.employee.id) ?? { name: b.employee.name, first: b.startTime, ranges: [] };
    e.ranges.push(`${b.startTime}–${b.endTime}`);
    byEmployee.set(b.employee.id, e);
  }
  const working = [...byEmployee.values()].sort((a, b) => a.first.localeCompare(b.first) || a.name.localeCompare(b.name, "it")).map(({ name, ranges }) => ({ name, ranges }));
  const away = leaves
    .map((l) => ({
      name: l.employee.name,
      what: l.type === "PERMESSO" ? `Permesso${l.quantity > 0 ? ` (${hoursText(l.quantity)})` : ""}` : l.quantity > 0 && l.quantity < 1 ? "Mezza giornata di ferie" : LEAVE_LABEL[l.type],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
  return { working, away };
}

// ---------- Note del giorno («EVENTO DAINELLI», un promemoria)

export const NOTE_MAX = 200;
const cleanNote = (t: unknown) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "");

export async function addDayNote(day: string, text: unknown, author: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!validDay(day)) return { ok: false, error: "Giorno non valido." };
  const t = cleanNote(text);
  if (!t) return { ok: false, error: "Scrivi la nota." };
  if (day < addDays(businessDay(new Date()), -400)) return { ok: false, error: "Quel giorno è troppo lontano." };
  const n = await prisma.bookingDayNote.create({ data: { day, text: t, author } });
  return { ok: true, id: n.id };
}

export async function updateDayNote(id: string, text: unknown, author: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = cleanNote(text);
  if (!t) return { ok: false, error: "Scrivi la nota, oppure toglila." };
  const r = await prisma.bookingDayNote.updateMany({ where: { id }, data: { text: t, author } });
  return r.count ? { ok: true } : { ok: false, error: "Questa nota non c'è più: qualcuno l'ha tolta." };
}

export async function removeDayNote(id: string): Promise<{ ok: true }> {
  await prisma.bookingDayNote.deleteMany({ where: { id } });
  return { ok: true };
}

// Menù già usati (i più frequenti degli ultimi 6 mesi): suggerimenti nel foglio della prenotazione.
export async function menuSuggestions(): Promise<string[]> {
  const rows = await prisma.bookingRequest.groupBy({
    by: ["menu"],
    where: { menu: { not: null }, createdAt: { gte: new Date(Date.now() - 183 * 86400000) } },
    _count: { menu: true },
    orderBy: { _count: { menu: "desc" } },
    take: 6,
  });
  const used = rows.map((r) => r.menu).filter((m): m is string => Boolean(m));
  // Senza storia: i due che si scrivono più spesso sul librone.
  for (const d of ["Menù da 25 €", "Menù degustazione"]) if (used.length < 4 && !used.includes(d)) used.push(d);
  return used;
}
