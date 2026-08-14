"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireUser, requireSelfOrAdmin } from "@/lib/guard";
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

// "Pubblicato" significa "questo è l'orario che ho comunicato al personale":
// una fotografia di un momento preciso, non uno stato che si aggiorna da
// solo. Se dopo la pubblicazione si tocca un turno, si chiude/riapre una
// giornata o si svuota la settimana, quello che è stato comunicato non
// corrisponde più a quello che si vede — quindi la settimana torna
// automaticamente in bozza. Senza questo, il badge "Pubblicato" può restare
// acceso su una settimana svuotata o modificata, mentendo su cosa sa
// davvero il personale.
async function unpublishWeeksForDates(dates: Date[]) {
  const weekStartKeys = new Set(dates.map((d) => toDateKey(startOfWeek(d))));
  await Promise.all(
    Array.from(weekStartKeys).map((key) =>
      prisma.weekPlan.updateMany({
        where: { weekStart: dateKeyToDate(key), publishedAt: { not: null } },
        data: { publishedAt: null, publishedBy: null },
      }),
    ),
  );
}

// Sostituisce lo stato dell'intera giornata per un dipendente: o una lista di
// blocchi orario, oppure un'unica voce di assenza (ferie, permesso, malattia,
// riposo). Le due cose sono alternative nello stesso giorno.
//
// Usata sia dal titolare (Orari, senza limiti) sia da un dipendente che
// rivede le proprie ore (Area Dipendenti — solo sui propri giorni passati,
// e solo finché il mese non è stato inviato per l'approvazione). Il ramo
// dipendente in più registra cosa è cambiato rispetto a quanto pianificato,
// confrontando mattina/pomeriggio uno a uno con quello che c'era prima:
// stessi due riquadri che il dipendente vede nell'editor, non ID di riga da
// far corrispondere (i blocchi vengono comunque ricreati da zero ad ogni
// salvataggio, non aggiornati in place).
export async function saveDayEntry(
  employeeIdInput: string,
  dateKeyInput: string,
  blocksInput: DayBlockInput[],
  leaveInput: DayLeaveInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const employeeId = parseId(employeeIdInput, "dipendente");
    const auth = await requireSelfOrAdmin(employeeId);

    const dateKey = parseDateKey(dateKeyInput);
    const date = dateKeyToDate(dateKey);

    const [employee, closure, existingBlocks, existingLeave] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId } }),
      prisma.closureDay.findUnique({ where: { date } }),
      prisma.shiftBlock.findMany({ where: { employeeId, date } }),
      prisma.leaveEntry.findUnique({ where: { employeeId_date: { employeeId, date } } }),
    ]);
    assert(employee, "Dipendente non trovato.");
    assert(employee.active, "Il dipendente è disattivato: riattivalo per modificarne gli orari.");
    assert(!closure, "La giornata è impostata come chiusa: riapri il locale per pianificare i turni.");

    // Un dipendente rivede solo giorni già passati (non ha senso registrare
    // ore per un giorno non ancora accaduto), e solo finché non ha inviato
    // quel mese per l'approvazione — creando il mese in bozza al primo
    // tocco, se non esisteva ancora.
    if (auth.role === "EMPLOYEE") {
      assert(dateKey <= todayKey(), "Non puoi registrare ore per un giorno futuro.");
      const [year, month] = dateKey.split("-").map(Number);
      const submission = await prisma.monthlySubmission.upsert({
        where: { employeeId_year_month: { employeeId, year, month } },
        update: {},
        create: { employeeId, year, month },
      });
      assert(
        submission.status === "DRAFT" || submission.status === "REOPENED",
        "Questo mese è già stato inviato al titolare: non è più modificabile.",
      );

      // Ferie, permessi e malattia incidono sui saldi e li registra il
      // titolare. Senza questi due controlli il dipendente poteva sia
      // assegnarsi ore di permesso, sia cancellare un'assenza già registrata
      // dal titolare salvando un normale turno sullo stesso giorno.
      if (leaveInput) {
        assert(
          leaveInput.type === "LIBERO",
          "Ferie, permessi e malattia li registra il titolare: segnala a lui la correzione.",
        );
      }
      if (existingLeave && existingLeave.type !== "LIBERO") {
        assert(
          false,
          "Su questo giorno il titolare ha registrato un'assenza: solo lui può modificarla.",
        );
      }
    }

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

    // "Mattina"/"pomeriggio" allo stesso confine delle 13:00 usato
    // dall'editor (vedi MATTINA_MAX/POMERIGGIO_MIN in orari/shared.tsx): è
    // il modo in cui il dipendente vede e corregge i due turni, quindi è
    // anche il modo giusto per confrontare "cosa c'era prima".
    const oldMorning = existingBlocks.find((b) => b.startTime < "13:00");
    const oldAfternoon = existingBlocks.find((b) => b.startTime >= "13:00");

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.shiftBlock.deleteMany({ where: { employeeId, date } }),
      prisma.leaveEntry.deleteMany({ where: { employeeId, date } }),
    ];
    if (leave) {
      ops.push(prisma.leaveEntry.create({ data: { employeeId, date, type: leave.type, quantity: leave.quantity } }));
    } else {
      for (const b of blocks) {
        let audit: { addedByEmployee?: boolean; originalStartTime?: string; originalEndTime?: string; editedByEmployeeAt?: Date } = {};
        if (auth.role === "EMPLOYEE") {
          const old = b.startTime < "13:00" ? oldMorning : oldAfternoon;
          if (!old || old.addedByEmployee) {
            // Nessun turno pianificato dal titolare in questa fascia — o non
            // c'era, o è già un blocco aggiunto dal dipendente in una
            // revisione precedente: in entrambi i casi non c'è nessun
            // "originale" del titolare da registrare.
            audit = { addedByEmployee: true, editedByEmployeeAt: new Date() };
          } else {
            // Se questo blocco è già stato corretto in un salvataggio
            // precedente, il vero orario pianificato dal titolare è quello
            // già registrato in originalStartTime/originalEndTime — non
            // old.startTime/endTime, che a questo punto è già la correzione
            // precedente del dipendente. Confrontarsi con quest'ultima
            // perderebbe il pianificato vero ad ogni modifica successiva.
            const trueOriginalStart = old.originalStartTime ?? old.startTime;
            const trueOriginalEnd = old.originalEndTime ?? old.endTime;
            audit =
              trueOriginalStart !== b.startTime || trueOriginalEnd !== b.endTime
                ? { originalStartTime: trueOriginalStart, originalEndTime: trueOriginalEnd, editedByEmployeeAt: new Date() }
                : {};
          }
        }
        ops.push(
          prisma.shiftBlock.create({
            data: { employeeId, date, startTime: b.startTime, endTime: b.endTime, ...audit },
          }),
        );
      }
    }
    await prisma.$transaction(ops);

    // La correzione a posteriori di un dipendente non tocca cosa il
    // titolare ha comunicato come pianificazione — solo lui che ripianifica
    // deve far tornare "non condivisa" la settimana.
    if (auth.role !== "EMPLOYEE") await unpublishWeeksForDates([date]);

    revalidateSchedule();
    revalidatePath("/mie-ore");
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
    // Svuotare una settimana pubblicata la riporta in bozza: quello che è
    // stato comunicato al personale non esiste più.
    await unpublishWeeksForDates([start]);

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
      ...(options.removeShifts ? [prisma.shiftBlock.deleteMany({ where: { date } })] : []),
    ]);
    await unpublishWeeksForDates([date]);

    revalidateSchedule();
    return {
      removedShifts: options.removeShifts ? existingShifts : 0,
      suspendedShifts: options.removeShifts ? 0 : existingShifts,
    };
  });
}

