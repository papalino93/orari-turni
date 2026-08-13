import { prisma } from "@/lib/prisma";
import { addDays, monthLabel, parseDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/week";
import { NewEmployeeForm } from "./new-employee-form";
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
    const updated = await prisma.employee.update({ where: { id: emp.id }, data: { username, password } });
    byId.set(emp.id, updated);
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
  const lastCompletedMonth = {
    year: now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(),
    month: now.getUTCMonth() === 0 ? 12 : now.getUTCMonth(),
  };

  const [employeesRaw, blocks, leaveEntries, closures, pendingSubmissions, lastMonthSubmissions] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    prisma.shiftBlock.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    // Solo gli invii "in attesa": è l'unico stato che richiede un'azione del
    // titolare — bozze e mesi già approvati non hanno nulla da mostrare qui.
    prisma.monthlySubmission.findMany({ where: { status: "SUBMITTED" } }),
    prisma.monthlySubmission.findMany({ where: { ...lastCompletedMonth } }),
  ]);
  const employees = await ensureEmployeeCredentials(employeesRaw);

  const submittedOrApprovedIds = new Set(
    lastMonthSubmissions.filter((s) => s.status === "SUBMITTED" || s.status === "APPROVED").map((s) => s.employeeId),
  );
  const missingLastMonth = employees.filter(
    (e) => e.role === "EMPLOYEE" && e.active && e.username && !submittedOrApprovedIds.has(e.id),
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
    pendingSubmissions: pendingSubmissions
      .filter((s) => s.employeeId === e.id)
      .map((s) => ({ year: s.year, month: s.month, submittedAt: s.submittedAt?.toISOString() ?? null })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Dipendenti</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Gestisci l&apos;elenco di dipendenti e titolare. Il titolare compare negli orari ma non nel registro ferie.
      </p>

      {missingLastMonth.length > 0 && (
        <p className="mb-5 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-gold">
          {missingLastMonth.length === 1
            ? `${missingLastMonth[0].name} non ha ancora inviato le ore di `
            : `${missingLastMonth.length} dipendenti non hanno ancora inviato le ore di `}
          {monthLabel(lastCompletedMonth.month - 1)} {lastCompletedMonth.year}
          {missingLastMonth.length > 1 && (
            <span className="text-gold/80"> ({missingLastMonth.map((e) => e.name).join(", ")})</span>
          )}
        </p>
      )}

      <NewEmployeeForm />
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
        }))}
        closures={closures.map((c) => ({ dateKey: toDateKey(c.date), reason: c.reason }))}
      />
    </div>
  );
}
