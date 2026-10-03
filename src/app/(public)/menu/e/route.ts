import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadStatsSetting } from "@/lib/menu";
import { isStatKind, romeParts } from "@/lib/menu-stats";

// Riceve gli eventi anonimi del menù dei clienti (vedi stats.tsx). Pubblico come
// tutto /menu: niente dati personali, niente cookie impostati. Non conta:
// - quando le statistiche sono spente («Inizia a contare» in Statistiche);
// - chi ha fatto l'accesso all'app (personale, titolare);
// - le raffiche (più di 40 eventi al minuto dallo stesso indirizzo).

const recent = new Map<string, { start: number; count: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const entry = recent.get(ip);
  if (!entry || now - entry.start > 60_000) {
    if (recent.size > 5000) recent.clear();
    recent.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > 40;
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null;

export async function POST(request: NextRequest) {
  const skip = new NextResponse(null, { status: 204 });
  const staff = request.cookies.getAll().some((c) => c.name.includes("next-auth.session-token"));
  if (staff) return skip;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (tooMany(ip)) return skip;

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2000) return skip;
    body = JSON.parse(text);
  } catch {
    return skip;
  }
  const { k, l, t } = (body ?? {}) as { k?: unknown; l?: unknown; t?: unknown };
  if (!isStatKind(k)) return skip;
  if (!(await loadStatsSetting()).enabled) return skip;

  const { day, hour, weekday } = romeParts();
  await prisma.menuEvent.create({
    data: { day, hour, weekday, kind: k, label: k === "search" || k === "search_empty" ? clean(l, 60)?.toLowerCase() ?? null : clean(l, 120), target: clean(t, 80) },
  });
  return skip;
}
