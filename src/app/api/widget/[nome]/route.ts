import { authenticateWidget } from "@/lib/widget-auth";
import { dataAndamento, dataAperture, dataClienti, dataDaFare, dataFuoriMenu, dataMattina, dataMenu, dataOggi, dataPannello, dataQr, dataRiepilogo, dataSala, dataSettimana, dataStasera, dataTurni } from "@/lib/widget-data";
import { ADMIN_WIDGETS, SCRIPT_GROUPS, WIDGETS, scriptFiles, widgetById } from "@/lib/widgets";

// Dati di un widget per Scriptable: GET /api/widget/<nome> con «Authorization: Bearer <chiave>».
// Mai in cache condivisa: ogni risposta dipende dalla chiave.
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  chiave: "Telefono non collegato. Ricollegalo da «Widget sul telefono».",
  tolto: "Accesso tolto · chiedi al titolare",
  scaduta: "Collegamento scaduto: non usato da 90 giorni. Ricollegalo da «Widget sul telefono».",
  permesso: "Questo widget non è tra i tuoi. Chiedi al titolare.",
  troppe: "Troppe richieste: riprova tra qualche minuto.",
  sconosciuto: "Widget sconosciuto: controlla la parola nel campo «Parameter».",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  // L'elenco per l'installatore: i widget di questa persona, con il nome dello script da creare.
  if (nome === "elenco") {
    const auth = await authenticateWidget(req, null);
    if (!auth.ok) return json({ errore: auth.code, messaggio: MESSAGES[auth.code] }, auth.status);
    const list = auth.owner.kind === "admin" ? ADMIN_WIDGETS : WIDGETS.filter((w) => !w.vecchio && w.per !== "admin" && auth.owner.kind === "employee" && auth.owner.widgets.includes(w.id));
    return json({
      chi: auth.owner.name,
      // Uno script per grandezza, in ordine: prima tutti i piccoli, poi i medi, i grandi e la schermata di blocco.
      widget: SCRIPT_GROUPS.flatMap((g) =>
        list.flatMap((w) =>
          scriptFiles(w)
            .filter((f) => f.gruppo === g.id)
            .map((f) => ({ id: w.id, nome: w.nome, file: f.file, grandezza: f.gruppo, icona: w.icona ?? { colore: "deep-brown", disegno: "wine-glass" } })),
        ),
      ),
    });
  }
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
    : nome === "qr" || nome === "apri" || nome === "menuqr" ? dataQr()
    : nome === "pannello" ? await dataPannello(auth.owner.kind === "employee" ? { kind: "employee", employeeId: auth.owner.employeeId } : { kind: "admin" })
    : nome === "sala" ? await dataSala()
    : nome === "mattina" ? await dataMattina()
    : nome === "stasera" ? await dataStasera()
    : nome === "andamento" ? await dataAndamento()
    : nome === "clienti" ? await dataClienti()
    : auth.owner.kind === "employee" ? await dataTurni(auth.owner.employeeId)
    : null;
  if (!data) return json({ errore: "permesso", messaggio: MESSAGES.permesso }, 403);
  const origin = new URL(req.url).origin;
  return json({ widget: nome, sito: origin, tema: auth.tema, ...data });
}
