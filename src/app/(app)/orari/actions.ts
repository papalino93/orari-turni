"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/guard";
import {
  assert,
  dateKeyToDate,
  parseDateKey,
  parseEnum,
  parseId,
  parseNumber,
  parseText,
  parseTime,
  runAction,
  ValidationError,
  type ActionResult,
} from "@/lib/validation";
import { addDays, parseDateKey as toDate, startOfWeek, timeToMinutes, toDateKey, todayKey } from "@/lib/week";
import type { LeaveType } from "@/lib/schedule";

export type DayBlockInput = { startTime: string; endTime: string };
export type DayLeaveInput = { type: LeaveType; quantity: number } | null;

const LEAVE_TYPES = ["FERIE", "PERMESSO", "LIBERO", "MALATTIA"] as const;

function revalidateSchedule() {
  revalidatePath("/orari");
  revalidatePath("/ferie");
  revalidatePath("/dipendenti");
}

// Sostituisce lo stato dell'intera giornata per un dipendente: o una lista di
// blocchi orario, oppure un'unica voce di assenza (ferie, permesso, malattia,
// riposo). Le due cose sono alternative nello stesso giorno.
export async function saveDayEntry(
  employeeIdInput: string,
  dateKeyInput: string,
  blocksInput: DayBlockInput[],
  leaveInput: DayLeaveInput,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();

    const employeeId = parseId(employeeIdInput, "dipendente");
    const dateKey = parseDateKey(dateKeyInput);
    const date = dateKeyToDate(dateKey);

    const [employee, closure] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId } }),
      prisma.closureDay.findUnique({ where: { date } }),
    ]);
    assert(employee, "Dipendente non trovato.");
    assert(employee.active, "Il dipendente è disattivato: riattivalo per modificarne gli orari.");
    assert(!closure, "La giornata è impostata come chiusa: riapri il locale per pianificare i turni.");

    const leave = leaveInput
      ? {
          type: parseEnum(leaveInput.type, LEAVE_TYPES, "tipo assenza"),
          quantity: parseNumber(leaveInput.quantity, "quantità", { min: 0, max: 24 }),
        }
      : null;

    if (leave && (leave.type === "FERIE" || leave.type === "PERMESSO")) {
      assert(
        employee.role !== "OWNER",
        "Il titolare non rientra nella gestione di ferie e permessi.",
      );
      assert(leave.quantity > 0, "Indica una quantità maggiore di zero.");
      if (leave.type === "FERIE") {
        assert(leave.quantity <= 1, "Le ferie si contano in giorni: al massimo 1 per giornata.");
      }
    }

    const blocks = leave
      ? []
      : blocksInput.slice(0, 4).map((b) => {
          const startTime = parseTime(b.startTime, "orario di inizio");
          const endTime = parseTime(b.endTime, "orario di fine");
          assert(
            timeToMinutes(endTime) > timeToMinutes(startTime),
            "L'orario di fine deve essere successivo a quello di inizio.",
          );
          return { startTime, endTime };
        });

    // Confronta con la fine più tardiva vista finora, non solo con il blocco
    // immediatamente precedente: con più di due blocchi un confronto a
    // coppie consecutive perderebbe una sovrapposizione con un blocco più
    // indietro nell'elenco ordinato.
    const sorted = blocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
    let maxEndSoFar = sorted.length > 0 ? timeToMinutes(sorted[0].endTime) : 0;
    for (let i = 1; i < sorted.length; i++) {
      assert(timeToMinutes(sorted[i].startTime) >= maxEndSoFar, "I due turni della giornata si sovrappongono.");
      maxEndSoFar = Math.max(maxEndSoFar, timeToMinutes(sorted[i].endTime));
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.shiftBlock.deleteMany({ where: { employeeId, date } }),
      prisma.leaveEntry.deleteMany({ where: { employeeId, date } }),
    ];
    if (leave) {
      ops.push(prisma.leaveEntry.create({ data: { employeeId, date, type: leave.type, quantity: leave.quantity } }));
    } else {
      for (const b of blocks) {
        ops.push(prisma.shiftBlock.create({ data: { employeeId, date, startTime: b.startTime, endTime: b.endTime } }));
      }
    }
    await prisma.$transaction(ops);

    revalidateSchedule();
  });
}

