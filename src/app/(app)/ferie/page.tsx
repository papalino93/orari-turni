import { prisma } from "@/lib/prisma";
import { toDateKey } from "@/lib/week";
import { computeLeaveSummary } from "@/lib/leave";
import { LeaveCard } from "./leave-card";

export default async function FeriePage() {
  const year = new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const today = new Date();

  const [employees, balances, entries] = await Promise.all([
    prisma.employee.findMany({
      where: { role: "EMPLOYEE", active: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveBalance.findMany({ where: { year } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: yearStart, lte: yearEnd } } }),
  ]);

  const cards = employees.map((emp) => {
    const balanceFor = (type: "FERIE" | "PERMESSO") =>
      balances.find((b) => b.employeeId === emp.id && b.leaveType === type) ?? null;
    const entriesFor = (type: "FERIE" | "PERMESSO") =>
      entries
        .filter((e) => e.employeeId === emp.id && e.type === type)
        .map((e) => ({ dateKey: toDateKey(e.date), quantity: e.quantity }));

    return {
      employee: { id: emp.id, name: emp.name },
      ferie: {
        summary: computeLeaveSummary(balanceFor("FERIE"), entriesFor("FERIE"), year, today),
        balance: balanceFor("FERIE"),
      },
      permesso: {
        summary: computeLeaveSummary(balanceFor("PERMESSO"), entriesFor("PERMESSO"), year, today),
        balance: balanceFor("PERMESSO"),
      },
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Ferie & Permessi {year}</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Se non hai ancora caricato i saldi di partenza di un dipendente, la sua scheda risulta vuota:
        imposta il saldo dalla scheda stessa oppure fammi leggere le buste paga in chat.
      </p>

      {cards.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
          Nessun dipendente. Aggiungine uno nella sezione Dipendenti.
        </p>
      )}

      <div className="space-y-4">
        {cards.map((c) => (
          <LeaveCard key={c.employee.id} year={year} {...c} />
        ))}
      </div>
    </div>
  );
}
