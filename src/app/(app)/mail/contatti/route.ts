import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { loadFeatures } from "@/lib/app-features";
import { loadRubrica } from "@/lib/mail-contacts";

// La rubrica per la pagina Mail (scheda «Rubrica» e «Dalla rubrica» al passo 1): letta quando
// serve, non a ogni apertura della pagina. Solo titolare e consulente, con la sezione accesa.
export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Accedi di nuovo." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!(await loadFeatures()).mail) return NextResponse.json({ error: "La sezione Mail è spenta." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(await loadRubrica(), { headers: { "Cache-Control": "private, no-store" } });
}
