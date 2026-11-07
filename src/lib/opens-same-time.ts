import { prisma } from "@/lib/prisma";
import { romeParts } from "@/lib/menu-stats";

// Aperture del menù fino alla STESSA ORA E MINUTO di adesso, nei giorni indicati: «ieri a quest'ora»
// alle 20:05 conta ieri fino alle 20:05, non fino alle 20:59 (sennò oggi sembrerebbe sempre in calo).
// I minuti dell'ora italiana sono gli stessi di quelli UTC (il fuso è a ore intere).
export async function opensAtSameTime(days: string[], now: Date = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>(days.map((d) => [d, 0]));
  if (!days.length) return out;
  const { hour } = romeParts(now);
  const minute = now.getUTCMinutes();
  const [prima, questOra] = await Promise.all([
    prisma.menuEvent.groupBy({ by: ["day"], where: { kind: "open", day: { in: days }, hour: { lt: hour } }, _count: { _all: true } }),
    prisma.menuEvent.findMany({ where: { kind: "open", day: { in: days }, hour }, select: { day: true, at: true } }),
  ]);
  for (const r of prima) out.set(r.day, (out.get(r.day) ?? 0) + r._count._all);
  for (const r of questOra) if (r.at.getUTCMinutes() <= minute) out.set(r.day, (out.get(r.day) ?? 0) + 1);
  return out;
}
