"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, formatDayMonth, isToday, parseDateKey, toDateKey } from "@/lib/week";
import { buildSchedule, formatHours, type Block, type Closure, type Leave, type Role } from "@/lib/schedule";
import { EmployeeAvatar } from "@/components/avatar";
import { useToast, runWithToast } from "@/components/toast";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import {
  deleteEmployee,
  getEmployeeDeletionImpact,
  moveEmployee,
  toggleEmployeeActive,
  updateEmployee,
} from "./actions";
import { PdfExportModal } from "./pdf-export-modal";
import { PhotoEditor } from "./photo-editor";
import { EmployeeCredentials } from "./employee-credentials";
import { PendingMonths } from "./pending-months";
import { DayCellContent } from "../orari/shared";

type EmployeeRow = {
  id: string;
  name: string;
  role: Role;
  jobTitle: string | null;
  active: boolean;
  sortOrder: number;
  photoVersion: string | null;
  username: string | null;
  password: string | null;
  pendingSubmissions: { year: number; month: number; submittedAt: string | null }[];
};

export function EmployeeList({
  employees,
  dateKeys,
  blocks,
  leaveEntries,
  closures,
}: {
  employees: EmployeeRow[];
  dateKeys: string[];
  blocks: Block[];
  leaveEntries: Leave[];
  closures: Closure[];
}) {
  // Stessa fonte dati e stessa funzione (buildSchedule) usate da /orari:
  // costruita qui lato client perché uno Schedule contiene funzioni (entry,
  // isClosed, ...) che un Server Component non può passare a un componente
  // client come prop.
  const schedule = useMemo(
    () =>
      buildSchedule({
        dateKeys,
        employees: employees.filter((e) => e.active),
        blocks,
        leaveEntries,
        closures,
      }),
    [dateKeys, employees, blocks, leaveEntries, closures],
  );
  const weekDays = useMemo(() => dateKeys.map((k) => parseDateKey(k)), [dateKeys]);

  if (employees.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
        Nessun dipendente ancora. Aggiungine uno qui sopra.
      </p>
    );
  }

  const active = employees.filter((e) => e.active);
  const inactive = employees.filter((e) => !e.active);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {active.map((emp, i) => (
          <EmployeeCard
            key={emp.id}
            employee={emp}
            isFirst={i === 0}
            isLast={i === active.length - 1}
            weekDays={weekDays}
            schedule={schedule}
          />
        ))}
      </div>

      {inactive.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Disattivati</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inactive.map((emp, i) => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                isFirst={i === 0}
                isLast={i === inactive.length - 1}
                weekDays={weekDays}
                schedule={schedule}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeCard({
  employee,
  isFirst,
  isLast,
  weekDays,
  schedule,
}: {
  employee: EmployeeRow;
  isFirst: boolean;
  isLast: boolean;
  weekDays: Date[];
  schedule: ReturnType<typeof buildSchedule>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(employee.name);
  const [editingTitle, setEditingTitle] = useState(false);
  const [jobTitle, setJobTitleValue] = useState(employee.jobTitle ?? "");
  const [showRoleChange, setShowRoleChange] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<{ shifts: number; leaves: number; balances: number } | null>(null);
  const [showPdfExport, setShowPdfExport] = useState(false);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function saveName() {
    setEditingName(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== employee.name) {
      startTransition(async () => {
        await runWithToast(toast, () => updateEmployee(employee.id, { name: trimmed }), "Nome aggiornato");
        router.refresh();
      });
    } else {
      setName(employee.name);
    }
  }

  function saveJobTitle() {
    setEditingTitle(false);
    const trimmed = jobTitle.trim();
    if (trimmed !== (employee.jobTitle ?? "")) {
      startTransition(async () => {
        await runWithToast(toast, () => updateEmployee(employee.id, { jobTitle: trimmed }), "Mansione aggiornata");
        router.refresh();
      });
    }
  }

  async function openDeleteConfirm() {
    setConfirmingDelete(true);
    const result = await runWithToast(toast, () => getEmployeeDeletionImpact(employee.id), undefined);
    if (result) setDeletionImpact(result);
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => deleteEmployee(employee.id), `${employee.name} eliminato`);
      if (result !== null) router.refresh();
    });
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await runWithToast(toast, () => moveEmployee(employee.id, direction), undefined);
      if (result !== null) router.refresh();
    });
  }

  function changeRole() {
    const nextRole = employee.role === "OWNER" ? "EMPLOYEE" : "OWNER";
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => updateEmployee(employee.id, { role: nextRole }),
        nextRole === "OWNER" ? `${employee.name} è ora titolare` : `${employee.name} è ora dipendente`,
      );
      if (result !== null) {
        setShowRoleChange(false);
        router.refresh();
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => toggleEmployeeActive(employee.id, !employee.active),
        employee.active ? "Dipendente disattivato" : "Dipendente riattivato",
      );
      if (result !== null) router.refresh();
    });
  }

  return (
    <div className={`overflow-hidden rounded-2xl border bg-surface ${employee.active ? "border-border" : "border-border opacity-70"}`}>
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        {/* Prima 16×20px l'uno, appiccicati: quasi impossibile da toccare
            con precisione su un telefono. Ora un'area di tocco reale
            (28×28px, avvicinandosi alle linee guida di 44px senza sforare
            il layout della card), con un piccolo distacco tra i due. */}
        <div className="flex shrink-0 flex-col gap-0.5 pt-1">
          <button
            type="button"
            disabled={isFirst || pending}
            onClick={() => move("up")}
            aria-label="Sposta su"
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-20"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 6l7 9H5z" />
            </svg>
          </button>
          <button
            type="button"
            disabled={isLast || pending}
            onClick={() => move("down")}
            aria-label="Sposta giù"
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-20"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 18l-7-9h14z" />
            </svg>
          </button>
        </div>

        <button type="button" onClick={() => setShowPhotoEditor(true)} className="shrink-0" title="Modifica foto" aria-label="Modifica foto">
          <EmployeeAvatar employee={employee} size="lg" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {editingName ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="w-full max-w-[12rem] rounded-lg border border-accent bg-surface-2 px-2 py-1 text-sm text-foreground outline-none"
              />
            ) : (
              <button type="button" onClick={() => setEditingName(true)} className="truncate text-left text-sm font-medium text-foreground hover:underline" title="Rinomina">
                {employee.name}
              </button>
            )}
            {/* Il ruolo non era modificabile dopo la creazione: sbagliarlo
                per errore alla creazione (o doverlo cambiare più avanti)
                significava eliminare e ricreare il dipendente, perdendo
                turni/ferie storici collegati. Ora il badge/pulsante apre la
                spiegazione delle conseguenze prima di cambiarlo. */}
            <button
              type="button"
              onClick={() => setShowRoleChange(true)}
              title={employee.role === "OWNER" ? "Cambia in Dipendente" : "Cambia in Titolare"}
              className={
                employee.role === "OWNER"
                  ? "shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold hover:bg-gold/25"
                  : "shrink-0 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-foreground-muted hover:border-accent hover:text-foreground"
              }
            >
              {employee.role === "OWNER" ? "Titolare" : "Rendi titolare"}
            </button>
            {!employee.active && (
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground-muted">Disattivato</span>
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
              className="mt-0.5 w-full max-w-[12rem] rounded border border-accent bg-surface-2 px-1.5 py-0.5 text-xs outline-none"
            />
          ) : (
            <button type="button" onClick={() => setEditingTitle(true)} className="mt-0.5 block truncate text-left text-xs text-foreground-muted hover:underline" title="Imposta una mansione">
              {employee.jobTitle || "+ aggiungi ruolo"}
            </button>
          )}
        </div>

        {employee.active && employee.role !== "OWNER" && (
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold leading-none text-foreground">{formatHours(schedule.employeeHours(employee.id)).replace(" h", "")}</p>
            <p className="text-[10px] uppercase tracking-wide text-foreground-muted">ore/sett.</p>
          </div>
        )}
      </div>

      {employee.role === "EMPLOYEE" && employee.pendingSubmissions.length > 0 && (
        <PendingMonths employeeId={employee.id} submissions={employee.pendingSubmissions} />
      )}

      {employee.active && (
        <div className="divide-y divide-border">
          {weekDays.map((d) => {
            const dateKey = toDateKey(d);
            const entry = schedule.entry(employee.id, dateKey);
            return (
              <div key={dateKey} className={`flex items-center justify-between gap-3 px-4 py-1.5 ${isToday(d) ? "bg-accent/[0.04]" : ""}`}>
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  {dayLabel(d)} <span className="font-normal normal-case text-foreground-muted/70">{formatDayMonth(d)}</span>
                  {isToday(d) && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="Oggi" />}
                </span>
                <DayCellContent entry={entry} align="right" />
              </div>
            );
          })}
        </div>
      )}

      {employee.role === "EMPLOYEE" && (
        <EmployeeCredentials employeeId={employee.id} username={employee.username} password={employee.password} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        {confirmingDelete ? (
          <div className="w-full">
            <p className="text-xs text-foreground-muted">
              {deletionImpact === null
                ? "Controllo dati collegati…"
                : deletionImpact.shifts + deletionImpact.leaves + deletionImpact.balances === 0
                  ? `Eliminare definitivamente ${employee.name}? Non ci sono dati collegati.`
                  : `Eliminando ${employee.name} verranno rimossi anche ${deletionImpact.shifts} turni, ${deletionImpact.leaves} voci di ferie/permessi e ${deletionImpact.balances} saldi collegati. Per il personale storico è preferibile disattivare invece di eliminare.`}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted">
                Annulla
              </button>
              <button
                type="button"
                disabled={pending || deletionImpact === null}
                onClick={confirmDelete}
                className="rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Elimina definitivamente
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
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
                onClick={toggleActive}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                {employee.active ? "Disattiva" : "Riattiva"}
              </button>
            </div>
            <button
              type="button"
              onClick={openDeleteConfirm}
              className="text-xs font-medium text-foreground-muted/70 hover:text-danger"
              title="Elimina definitivamente"
            >
              Elimina definitivamente
            </button>
          </>
        )}
      </div>

      {showPdfExport && (
        <PdfExportModal
          employeeId={employee.id}
          employeeName={employee.name}
          jobTitle={employee.jobTitle}
          photoVersion={employee.photoVersion}
          onClose={() => setShowPdfExport(false)}
        />
      )}
      {showPhotoEditor && <PhotoEditor employee={employee} onClose={() => setShowPhotoEditor(false)} />}
      {showRoleChange && (
        <RoleChangeModal
          employeeName={employee.name}
          currentRole={employee.role}
          pending={pending}
          onConfirm={changeRole}
          onClose={() => setShowRoleChange(false)}
        />
      )}
    </div>
  );
}

// Le conseguenze delle due direzioni non sono simmetriche (una crea
// credenziali, l'altra le cancella) — vengono spiegate per esteso qui invece
// che in un badge/tooltip poco visibile, prima di far confermare la scelta.
function RoleChangeModal({
  employeeName,
  currentRole,
  pending,
  onConfirm,
  onClose,
}: {
  employeeName: string;
  currentRole: Role;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const toOwner = currentRole === "EMPLOYEE";
  useEscapeToClose(onClose, !pending);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={() => !pending && onClose()}>
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
        >
          <h2 className="text-base font-semibold text-foreground">
            {toOwner ? `Rendere ${employeeName} titolare?` : `Rendere ${employeeName} un dipendente?`}
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            {toOwner
              ? "Perderà l'accesso all'Area Dipendenti: username e password attuali verranno eliminati. Uscirà anche dalla gestione ferie/permessi e dal totale ore, come il titolare."
              : "Riceverà un nuovo username e password per l'Area Dipendenti (visibili nella sua scheda dopo la conferma) ed entrerà nella gestione ferie/permessi e nel totale ore."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Confermo…" : "Sì, cambia ruolo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
