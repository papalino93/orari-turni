import type { NextRequest } from "next/server";
import { customerAction } from "@/lib/booking/service";
import { json, readJson, requestOrigin, sameOrigin } from "../../../server-utils";

// Il cliente dalla sua pagina: annulla, oppure accetta o rifiuta l'orario proposto.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({ ok: false, error: "Ricarica la pagina e riprova." }, 403);
  const { token } = await params;
  const body = await readJson(request, 500);
  const action = body?.action;
  if (action !== "cancel" && action !== "accept" && action !== "refuse") return json({ ok: false, error: "Ricarica la pagina e riprova." }, 400);
  const res = await customerAction(token, action, requestOrigin(request));
  return json(res.ok ? { ok: true } : { ok: false, error: res.error });
}
