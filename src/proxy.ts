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
const EMPLOYEE_ALLOWED_PREFIXES = ["/mie-ore", "/installa"];

export default withAuth(
  function proxy(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth?.token?.role;

    if (role === "EMPLOYEE") {
      const allowed = EMPLOYEE_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      if (!allowed) {
        return NextResponse.redirect(new URL("/mie-ore", req.url));
      }
    }

    return NextResponse.next();
  },
  { pages: { signIn: "/login" } },
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
  matcher: ["/((?!api/auth|login|opengraph-image|twitter-image|_next/static|_next/image|.*\\..*).*)"],
};
