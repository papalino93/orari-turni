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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username: string;
    role: "ADMIN" | "EMPLOYEE";
    employeeId?: string;
  }
}
