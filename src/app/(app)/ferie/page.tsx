import { prisma } from "@/lib/prisma";
import { toDateKey, todayKey } from "@/lib/week";
import { computeLeaveSummary } from "@/lib/leave";
import { LeaveCard } from "./leave-card";

export default async function FeriePage() {
  const today = todayKey();
  const year = Number(today.slice(0, 4));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));

  const [employees, balances, allEntries, closures] = await Promise.all([
    prisma.employee.findMany({ where: { role: "EMPLOYEE", isVenueDevice: false }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    prisma.leaveBalance.findMany({ where: { year } }),
    prisma.leaveEntry.findMany({ where: { date: { gte: yearStart, lte: yearEnd }, type: { in: ["FERIE", "PERMESSO"] } } }),
    prisma.closureDay.findMany({ where: { date: { gte: yearStart, lte: yearEnd } }, select: { date: true } }),
  ]);
  // Ferie o permesso su un giorno poi chiuso: il locale non apre, quindi quel
  // giorno non si consumano ferie (come per i turni, la chiusura vince su
  // tutto: vedi buildSchedule). L'assenza resta salvata e torna a contare se
  // la giornata viene riaperta.
  const closedKeys = new Set(closures.map((c) => toDateKey(c.date)));
  const entries = allEntries.filter((e) => !closedKeys.has(toDateKey(e.date)));

  function buildCard(emp: (typeof employees)[number]) {
    const balanceFor = (type: "FERIE" | "PERMESSO") => balances.find((b) => b.employeeId === emp.id && b.leaveType === type) ?? null;
    const entriesFor = (type: "FERIE" | "PERMESSO") =>
      entries.filter((e) => e.employeeId === emp.id && e.type === type).map((e) => ({ dateKey: toDateKey(e.date), quantity: e.quantity }));
    // Un dipendente disattivato non matura più ferie/permessi dopo la fine
    // del rapporto: senza questo, "Maturato" e "Residui al 31/12" di un ex
    // dipendente continuerebbero a proiettare mesi mai lavorati.
    const deactivatedAtKey = emp.deactivatedAt ? toDateKey(emp.deactivatedAt) : null;

    return {
      employee: { id: emp.id, name: emp.name, active: emp.active },
      ferie: {
        summary: computeLeaveSummary(balanceFor("FERIE"), entriesFor("FERIE"), year, today, deactivatedAtKey),
        balance: balanceFor("FERIE"),
      },
      permesso: {
        summary: computeLeaveSummary(balanceFor("PERMESSO"), entriesFor("PERMESSO"), year, today, deactivatedAtKey),
        balance: balanceFor("PERMESSO"),
      },
    };
  }

  const activeEmployees = employees.filter((e) => e.active);
  // Un dipendente disattivato con saldi o movimenti quest'anno resta
  // visibile (in sola lettura): i suoi dati storici non devono sparire
  // solo perché non lavora più qui.
  const inactiveWithHistory = employees.filter(
    (e) => !e.active && (balances.some((b) => b.employeeId === e.id) || entries.some((en) => en.employeeId === e.id)),
  );

  const activeCards = activeEmployees.map(buildCard);
  const inactiveCards = inactiveWithHistory.map(buildCard);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Ferie & Permessi {year}</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        I giorni di ferie, permesso e malattia si segnano in «Orari», toccando il giorno del dipendente; qui vedi i saldi.
        Se non hai ancora caricato i saldi di partenza di un dipendente, la sua scheda risulta vuota: imposta il saldo
        dalla scheda stessa con «Imposta saldo».
      </p>

      {activeCards.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
          Nessun dipendente. Aggiungine uno nella sezione Dipendenti.
        </p>
      )}

      <div className="space-y-4">
        {activeCards.map((c) => (
          <LeaveCard key={c.employee.id} year={year} {...c} />
        ))}
      </div>

      {inactiveCards.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">
            Dipendenti disattivati con saldo storico {year}
          </h2>
          <div className="space-y-4 opacity-75">
            {inactiveCards.map((c) => (
              <LeaveCard key={c.employee.id} year={year} {...c} readOnly />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
