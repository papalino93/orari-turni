"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { LeaveType, Prisma } from "@prisma/client";

export type DayBlockInput = { startTime: string; endTime: string };
export type DayLeaveInput = { type: LeaveType; quantity: number } | null;

// Sostituisce lo stato dell'intera giornata per un dipendente: o una lista
// di blocchi orario di lavoro, oppure un'unica voce di ferie/permesso
// (le due cose sono alternative nello stesso giorno).
export async function saveDayEntry(
  employeeId: string,
  dateKey: string,
  blocks: DayBlockInput[],
  leave: DayLeaveInput,
) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.shiftBlock.deleteMany({ where: { employeeId, date } }),
    prisma.leaveEntry.deleteMany({ where: { employeeId, date } }),
  ];

  if (leave) {
    ops.push(
      prisma.leaveEntry.create({
        data: { employeeId, date, type: leave.type, quantity: leave.quantity },
      }),
    );
  } else {
    for (const b of blocks.filter((b) => b.startTime && b.endTime)) {
      ops.push(
        prisma.shiftBlock.create({
          data: { employeeId, date, startTime: b.startTime, endTime: b.endTime },
        }),
      );
    }
  }

  await prisma.$transaction(ops);

  revalidatePath("/orari");
  revalidatePath("/ferie");
}

export async function setDayThreshold(dateKey: string, minStaff: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  const existing = await prisma.coverageThreshold.findFirst({ where: { specificDate: date } });
  if (existing) {
    await prisma.coverageThreshold.update({ where: { id: existing.id }, data: { minStaff } });
  } else {
    await prisma.coverageThreshold.create({ data: { specificDate: date, minStaff } });
  }
  revalidatePath("/orari");
}

export async function setWeekdayDefaultThreshold(dayOfWeek: number, minStaff: number) {
  const existing = await prisma.coverageThreshold.findFirst({
    where: { dayOfWeek, specificDate: null },
  });
  if (existing) {
    await prisma.coverageThreshold.update({ where: { id: existing.id }, data: { minStaff } });
  } else {
    await prisma.coverageThreshold.create({ data: { dayOfWeek, minStaff } });
  }
  revalidatePath("/orari");
}
