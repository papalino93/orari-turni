import { prisma } from "@/lib/prisma";
import {
  addDays,
  endOfMonth,
  endOfYear,
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
  const refDate = params.date ? parseDateKey(params.date) : parseDateKey(todayKey());
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

  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const needsLeave = view === "day" || view === "week";
  const weekStart = view === "week" ? startOfWeek(refDate) : null;

  const [blocks, leaveEntries, closures, weekPlan] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    needsLeave
      ? prisma.leaveEntry.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } })
      : Promise.resolve([]),
    prisma.closureDay.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    weekStart ? prisma.weekPlan.findUnique({ where: { weekStart } }) : Promise.resolve(null),
  ]);

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
      blocks={blocks.map((b) => ({
        id: b.id,
        employeeId: b.employeeId,
        dateKey: toDateKey(b.date),
        startTime: b.startTime,
        endTime: b.endTime,
        confirmed: b.confirmed,
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
