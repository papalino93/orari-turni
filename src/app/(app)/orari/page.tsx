import { prisma } from "@/lib/prisma";
import { addDays, endOfMonth, endOfYear, parseDateKey, startOfMonth, startOfWeek, startOfYear, toDateKey } from "@/lib/week";
import { OrariView, type ViewMode } from "./orari-view";

export default async function OrariPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; employee?: string }>;
}) {
  const params = await searchParams;
  const view = (["day", "week", "month", "year"].includes(params.view ?? "") ? params.view : "week") as ViewMode;
  const refDate = params.date ? parseDateKey(params.date) : parseDateKey(toDateKey(new Date()));
  const employeeFilter = params.employee || undefined;

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

  const [blocks, leaveEntries] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    needsLeave
      ? prisma.leaveEntry.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } })
      : Promise.resolve([]),
  ]);

  return (
    <OrariView
      view={view}
      dateKey={toDateKey(refDate)}
      rangeStartKey={toDateKey(rangeStart)}
      rangeEndKey={toDateKey(rangeEnd)}
      employeeFilter={employeeFilter}
      employees={employees.map((e) => ({ id: e.id, name: e.name, role: e.role, sortOrder: e.sortOrder }))}
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
    />
  );
}
