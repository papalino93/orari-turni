import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { StaffDeviceMark } from "@/components/staff-device-mark";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Non "=== 'ADMIN'": un cookie firmato prima dell'Area Dipendenti non ha
  // ancora questo campo, e appartiene per forza a titolare/consulente (quel
  // valore non esisteva prima) — vedi lo stesso ragionamento in lib/guard.ts.
  const role = session.user.role === "EMPLOYEE" ? "EMPLOYEE" : "ADMIN";

  // Titolare/consulente gestiscono sempre il menù; un dipendente solo se il
  // titolare gli ha dato il permesso (letto dal database, non dal token).
  let canEditMenu = role === "ADMIN";
  if (role === "EMPLOYEE" && session.user.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      select: { canEditMenu: true, active: true },
    });
    canEditMenu = Boolean(employee?.active && employee.canEditMenu);
  }

  return (
    <AppShell userName={session.user.name} role={role} canEditMenu={canEditMenu}>
      <StaffDeviceMark />
      {children}
    </AppShell>
  );
}
