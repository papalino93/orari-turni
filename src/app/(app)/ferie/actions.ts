"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { assert, parseEnum, parseId, parseNumber, parseText, runAction, type ActionResult } from "@/lib/validation";

const LEAVE_BALANCE_TYPES = ["FERIE", "PERMESSO"] as const;

export async function setLeaveBalance(
  employeeIdInput: string,
  leaveTypeInput: string,
  yearInput: number,
  openingBalanceInput: number,
  monthlyAccrualRateInput: number,
  sourceNoteInput?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();

    const employeeId = parseId(employeeIdInput, "dipendente");
    const leaveType = parseEnum(leaveTypeInput, LEAVE_BALANCE_TYPES, "tipo");
    const year = parseNumber(yearInput, "anno", { min: 2000, max: 2100 });
    const openingBalance = parseNumber(openingBalanceInput, "saldo di partenza", { min: -365, max: 365 });
    const monthlyAccrualRate = parseNumber(monthlyAccrualRateInput, "maturazione mensile", { min: 0, max: 100 });
    const sourceNote = parseText(sourceNoteInput, "nota", { max: 120 });

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    assert(employee, "Dipendente non trovato.");
    assert(employee.role !== "OWNER", "Il titolare non rientra nella gestione di ferie e permessi.");

    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveType_year: { employeeId, leaveType, year } },
      update: { openingBalance, monthlyAccrualRate, sourceNote: sourceNote || null },
      create: { employeeId, leaveType, year, openingBalance, monthlyAccrualRate, sourceNote: sourceNote || null },
    });
    revalidatePath("/ferie");
  });
}
