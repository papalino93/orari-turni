import withAuth from "next-auth/middleware";

export default withAuth;

export const config = {
  // Esclude anche i file statici pubblici (logo, favicon, icone...): un
  // file con estensione non deve mai passare per il controllo di login,
  // altrimenti su una pagina non autenticata (es. /login) l'immagine
  // viene rediretta a sua volta e appare come icona rotta.
  matcher: ["/((?!api/auth|login|_next/static|_next/image|.*\\..*).*)"],
};
