"use client";

import { ConfirmSheet } from "@/components/confirm-sheet";
import { useMemo, useState, useTransition } from "react";
import { useBackdropClose } from "@/lib/use-backdrop-close";
import { useRouter } from "next/navigation";
import { dayLabel, formatDayMonth, isToday, parseDateKey, toDateKey } from "@/lib/week";
import { buildSchedule, formatHours, type Block, type Closure, type Leave, type Role } from "@/lib/schedule";
import { EmployeeAvatar } from "@/components/avatar";
import { useToast, runWithToast } from "@/components/toast";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { plural } from "@/lib/plural";
import {
  deleteEmployee,
  getEmployeeDeletionImpact,
  moveEmployee,
  setEmployeeBookingsAccess,
  setEmployeeMenuAccess,
  setEmployeeVenueDevice,
  toggleEmployeeActive,
  updateEmployee,
} from "./actions";
import { PdfExportModal } from "./pdf-export-modal";
import { PhotoEditor } from "./photo-editor";
import { EmployeeCredentials } from "./employee-credentials";
import { VENUE_SWITCH_HINT, VENUE_SWITCH_LABEL, VenueDeviceCard } from "./venue-device";
import { ApprovedMonths, PendingMonths, type ApprovedMonth, type PendingMonth, type ReopenedMonth } from "./pending-months";
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
  canEditMenu: boolean;
  canManageBookings: boolean;
  isVenueDevice?: boolean;
  pendingSubmissions: PendingMonth[];
  reopenedSubmissions: ReopenedMonth[];
  approvedSubmissions: ApprovedMonth[];
};

