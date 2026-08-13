import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays, parseDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/week";
import { MieOreView } from "./mie-ore-view";

export default async function MieOrePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // Il Proxy tiene già fuori un login titolare/consulente da questa pagina
  // nella navigazione normale — questo controllo resta comunque necessario:
  // è l'unica cosa che impedisce a un URL digitato a mano, o a una sessione
  // scaduta a metà, di leggere dati che non le competono.
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "EMPLOYEE" || !session.user.employeeId) redirect("/orari");

  const employee = await prisma.employee.findUnique({ where: { id: session.user.employeeId } });
  if (!employee) redirect("/login");

  const { date } = await searchParams;
  // todayKey() e non new Date(): coerente con lo stesso motivo spiegato in
  // /orari — evita di sbagliare settimana nella finestra fra la mezzanotte
  // UTC e quella italiana.
  const anchor = date ? parseDateKey(date) : parseDateKey(todayKey());
  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 6);
  const dateKeys = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i)));

  // L'ultimo mese concluso è quello che più probabilmente serve rivedere
  // "a fine mese" — vedi il promemoria mostrato qui sotto se non è ancora
  // stato inviato.
  const now = parseDateKey(todayKey());
  const lastCompletedMonth = { year: now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(), month: now.getUTCMonth() === 0 ? 12 : now.getUTCMonth() };

  const [blocks, leaveEntries, closures, lastMonthSubmission] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { employeeId: employee.id, date: { gte: weekStart, lte: weekEnd } } }),
    prisma.leaveEntry.findMany({ where: { employeeId: employee.id, date: { gte: weekStart, lte: weekEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.monthlySubmission.findUnique({
      where: { employeeId_year_month: { employeeId: employee.id, ...lastCompletedMonth } },
    }),
  ]);

  return (
    <MieOreView
      employee={{
        id: employee.id,
        name: employee.name,
        jobTitle: employee.jobTitle,
        photoVersion: employee.photoUpdatedAt ? String(employee.photoUpdatedAt.getTime()) : null,
      }}
      deactivatedAtKey={employee.deactivatedAt ? toDateKey(employee.deactivatedAt) : null}
      lastCompletedMonth={lastCompletedMonth}
      lastMonthStatus={lastMonthSubmission?.status ?? null}
      weekStartKey={toDateKey(weekStart)}
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
    />
  );
}
