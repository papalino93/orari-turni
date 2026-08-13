import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Ogni Server Action è di fatto un endpoint HTTP pubblico: l'id dell'azione
// è globale e può essere invocato da qualsiasi route, comprese quelle non
// coperte dal matcher del middleware (es. /login). Il middleware quindi non
// basta: ogni azione che legge o scrive deve verificare la sessione da sé.
// Questo è l'unico punto in cui farlo.

export type CurrentUser = { id: string; name: string; username: string };

export class AuthError extends Error {
  constructor(message = "Sessione non valida. Esegui di nuovo l'accesso.") {
    super(message);
    this.name = "AuthError";
  }
}

// Restituisce l'utente della sessione corrente, verificando che esista
// ancora nel database: un token firmato resta valido fino alla scadenza
// anche se l'account nel frattempo è stato rimosso.
export async function requireUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions);
  const username = session?.user?.username;
  if (!username) throw new AuthError();

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new AuthError();

  return { id: user.id, name: user.name, username: user.username };
}

// I due account applicativi (titolare e persona di fiducia) hanno per scelta
// di prodotto gli stessi permessi: non esistono ruoli distinti lato accesso.
// La funzione esiste comunque come punto unico da cui partire il giorno in
// cui servisse un accesso a permessi ridotti.
export async function requireManager(): Promise<CurrentUser> {
  return requireUser();
}
