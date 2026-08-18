import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { decryptEmployeePassword } from "@/lib/employee-credentials";

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
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // Titolare/consulente: account condivisi, pieno accesso — invariato.
        const user = await prisma.user.findFirst({
          where: { username: { equals: credentials.username, mode: "insensitive" } },
        });
        if (user) {
          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!valid) return null;
          return { id: user.id, name: user.name, username: user.username, role: "ADMIN", tokenVersion: user.tokenVersion };
        }

        // Dipendente: stesso form di login, username/password assegnati dal
        // titolare (vedi lib/employee-credentials.ts). Un dipendente
        // disattivato può ancora accedere — l'area riservata stessa decide
        // cosa mostrargli (solo lo storico), non il login.
        const employee = await prisma.employee.findFirst({
          where: { username: { equals: credentials.username, mode: "insensitive" } },
        });
        if (employee?.username && employee.password) {
          let stored: string;
          try {
            stored = decryptEmployeePassword(employee.password);
          } catch {
            return null;
          }
          if (stored !== credentials.password) return null;
          return {
            id: employee.id,
            name: employee.name,
            username: employee.username,
            role: "EMPLOYEE",
            employeeId: employee.id,
            tokenVersion: employee.tokenVersion,
          };
        }

        return null;
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
        const employee = await prisma.employee.findUnique({
          where: { id: token.employeeId as string },
          select: { tokenVersion: true },
        });
        if (!employee || employee.tokenVersion !== seenVersion) return { ...token, revoked: true };
      } else if (token.username) {
        const dbUser = await prisma.user.findUnique({
          where: { username: token.username as string },
          select: { tokenVersion: true },
        });
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
