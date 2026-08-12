"use client";

import { useState, useTransition } from "react";
import { renameEmployee, toggleEmployeeActive } from "./actions";
import type { Employee } from "@prisma/client";

export function EmployeeList({ employees }: { employees: Employee[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {employees.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-foreground-muted">
          Nessun dipendente ancora. Aggiungine uno qui sopra.
        </p>
      )}
      {employees.map((emp) => (
        <EmployeeRow key={emp.id} employee={emp} />
      ))}
    </div>
  );
}

function EmployeeRow({ employee }: { employee: Employee }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(employee.name);
  const [pending, startTransition] = useTransition();

  function saveName() {
    setEditing(false);
    if (name.trim() && name.trim() !== employee.name) {
      startTransition(() => renameEmployee(employee.id, name.trim()));
    } else {
      setName(employee.name);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
            employee.role === "OWNER" ? "bg-gold/20 text-gold" : "bg-surface-2 text-foreground-muted"
          }`}
        >
          {employee.name.charAt(0).toUpperCase()}
        </span>

        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="w-full max-w-[14rem] rounded-lg border border-accent bg-surface-2 px-2 py-1 text-sm text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="truncate text-left text-sm font-medium text-foreground hover:underline"
            title="Rinomina"
          >
            {employee.name}
          </button>
        )}

        {employee.role === "OWNER" && (
          <span className="hidden shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold sm:inline">
            Titolare
          </span>
        )}
        {!employee.active && (
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
            Disattivato
          </span>
        )}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => toggleEmployeeActive(employee.id, !employee.active))}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
      >
        {employee.active ? "Disattiva" : "Riattiva"}
      </button>
    </div>
  );
}
