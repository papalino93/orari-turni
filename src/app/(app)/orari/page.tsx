import { prisma } from "@/lib/prisma";
import {
  addDays,
  endOfMonth,
  endOfYear,
  isValidDateKey,
  monthLabel,
  parseDateKey,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toDateKey,
  todayKey,
} from "@/lib/week";
import { OrariView, type ViewMode } from "./orari-view";

export default async function OrariPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; employee?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const view = (["day", "week", "month", "year"].includes(params.view ?? "") ? params.view : "week") as ViewMode;
  // todayKey() e non toDateKey(new Date()): quest'ultima legge il giorno in
  // UTC, sbagliando la vista di default nella finestra tra mezzanotte UTC e
  // quella italiana (l'utente aprirebbe /orari e vedrebbe ancora ieri).
  // isValidDateKey scarta un `?date=` malformato (link troncato, vecchio
  // segnalibro) invece di far esplodere parseDateKey più sotto.
  const refDate = params.date && isValidDateKey(params.date) ? parseDateKey(params.date) : parseDateKey(todayKey());
  const employeeFilter = params.employee || undefined;
  const displayMode = params.mode === "employees" ? "employees" : "periods";

  const rangeStart =
    view === "day"
      ? refDate
      : view === "week"
        ? startOfWeek(refDate)
        : view === "month"
          ? startOfMonth(refDate)
          : startOfYear(refDate);
  const rangeEnd =
    view === "day"
      ? refDate
      : view === "week"
        ? addDays(startOfWeek(refDate), 6)
        : view === "month"
          ? endOfMonth(refDate)
          : endOfYear(refDate);

  const weekStart = view === "week" ? startOfWeek(refDate) : null;

  // leaveEntries va sempre interrogato, anche per Mese/Anno: schedule.ts
  // dichiara esplicitamente "una sola fonte dati, nessuna vista ricalcola
  // nulla per conto suo" — saltarlo per Mese/Anno (come prima, quando
  // "serviva" solo a Giorno/Settimana) faceva sì che schedule.entry() e le
  // anomalie mentissero in silenzio su ferie/permessi/malattia per quelle
  // due viste, viste come "non pianificato". L'intervallo più ampio (fino a
  // un anno) resta comunque poco costoso per il volume di dati di un
  // singolo negozio.
  const [blocks, leaveEntries, closures, weekPlan] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    weekStart ? prisma.weekPlan.findUnique({ where: { weekStart } }) : Promise.resolve(null),
  ]);

  // Oltre agli attivi, includiamo chi è stato disattivato ma ha comunque
  // turni/assenze registrati nel periodo mostrato: altrimenti un dipendente
  // uscito sparisce, con le sue ore, anche dai periodi passati in cui ha
  // davvero lavorato (verifiche retrospettive, controlli su buste paga).
  const employeeIdsWithData = Array.from(
    new Set([...blocks.map((b) => b.employeeId), ...leaveEntries.map((l) => l.employeeId)]),
  );

  const employees = await prisma.employee.findMany({
    // Il «Telefono enoteca» non è una persona: mai negli orari (né in copertura e PDF).
    where: { isVenueDevice: false, ...(employeeIdsWithData.length > 0 ? { OR: [{ active: true }, { id: { in: employeeIdsWithData } }] } : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // «Svuota settimana» su una settimana già passata, o con ore che i
  // dipendenti hanno già inviato o che sono state approvate: la conferma lo
  // dice chiaro, invece di un generico «Azione irreversibile».
  const clearWeekWarnings: string[] = [];
  if (weekStart) {
    const today = todayKey();
    const weekStartKey = toDateKey(weekStart);
    const weekEndKey = toDateKey(addDays(weekStart, 6));
    if (weekEndKey < today) clearWeekWarnings.push("Questa settimana è già passata: si cancellano ore già lavorate.");
    else if (weekStartKey < today) clearWeekWarnings.push("Questa settimana è in corso: si cancellano anche i giorni già passati.");
    const months = Array.from(new Set([weekStartKey.slice(0, 7), weekEndKey.slice(0, 7)])).map((k) => ({
      year: Number(k.slice(0, 4)),
      month: Number(k.slice(5, 7)),
    }));
    const sent = await prisma.monthlySubmission.findMany({
      where: { status: { in: ["SUBMITTED", "APPROVED"] }, OR: months },
      include: { employee: { select: { name: true } } },
    });
    if (sent.length > 0) {
      const list = sent
        .map((s) => `${s.employee.name} (${monthLabel(s.month - 1).toLowerCase()}, ${s.status === "APPROVED" ? "approvate" : "inviate"})`)
        .join(", ");
      clearWeekWarnings.push(`Contiene ore già inviate o approvate: ${list}. Svuotandola cambiano anche quelle.`);
    }
  }

  return (
    <OrariView
      view={view}
      displayMode={displayMode}
      dateKey={toDateKey(refDate)}
      rangeStartKey={toDateKey(rangeStart)}
      rangeEndKey={toDateKey(rangeEnd)}
      employeeFilter={employeeFilter}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        jobTitle: e.jobTitle,
        sortOrder: e.sortOrder,
        photoVersion: e.photoUpdatedAt ? String(e.photoUpdatedAt.getTime()) : null,
      }))}
      activeEmployeeIds={employees.filter((e) => e.active).map((e) => e.id)}
      blocks={blocks.map((b) => ({
        id: b.id,
        employeeId: b.employeeId,
        dateKey: toDateKey(b.date),
        startTime: b.startTime,
        endTime: b.endTime,
        confirmed: b.confirmed,
        addedByEmployee: b.addedByEmployee,
        originalStartTime: b.originalStartTime,
        originalEndTime: b.originalEndTime,
      }))}
      leaveEntries={leaveEntries.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        dateKey: toDateKey(l.date),
        type: l.type,
        quantity: l.quantity,
        addedByEmployee: l.addedByEmployee,
      }))}
      closures={closures.map((c) => ({ dateKey: toDateKey(c.date), reason: c.reason }))}
      weekPlan={
        weekPlan
          ? { publishedAt: weekPlan.publishedAt ? weekPlan.publishedAt.toISOString() : null, changedAfterConfirm: Boolean(weekPlan.changedAfterConfirmAt) }
          : { publishedAt: null, changedAfterConfirm: false }
      }
      clearWeekWarnings={clearWeekWarnings}
    />
  );
}