export function EmployeeList({
  employees: everyone,
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
  // Il «Telefono enoteca» non è una persona: scheda a parte, mai tra i dipendenti.
  const employees = useMemo(() => everyone.filter((e) => !e.isVenueDevice), [everyone]);
  const devices = everyone.filter((e) => e.isVenueDevice);
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

  const venueSection =
    devices.length > 0 ? (
      <section aria-label="Telefono dell'enoteca">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Telefono dell&apos;enoteca</h2>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          {devices.map((d) => (
            <VenueDeviceCard key={d.id} device={d} />
          ))}
        </div>
      </section>
    ) : null;

  if (employees.length === 0) {
    return (
      <>
      {venueSection}
      <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
        Nessun dipendente ancora. Aggiungine uno qui sopra.
      </p>
      </>
    );
  }

  const active = employees.filter((e) => e.active);
  const inactive = employees.filter((e) => !e.active);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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

      {venueSection}

      {inactive.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Disattivati</h2>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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
  // Sul telefono la scheda resta chiusa (nome, ore e mesi da approvare): settimana,
  // accesso e azioni si aprono con un tocco. Dal tablet in su è sempre aperta.
  const [open, setOpen] = useState(false);
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

  function toggleMenuAccess() {
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => setEmployeeMenuAccess(employee.id, !employee.canEditMenu),
        employee.canEditMenu ? "Non può più modificare il menù" : "Ora può modificare il menù",
      );
      if (result !== null) router.refresh();
    });
  }

  function toggleBookingsAccess() {
    startTransition(async () => {
      const result = await runWithToast(
        toast,
        () => setEmployeeBookingsAccess(employee.id, !employee.canManageBookings),
        employee.canManageBookings ? "Non può più gestire le prenotazioni" : "Ora può gestire le prenotazioni",
      );
      if (result !== null) router.refresh();
    });
  }

  // Disattivare lo toglie dagli orari: prima si chiede conferma (riattivare no).
  const [askDeactivate, setAskDeactivate] = useState(false);
  const [askVenue, setAskVenue] = useState(false);
  function toggleActive() {
    setAskDeactivate(false);
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
        {/* Area di tocco di 40×40px sul telefono (dal tablet in su, col
            mouse, bastano 32px), con un piccolo distacco tra i due. */}
        <div className="-ml-2 flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            disabled={isFirst || pending}
            onClick={() => move("up")}
            aria-label="Sposta su"
            className="flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-20 sm:h-8 sm:w-8"
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
            className="flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-20 sm:h-8 sm:w-8"
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
                // Solo blur, non anche saveName(): smontare qui il campo (via
                // saveName -> setEditingName(false)) fa comunque scattare un
                // blur nativo un istante dopo, che richiamerebbe saveName()
                // una seconda volta con lo stesso valore — doppia richiesta
                // al server e doppio toast per un singolo Invio.
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="w-full max-w-[12rem] rounded-lg border border-accent bg-surface-2 px-2 py-1 text-sm text-foreground outline-none"
              />
            ) : (
              <button type="button" onClick={() => setEditingName(true)} className="min-w-0 text-left text-sm font-medium text-foreground [overflow-wrap:anywhere] hover:underline" title="Rinomina">
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
              // L'area di tocco è alta 40px (margini negativi per non
              // allargare la riga), l'etichetta visibile resta piccola.
              className="group -my-2 flex min-h-10 shrink-0 items-center"
            >
              <span
                className={
                  employee.role === "OWNER"
                    ? "rounded-full bg-gold/15 px-2 py-1 text-[11px] font-medium text-gold group-hover:bg-gold/25"
                    : "rounded-full border border-dashed border-border px-2 py-1 text-[11px] font-medium text-foreground-muted group-hover:border-accent group-hover:text-foreground"
                }
              >
                {employee.role === "OWNER" ? "Titolare" : "Rendi titolare"}
              </span>
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
              // Vedi lo stesso commento sul campo nome qui sopra.
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder="es. Responsabile sala"
              className="mt-0.5 w-full max-w-[12rem] rounded border border-accent bg-surface-2 px-1.5 py-0.5 text-xs outline-none"
            />
          ) : (
            <button type="button" onClick={() => setEditingTitle(true)} className="mt-0.5 block truncate text-left text-xs text-foreground-muted hover:underline" title="Imposta una mansione">
              {employee.jobTitle || "+ aggiungi mansione"}
            </button>
          )}
        </div>

        {employee.active && employee.role !== "OWNER" && (
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold leading-none text-foreground">{formatHours(schedule.employeeHours(employee.id)).replace(" h", "")}</p>
            <p className="text-[10px] text-foreground-muted">ore questa settimana</p>
          </div>
        )}
      </div>

      {employee.role === "EMPLOYEE" && (employee.pendingSubmissions.length > 0 || employee.reopenedSubmissions.length > 0) && (
        <PendingMonths
          employeeId={employee.id}
          employeeName={employee.name}
          submissions={employee.pendingSubmissions}
          reopened={employee.reopenedSubmissions}
        />
      )}

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-border px-4 text-left text-xs font-medium text-foreground-muted"
      >
        <span>{open ? "Chiudi i dettagli" : employee.active ? "Settimana, accesso e azioni" : "Azioni"}</span>
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div className={open ? "" : "hidden"}>
      {employee.active && (
        <div className="divide-y divide-border">
          {weekDays.map((d) => {
            const dateKey = toDateKey(d);
            const entry = schedule.entry(employee.id, dateKey);
            return (
              <div key={dateKey} className={`flex items-center justify-between gap-3 px-4 py-1.5 ${isToday(d) ? "bg-accent/[0.04]" : ""}`}>
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  {dayLabel(d)} <span className="font-normal normal-case text-foreground-muted">{formatDayMonth(d)}</span>
                  {isToday(d) && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="Oggi" />}
                </span>
                <DayCellContent entry={entry} align="right" readOnly />
              </div>
            );
          })}
        </div>
      )}

      {employee.role === "EMPLOYEE" && employee.approvedSubmissions.length > 0 && (
        <ApprovedMonths employeeId={employee.id} months={employee.approvedSubmissions} />
      )}

      {employee.role === "EMPLOYEE" && (
        <EmployeeCredentials employeeId={employee.id} username={employee.username} password={employee.password} />
      )}

      {employee.role === "EMPLOYEE" && employee.active && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Può modificare il menù</p>
            <p className="text-[11px] text-foreground-muted">Esaurito, voci, prezzi e gruppi del menù pubblico</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={employee.canEditMenu}
            aria-label={`Può modificare il menù: ${employee.name}`}
            disabled={pending}
            onClick={toggleMenuAccess}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              employee.canEditMenu ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                employee.canEditMenu ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      )}

      {employee.role === "EMPLOYEE" && employee.active && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Può gestire le prenotazioni</p>
            <p className="text-[11px] text-foreground-muted">Vede le richieste di tavolo, risponde e riceve gli avvisi</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={employee.canManageBookings}
            aria-label={`Può gestire le prenotazioni: ${employee.name}`}
            disabled={pending}
            onClick={toggleBookingsAccess}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              employee.canManageBookings ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                employee.canManageBookings ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      )}

      {employee.role === "EMPLOYEE" && employee.active && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{VENUE_SWITCH_LABEL}</p>
            <p className="text-[11px] text-foreground-muted">{VENUE_SWITCH_HINT}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={false}
            aria-label={`${VENUE_SWITCH_LABEL}: ${employee.name}`}
            disabled={pending}
            onClick={() => setAskVenue(true)}
            className="relative h-6 w-11 shrink-0 rounded-full bg-surface-2 ring-1 ring-inset ring-border transition-colors disabled:opacity-60"
          >
            <span aria-hidden className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" />
          </button>
        </div>
      )}
      {askVenue && (
        <ConfirmSheet
          title={`Rendere «${employee.name}» il telefono enoteca?`}
          confirmLabel="Sì, è il telefono della sala"
          busy={pending}
          onConfirm={() => {
            setAskVenue(false);
            startTransition(async () => {
              const r = await runWithToast(toast, () => setEmployeeVenueDevice(employee.id, true), "Ora è il telefono enoteca");
              if (r !== null) router.refresh();
            });
          }}
          onCancel={() => setAskVenue(false)}
        >
          <p>Esce da orari, ore, ferie e mesi da inviare; tiene solo le prenotazioni e i widget della sala. Serve per l&apos;accesso del telefono che resta in sala, non per una persona.</p>
        </ConfirmSheet>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        {confirmingDelete ? (
          <div className="w-full">
            <p className="text-xs text-foreground-muted">
              {deletionImpact === null
                ? "Controllo dati collegati…"
                : deletionImpact.shifts + deletionImpact.leaves + deletionImpact.balances === 0
                  ? `Eliminare definitivamente ${employee.name}? Non ci sono dati collegati.`
                  : `Eliminando ${employee.name} verranno rimossi anche ${plural(deletionImpact.shifts, "turno", "turni")}, ${plural(deletionImpact.leaves, "voce di ferie/permessi", "voci di ferie/permessi")} e ${plural(deletionImpact.balances, "saldo collegato", "saldi collegati")}. Per il personale storico è preferibile disattivare invece di eliminare.`}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted">
                Annulla
              </button>
              <button
                type="button"
                disabled={pending || deletionImpact === null}
                onClick={confirmDelete}
                className="min-h-11 rounded-full bg-danger px-4 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
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
                className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
              >
                PDF
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => (employee.active ? setAskDeactivate(true) : toggleActive())}
                className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                {employee.active ? "Disattiva" : "Riattiva"}
              </button>
              {askDeactivate && (
                <ConfirmSheet
                  title={`Disattivare ${employee.name}?`}
                  confirmLabel="Sì, disattiva"
                  danger
                  onConfirm={toggleActive}
                  onCancel={() => setAskDeactivate(false)}
                >
                  <p>Potrà solo vedere le sue ore passate; non comparirà più negli orari. I suoi dati restano: puoi riattivarlo quando vuoi.</p>
                </ConfirmSheet>
              )}
            </div>
            <button
              type="button"
              onClick={openDeleteConfirm}
              className="min-h-11 text-xs font-medium text-foreground-muted hover:text-danger"
              title="Elimina definitivamente"
            >
              Elimina definitivamente
            </button>
          </>
        )}
      </div>
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

  const backdrop = useBackdropClose(() => !pending && onClose());
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm" {...backdrop}>
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
              className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Confermo…" : "Sì, cambia ruolo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
