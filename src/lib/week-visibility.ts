import { prisma } from "@/lib/prisma";
import { parseDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/week";

// Cosa vede un dipendente dei propri turni: sempre il passato e la settimana in
// corso; le settimane successive solo dopo «Conferma orari della settimana»
// (WeekPlan.publishedAt). Restituisce il filtro per data da applicare a turni e assenze.
export async function employeeVisibleDates(): Promise<(date: Date) => boolean> {
  const currentWeekKey = toDateKey(startOfWeek(parseDateKey(todayKey())));
  const published = await prisma.weekPlan.findMany({ where: { publishedAt: { not: null } }, select: { weekStart: true } });
  const confirmed = new Set(published.map((w) => toDateKey(w.weekStart)));
  return (date) => {
    const week = toDateKey(startOfWeek(date));
    return week <= currentWeekKey || confirmed.has(week);
  };
}
