"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { LeaveType } from "@prisma/client";

export async function setLeaveBalance(
  employeeId: string,
  leaveType: LeaveType,
  year: number,
  openingBalance: number,
  monthlyAccrualRate: number,
  sourceNote?: string,
) {
  await prisma.leaveBalance.upsert({
    where: { employeeId_leaveType_year: { employeeId, leaveType, year } },
    update: { openingBalance, monthlyAccrualRate, sourceNote },
    create: { employeeId, leaveType, year, openingBalance, monthlyAccrualRate, sourceNote },
  });
  revalidatePath("/ferie");
}
