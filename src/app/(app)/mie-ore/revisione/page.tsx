import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { daysInMonth, toDateKey, todayKey } from "@/lib/week";
import { RevisioneView } from "./revisione-view";

export default async function RevisionePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "EMPLOYEE" || !session.user.employeeId) redirect("/orari");

  const employee = await prisma.employee.findUnique({ where: { id: session.user.employeeId } });
  if (!employee) redirect("/login");

  const today = todayKey();
  const { year: yearParam, month: monthParam } = await searchParams;
  const year = yearParam ? Number(yearParam) : Number(today.slice(0, 4));
  const month = monthParam ? Number(monthParam) : Number(today.slice(5, 7));
  const anchor = new Date(Date.UTC(year, month - 1, 1));

  const dateKeys = daysInMonth(anchor).map(toDateKey);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const [blocks, leaveEntries, closures, submission] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { employeeId: employee.id, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.leaveEntry.findMany({ where: { employeeId: employee.id, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.monthlySubmission.findUnique({ where: { employeeId_year_month: { employeeId: employee.id, year, month } } }),
  ]);

  return (
    <RevisioneView
      employee={{
        id: employee.id,
        name: employee.name,
        jobTitle: employee.jobTitle,
        photoVersion: employee.photoUpdatedAt ? String(employee.photoUpdatedAt.getTime()) : null,
      }}
      isActive={employee.active}
      year={year}
      month={month}
      dateKeys={dateKeys}
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
      status={submission?.status ?? "DRAFT"}
      reopenNote={submission?.status === "REOPENED" ? submission.reopenNote : null}
    />
  );
}
