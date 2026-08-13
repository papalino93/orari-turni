"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast, runWithToast } from "@/components/toast";
import { setLeaveBalance } from "./actions";
import type { LeaveSummary } from "@/lib/leave";
import type { LeaveBalance } from "@prisma/client";

type Section = { summary: LeaveSummary; balance: LeaveBalance | null };

export function LeaveCard({
  employee,
  year,
  ferie,
  permesso,
  readOnly = false,
}: {
  employee: { id: string; name: string; active: boolean };
  year: number;
  ferie: Section;
  permesso: Section;
  readOnly?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{employee.name}</h2>
        {!employee.active && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground-muted">Disattivato</span>
        )}
      </div>
      <div className="divide-y divide-border">
        <LeaveTypeRow employeeId={employee.id} type="FERIE" label="Ferie" unit="giorni" year={year} section={ferie} readOnly={readOnly} />
        <LeaveTypeRow employeeId={employee.id} type="PERMESSO" label="Permessi / ROL" unit="ore" year={year} section={permesso} readOnly={readOnly} />
      </div>
    </div>
  );
}

function LeaveTypeRow({
  employeeId,
  type,
  label,
  unit,
  year,
  section,
  readOnly,
}: {
  employeeId: string;
  type: "FERIE" | "PERMESSO";
  label: string;
  unit: string;
  year: number;
  section: Section;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [opening, setOpening] = useState(section.balance?.openingBalance.toString() ?? "0");
  const [rate, setRate] = useState(section.balance?.monthlyAccrualRate.toString() ?? "0");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function save() {
    const o = Number(opening);
    const r = Number(rate);
    if (Number.isNaN(o) || Number.isNaN(r)) {
      toast.showError("Inserisci numeri validi.");
      return;
    }
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => setLeaveBalance(employeeId, type, year, o, r, "inserito manualmente"),
        "Saldo aggiornato",
      );
      if (result !== null) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
        {!readOnly && (
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs font-medium text-accent hover:text-accent-hover">
            {section.summary.hasData ? "Modifica saldo" : "Imposta saldo"}
          </button>
        )}
      </div>

      {!section.summary.hasData && !editing && <p className="text-sm text-foreground-muted">Dati non ancora caricati.</p>}

      {section.summary.hasData && !editing && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Maturati" value={section.summary.maturato} unit={unit} />
          <Stat label="Goduti" value={section.summary.goduto} unit={unit} />
          <Stat label="Programmati" value={section.summary.programmato} unit={unit} />
          <Stat label="Residui" value={section.summary.residuo} unit={unit} highlight />
          <Stat label="Residui previsti al 31/12" value={section.summary.residuoAl31Dic} unit={unit} className="col-span-2 sm:col-span-4" />
        </div>
      )}

      {editing && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-2 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-foreground-muted">Residuo di partenza ({unit})</span>
            <input
              type="number"
              step="0.5"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-foreground-muted">Maturazione mensile ({unit}/mese)</span>
            <input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Salvo…" : "Salva"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground-muted">
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight,
  className,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "bg-accent/10" : "bg-surface-2"} ${className ?? ""}`}>
      <p className="text-[10px] uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-accent" : "text-foreground"}`}>
        {value} <span className="text-xs font-normal text-foreground-muted">{unit}</span>
      </p>
    </div>
  );
}
