"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/guard";
import { assert, runAction, type ActionResult } from "@/lib/validation";
import { todayKey } from "@/lib/week";

// Bozza → Inviato: il dipendente segnala "ho finito, controlla tu". Da qui
// in poi saveDayEntry (orari/actions.ts) rifiuta ulteriori modifiche finché
// il titolare non approva o rimanda indietro il mese — vedi dipendenti/actions.ts.
export async function submitMonth(year: number, month: number): Promise<ActionResult> {
  return runAction(async () => {
    const employee = await requireEmployee();
    assert(year >= 2020 && year <= 2100, "Anno non valido.");
    assert(month >= 1 && month <= 12, "Mese non valido.");

    // Non ha senso inviare un mese non ancora concluso: si rivedono ore
    // già lavorate, non si anticipano quelle future.
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const currentMonthKey = todayKey().slice(0, 7);
    assert(monthKey <= currentMonthKey, "Non puoi inviare un mese futuro.");

    const submission = await prisma.monthlySubmission.upsert({
      where: { employeeId_year_month: { employeeId: employee.id, year, month } },
      update: {},
      create: { employeeId: employee.id, year, month },
    });
    assert(
      submission.status === "DRAFT" || submission.status === "REOPENED",
      submission.status === "SUBMITTED" ? "Hai già inviato questo mese." : "Questo mese è già stato approvato.",
    );

    await prisma.monthlySubmission.update({
      where: { id: submission.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    revalidatePath("/mie-ore");
  });
}
