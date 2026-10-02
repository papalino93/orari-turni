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
