import { authenticateWidget } from "@/lib/widget-auth";
import { dataAperture, dataDaFare, dataFuoriMenu, dataMenu, dataOggi, dataQr, dataRiepilogo, dataSettimana, dataTurni } from "@/lib/widget-data";
import { widgetById } from "@/lib/widgets";

// Dati di un widget per Scriptable: GET /api/widget/<nome> con «Authorization: Bearer <chiave>».
// Mai in cache condivisa: ogni risposta dipende dalla chiave.
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  chiave: "Telefono non collegato. Ricollegalo da «Widget sul telefono».",
  tolto: "Accesso tolto · chiedi al titolare",
  scaduta: "Collegamento scaduto: non usato da 90 giorni. Ricollegalo da «Widget sul telefono».",
  permesso: "Questo widget non è tra i tuoi. Chiedi al titolare.",
  troppe: "Troppe richieste: riprova tra qualche minuto.",
  sconosciuto: "Widget sconosciuto: controlla la parola nel campo «Parametro».",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  if (!widgetById(nome)) return json({ errore: "sconosciuto", messaggio: MESSAGES.sconosciuto }, 404);
  const auth = await authenticateWidget(req, nome);
  if (!auth.ok) return json({ errore: auth.code, messaggio: MESSAGES[auth.code] }, auth.status);

  const data =
    nome === "aperture" ? await dataAperture()
    : nome === "settimana" ? await dataSettimana()
    : nome === "riepilogo" ? await dataRiepilogo()
    : nome === "oggi" ? await dataOggi()
    : nome === "dafare" ? await dataDaFare()
    : nome === "menu" ? await dataMenu()
    : nome === "fuorimenu" ? await dataFuoriMenu()
    : nome === "qr" ? dataQr()
    : auth.owner.kind === "employee" ? await dataTurni(auth.owner.employeeId)
    : null;
  if (!data) return json({ errore: "permesso", messaggio: MESSAGES.permesso }, 403);
  const origin = new URL(req.url).origin;
  return json({ widget: nome, sito: origin, ...data });
}
