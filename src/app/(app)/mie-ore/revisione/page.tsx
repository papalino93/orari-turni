import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { daysInMonth, toDateKey, todayKey } from "@/lib/week";
import { RevisioneView } from "./revisione-view";

export default async function RevisionePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; viewAs?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { viewAs } = await searchParams;
  const isEmployeeSession = session?.user?.role === "EMPLOYEE";

  // Stessa eccezione voluta di /mie-ore: titolare/consulente possono aprire
  // la revisione mensile di un dipendente in sola lettura con ?viewAs=<id>
  // — mai in scrittura, vedi la prop readOnly passata sotto.
  let targetEmployeeId: string | null = null;
  let preview = false;
  if (isEmployeeSession) {
    targetEmployeeId = session.user.employeeId ?? null;
  } else if (session?.user && viewAs) {
    targetEmployeeId = viewAs;
    preview = true;
  }
  if (!targetEmployeeId) redirect("/orari");

  const employee = await prisma.employee.findUnique({ where: { id: targetEmployeeId } });
  if (!employee) redirect(preview ? "/dipendenti" : "/login");

  const today = todayKey();
  const { year: yearParam, month: monthParam } = await searchParams;
  // Un ?year=/?month= mancante o non numerico (link malformato, parametro
  // modificato a mano) non deve produrre un NaN silenzioso: si torna al
  // mese corrente, come già fa parseDateKey delle Server Action per lo
  // stesso genere di input.
  const parsedYear = yearParam ? Number(yearParam) : NaN;
  const parsedMonth = monthParam ? Number(monthParam) : NaN;
  const validYear = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100;
  const validMonth = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12;
  const year = validYear ? parsedYear : Number(today.slice(0, 4));
  const month = validMonth ? parsedMonth : Number(today.slice(5, 7));
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
      readOnly={preview}
    />
  );
}
