"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  addYears,
  formatFullDate,
  formatMonthYear,
  formatWeekRange,
  isToday,
  parseDateKey,
  startOfWeek,
  toDateKey,
  todayKey,
} from "@/lib/week";
import { buildSchedule, type Block, type Closure, type Employee, type Leave } from "@/lib/schedule";
import { orderEmployees } from "./shared";
import { WeekBody } from "./week-grid";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { YearView } from "./year-view";
import { ExportButton } from "./export-button";
import { SummaryExportButton } from "./summary-export-button";
import { ClearWeekButton } from "./clear-week-button";
import { useToast, runWithToast } from "@/components/toast";
import { confirmPastShifts, setWeekPublished } from "./actions";

export type ViewMode = "day" | "week" | "month" | "year";
export type DisplayMode = "periods" | "employees";

const VIEW_LABELS: Record<ViewMode, string> = {
  day: "Giorno",
  week: "Settimana",
  month: "Mese",
  year: "Anno",
};

// Solo Giorno e Settimana permettono di inserire/modificare i turni: senza
// un segnale visivo sulle stesse linguette, non è ovvio quale vista usare
// per farlo — è capitato di dover spiegare "devi andare su Settimana".
const VIEW_EDITABLE: Record<ViewMode, boolean> = {
  day: true,
  week: true,
  month: false,
  year: false,
};

