import { prisma } from "@/lib/prisma";
import {
  addDays,
  dayLabel,
  endOfMonth,
  formatDayMonth,
  lastCompletedMonth,
  monthLabel,
  parseDateKey,
  startOfWeek,
  toDateKey,
  todayKey,
} from "@/lib/week";
import { blockTimeLabel, leaveLabelFor } from "@/lib/schedule";
import { NewEmployeeForm } from "./new-employee-form";
import { VenueDeviceButton } from "./venue-device";
import { EmployeeList } from "./employee-list";
import {
  decryptEmployeePassword,
  encryptEmployeePassword,
  generateEmployeePassword,
  generateEmployeeUsername,
} from "@/lib/employee-credentials";
import type { Employee } from "@prisma/client";

// Dipendenti creati prima dell'Area Dipendenti non hanno ancora username e
// password: si assegnano da soli alla prima apertura di questa pagina dopo
// l'aggiornamento, invece di richiedere uno script di migrazione dati a
// parte da ricordarsi di lanciare in produzione.
// Se NEXTAUTH_SECRET cambiasse (o il dato fosse corrotto) la decifrazione
// fallirebbe: meglio mostrare "—" per quel dipendente che far esplodere
// l'intera pagina Dipendenti.
function safeDecrypt(stored: string): string | null {
  try {
    return decryptEmployeePassword(stored);
  } catch {
    return null;
  }
}

async function ensureEmployeeCredentials(employees: Employee[]): Promise<Employee[]> {
  const missing = employees.filter((e) => e.role === "EMPLOYEE" && !e.username);
  if (missing.length === 0) return employees;

  const byId = new Map(employees.map((e) => [e.id, e]));
  for (const emp of missing) {
    const username = await generateEmployeeUsername(emp.name);
    const password = encryptEmployeePassword(generateEmployeePassword());
    // updateMany con where username:null, non update semplice: due richieste
    // quasi simultanee a questa pagina (doppia scheda, refresh rapido, un
    // prefetch di Next.js più la navigazione reale) possono trovare
    // entrambe lo stesso dipendente senza credenziali — con un update
    // incondizionato la seconda sovrascriveva silenziosamente username e
    // password già scritti dalla prima, lasciando al titolare una coppia
    // che comunica a voce ma che nel frattempo non è più quella salvata.
    // Qui solo la prima scrittura va a buon fine (count === 1); chi perde
    // la corsa rilegge il valore davvero persistito invece di sovrascriverlo.
    const { count } = await prisma.employee.updateMany({
      where: { id: emp.id, username: null },
      data: { username, password },
    });
    if (count === 1) {
      byId.set(emp.id, { ...emp, username, password });
    } else {
      const updated = await prisma.employee.findUnique({ where: { id: emp.id } });
      if (updated) byId.set(emp.id, updated);
    }
  }
  return employees.map((e) => byId.get(e.id)!);
}

