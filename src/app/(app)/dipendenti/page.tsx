import { prisma } from "@/lib/prisma";
import { NewEmployeeForm } from "./new-employee-form";
import { EmployeeList } from "./employee-list";

export default async function DipendentiPage() {
  const employees = await prisma.employee.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Dipendenti</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Gestisci l&apos;elenco di dipendenti e titolare. Il titolare compare negli orari ma non nel
        registro ferie.
      </p>

      <NewEmployeeForm />
      <EmployeeList employees={employees} />
    </div>
  );
}
