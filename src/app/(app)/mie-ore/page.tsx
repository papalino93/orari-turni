import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  dayLabel,
  endOfMonth,
  isValidDateKey,
  lastCompletedMonth,
  parseDateKey,
  shiftEndMinutes,
  startOfWeek,
  timeToMinutes,
  toDateKey,
  todayKey,
} from "@/lib/week";
import { buildSchedule } from "@/lib/schedule";
import { employeeVisibleDates } from "@/lib/week-visibility";
import { MieOreView, type NextShift } from "./mie-ore-view";
import { employeeCanEditMonth } from "./editable-month";

export default async function MieOrePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; viewAs?: string }>;
}) {
  // Il Proxy tiene già fuori un login titolare/consulente da questa pagina
  // nella navigazione normale — questo controllo resta comunque necessario:
  // è l'unica cosa che impedisce a un URL digitato a mano, o a una sessione
  // scaduta a metà, di leggere dati che non le competono.
  //
  // Eccezione voluta: titolare/consulente possono aprire questa pagina in
  // sola lettura con ?viewAs=<id> per vedere esattamente cosa vede quel
  // dipendente ("Visualizza come", dal riquadro Dipendenti) — senza dover
  // conoscere la sua password. Resta comunque una sessione ADMIN: nessun
  // cambio di token, nessuna azione di scrittura è raggiungibile da qui.
  const session = await getServerSession(authOptions);
  const { date, viewAs } = await searchParams;
  const isEmployeeSession = session?.user?.role === "EMPLOYEE";

  let targetEmployeeId: string | null = null;
  let preview = false;
  if (isEmployeeSession) {
    targetEmployeeId = session.user.employeeId ?? null;
  } else if (session?.user && viewAs) {
    targetEmployeeId = viewAs;
    preview = true;
  }
  // "/orari" solo se davvero c'è una sessione admin (senza ?viewAs): senza
  // sessione — anche una revocata da un cambio password altrove, che il
  // Proxy da solo non può ancora sapere (vedi lib/auth.ts) — si va a
  // "/login". Altrimenti un dipendente con la sessione appena revocata
  // finirebbe in un rimbalzo infinito: il Proxy lo rimanda ancora qui
  // pensando sia un EMPLOYEE (legge il JWT grezzo, non rivede la revoca),
  // e questa pagina lo rimanderebbe di nuovo a "/orari", che il Proxy
  // rispedisce di nuovo a "/mie-ore".
  if (!targetEmployeeId) redirect(session?.user ? "/orari" : "/login");

  const employee = await prisma.employee.findUnique({ where: { id: targetEmployeeId } });
  if (!employee) redirect(preview ? "/dipendenti" : "/login");
  // todayKey() e non new Date(): coerente con lo stesso motivo spiegato in
  // /orari — evita di sbagliare settimana nella finestra fra la mezzanotte
  // UTC e quella italiana. isValidDateKey scarta un `?date=` malformato
  // invece di far esplodere parseDateKey più sotto.
  const anchor = date && isValidDateKey(date) ? parseDateKey(date) : parseDateKey(todayKey());
  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 6);
  const dateKeys = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i)));

  // L'ultimo mese concluso è quello che più probabilmente serve rivedere
  // "a fine mese" — vedi il promemoria mostrato qui sotto se non è ancora
  // stato inviato.
  const now = parseDateKey(todayKey());
  const reviewMonth = lastCompletedMonth(now);
  const reviewMonthEnd = endOfMonth(new Date(Date.UTC(reviewMonth.year, reviewMonth.month - 1, 1)));
  // Se il dipendente è stato assunto dopo la fine di quel mese, non c'è
  // nulla da rivedere: il promemoria non deve suonare come un mese
  // dimenticato quando semplicemente non lavorava ancora qui.
  const wasHiredByReviewMonth = employee.createdAt <= reviewMonthEnd;

  // Il dipendente vede sempre il passato e la settimana in corso; le settimane
  // successive solo quando il titolare ha confermato gli orari (WeekPlan.publishedAt).
  const currentWeekStart = startOfWeek(now);
  const weekPlan = weekStart >= currentWeekStart ? await prisma.weekPlan.findUnique({ where: { weekStart } }) : null;
  const notConfirmed = weekStart > currentWeekStart && !weekPlan?.publishedAt;
  // Settimana in corso non ancora confermata: si vede lo stesso (regola di
  // lib/week-visibility.ts), ma va detto — altrimenti una colonna di «Nessun
  // turno» sembra una settimana di riposo.
  const currentWeekUnconfirmed = weekStart.getTime() === currentWeekStart.getTime() && !weekPlan?.publishedAt;

  const [rawBlocks, rawLeaveEntries, closures, submissions, nextShift] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { employeeId: employee.id, date: { gte: weekStart, lte: weekEnd } } }),
    prisma.leaveEntry.findMany({ where: { employeeId: employee.id, date: { gte: weekStart, lte: weekEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.monthlySubmission.findMany({ where: { employeeId: employee.id } }),
    employee.deactivatedAt ? null : findNextShift(employee.id),
  ]);

  const blocks = notConfirmed ? [] : rawBlocks;
  const leaveEntries = notConfirmed ? [] : rawLeaveEntries;

  const statusOf = (y: number, m: number) => submissions.find((s) => s.year === y && s.month === m)?.status ?? null;
  const lastMonthSubmission = submissions.find((s) => s.year === reviewMonth.year && s.month === reviewMonth.month);
  // Mesi che il titolare ha rimandato indietro, anche vecchi (settembre
  // riaperto mentre il promemoria parlava solo di ottobre): il più vecchio per primo.
  const reopenedMonths = submissions
    .filter((s) => s.status === "REOPENED")
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((s) => ({ year: s.year, month: s.month, note: s.reopenNote }));

  // Mese a cui punta «Qualcosa non torna in questi giorni?». Una settimana
  // può stare a cavallo di due mesi: se contiene oggi vale il mese corrente
  // (quello che si sta vivendo), altrimenti quello in cui cade il lunedì
  // della settimana mostrata. Il collegamento compare solo se quei giorni sono
  // già arrivati e il mese si può ancora correggere: niente invito a
  // «correggere» una settimana futura o un mese ormai chiuso.
  const today = todayKey();
  const correctionAnchor = dateKeys.includes(today) ? today : toDateKey(weekStart);
  const correctionMonth = { year: Number(correctionAnchor.slice(0, 4)), month: Number(correctionAnchor.slice(5, 7)) };
  const showCorrectionLink =
    !notConfirmed &&
    toDateKey(weekStart) <= today &&
    employeeCanEditMonth({
      ...correctionMonth,
      status: statusOf(correctionMonth.year, correctionMonth.month),
      hireMonthKey: toDateKey(employee.createdAt).slice(0, 7),
      today,
    });

  return (
    <MieOreView
      nextShift={nextShift}
      showWidgetLink={!preview && employee.widgets.length > 0}
      showInstallLink={!employee.appInstalledAt}
      reopenedMonths={reopenedMonths}
      correctionMonth={showCorrectionLink ? correctionMonth : null}
      currentWeekUnconfirmed={currentWeekUnconfirmed}
      notConfirmed={notConfirmed}
      employee={{
        id: employee.id,
        name: employee.name,
        jobTitle: employee.jobTitle,
        photoVersion: employee.photoUpdatedAt ? String(employee.photoUpdatedAt.getTime()) : null,
      }}
      preview={preview}
      deactivatedAtKey={employee.deactivatedAt ? toDateKey(employee.deactivatedAt) : null}
      lastCompletedMonth={reviewMonth}
      lastMonthStatus={lastMonthSubmission?.status ?? null}
      wasHiredByReviewMonth={wasHiredByReviewMonth}
      weekStartKey={toDateKey(weekStart)}
      dateKeys={dateKeys}
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
    />
  );
}

// Ora del giorno nel fuso del locale, in minuti dalla mezzanotte.
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// «Prossimo turno» in cima a Le mie ore: il primo turno non ancora finito,
// tra quelli che il dipendente può vedere (passato, settimana in corso e
// settimane confermate — come nel resto della pagina). Si parte da ieri: un
// turno di ieri che finisce dopo mezzanotte (18:00–01:00) può essere ancora
// in corso. La fine si conta con shiftEndMinutes, così 00:00 vale 24:00.
// Giorni di chiusura e assenze passano da buildSchedule come altrove.
async function findNextShift(employeeId: string): Promise<NextShift | null> {
  const today = todayKey();
  const todayDate = parseDateKey(today);
  const from = addDays(todayDate, -1);
  const to = addDays(todayDate, 42);
  const [blocks, leaveEntries, closures, visible, plans] = await Promise.all([
    prisma.shiftBlock.findMany({ where: { employeeId, date: { gte: from, lte: to } } }),
    prisma.leaveEntry.findMany({ where: { employeeId, date: { gte: from, lte: to } } }),
    prisma.closureDay.findMany({ where: { date: { gte: from, lte: to } } }),
    employeeVisibleDates(),
    prisma.weekPlan.findMany({ where: { weekStart: { gte: startOfWeek(from), lte: to }, publishedAt: { not: null } } }),
  ]);
  const confirmedWeeks = new Set(plans.map((p) => toDateKey(p.weekStart)));
  const dateKeys = Array.from({ length: 44 }, (_, i) => toDateKey(addDays(from, i)));
  const schedule = buildSchedule({
    dateKeys,
    employees: [{ id: employeeId, name: "", role: "EMPLOYEE", jobTitle: null, sortOrder: 0, photoVersion: null }],
    blocks: blocks
      .filter((b) => visible(b.date))
      .map((b) => ({ id: b.id, employeeId, dateKey: toDateKey(b.date), startTime: b.startTime, endTime: b.endTime, confirmed: b.confirmed })),
    leaveEntries: leaveEntries
      .filter((l) => visible(l.date))
      .map((l) => ({ id: l.id, employeeId, dateKey: toDateKey(l.date), type: l.type, quantity: l.quantity })),
    closures: closures.map((c) => ({ dateKey: toDateKey(c.date), reason: c.reason })),
    today,
  });

  const nowMinutes = timeToMinutes(clockFormatter.format(new Date()));
  for (const [i, dateKey] of dateKeys.entries()) {
    const entry = schedule.entry(employeeId, dateKey);
    if (entry.kind !== "TURNO") continue;
    const dayOffset = i - 1; // -1 = ieri, 0 = oggi, 1 = domani…
    const sorted = entry.blocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
    const idx = sorted.findIndex((b) => dayOffset * 1440 + shiftEndMinutes(b.startTime, b.endTime) > nowMinutes);
    if (idx === -1) continue;
    const date = parseDateKey(dateKey);
    const first = sorted[idx];
    return {
      dayOffset,
      dayName: dayLabel(date, true).toLowerCase(),
      dayOfMonth: date.getUTCDate(),
      monthIndex: date.getUTCMonth(),
      times: sorted.slice(idx).map((b) => `${b.startTime}–${b.endTime}`),
      inProgress: dayOffset * 1440 + timeToMinutes(first.startTime) <= nowMinutes,
      confirmed: confirmedWeeks.has(toDateKey(startOfWeek(date))),
    };
  }
  return null;
}
