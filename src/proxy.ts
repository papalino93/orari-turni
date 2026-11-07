import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Rinominato da middleware.ts a proxy.ts: da Next.js 16 la convenzione
// "middleware" è deprecata in favore di "proxy" (stessa firma, stesso
// comportamento). Vedi node_modules/next/dist/docs/.../file-conventions/proxy.md.
//
// Importante: il Proxy è solo una prima barriera lato routing. Le Server
// Action non passano sempre da qui (un matcher sbagliato o un refactor può
// escluderle silenziosamente), quindi ogni Server Action verifica comunque
// la sessione per conto proprio — vedi lib/guard.ts (requireUser/requireEmployee).

// Le uniche pagine raggiungibili da un login dipendente: la sua area e la
// guida per installare l'app (che ha senso indipendentemente dal ruolo). Un
// dipendente che digita a mano /orari, /dipendenti, /ferie o /account viene
// rimandato qui — non solo "non trova il link" nella barra di navigazione.
//
// "/gestione-menu" è raggiungibile da tutti i login dipendente solo a livello
// di routing: il Proxy legge il token e non conosce il permesso "può
// modificare il menù" (vive nel database). Chi non ce l'ha viene rimandato
// altrove dalla pagina stessa, e ogni Server Action lo ricontrolla.
// "/widget": la guida per mettere i widget sul telefono (la pagina mostra solo quelli permessi).
// "/api/employee-photo": la propria foto (la route rifiuta quella degli altri).
// "/prenotazioni": come "/gestione-menu", il permesso («Può gestire le prenotazioni») lo controlla la pagina.
const EMPLOYEE_ALLOWED_PREFIXES = ["/mie-ore", "/installa", "/gestione-menu", "/prenotazioni", "/widget", "/api/employee-photo"];

// Pagine di partenza: "/" e "/orari" (l'app installata sul telefono si apre su /orari,
// vedi manifest.ts). Un dipendente che arriva qui va alla sua area senza avvisi; da ogni
// altra pagina del titolare arriva con ?bloccato=1, e la sua pagina spiega perché
// (vedi BlockedNotice in components/app-shell.tsx) invece di cambiare pagina in silenzio.
const START_PAGES = ["/", "/orari"];

export default withAuth(
  function proxy(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth?.token;
    const role = token?.role;

    // Senza accesso arrivano qui solo le chiamate delle azioni (vedi «authorized» sotto):
    // ognuna risponde da sé con un messaggio, quindi non le si tocca.
    if (!token) return NextResponse.next();

    if (role === "EMPLOYEE") {
      const allowed = EMPLOYEE_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      if (!allowed) {
        const target = new URL("/mie-ore", req.url);
        if (!START_PAGES.includes(pathname)) target.searchParams.set("bloccato", "1");
        return NextResponse.redirect(target);
      }
    }

    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      // Accesso scaduto mentre una pagina è aperta: la chiamata di un'azione (intestazione
      // «Next-Action», per esempio «Salva» in una scheda) non va rimandata alla pagina di
      // accesso, perché il browser riceverebbe una pagina invece della risposta, mostrerebbe
      // «Qualcosa è andato storto» e si perderebbe quello che si è scritto. La si lascia
      // arrivare all'azione, che controlla l'accesso da sé (requireUser/requireEmployee/
      // requireMenuEditor… in lib/guard.ts) e risponde con un messaggio da mostrare; il
      // resto della pagina, senza accesso, non viene comunque mostrato (vedi (app)/layout.tsx).
      // Il controllo sul ruolo qui sopra resta anche per queste chiamate.
      // Solo POST: una chiamata d'azione è sempre un POST, e Next non tratta come azione
      // una GET con la stessa intestazione (sarebbe una pagina servita senza controllo).
      // Verificato: ogni azione controlla l'accesso prima di aggiornare qualunque pagina
      // (revalidatePath), e senza aggiornamenti Next non disegna la pagina nella risposta.
      authorized: ({ req, token }) => !!token || (req.method === "POST" && req.headers.has("next-action")),
    },
  },
);

export const config = {
  // Esclude anche i file statici pubblici (logo, favicon, icone...): un
  // file con estensione non deve mai passare per il controllo di login,
  // altrimenti su una pagina non autenticata (es. /login) l'immagine
  // viene rediretta a sua volta e appare come icona rotta.
  //
  // opengraph-image è generata da Next senza estensione nell'URL (a
  // differenza di manifest.webmanifest o apple-icon.png, che un'estensione
  // ce l'hanno e sono già esclusi dalla regola sopra): senza questa
  // eccezione esplicita finiva reindirizzata al login, e chi riceve il
  // link su WhatsApp — senza sessione — vedeva un'anteprima vuota invece
  // dell'immagine.
  //
  // "menu" è il menù pubblico dietro il QR in enoteca: l'unica sezione
  // visibile senza login (insieme a /menu/allergeni). Scritto come
  // "menu(?:/|$)" e non "menu" perché questo elenco esclude per PREFISSO —
  // "login" qui sopra esclude anche "/login-qualcosa" — e una rotta come
  // "/menu-qualcosa" non deve diventare pubblica per sbaglio. L'area di
  // gestione sta infatti sotto un altro nome ("/gestione-menu").
  // api/widget: i dati dei widget si leggono con la chiave del telefono, non con la
  // sessione del sito (il controllo è in lib/widget-auth.ts).
  matcher: ["/((?!api/auth|api/widget|login|menu(?:/|$)|opengraph-image|twitter-image|_next/static|_next/image|.*\\..*).*)"],
};
