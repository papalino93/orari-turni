import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadStatsSetting } from "@/lib/menu";
import { loadStats, parseDay, parsePeriod } from "@/lib/stats-queries";
import { WEEKDAY_NAMES } from "@/lib/menu-stats";

// «Scarica per Excel» nelle Statistiche: le aperture del menù giorno per giorno del periodo scelto
// (stessi parametri della pagina: p, dal, al), da conservare e analizzare. Solo titolare e consulente.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", request.url));
  if (session.user.role === "EMPLOYEE") return new NextResponse("Non autorizzato", { status: 403 });
  const q = new URL(request.url).searchParams;
  let custom = { from: parseDay(q.get("dal")), to: parseDay(q.get("al")) };
  if (custom.from && custom.to && custom.from > custom.to) custom = { from: custom.to, to: custom.from };
  const period = custom.from || custom.to ? "custom" : parsePeriod(q.get("p"));
  const setting = await loadStatsSetting();
  const data = await loadStats(period, setting.since, custom);
  const rows = [...data.daily].reverse(); // dal più vecchio al più recente
  const weekday = (day: string) => WEEKDAY_NAMES[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7];
  const csv = ["Giorno;Giorno della settimana;Aperture del menù", ...rows.map((r) => `${r.day};${weekday(r.day)};${r.count}`)].join("\r\n");
  return new NextResponse(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aperture-menu-${rows[0]?.day ?? data.today}_${rows[rows.length - 1]?.day ?? data.today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
