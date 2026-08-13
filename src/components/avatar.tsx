"use client";

// Avatar del dipendente: foto se presente, altrimenti iniziali. Stesso
// componente ovunque (lista, scheda, vista per dipendente) così una foto
// caricata una volta compare identica in tutta l'app.

import { useState } from "react";

const SIZES = {
  sm: { box: "h-7 w-7", text: "text-[11px]" },
  md: { box: "h-9 w-9", text: "text-sm" },
  lg: { box: "h-14 w-14", text: "text-lg" },
  xl: { box: "h-20 w-20", text: "text-2xl" },
};

export function EmployeeAvatar({
  employee,
  size = "md",
  className = "",
}: {
  employee: { id: string; name: string; photoVersion: string | null; role?: "EMPLOYEE" | "OWNER" };
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { box, text } = SIZES[size];
  const gold = employee.role === "OWNER";
  // Se il caricamento della foto fallisce (rete, riferimento non più
  // valido) si torna all'iniziale invece di lasciare un'icona rotta.
  const [loadFailed, setLoadFailed] = useState(false);

  if (employee.photoVersion && !loadFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto caricata dall'utente, servita da una route interna
      <img
        src={`/api/employee-photo/${employee.id}?v=${employee.photoVersion}`}
        alt={employee.name}
        onError={() => setLoadFailed(true)}
        className={`${box} shrink-0 rounded-full object-cover ring-1 ring-border ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full font-medium ${text} ${
        gold ? "bg-gold/20 text-gold" : "bg-surface-2 text-foreground-muted"
      } ${className}`}
      aria-hidden
    >
      {initials(employee.name)}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
