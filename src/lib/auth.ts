import { cache } from "react";
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { decryptEmployeePassword } from "@/lib/employee-credentials";
import { clientIp, loginBlocked, noteLoginFailure, noteLoginSuccess } from "@/lib/login-limit";

// Titolare/dipendente letti una volta sola per richiesta: getServerSession() (layout,
// pagina, azioni) e i controlli di guard.ts li rileggevano ognuno per conto suo, 3-4
// volte per ogni pagina. cache() di React vale solo per la richiesta in corso (fuori da
// una pagina o da un'azione, per esempio nelle route, non memorizza nulla), quindi una
// password cambiata o un permesso tolto si vedono già dalla richiesta successiva.
export const findUserByUsername = cache((username: string) => prisma.user.findUnique({ where: { username } }));
export const findEmployeeById = cache((id: string) => prisma.employee.findUnique({ where: { id } }));

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenziali",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        // Spazi prima/dopo il nome (tastiera del telefono, copia e incolla) non contano.
        const username = credentials?.username?.trim() ?? "";
        const password = credentials?.password ?? "";
        if (!username || !password) return null;

        // Troppi errori di fila per questo nome o da questo indirizzo: fermo per un
        // quarto d'ora, anche con la password giusta (vedi lib/login-limit.ts). Il
        // messaggio arriva così com'è alla pagina di accesso.
        const ip = clientIp(req?.headers);
        const blocked = loginBlocked(username, ip);
        if (blocked) throw new Error(blocked);
        const fail = () => {
          noteLoginFailure(username, ip);
          return null;
        };

        // Titolare/consulente: account condivisi, pieno accesso — invariato.
        const user = await prisma.user.findFirst({
          where: { username: { equals: username, mode: "insensitive" } },
        });
        if (user) {
          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return fail();
          noteLoginSuccess(username);
          return { id: user.id, name: user.name, username: user.username, role: "ADMIN", tokenVersion: user.tokenVersion };
        }

        // Dipendente: stesso form di login, username/password assegnati dal
        // titolare (vedi lib/employee-credentials.ts). Un dipendente
        // disattivato può ancora accedere — l'area riservata stessa decide
        // cosa mostrargli (solo lo storico), non il login.
        const employee = await prisma.employee.findFirst({
          where: { username: { equals: username, mode: "insensitive" } },
        });
        if (employee?.username && employee.password) {
          let stored: string;
          try {
            stored = decryptEmployeePassword(employee.password);
          } catch {
            return fail();
          }
          if (stored !== password) return fail();
          noteLoginSuccess(username);
          return {
            id: employee.id,
            name: employee.name,
            username: employee.username,
            role: "EMPLOYEE",
            employeeId: employee.id,
            tokenVersion: employee.tokenVersion,
          };
        }

        return fail();
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Login appena avvenuto: si fotografa la versione corrente delle
        // credenziali nel token, per confrontarla più avanti.
        const u = user as { username: string; role: "ADMIN" | "EMPLOYEE"; employeeId?: string; tokenVersion: number };
        token.username = u.username;
        token.role = u.role;
        token.employeeId = u.employeeId;
        token.tokenVersion = u.tokenVersion;
        return token;
      }

      // Non è un login nuovo: si rilegge la versione corrente da User o
      // Employee e si confronta con quella "vista" al login (0 se il token
      // è stato firmato prima che questo campo esistesse — coincide con il
      // valore di partenza in DB, così una sessione già aperta resta valida
      // finché la password non cambia davvero, invece di sloggare tutti al
      // primo deploy di questa modifica). Se non corrispondono più, la
      // password è stata cambiata (o le credenziali del dipendente
      // rigenerate/revocate) dopo l'emissione di questo token: è così che
      // un cambio password toglie l'accesso a chi ha già una sessione
      // valida, invece di lasciarlo dentro fino alla scadenza naturale del
      // token (fino a 30 giorni).
      const seenVersion = (token.tokenVersion as number | undefined) ?? 0;
      if (token.role === "EMPLOYEE" && token.employeeId) {
        const employee = await findEmployeeById(token.employeeId as string);
        if (!employee || employee.tokenVersion !== seenVersion) return { ...token, revoked: true };
      } else if (token.username) {
        const dbUser = await findUserByUsername(token.username as string);
        if (!dbUser || dbUser.tokenVersion !== seenVersion) return { ...token, revoked: true };
      }
      return token;
    },
    async session({ session, token }) {
      if (token.revoked) {
        // Sessione revocata: niente session.user, così requireUser() /
        // requireEmployee() (guard.ts) la trattano come non autenticata —
        // esattamente come un utente mai loggato — invece di continuare a
        // fidarsi di un token ormai superato.
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      if (session.user) {
        session.user.username = token.username as string;
        session.user.role = token.role as "ADMIN" | "EMPLOYEE";
        session.user.employeeId = token.employeeId as string | undefined;
      }
      return session;
    },
  },
};
