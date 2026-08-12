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

// Marca come confermati (verificati dal titolare) tutti i turni fino a
// oggi escluso, entro l'intervallo dato — opzionalmente per un solo
// dipendente. Usato dopo aver rivisto gli orari effettivamente lavorati.
export async function confirmPastShifts(rangeStartKey: string, rangeEndKey: string, employeeId?: string) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const endKey = rangeEndKey < todayKey ? rangeEndKey : todayKey;
  if (rangeStartKey > endKey) return;

  await prisma.shiftBlock.updateMany({
    where: {
      date: { gte: new Date(`${rangeStartKey}T00:00:00.000Z`), lte: new Date(`${endKey}T00:00:00.000Z`) },
      confirmed: false,
      ...(employeeId ? { employeeId } : {}),
    },
    data: { confirmed: true },
  });
  revalidatePath("/orari");
}
