"use client";

import { useState, useTransition } from "react";
import { deleteEmployee, moveEmployee, renameEmployee, setJobTitle, toggleEmployeeActive } from "./actions";
import { PdfExportModal } from "./pdf-export-modal";
import type { Employee } from "@prisma/client";

export function EmployeeList({ employees }: { employees: Employee[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {employees.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-foreground-muted">
          Nessun dipendente ancora. Aggiungine uno qui sopra.
        </p>
      )}
      {employees.map((emp, i) => (
        <EmployeeRow
          key={emp.id}
          employee={emp}
          isFirst={i === 0}
          isLast={i === employees.length - 1}
        />
      ))}
    </div>
  );
}

function EmployeeRow({
  employee,
  isFirst,
  isLast,
}: {
  employee: Employee;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(employee.name);
  const [editingTitle, setEditingTitle] = useState(false);
  const [jobTitle, setJobTitleValue] = useState(employee.jobTitle ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showPdfExport, setShowPdfExport] = useState(false);
  const [pending, startTransition] = useTransition();

  function saveName() {
    setEditingName(false);
    if (name.trim() && name.trim() !== employee.name) {
      startTransition(() => renameEmployee(employee.id, name.trim()));
    } else {
      setName(employee.name);
    }
  }

  function saveJobTitle() {
    setEditingTitle(false);
    if (jobTitle.trim() !== (employee.jobTitle ?? "")) {
      startTransition(() => setJobTitle(employee.id, jobTitle.trim()));
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            disabled={isFirst || pending}
            onClick={() => startTransition(() => moveEmployee(employee.id, "up"))}
            aria-label="Sposta su"
            className="flex h-4 w-5 items-center justify-center text-foreground-muted hover:text-foreground disabled:opacity-20"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 6l7 9H5z" />
            </svg>
          </button>
          <button
            type="button"
            disabled={isLast || pending}
            onClick={() => startTransition(() => moveEmployee(employee.id, "down"))}
            aria-label="Sposta giù"
            className="flex h-4 w-5 items-center justify-center text-foreground-muted hover:text-foreground disabled:opacity-20"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 18l-7-9h14z" />
            </svg>
          </button>
        </div>

        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
            employee.role === "OWNER" ? "bg-gold/20 text-gold" : "bg-surface-2 text-foreground-muted"
          }`}
        >
          {employee.name.charAt(0).toUpperCase()}
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {editingName ? (
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
                onClick={() => setEditingName(true)}
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

          {editingTitle ? (
            <input
              autoFocus
              value={jobTitle}
              onChange={(e) => setJobTitleValue(e.target.value)}
              onBlur={saveJobTitle}
              onKeyDown={(e) => e.key === "Enter" && saveJobTitle()}
              placeholder="es. Responsabile sala"
              className="mt-0.5 w-full max-w-[14rem] rounded border border-accent bg-surface-2 px-1.5 py-0.5 text-xs outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="mt-0.5 block truncate text-left text-xs text-foreground-muted hover:underline"
              title="Imposta un ruolo (es. Responsabile sala)"
            >
              {employee.jobTitle || "+ aggiungi ruolo"}
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-foreground-muted">Eliminare definitivamente?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => deleteEmployee(employee.id))}
              className="rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Elimina
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted"
            >
              Annulla
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowPdfExport(true)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
            >
              PDF
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => toggleEmployeeActive(employee.id, !employee.active))}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              {employee.active ? "Disattiva" : "Riattiva"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-danger hover:text-danger"
              aria-label="Elimina dipendente"
              title="Elimina definitivamente"
            >
              ×
            </button>
          </>
        )}
      </div>

      {showPdfExport && (
        <PdfExportModal
          employeeId={employee.id}
          employeeName={employee.name}
          jobTitle={employee.jobTitle}
          onClose={() => setShowPdfExport(false)}
        />
      )}
    </div>
  );
}
