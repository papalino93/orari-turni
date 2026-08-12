import { prisma } from "@/lib/prisma";
import {
  addDays,
  endOfMonth,
  endOfYear,
  jsDayOfWeek,
  parseDateKey,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toDateKey,
} from "@/lib/week";
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
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const needsLeaveAndThresholds = view === "day" || view === "week";

  const [blocks, leaveEntries, thresholds] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    needsLeaveAndThresholds
      ? prisma.leaveEntry.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } })
      : Promise.resolve([]),
    needsLeaveAndThresholds
      ? prisma.coverageThreshold.findMany({
          where: {
            OR: [{ specificDate: { gte: rangeStart, lte: rangeEnd } }, { specificDate: null }],
          },
        })
      : Promise.resolve([]),
  ]);

  let dayThreshold: number | null = null;
  if (view === "day") {
    const dateKey = toDateKey(refDate);
    const override = thresholds.find((t) => t.specificDate && toDateKey(t.specificDate) === dateKey);
    const dow = jsDayOfWeek(refDate);
    const weekdayDefault = thresholds.find((t) => t.dayOfWeek === dow && !t.specificDate);
    dayThreshold = override?.minStaff ?? weekdayDefault?.minStaff ?? null;
  }

  return (
    <OrariView
      view={view}
      dateKey={toDateKey(refDate)}
      employeeFilter={employeeFilter}
      employees={employees.map((e) => ({ id: e.id, name: e.name, role: e.role }))}
      blocks={blocks.map((b) => ({
        id: b.id,
        employeeId: b.employeeId,
        dateKey: toDateKey(b.date),
        startTime: b.startTime,
        endTime: b.endTime,
      }))}
      leaveEntries={leaveEntries.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        dateKey: toDateKey(l.date),
        type: l.type,
        quantity: l.quantity,
      }))}
      thresholds={thresholds.map((t) => ({
        dayOfWeek: t.dayOfWeek,
        dateKey: t.specificDate ? toDateKey(t.specificDate) : null,
        minStaff: t.minStaff,
      }))}
      dayThreshold={dayThreshold}
    />
  );
}