// Come closeDay, ma per un intervallo di più giorni consecutivi in un colpo
// solo — ferie del locale, ristrutturazione: prima andava chiusa una
// giornata alla volta, ripetendo lo stesso gesto per ognuna.
export async function closeDateRange(
  fromKeyInput: string,
  toKeyInput: string,
  options: { removeShifts?: boolean; reason?: string } = {},
): Promise<ActionResult<{ days: number; removedShifts: number; suspendedShifts: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const fromKey = parseDateKey(fromKeyInput, "data di inizio");
    const toKey = parseDateKey(toKeyInput, "data di fine");
    assert(fromKey <= toKey, "La data di inizio deve precedere quella di fine.");
    const reason = parseText(options.reason, "motivo", { max: 80 });

    const dateKeys: string[] = [];
    for (let cursor = toDate(fromKey); toDateKey(cursor) <= toKey; cursor = addDays(cursor, 1)) {
      dateKeys.push(toDateKey(cursor));
    }
    assert(dateKeys.length <= 60, "Puoi chiudere al massimo 60 giorni per volta.");
    const dates = dateKeys.map(dateKeyToDate);

    const existingShifts = await prisma.shiftBlock.count({ where: { date: { in: dates } } });

    await prisma.$transaction([
      ...dates.map((date) =>
        prisma.closureDay.upsert({
          where: { date },
          update: { reason: reason || null },
          create: { date, reason: reason || null, createdBy: user.username },
        }),
      ),
      ...(options.removeShifts ? [prisma.shiftBlock.deleteMany({ where: { date: { in: dates } } })] : []),
    ]);
    await unpublishWeeksForDates(dates);

    revalidateSchedule();
    return {
      days: dateKeys.length,
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
    await unpublishWeeksForDates([date]);

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