// Marca come verificati — cioè: il titolare ha controllato che l'orario
// pianificato corrisponda a quello davvero lavorato — i turni passati
// dell'intervallo. È cosa diversa dalla pubblicazione dell'orario.
export async function confirmPastShifts(
  rangeStartKeyInput: string,
  rangeEndKeyInput: string,
  employeeIdInput?: string,
): Promise<ActionResult<{ verified: number }>> {
  return runAction(async () => {
    await requireUser();

    const rangeStartKey = parseDateKey(rangeStartKeyInput, "inizio periodo");
    const rangeEndKey = parseDateKey(rangeEndKeyInput, "fine periodo");
    const employeeId = employeeIdInput ? parseId(employeeIdInput, "dipendente") : undefined;

    // Si verificano solo giornate concluse: il turno di oggi è ancora in
    // corso e non si può dire che sia stato lavorato come previsto.
    const lastVerifiable = toDateKey(addDays(toDate(todayKey()), -1));
    const endKey = rangeEndKey < lastVerifiable ? rangeEndKey : lastVerifiable;
    if (rangeStartKey > endKey) return { verified: 0 };

    const start = dateKeyToDate(rangeStartKey);
    const end = dateKeyToDate(endKey);

    // Un turno rimasto sotto una giornata chiusa non è stato lavorato:
    // verificarlo darebbe per buone ore che non esistono.
    const closures = await prisma.closureDay.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true },
    });
    const closedDates = closures.map((c) => c.date);

    const { count } = await prisma.shiftBlock.updateMany({
      where: {
        date: { gte: start, lte: end, ...(closedDates.length ? { notIn: closedDates } : {}) },
        confirmed: false,
        ...(employeeId ? { employeeId } : {}),
      },
      data: { confirmed: true },
    });

    revalidatePath("/orari");
    return { verified: count };
  });
}

// Elimina turni e assenze della settimana indicata, per tutti i dipendenti.
// Azione distruttiva: va sempre confermata lato UI prima di essere chiamata.
export async function clearWeekData(weekStartKeyInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const weekStartKey = parseDateKey(weekStartKeyInput, "settimana");
    const start = dateKeyToDate(weekStartKey);
    const end = dateKeyToDate(toDateKey(addDays(toDate(weekStartKey), 6)));

    await prisma.$transaction([
      prisma.shiftBlock.deleteMany({ where: { date: { gte: start, lte: end } } }),
      prisma.leaveEntry.deleteMany({ where: { date: { gte: start, lte: end } } }),
    ]);

    revalidateSchedule();
  });
}

// --- Giornate di chiusura del locale ---------------------------------------

// Chiude il locale per una singola data. I turni già presenti non vengono
// mai persi in silenzio: o restano salvati e sospesi (e tornano validi alla
// riapertura), o vengono rimossi su richiesta esplicita.
export async function closeDay(
  dateKeyInput: string,
  options: { removeShifts?: boolean; reason?: string } = {},
): Promise<ActionResult<{ removedShifts: number; suspendedShifts: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const dateKey = parseDateKey(dateKeyInput);
    const date = dateKeyToDate(dateKey);
    const reason = parseText(options.reason, "motivo", { max: 80 });

    const existingShifts = await prisma.shiftBlock.count({ where: { date } });

    await prisma.$transaction([
      prisma.closureDay.upsert({
        where: { date },
        update: { reason: reason || null },
        create: { date, reason: reason || null, createdBy: user.username },
      }),
      // Il riposo esplicito su una giornata chiusa non ha senso: il locale
      // non apre, non c'è nessun turno da cui riposare.
      prisma.leaveEntry.deleteMany({ where: { date, type: "LIBERO" } }),
      ...(options.removeShifts ? [prisma.shiftBlock.deleteMany({ where: { date } })] : []),
    ]);

    revalidateSchedule();
    return {
      removedShifts: options.removeShifts ? existingShifts : 0,
      suspendedShifts: options.removeShifts ? 0 : existingShifts,
    };
  });
}

// Riapre una giornata: i turni conservati durante la chiusura tornano validi.
export async function reopenDay(dateKeyInput: string): Promise<ActionResult<{ restoredShifts: number }>> {
  return runAction(async () => {
    await requireUser();
    const dateKey = parseDateKey(dateKeyInput);
    const date = dateKeyToDate(dateKey);

    const closure = await prisma.closureDay.findUnique({ where: { date } });
    assert(closure, "Questa giornata non risulta chiusa.");

    const restoredShifts = await prisma.shiftBlock.count({ where: { date } });
    await prisma.closureDay.delete({ where: { date } });

    revalidateSchedule();
    return { restoredShifts };
  });
}

// --- Pubblicazione dell'orario settimanale ---------------------------------

// Bozza → pubblicato: l'orario è stato comunicato al personale. Non ha nulla
// a che vedere con la verifica delle ore già lavorate.
export async function setWeekPublished(
  weekStartKeyInput: string,
  published: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const weekStartKey = parseDateKey(weekStartKeyInput, "settimana");

    const weekStart = startOfWeek(toDate(weekStartKey));
    if (toDateKey(weekStart) !== weekStartKey) {
      throw new ValidationError("La settimana deve iniziare di lunedì.");
    }

    await prisma.weekPlan.upsert({
      where: { weekStart: dateKeyToDate(weekStartKey) },
      update: {
        publishedAt: published ? new Date() : null,
        publishedBy: published ? user.username : null,
      },
      create: {
        weekStart: dateKeyToDate(weekStartKey),
        publishedAt: published ? new Date() : null,
        publishedBy: published ? user.username : null,
      },
    });

    revalidatePath("/orari");
  });
}
