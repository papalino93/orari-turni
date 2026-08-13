import { prisma } from "@/lib/prisma";
import { addDays, parseDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/week";
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

  const [employeesRaw, blocks, leaveEntries, closures] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    prisma.shiftBlock.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.closureDay.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
  ]);
  const employees = await ensureEmployeeCredentials(employeesRaw);

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
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Dipendenti</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Gestisci l&apos;elenco di dipendenti e titolare. Il titolare compare negli orari ma non nel registro ferie.
      </p>

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
