import { after, type NextRequest } from "next/server";
import { afterCreate, createBookingRequest } from "@/lib/booking/service";
import { clientIp, formAge, isOwner, json, MIN_FILL_MS, readJson, requestOrigin, sameOrigin } from "../server-utils";

// Invio del modulo «Chiedi un tavolo». Una route con JSON e non una server action: le action
// cambiano nome a ogni rilascio, e un cliente con la pagina aperta da prima riceverebbe un errore.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ ok: false, error: "Ricarica la pagina e riprova." }, 403);
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "Qualcosa non ha funzionato: ricarica la pagina e riprova." }, 400);

  // Campo trappola, invisibile alle persone: se è pieno l'ha compilato un programma.
  // Si finge che sia andato tutto bene, senza salvare nulla.
  if (typeof body.sito === "string" && body.sito.trim()) return json({ ok: true, fake: true });

  const age = formAge(body.t);
  if (age === null) return json({ ok: false, error: "La pagina è vecchia: ricaricala e riprova." });
  if (age < MIN_FILL_MS) return json({ ok: false, error: "Un attimo: controlla i dati e premi di nuovo «Invia la richiesta»." });

  const origin = requestOrigin(request);
  const isAdmin = await isOwner();
  const res = await createBookingRequest(
    {
      day: body.day,
      time: body.time,
      people: body.people,
      name: body.name,
      phone: body.phone,
      email: body.email,
      contact: body.contact,
      note: body.note,
      allergies: body.allergies === true,
      source: body.source,
      event: body.event,
      privacy: body.privacy,
    },
    { ip: clientIp(request), isAdmin, origin },
  );
  if (!res.ok) return json({ ok: false, error: res.error, field: res.field ?? null });
  // Avvisi al personale e ricevuta per email dopo aver risposto: il cliente non aspetta.
  // Un doppio invio (stesso telefono, giorno e ora) riusa la richiesta di prima: niente secondo avviso.
  if (!res.reused) after(() => afterCreate(res.id, origin));
  return json({ ok: true, statusPath: res.statusPath, isTest: res.isTest });
}
