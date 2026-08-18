import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name: string;
      username: string;
      role: "ADMIN" | "EMPLOYEE";
      // Presente solo per role "EMPLOYEE" — collega la sessione al suo
      // Employee (titolare/consulente non ne hanno bisogno, hanno accesso
      // pieno indipendentemente da un dipendente specifico).
      employeeId?: string;
    };
  }
  interface User {
    username: string;
    role: "ADMIN" | "EMPLOYEE";
    employeeId?: string;
    // Versione delle credenziali vista al login — vedi lib/auth.ts.
    tokenVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username: string;
    role: "ADMIN" | "EMPLOYEE";
    employeeId?: string;
    tokenVersion?: number;
    // Impostato dal callback jwt() quando la versione non corrisponde più a
    // quella in User/Employee (password cambiata altrove): il callback
    // session() lo usa per svuotare session.user.
    revoked?: boolean;
  }
}
