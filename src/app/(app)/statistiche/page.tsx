import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadStatsSetting } from "@/lib/menu";
import { loadStats, parsePeriod } from "@/lib/stats-queries";
import { StatsView } from "./stats-view";

// Statistiche del menù dei clienti: solo titolare e consulente (il Proxy tiene
// fuori i dipendenti; qui il controllo è ripetuto). Dati anonimi, vedi lib/menu-stats.ts.
export default async function StatistichePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "EMPLOYEE") redirect("/mie-ore");
  const period = parsePeriod((await searchParams).p);
  const setting = await loadStatsSetting();
  const data = await loadStats(period, setting.since);
  return <StatsView period={period} setting={setting} data={data} />;
}
