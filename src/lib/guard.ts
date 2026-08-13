import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Ogni Server Action è di fatto un endpoint HTTP pubblico: l'id dell'azione
// è globale e può essere invocato da qualsiasi route, comprese quelle non
// coperte dal matcher del Proxy (es. /login). Il Proxy quindi non basta:
// ogni azione che legge o scrive deve verificare la sessione da sé.
// Questo è l'unico punto in cui farlo.

export type CurrentUser = { id: string; name: string; username: string };
export type CurrentEmployee = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  deactivatedAt: Date | null;
};

export class AuthError extends Error {
  constructor(message = "Sessione non valida. Esegui di nuovo l'accesso.") {
    super(message);
    this.name = "AuthError";
  }
}

// Restituisce l'utente della sessione corrente, verificando che esista
// ancora nel database: un token firmato resta valido fino alla scadenza
// anche se l'account nel frattempo è stato rimosso.
//
// Riservata a titolare/consulente (role "ADMIN"): ogni action di Orari,
// Dipendenti, Ferie & Permessi e Account passa da qui, ed è quello il
// confine reale che tiene fuori un login da dipendente — non solo la
// navigazione nascosta lato interfaccia. Per le action dell'Area
// Dipendenti vedi requireEmployee() sotto.
//
// Il controllo rifiuta solo role "EMPLOYEE" esplicito, non richiede che sia
// letteralmente "ADMIN": i cookie di sessione firmati prima dell'Area
// Dipendenti non hanno ancora questo campo (undefined), e appartengono per
// forza a titolare/consulente — quel valore non è mai esistito prima d'ora.
// Trattarli come non autorizzati sloggerebbe chiunque fosse già connesso
// nel momento in cui questa modifica va in produzione.
export async function requireUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "EMPLOYEE") throw new AuthError();
  const username = session.user.username;

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

// Per le poche action che titolare/consulente possono usare su QUALSIASI
// dipendente, e un dipendente può usare solo sui PROPRI dati — l'export del
// proprio orario, ad esempio, che esisteva già solo per il titolare e ora
// serve anche al dipendente per sé stesso. Non sostituisce requireUser()/
// requireEmployee(): le action esclusive di un ruolo continuano a usare quelle.
export async function requireSelfOrAdmin(employeeId: string): Promise<{ role: "ADMIN" | "EMPLOYEE" }> {
  const session = await getServerSession(authOptions);
  // Stesso motivo di requireUser() sopra: un ruolo non ancora presente nel
  // cookie (sessione firmata prima dell'Area Dipendenti) è per forza admin.
  if (session?.user && session.user.role !== "EMPLOYEE") return { role: "ADMIN" };
  if (session?.user?.role === "EMPLOYEE" && session.user.employeeId === employeeId) return { role: "EMPLOYEE" };
  throw new AuthError();
}

// Analoga a requireUser() ma per un login da dipendente (role "EMPLOYEE"):
// usata dalle action dell'Area Dipendenti, dove ognuno può leggere e
// modificare solo i propri dati (mai passare l'id di un altro dipendente).
export async function requireEmployee(): Promise<CurrentEmployee> {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "EMPLOYEE" || !session.user.employeeId) throw new AuthError();

  const employee = await prisma.employee.findUnique({ where: { id: session.user.employeeId } });
  if (!employee || !employee.username) throw new AuthError();

  return {
    id: employee.id,
    name: employee.name,
    username: employee.username,
    active: employee.active,
    deactivatedAt: employee.deactivatedAt,
  };
}