export default async function DipendentiPage() {
  // todayKey() e non new Date(): quest'ultima, passata a startOfWeek (che
  // legge i campi UTC), sbaglierebbe settimana nella finestra tra la
  // mezzanotte UTC e quella italiana — ad es. domenica notte in Italia
  // mostrerebbe ancora la settimana appena finita.
  const weekStart = startOfWeek(parseDateKey(todayKey()));
  const weekEnd = addDays(weekStart, 6);
  const dateKeys = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i)));

  // Speculare al promemoria che vede il dipendente in "Le mie ore": qui il
  // titolare vede chi non ha ancora inviato l'ultimo mese concluso.
  const now = parseDateKey(todayKey());
  const reviewMonth = lastCompletedMonth(now);
  const reviewMonthEnd = endOfMonth(new Date(Date.UTC(reviewMonth.year, reviewMonth.month - 1, 1)));

  const [employeesRaw, blocks, leaveEntries, closures, reviewSubmissions, lastMonthSubmissions] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    prisma.shiftBlock.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    // Inviati (da controllare), rimandati indietro (in attesa del dipendente)
    // e approvati (gli ultimi, per poterli riaprire). Le bozze non servono qui.
    prisma.monthlySubmission.findMany({
      where: { status: { in: ["SUBMITTED", "REOPENED", "APPROVED"] } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.monthlySubmission.findMany({ where: { ...reviewMonth } }),
  ]);
  const employees = await ensureEmployeeCredentials(employeesRaw);
  const pendingSubmissions = reviewSubmissions.filter((s) => s.status === "SUBMITTED");

  // Cosa ha cambiato il dipendente nei mesi da controllare, rispetto agli
  // orari del titolare: turni corretti o aggiunti, turni tolti, permessi a
  // ore segnati da lui. Chi approva lo vede subito sotto il mese.
  const firstPending = pendingSubmissions.reduce<Date | null>((min, s) => {
    const d = new Date(Date.UTC(s.year, s.month - 1, 1));
    return !min || d < min ? d : min;
  }, null);
  const [editedBlocks, employeeLeaves, removals] = firstPending
    ? await Promise.all([
        prisma.shiftBlock.findMany({
          where: { date: { gte: firstPending }, OR: [{ addedByEmployee: true }, { originalStartTime: { not: null } }] },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
        prisma.leaveEntry.findMany({ where: { date: { gte: firstPending }, addedByEmployee: true }, orderBy: { date: "asc" } }),
        prisma.shiftRemoval.findMany({ where: { date: { gte: firstPending } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
      ])
    : [[], [], []];
  function changesFor(employeeId: string, employeeName: string, year: number, month: number): string[] {
    const who = employeeName.split(" ")[0];
    const inMonth = (d: Date) => d.getUTCFullYear() === year && d.getUTCMonth() === month - 1;
    const day = (d: Date) => `${dayLabel(d)} ${formatDayMonth(d)}`;
    const lines: { key: string; text: string }[] = [];
    for (const b of editedBlocks) {
      if (b.employeeId !== employeeId || !inMonth(b.date)) continue;
      lines.push({
        key: `${toDateKey(b.date)}${b.startTime}`,
        text: b.originalStartTime
          ? `${day(b.date)} · Corretto da ${who}: era ${blockTimeLabel({ startTime: b.originalStartTime, endTime: b.originalEndTime ?? "" })}, ora ${blockTimeLabel(b)}`
          : `${day(b.date)} · Aggiunto da ${who}: ${blockTimeLabel(b)}`,
      });
    }
    for (const r of removals) {
      if (r.employeeId !== employeeId || !inMonth(r.date)) continue;
      lines.push({ key: `${toDateKey(r.date)}${r.startTime}`, text: `${day(r.date)} · Tolto da ${who}: era ${blockTimeLabel(r)}` });
    }
    for (const l of employeeLeaves) {
      if (l.employeeId !== employeeId || !inMonth(l.date)) continue;
      lines.push({ key: `${toDateKey(l.date)}~`, text: `${day(l.date)} · ${leaveLabelFor(l.type, l.quantity)} segnato da ${who}` });
    }
    return lines.sort((a, b) => a.key.localeCompare(b.key)).map((l) => l.text);
  }

  const submittedOrApprovedIds = new Set(
    lastMonthSubmissions.filter((s) => s.status === "SUBMITTED" || s.status === "APPROVED").map((s) => s.employeeId),
  );
  // Assunti dopo la fine del mese in questione restano fuori: non hanno
  // nulla da inviare per un periodo in cui non lavoravano ancora qui.
  const missingLastMonth = employees.filter(
    (e) =>
      e.role === "EMPLOYEE" &&
      e.active &&
      !e.isVenueDevice &&
      e.username &&
      e.createdAt <= reviewMonthEnd &&
      !submittedOrApprovedIds.has(e.id),
  );

  const mapped = employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    jobTitle: e.jobTitle,
    active: e.active,
    sortOrder: e.sortOrder,
    photoVersion: e.photoUpdatedAt ? String(e.photoUpdatedAt.getTime()) : null,
    username: e.username,
    // Decifrata qui, non nel Client Component: la chiave di decifrazione
    // (derivata da NEXTAUTH_SECRET) non deve mai lasciare il server.
    password: e.password ? safeDecrypt(e.password) : null,
    canEditMenu: e.canEditMenu,
    canManageBookings: e.canManageBookings,
    isVenueDevice: e.isVenueDevice,
    pendingSubmissions: pendingSubmissions
      .filter((s) => s.employeeId === e.id)
      .map((s) => ({
        year: s.year,
        month: s.month,
        submittedAt: s.submittedAt?.toISOString() ?? null,
        changes: changesFor(e.id, e.name, s.year, s.month),
      })),
    // Mesi rimandati indietro: prima sparivano da questa pagina finché il
    // dipendente non li inviava di nuovo.
    reopenedSubmissions: reviewSubmissions
      .filter((s) => s.employeeId === e.id && s.status === "REOPENED")
      .map((s) => ({ year: s.year, month: s.month, reopenedAt: s.reopenedAt?.toISOString() ?? null, note: s.reopenNote, wasApproved: Boolean(s.approvedAt) })),
    // Gli ultimi tre mesi approvati, per poterli riaprire.
    approvedSubmissions: reviewSubmissions
      .filter((s) => s.employeeId === e.id && s.status === "APPROVED")
      .slice(0, 3)
      .map((s) => ({ year: s.year, month: s.month, approvedAt: s.approvedAt?.toISOString() ?? null })),
  }));

  return (
    <div className="app-wide mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Dipendenti</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Gestisci l&apos;elenco di dipendenti e titolare. Il titolare compare negli orari ma non nel registro ferie.
      </p>

      {missingLastMonth.length > 0 && (
        <p className="mb-5 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-gold">
          {missingLastMonth.length === 1
            ? `${missingLastMonth[0].name} non ha ancora inviato le ore di `
            : `${missingLastMonth.length} dipendenti non hanno ancora inviato le ore di `}
          {monthLabel(reviewMonth.month - 1)} {reviewMonth.year}
          {missingLastMonth.length > 1 && (
            <span className="text-gold"> ({missingLastMonth.map((e) => e.name).join(", ")})</span>
          )}
        </p>
      )}

      <NewEmployeeForm />
      <VenueDeviceButton exists={employees.some((e) => e.isVenueDevice)} />
      <EmployeeList
        employees={mapped}
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
    </div>
  );
}
