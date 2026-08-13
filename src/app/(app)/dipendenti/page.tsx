import { prisma } from "@/lib/prisma";
import { addDays, startOfWeek, toDateKey } from "@/lib/week";
import { NewEmployeeForm } from "./new-employee-form";
import { EmployeeList } from "./employee-list";

export default async function DipendentiPage() {
  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 6);
  const dateKeys = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i)));

  const [employees, blocks, leaveEntries, closures] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    prisma.shiftBlock.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
  ]);

  const mapped = employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    jobTitle: e.jobTitle,
    active: e.active,
    sortOrder: e.sortOrder,
    photoVersion: e.photoUpdatedAt ? String(e.photoUpdatedAt.getTime()) : null,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Dipendenti</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Gestisci l&apos;elenco di dipendenti e titolare. Il titolare compare negli orari ma non nel registro ferie.
      </p>

      <NewEmployeeForm />
      <EmployeeList
        employees={mapped}
        dateKeys={dateKeys}
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
      />
    </div>
  );
}
