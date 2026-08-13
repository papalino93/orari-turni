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
          return { id: user.id, name: user.name, username: user.username, role: "ADMIN" };
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
          };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { username: string; role: "ADMIN" | "EMPLOYEE"; employeeId?: string };
        token.username = u.username;
        token.role = u.role;
        token.employeeId = u.employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.username = token.username as string;
        session.user.role = token.role as "ADMIN" | "EMPLOYEE";
        session.user.employeeId = token.employeeId as string | undefined;
      }
      return session;
    },
  },
};
