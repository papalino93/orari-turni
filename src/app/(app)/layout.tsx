import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Non "=== 'ADMIN'": un cookie firmato prima dell'Area Dipendenti non ha
  // ancora questo campo, e appartiene per forza a titolare/consulente (quel
  // valore non esisteva prima) — vedi lo stesso ragionamento in lib/guard.ts.
  const role = session.user.role === "EMPLOYEE" ? "EMPLOYEE" : "ADMIN";

  return (
    <AppShell userName={session.user.name} role={role}>
      {children}
    </AppShell>
  );
}
