"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { loadFeatures } from "@/lib/app-features";
import { runAction, type ActionResult } from "@/lib/validation";

// L'app è stata aperta dall'icona sulla Home: si ricorda per questa persona, così
// l'invito a installarla sparisce anche quando apre il sito dal browser.
export async function markAppInstalled(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user) return;
    if (session.user.role === "EMPLOYEE" && session.user.employeeId) {
      await prisma.employee.updateMany({ where: { id: session.user.employeeId, appInstalledAt: null }, data: { appInstalledAt: new Date() } });
    } else if (session.user.username) {
      await prisma.user.updateMany({ where: { username: session.user.username, appInstalledAt: null }, data: { appInstalledAt: new Date() } });
    }
  });
}

// Account → «Mostra Mail nel menu».
export async function setMailVisible(visible: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const next = { ...(await loadFeatures()), mail: Boolean(visible) };
    const value = JSON.stringify(next);
    await prisma.menuSetting.upsert({ where: { id: "features" }, create: { id: "features", value }, update: { value } });
    revalidatePath("/", "layout");
  });
}
