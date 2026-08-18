import { prisma } from "@/lib/prisma";
import {
  addDays,
  endOfMonth,
  endOfYear,
  isValidDateKey,
  parseDateKey,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toDateKey,
  todayKey,
} from "@/lib/week";
import { OrariView, type ViewMode } from "./orari-view";

export default async function OrariPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; employee?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const view = (["day", "week", "month", "year"].includes(params.view ?? "") ? params.view : "week") as ViewMode;
  // todayKey() e non toDateKey(new Date()): quest'ultima legge il giorno in
  // UTC, sbagliando la vista di default nella finestra tra mezzanotte UTC e
  // quella italiana (l'utente aprirebbe /orari e vedrebbe ancora ieri).
  // isValidDateKey scarta un `?date=` malformato (link troncato, vecchio
  // segnalibro) invece di far esplodere parseDateKey più sotto.
  const refDate = params.date && isValidDateKey(params.date) ? parseDateKey(params.date) : parseDateKey(todayKey());
  const employeeFilter = params.employee || undefined;
  const displayMode = params.mode === "employees" ? "employees" : "periods";

  const rangeStart =
    view === "day"
      ? refDate
      : view === "week"
        ? startOfWeek(refDate)
        : view === "month"
          ? startOfMonth(refDate)
          : startOfYear(refDate);
  const rangeEnd =
    view === "day"
      ? refDate
      : view === "week"
        ? addDays(startOfWeek(refDate), 6)
        : view === "month"
          ? endOfMonth(refDate)
          : endOfYear(refDate);

  const weekStart = view === "week" ? startOfWeek(refDate) : null;

  // leaveEntries va sempre interrogato, anche per Mese/Anno: schedule.ts
  // dichiara esplicitamente "una sola fonte dati, nessuna vista ricalcola
  // nulla per conto suo" — saltarlo per Mese/Anno (come prima, quando
  // "serviva" solo a Giorno/Settimana) faceva sì che schedule.entry() e le
  // anomalie mentissero in silenzio su ferie/permessi/malattia per quelle
  // due viste, viste come "non pianificato". L'intervallo più ampio (fino a
  // un anno) resta comunque poco costoso per il volume di dati di un
  // singolo negozio.
  const [blocks, leaveEntries, closures, weekPlan] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    weekStart ? prisma.weekPlan.findUnique({ where: { weekStart } }) : Promise.resolve(null),
  ]);

  // Oltre agli attivi, includiamo chi è stato disattivato ma ha comunque
  // turni/assenze registrati nel periodo mostrato: altrimenti un dipendente
  // uscito sparisce, con le sue ore, anche dai periodi passati in cui ha
  // davvero lavorato (verifiche retrospettive, controlli su buste paga).
  const employeeIdsWithData = Array.from(
    new Set([...blocks.map((b) => b.employeeId), ...leaveEntries.map((l) => l.employeeId)]),
  );

  const employees = await prisma.employee.findMany({
    where: employeeIdsWithData.length > 0 ? { OR: [{ active: true }, { id: { in: employeeIdsWithData } }] } : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <OrariView
      view={view}
      displayMode={displayMode}
      dateKey={toDateKey(refDate)}
      rangeStartKey={toDateKey(rangeStart)}
      rangeEndKey={toDateKey(rangeEnd)}
      employeeFilter={employeeFilter}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        jobTitle: e.jobTitle,
        sortOrder: e.sortOrder,
        photoVersion: e.photoUpdatedAt ? String(e.photoUpdatedAt.getTime()) : null,
      }))}
      activeEmployeeIds={employees.filter((e) => e.active).map((e) => e.id)}
      blocks={blocks.map((b) => ({
        id: b.id,
        employeeId: b.employeeId,
        dateKey: toDateKey(b.date),
        startTime: b.startTime,
        endTime: b.endTime,
        confirmed: b.confirmed,
        addedByEmployee: b.addedByEmployee,
        originalStartTime: b.originalStartTime,
        originalEndTime: b.originalEndTime,
      }))}
      leaveEntries={leaveEntries.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        dateKey: toDateKey(l.date),
        type: l.type,
        quantity: l.quantity,
      }))}
      closures={closures.map((c) => ({ dateKey: toDateKey(c.date), reason: c.reason }))}
      weekPlan={
        weekPlan ? { publishedAt: weekPlan.publishedAt ? weekPlan.publishedAt.toISOString() : null } : { publishedAt: null }
      }
    />
  );
}
