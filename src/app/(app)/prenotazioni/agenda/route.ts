import { NextResponse } from "next/server";
import { getBookingManager } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { addDays, businessDay } from "@/lib/booking/rules";
import { loadBookingSettings, siteOrigin } from "@/lib/booking/service";
import { AGENDA_MAX_DAYS, loadAgenda, validDay } from "@/lib/booking/agenda-server";
import { toBookingItem } from "../items";

// Dati dell'agenda a calendario, letti dal browser quando si cambia giorno, settimana o mese
// (una lettura, non una modifica: per questo una Route Handler e non una Server Action, che
// partirebbero una alla volta). Stessi permessi della pagina /prenotazioni.
//   ?dal=AAAA-MM-GG&al=AAAA-MM-GG[&righe=1][&servizio=1]  → AgendaData
//   ?id=<prenotazione>                                    → la prenotazione intera (con la cronologia)
export async function GET(request: Request) {
  const manager = await getBookingManager();
  if (!manager) return NextResponse.json({ error: "Non hai il permesso di vedere le prenotazioni." }, { status: 403, headers: NO_STORE });
  const settings = await loadBookingSettings();
  if (manager.role !== "ADMIN" && !settings.agendaEnabled) {
    return NextResponse.json({ error: "L'agenda delle prenotazioni non è ancora accesa." }, { status: 403, headers: NO_STORE });
  }
  const q = new URL(request.url).searchParams;

  // ?coda=1: un'impronta leggera di quello che cambia (prenotazioni, cronologia, lucchetti di WhatsApp):
  // la pagina la chiede ogni pochi secondi mentre ci sono risposte da mandare e si aggiorna solo se cambia.
  if (q.get("coda") === "1") {
    const since = new Date(Date.now() - 2 * 86400000);
    const [last, logs] = await Promise.all([
      prisma.bookingRequest.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
      prisma.bookingLog.count({ where: { at: { gte: since } } }),
    ]);
    return NextResponse.json({ sig: `${last._max.updatedAt?.getTime() ?? 0}:${last._count._all}:${logs}` }, { headers: NO_STORE });
  }

  const id = q.get("id");
  if (id !== null) {
    if (!/^[a-z0-9_]{10,40}$/i.test(id)) return NextResponse.json({ error: "Prenotazione non trovata." }, { status: 400, headers: NO_STORE });
    const b = await prisma.bookingRequest.findUnique({ where: { id }, include: { promo: { select: { title: true } }, log: { orderBy: { at: "asc" } } } });
    if (!b) return NextResponse.json({ error: "Questa prenotazione non c'è più." }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ booking: toBookingItem(b, siteOrigin(new URL(request.url).origin)) }, { headers: NO_STORE });
  }

  const from = q.get("dal");
  const to = q.get("al");
  if (!validDay(from) || !validDay(to) || from > to || addDays(from, AGENDA_MAX_DAYS) < to) {
    return NextResponse.json({ error: "Periodo non valido." }, { status: 400, headers: NO_STORE });
  }
  // Oltre i sei mesi indietro i dati non ci sono più (si cancellano): niente letture inutili.
  const today = businessDay(new Date());
  if (to < addDays(today, -200) || from > addDays(today, 800)) return NextResponse.json({ error: "Periodo non valido." }, { status: 400, headers: NO_STORE });
  const data = await loadAgenda(from, to, {
    rows: q.get("righe") === "1",
    staff: q.get("servizio") === "1",
    isOwner: manager.role === "ADMIN",
    countTests: !settings.agendaEnabled,
  });
  return NextResponse.json(data, { headers: NO_STORE });
}

const NO_STORE = { "Cache-Control": "private, no-store" };
