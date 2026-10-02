import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadStatsSetting } from "@/lib/menu";
import { loadStats, parseDay, parsePeriod } from "@/lib/stats-queries";
import { StatsView } from "./stats-view";

// Statistiche del menù dei clienti: solo titolare e consulente (il Proxy tiene
// fuori i dipendenti; qui il controllo è ripetuto). Dati anonimi, vedi lib/menu-stats.ts.
export default async function StatistichePage({ searchParams }: { searchParams: Promise<{ p?: string; dal?: string; al?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "EMPLOYEE") redirect("/mie-ore");
  const params = await searchParams;
  const custom = { from: parseDay(params.dal), to: parseDay(params.al) };
  // «dal/al» senza p: è comunque un periodo a scelta.
  const period = custom.from || custom.to ? "custom" : parsePeriod(params.p);
  const setting = await loadStatsSetting();
  const data = await loadStats(period, setting.since, custom);
  return <StatsView period={period} setting={setting} data={data} custom={custom} />;
}
