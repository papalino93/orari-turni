"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { loadStatsSetting } from "@/lib/menu";
import { romeParts } from "@/lib/menu-stats";
import { runAction, type ActionResult } from "@/lib/validation";

// «Inizia a contare»: solo titolare e consulente (requireUser rifiuta i dipendenti).
// Il giorno di partenza resta quello della prima accensione.
export async function setStatsEnabled(enabled: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const current = await loadStatsSetting();
    const next = { enabled: Boolean(enabled), since: current.since ?? (enabled ? romeParts().day : null) };
    await prisma.menuSetting.upsert({ where: { id: "stats" }, create: { id: "stats", value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
    revalidatePath("/statistiche");
  });
}

// «Togli aperture di prova»: le aperture del menù di oggi e di ieri, una per una con l'ora,
// per togliere quelle fatte per prova (dal personale, nei test). Solo titolare e consulente.
export type RecentOpen = { id: string; day: string; time: string };

const romeTime = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

function yesterdayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function listRecentOpens(): Promise<ActionResult<RecentOpen[]>> {
  return runAction(async () => {
    await requireUser();
    const today = romeParts().day;
    const rows = await prisma.menuEvent.findMany({
      where: { kind: "open", day: { in: [today, yesterdayOf(today)] } },
      select: { id: true, day: true, at: true },
      orderBy: { at: "desc" },
      take: 400,
    });
    return rows.map((r) => ({ id: r.id, day: r.day, time: romeTime.format(r.at) }));
  });
}

export async function removeOpens(ids: string[]): Promise<ActionResult<number>> {
  return runAction(async () => {
    await requireUser();
    const list = Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, 400) : [];
    if (!list.length) return 0;
    const today = romeParts().day;
    // Solo aperture, e solo di oggi e di ieri: nient'altro si può togliere da qui.
    const res = await prisma.menuEvent.deleteMany({ where: { id: { in: list }, kind: "open", day: { in: [today, yesterdayOf(today)] } } });
    revalidatePath("/statistiche");
    return res.count;
  });
}