export function OrariView({
  view,
  displayMode,
  dateKey,
  rangeStartKey,
  rangeEndKey,
  employeeFilter,
  employees,
  blocks,
  leaveEntries,
  closures,
  weekPlan,
}: {
  view: ViewMode;
  displayMode: DisplayMode;
  dateKey: string;
  rangeStartKey: string;
  rangeEndKey: string;
  employeeFilter?: string;
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  closures: Closure[];
  weekPlan: { publishedAt: string | null };
}) {
  const router = useRouter();
  const date = parseDateKey(dateKey);
  const [confirming, startConfirming] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const toast = useToast();

  const rangeDateKeys = useMemo(() => {
    const keys: string[] = [];
    let cursor = parseDateKey(rangeStartKey);
    const end = parseDateKey(rangeEndKey);
    while (cursor <= end) {
      keys.push(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return keys;
  }, [rangeStartKey, rangeEndKey]);

  const schedule = useMemo(
    () => buildSchedule({ dateKeys: rangeDateKeys, employees, blocks, leaveEntries, closures }),
    [rangeDateKeys, employees, blocks, leaveEntries, closures],
  );

  function navigate(params: { view?: ViewMode; date?: string; employee?: string | null; mode?: DisplayMode }) {
    const search = new URLSearchParams();
    search.set("view", params.view ?? view);
    search.set("date", params.date ?? dateKey);
    const emp = params.employee === undefined ? employeeFilter : params.employee;
    if (emp) search.set("employee", emp);
    const mode = params.mode ?? displayMode;
    if (mode !== "periods") search.set("mode", mode);
    router.push(`/orari?${search.toString()}`);
  }

  function step(direction: 1 | -1) {
    let newDate: Date;
    switch (view) {
      case "day":
        newDate = addDays(date, direction);
        break;
      case "week":
        newDate = addDays(date, direction * 7);
        break;
      case "month":
        newDate = addMonths(date, direction);
        break;
      case "year":
        newDate = addYears(date, direction);
        break;
    }
    navigate({ date: toDateKey(newDate) });
  }

  const title =
    view === "day"
      ? capitalize(formatFullDate(date)) + (isToday(date) ? " — Oggi" : "")
      : view === "week"
        ? "Orari settimanali"
        : view === "month"
          ? "Orari mensili"
          : "Orari annuali";

  const subtitle =
    view === "day"
      ? null
      : view === "week"
        ? formatWeekRange(startOfWeek(date))
        : view === "month"
          ? formatMonthYear(date)
          : String(date.getUTCFullYear());

  const allEmployees = orderEmployees(employees);
  const weekStartKey = toDateKey(startOfWeek(date));
  // "Condiviso" non è più un interruttore manuale: si accende da solo
  // quando l'orario viene davvero esportato (PDF o immagine), e si spegne
  // da solo alla prima modifica successiva — vedi unpublishWeeksForDates
  // in actions.ts. Prima era un tasto scollegato da qualunque azione reale
  // ("che senso ha il tasto pubblica?"), e restava acceso anche su una
  // settimana appena svuotata. L'unico controllo manuale rimasto è
  // annullare una condivisione segnata per sbaglio.
  const isPublished = Boolean(weekPlan.publishedAt);

  function unshare() {
    startPublishing(async () => {
      const result = await runWithToast(toast, () => setWeekPublished(weekStartKey, false), "Segnato come non condiviso");
      if (result !== null) router.refresh();
    });
  }

  function verifyPast() {
    startConfirming(async () => {
      const result = await runWithToast(toast, () => confirmPastShifts(rangeStartKey, rangeEndKey, employeeFilter), undefined);
      if (result) {
        toast.showSuccess(result.verified > 0 ? `${result.verified} turni verificati` : "Nessun turno da verificare");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-foreground-muted">{subtitle}</p>}
        </div>
        {/* Due righe sempre "sicure" (flex-wrap, mai uno scroll che taglia
            qualcosa a metà) invece di un'unica striscia: navigazione
            (filtro, ‹/Oggi/›) e azioni (verifica, Invia orari, altro) sono
            due gruppi indipendenti — su ogni telefono comune ciascuno sta
            su una riga sola, e se proprio lo spazio non basta va a capo per
            intero (mai un pulsante mostrato a metà). Un primo tentativo con
            un'unica riga scorrevole lasciava "Invia orari" tagliato sul
            bordo come per errore; spostare solo "Svuota settimana" in un
            menu non bastava, perché con il badge "da verificare" presente
            si tagliava quello. "Svuota settimana" resta comunque nel menu
            "⋮": è l'azione più rara e distruttiva, non merita una pillola
            propria. */}
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={employeeFilter ?? ""}
              onChange={(e) => navigate({ employee: e.target.value || null })}
              aria-label="Filtra per dipendente"
              className="max-w-[7.5rem] rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted outline-none hover:border-accent hover:text-foreground"
            >
              <option value="">Tutti</option>
              {allEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => step(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
              aria-label="Precedente"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => navigate({ date: todayKey() })}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
            >
              Oggi
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
              aria-label="Successivo"
            >
              ›
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {schedule.unverifiedPastBlocks > 0 && (
              <button
                type="button"
                disabled={confirming}
                onClick={verifyPast}
                className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20"
                title="Segna come verificati i turni passati in questo periodo"
              >
                {confirming ? "Verifica…" : `⚠️ ${schedule.unverifiedPastBlocks} da verificare`}
              </button>
            )}
            {view === "week" && (
              <>
                <ExportButton
                  weekStartKey={weekStartKey}
                  employees={employees}
                  blocks={blocks}
                  leaveEntries={leaveEntries}
                  closures={closures}
                  employeeFilter={employeeFilter}
                />
                <MoreActionsMenu>
                  <ClearWeekButton weekStartKey={weekStartKey} variant="menuitem" />
                </MoreActionsMenu>
              </>
            )}
            {view === "month" && <SummaryExportButton monthDateKey={dateKey} employees={employees} blocks={blocks} closures={closures} />}
          </div>
        </div>
      </div>

      {(view === "week" || view === "day") && (
        <WeekSummary schedule={schedule} isPublished={isPublished} view={view} onUnshare={unshare} unsharing={publishing} />
      )}

      <div className="mb-3 flex flex-col gap-1.5">
        {/* Prima erano 4+2 linguette identiche affiancate su una riga: si
            leggevano come un unico gruppo di sei opzioni, non due controlli
            indipendenti (periodo vs. disposizione). Ora: un menu a tendina
            per il periodo (mostra subito se quella vista si può modificare)
            e, solo in Settimana, un piccolo menu ad hamburger per la
            disposizione — un pulsante compatto e ovviamente "altro menu",
            non un'altra fila di pillole uguali alle prime. */}
        <div className="flex flex-wrap items-center gap-2">
          <ViewSwitcher view={view} onSelect={(v) => navigate({ view: v })} />
          {view === "week" && <DisplayModeMenu mode={displayMode} onSelect={(m) => navigate({ mode: m })} />}
        </div>
        <p className="flex items-center gap-1 text-[11px] text-foreground-muted/80">
          {view === "day" || view === "week" ? (
            <>
              <EditPencilIcon className="shrink-0 text-accent" /> Tocca una casella per inserire o modificare un turno,
              riposo, ferie o permesso.
            </>
          ) : (
            "Sola lettura — riepiloga i totali. Passa a Giorno o Settimana (nel menu qui sopra) per modificare gli orari."
          )}
        </p>
      </div>

      {view === "day" && <DayView dateKey={dateKey} schedule={schedule} employeeFilter={employeeFilter} />}
      {view === "week" && (
        <WeekBody weekStartKey={weekStartKey} schedule={schedule} employeeFilter={employeeFilter} displayMode={displayMode} />
      )}
      {view === "month" && <MonthView monthDateKey={dateKey} schedule={schedule} employeeFilter={employeeFilter} />}
      {view === "year" && <YearView year={date.getUTCFullYear()} schedule={schedule} employeeFilter={employeeFilter} />}
    </div>
  );
}

function WeekSummary({
  schedule,
  isPublished,
  view,
  onUnshare,
  unsharing,
}: {
  schedule: ReturnType<typeof buildSchedule>;
  isPublished: boolean;
  view: ViewMode;
  onUnshare: () => void;
  unsharing: boolean;
}) {
  const staffCount = schedule.employees.filter((e) => e.role !== "OWNER").length;
  const anomalyCount = schedule.anomalies.length;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      {view === "week" &&
        (isPublished ? (
          <InfoPopoverBadge tone="success" label={<>🟢 Condiviso</>}>
            <p className="text-foreground">
              Questa settimana è stata esportata (PDF o immagine) e non è più stata modificata da allora — per questo
              risulta &ldquo;condivisa&rdquo; con lo staff.
            </p>
            <p className="mt-1 text-foreground-muted">
              Torna automaticamente &ldquo;non condivisa&rdquo; alla prima modifica di un turno in questa settimana.
            </p>
            <button
              type="button"
              onClick={onUnshare}
              disabled={unsharing}
              className="mt-2 text-success underline decoration-dotted hover:text-success/80"
            >
              {unsharing ? "Annullo…" : "Segna come non condivisa"}
            </button>
          </InfoPopoverBadge>
        ) : (
          <InfoPopoverBadge tone="neutral" label={<>○ Non condiviso</>}>
            <p className="text-foreground">Nessuno ha ancora ricevuto l&apos;orario di questa settimana.</p>
            <p className="mt-1 text-foreground-muted">
              Diventa &ldquo;condiviso&rdquo; da solo quando esporti questa settimana con &ldquo;Invia orari&rdquo; (PDF o
              immagine) — non serve nessun interruttore da ricordarsi di premere.
            </p>
          </InfoPopoverBadge>
        ))}
      <Badge tone="neutral">
        {staffCount} dipendent{staffCount === 1 ? "e" : "i"}
      </Badge>
      <Badge tone="neutral">{schedule.totalHours} h pianificate</Badge>
      {schedule.closedDateKeys.length > 0 && (
        <Badge tone="neutral">
          🔒 {schedule.closedDateKeys.length} giorn{schedule.closedDateKeys.length === 1 ? "o" : "i"} di chiusura
        </Badge>
      )}
      {anomalyCount > 0 ? (
        <InfoPopoverBadge tone="warning" label={<>⚠️ {anomalyCount} da controllare</>}>
          <p className="mb-1.5 font-medium text-foreground">Turni che vale la pena ricontrollare:</p>
          <ul className="space-y-1 text-foreground-muted">
            {schedule.anomalies.slice(0, 6).map((a, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden>·</span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
          {schedule.anomalies.length > 6 && (
            <p className="mt-1 text-foreground-muted">+ altr{schedule.anomalies.length - 6 === 1 ? "o" : "i"} {schedule.anomalies.length - 6}</p>
          )}
        </InfoPopoverBadge>
      ) : (
        <Badge tone="success">✓ 0 anomalie</Badge>
      )}
    </div>
  );
}

function Badge({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: "neutral" | "success" | "warning";
  title?: string;
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success-bg text-success"
      : tone === "warning"
        ? "border-gold/40 bg-gold/10 text-gold"
        : "border-border bg-surface text-foreground-muted";
  return (
    <span title={title} className={`rounded-full border px-2.5 py-1 font-medium ${cls}`}>
      {children}
    </span>
  );
}

// Prima queste due pillole (Condiviso / N da controllare) portavano solo un
// title="…" — una spiegazione visibile solo passandoci sopra col mouse, mai
// al tocco su telefono, quindi su mobile restavano due parole criptiche
// senza modo di capire cosa significassero. Ora sono pulsanti che aprono un
// piccolo pannello con la spiegazione (e, per le anomalie, l'elenco vero e
// proprio di cosa controllare) — funziona identico al tocco e al click.
function InfoPopoverBadge({
  children,
  tone,
  label,
}: {
  children: React.ReactNode;
  tone: "neutral" | "success" | "warning";
  label: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const cls =
    tone === "success"
      ? "border-success/30 bg-success-bg text-success"
      : tone === "warning"
        ? "border-gold/40 bg-gold/10 text-gold"
        : "border-border bg-surface text-foreground-muted";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${cls}`}
      >
        {label}
        <ChevronIcon className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[80vw] rounded-xl border border-border bg-surface p-3 text-xs normal-case shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EditPencilIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function PeriodsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="3" />
      <path d="M2 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15.5 14c2.5.3 4.5 2.2 4.5 5.5" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Chiude il pannello al primo click/tocco fuori, o con Esc — lo stesso
// comportamento di qualunque menu a tendina nativo del sistema operativo.
function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOutside();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, onOutside]);
}

// Prima Giorno/Settimana/Mese/Anno erano 4 linguette sempre tutte visibili:
// un vero e proprio menu a tendina (come richiesto) le sostituisce con un
// solo pulsante che mostra la vista corrente — meno elementi sullo schermo,
// e la lista che si apre mostra subito, per ognuna, se si può modificare o
// è di sola lettura (prima era un'informazione nascosta in un tooltip).
function ViewSwitcher({ view, onSelect }: { view: ViewMode; onSelect: (v: ViewMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
      >
        {VIEW_LABELS[view]}
        {VIEW_EDITABLE[view] && <EditPencilIcon className="text-accent" />}
        <ChevronIcon className={`text-foreground-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={v === view}
              onClick={() => {
                onSelect(v);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                v === view ? "bg-surface-2 text-foreground" : "text-foreground-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {VIEW_LABELS[v]}
              <span className="text-[10px] font-medium uppercase tracking-wide text-foreground-muted/60">
                {VIEW_EDITABLE[v] ? "Modifica" : "Sola lettura"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  periods: "Fasce orarie",
  employees: "Dipendenti",
};

// Controllo secondario (come disporre la stessa settimana), usato molto
// meno spesso del cambio periodo qui sopra: un pulsante a hamburger, come
// richiesto, invece dell'ennesima coppia di pillole identiche alle altre —
// segnala da solo "qui c'è dell'altro", senza pesare sulla riga.
function DisplayModeMenu({ mode, onSelect }: { mode: DisplayMode; onSelect: (m: DisplayMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
      >
        {mode === "periods" ? <PeriodsIcon /> : <PersonIcon />}
        {DISPLAY_MODE_LABELS[mode]}
        <ChevronIcon className={`text-foreground-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted/60">
            Visualizza per
          </p>
          {(Object.keys(DISPLAY_MODE_LABELS) as DisplayMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={m === mode}
              onClick={() => {
                onSelect(m);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                m === mode ? "text-foreground" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {m === "periods" ? <PeriodsIcon /> : <PersonIcon />}
              {DISPLAY_MODE_LABELS[m]}
              {m === mode && <CheckIcon className="ml-auto text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Contenitore generico per azioni secondarie/rare della toolbar (per ora
// solo "Svuota settimana", distruttiva e usata di rado): un'icona a puntini
// invece di un'altra pillola di testo, per tenere corta la riga di
// controlli su mobile. Allineato a destra (non a sinistra come gli altri
// menu qui sopra) perché è l'ultimo elemento della riga: aperto a sinistra
// finirebbe fuori dal bordo dello schermo.
function MoreActionsMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Altre azioni"
        title="Altre azioni"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-accent hover:text-foreground"
      >
        <DotsIcon />
      </button>
      {open && (
        // onClick sul contenitore, non sui singoli figli: chiude il menu
        // dopo qualsiasi azione al suo interno (i click sui figli risalgono
        // fin qui) senza dover passare un onClose a ogni voce.
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}
