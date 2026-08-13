import withAuth from "next-auth/middleware";

// Rinominato da middleware.ts a proxy.ts: da Next.js 16 la convenzione
// "middleware" è deprecata in favore di "proxy" (stessa firma, stesso
// comportamento). Vedi node_modules/next/dist/docs/.../file-conventions/proxy.md.
//
// Importante: il Proxy è solo una prima barriera lato routing. Le Server
// Action non passano sempre da qui (un matcher sbagliato o un refactor può
// escluderle silenziosamente), quindi ogni Server Action verifica comunque
// la sessione per conto proprio — vedi lib/guard.ts::requireUser().
export default withAuth;

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
