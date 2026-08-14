// Modello di dominio della pianificazione: una sola fonte dati per la vista
// per fascia oraria, la vista per dipendente, gli export e i riepiloghi.
// Nessuna delle viste ricalcola nulla per conto suo — se lo facessero,
// prima o poi mostrerebbero numeri diversi sugli stessi turni.

import { blockHours, sumHours, timeToMinutes, todayKey } from "@/lib/week";

export type Role = "EMPLOYEE" | "OWNER";
export type LeaveType = "FERIE" | "PERMESSO" | "LIBERO" | "MALATTIA";

export type Employee = {
  id: string;
  name: string;
  role: Role;
  jobTitle: string | null;
  sortOrder: number;
  photoVersion: string | null; // timestamp dell'ultima foto, null = nessuna foto
};

export type Block = {
  id: string;
  employeeId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  confirmed: boolean;
  // Presenti solo se un dipendente ha corretto o aggiunto questo turno
  // durante la revisione mensile (Area Dipendenti) — assenti per i turni
  // pianificati dal titolare, come sempre. Opzionali apposta: tutti i punti
  // che già costruiscono un Block senza questi campi restano validi.
  addedByEmployee?: boolean;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
};

export type Leave = {
  id: string;
  employeeId: string;
  dateKey: string;
  type: LeaveType;
  quantity: number;
};

export type Closure = { dateKey: string; reason: string | null };

// Stato di una casella giorno×dipendente. Sono concetti distinti e non vanno
// mai confusi tra loro: "locale chiuso" è un fatto della giornata, "riposo"
// riguarda il singolo dipendente a locale aperto.
export type DayKind =
  | "CHIUSO" // il locale non apre: nessun turno, nessuna ora, nessun riposo
  | "TURNO" // il dipendente lavora, con uno o due blocchi orario
  | "RIPOSO" // locale aperto, dipendente a riposo (LeaveType LIBERO)
  | "FERIE"
  | "PERMESSO"
  | "MALATTIA"
  | "NON_PIANIFICATO"; // locale aperto, nulla ancora deciso

export type DayEntry = {
  kind: DayKind;
  blocks: Block[]; // ordinati per orario; sempre vuoto se CHIUSO
  leave: Leave | null;
  hours: number; // 0 per tutto ciò che non è TURNO
  needsVerification: boolean; // turno passato non ancora verificato
  /** Turni rimasti sotto una chiusura: conservati, ignorati da ogni calcolo. */
  suspendedBlocks: Block[];
};

export const DAY_KIND_LABEL: Record<Exclude<DayKind, "TURNO">, string> = {
  CHIUSO: "Locale chiuso",
  RIPOSO: "Riposo",
  FERIE: "Ferie",
  PERMESSO: "Permesso",
  MALATTIA: "Malattia",
  NON_PIANIFICATO: "Non pianificato",
};

export function leaveTypeToKind(type: LeaveType): Exclude<DayKind, "TURNO" | "NON_PIANIFICATO"> {
  return type === "LIBERO" ? "RIPOSO" : type;
}

export function kindToLeaveType(kind: DayKind): LeaveType | null {
  if (kind === "RIPOSO") return "LIBERO";
  if (kind === "FERIE" || kind === "PERMESSO" || kind === "MALATTIA") return kind;
  return null;
}

// Etichetta di un'assenza a partire dai dati grezzi. Unica fonte per web,
// PNG e PDF: ricostruirla a mano faceva stampare "Ferie" anche per mezza
// giornata, cioè un giorno intero di ferie in un documento consegnato.
export function leaveLabelFor(type: LeaveType, quantity: number): string {
  if (type === "PERMESSO") return `Permesso ${formatHours(quantity)}`;
  if (type === "FERIE" && quantity !== 1) return `Ferie (${String(quantity).replace(".", ",")}g)`;
  return DAY_KIND_LABEL[leaveTypeToKind(type)];
}

// Etichetta breve di una casella, usata identica in web, export e PDF.
export function entryLabel(entry: DayEntry): string {
  if (entry.kind === "TURNO") {
    return entry.blocks.map((b) => `${b.startTime}–${b.endTime}`).join(" · ");
  }
  if (entry.leave) return leaveLabelFor(entry.leave.type, entry.leave.quantity);
  return DAY_KIND_LABEL[entry.kind];
}

export type Anomaly = {
  dateKey: string;
  employeeId: string | null;
  message: string;
};

export type Schedule = {
  dateKeys: string[];
  employees: Employee[];
  /** Stato della casella per dipendente e giorno. Mai null per una coppia valida. */
  entry: (employeeId: string, dateKey: string) => DayEntry;
  isClosed: (dateKey: string) => boolean;
  closureOf: (dateKey: string) => Closure | null;
  /** Ore effettive del dipendente sul periodo, chiusure escluse. */
  employeeHours: (employeeId: string) => number;
  /** Ore effettive del dipendente in un sotto-intervallo (es. una settimana dentro il mese), chiusure escluse. */
  hoursInRange: (employeeId: string, fromKey: string, toKey: string) => number;
  /** Ore di tutti i dipendenti in una giornata, 0 se chiusa. */
  dayHours: (dateKey: string) => number;
  /** Quante persone sono in turno in una data ora, 0 se la giornata è chiusa. */
  dayCoverage: (dateKey: string) => number[];
  /** Giorni aperti del periodo. */
  openDateKeys: string[];
  closedDateKeys: string[];
  totalHours: number;
  anomalies: Anomaly[];
  unverifiedPastBlocks: number;
};

const EMPTY_ENTRY: DayEntry = {
  kind: "NON_PIANIFICATO",
  blocks: [],
  leave: null,
  hours: 0,
  needsVerification: false,
  suspendedBlocks: [],
};

export function buildSchedule({
  dateKeys,
  employees,
  blocks,
  leaveEntries,
  closures,
  today = todayKey(),
}: {
  dateKeys: string[];
  employees: Employee[];
  blocks: Block[];
  leaveEntries: Leave[];
  closures: Closure[];
  today?: string;
}): Schedule {
  const closureByDate = new Map(closures.map((c) => [c.dateKey, c]));
  const ordered = employees.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const entries = new Map<string, DayEntry>();
  const key = (employeeId: string, dateKey: string) => `${employeeId}|${dateKey}`;

  const blocksByCell = new Map<string, Block[]>();
  for (const b of blocks) {
    const k = key(b.employeeId, b.dateKey);
    const list = blocksByCell.get(k);
    if (list) list.push(b);
    else blocksByCell.set(k, [b]);
  }
  const leaveByCell = new Map<string, Leave>();
  for (const l of leaveEntries) leaveByCell.set(key(l.employeeId, l.dateKey), l);

  for (const emp of ordered) {
    for (const dateKey of dateKeys) {
      const k = key(emp.id, dateKey);
      const cellBlocks = (blocksByCell.get(k) ?? [])
        .slice()
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const leave = leaveByCell.get(k) ?? null;

      // La chiusura vince su tutto: i turni eventualmente presenti restano
      // salvati ma sospesi, e non producono né ore né copertura né riposi.
      if (closureByDate.has(dateKey)) {
        entries.set(k, {
          kind: "CHIUSO",
          blocks: [],
          leave: null,
          hours: 0,
          needsVerification: false,
          suspendedBlocks: cellBlocks,
        });
        continue;
      }

      if (leave) {
        entries.set(k, {
          kind: leaveTypeToKind(leave.type),
          blocks: [],
          leave,
          hours: 0,
          needsVerification: false,
          suspendedBlocks: [],
        });
        continue;
      }

      if (cellBlocks.length === 0) {
        entries.set(k, EMPTY_ENTRY);
        continue;
      }

      entries.set(k, {
        kind: "TURNO",
        blocks: cellBlocks,
        leave: null,
        hours: sumHours(cellBlocks),
        needsVerification: dateKey < today && cellBlocks.some((b) => !b.confirmed),
        suspendedBlocks: [],
      });
    }
  }

  function entry(employeeId: string, dateKey: string): DayEntry {
    return entries.get(key(employeeId, dateKey)) ?? EMPTY_ENTRY;
  }

  const openDateKeys = dateKeys.filter((d) => !closureByDate.has(d));
  const closedDateKeys = dateKeys.filter((d) => closureByDate.has(d));

  function employeeHours(employeeId: string): number {
    return round(openDateKeys.reduce((sum, d) => sum + entry(employeeId, d).hours, 0));
  }

  function hoursInRange(employeeId: string, fromKey: string, toKey: string): number {
    return round(
      openDateKeys
        .filter((d) => d >= fromKey && d <= toKey)
        .reduce((sum, d) => sum + entry(employeeId, d).hours, 0),
    );
  }

  // Il titolare compare negli orari per la copertura ma non contribuisce al
  // monte ore: i totali aggregati devono escluderlo, come già fanno le viste
  // mese/anno e i PDF. `employeeHours` resta sul singolo dipendente e non
  // filtra, così la riga del titolare può comunque mostrare le sue ore.
  const countedForHours = ordered.filter((e) => e.role !== "OWNER");

  function dayHours(dateKey: string): number {
    if (closureByDate.has(dateKey)) return 0;
    return round(countedForHours.reduce((sum, e) => sum + entry(e.id, dateKey).hours, 0));
  }

  function dayCoverage(dateKey: string): number[] {
    if (closureByDate.has(dateKey)) return [];
    const dayBlocks = ordered.flatMap((e) => entry(e.id, dateKey).blocks);
    return coverageByHour(dayBlocks);
  }

  const totalHours = round(countedForHours.reduce((sum, e) => sum + employeeHours(e.id), 0));

  let unverifiedPastBlocks = 0;
  for (const emp of ordered) {
    for (const dateKey of openDateKeys) {
      const e = entry(emp.id, dateKey);
      if (e.needsVerification) unverifiedPastBlocks += e.blocks.filter((b) => !b.confirmed).length;
    }
  }

  return {
    dateKeys,
    employees: ordered,
    entry,
    isClosed: (dateKey) => closureByDate.has(dateKey),
    closureOf: (dateKey) => closureByDate.get(dateKey) ?? null,
    employeeHours,
    hoursInRange,
    dayHours,
    dayCoverage,
    openDateKeys,
    closedDateKeys,
    totalHours,
    anomalies: findAnomalies(ordered, dateKeys, entry, closureByDate, today),
    unverifiedPastBlocks,
  };
}

function findAnomalies(
  employees: Employee[],
  dateKeys: string[],
  entry: (employeeId: string, dateKey: string) => DayEntry,
  closureByDate: Map<string, Closure>,
  today: string,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const emp of employees) {
    for (const dateKey of dateKeys) {
      const e = entry(emp.id, dateKey);

      for (const b of e.blocks) {
        if (timeToMinutes(b.endTime) <= timeToMinutes(b.startTime)) {
          anomalies.push({
            dateKey,
            employeeId: emp.id,
            message: `${emp.name}: turno da completare (${b.startTime}–${b.endTime})`,
          });
        }
      }

      // Due blocchi che si sovrappongono significano quasi sempre un
      // pomeriggio inserito senza correggere la mattina. Si confronta con la
      // fine più tardiva vista finora, non solo con il blocco immediatamente
      // precedente: con 3+ blocchi in un giorno un confronto solo "a coppie
      // consecutive" perderebbe una sovrapposizione con un blocco più
      // indietro nell'elenco ordinato.
      const sorted = e.blocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
      let maxEndSoFar = sorted.length > 0 ? timeToMinutes(sorted[0].endTime) : 0;
      for (let i = 1; i < sorted.length; i++) {
        if (timeToMinutes(sorted[i].startTime) < maxEndSoFar) {
          anomalies.push({
            dateKey,
            employeeId: emp.id,
            message: `${emp.name}: due turni sovrapposti`,
          });
        }
        maxEndSoFar = Math.max(maxEndSoFar, timeToMinutes(sorted[i].endTime));
      }

      if (e.kind === "CHIUSO" && e.suspendedBlocks.length > 0) {
        anomalies.push({
          dateKey,
          employeeId: emp.id,
          message: `${emp.name}: turno sospeso, la giornata è chiusa`,
        });
      }
    }
  }

  // Giornata già passata, aperta, in cui non ha lavorato nessuno: o è
  // mancata la pianificazione, o in realtà quel giorno il locale era chiuso
  // e andava segnato come tale. Guardiamo solo al passato: una settimana
  // futura ancora da pianificare non è un'anomalia, è solo lavoro non
  // ancora fatto — segnalarla ogni volta finché non si pianifica sarebbe
  // solo rumore.
  for (const dateKey of dateKeys) {
    if (dateKey >= today) continue;
    if (closureByDate.has(dateKey)) continue;
    const anyWork = employees.some((e) => entry(e.id, dateKey).kind === "TURNO");
    if (!anyWork) {
      anomalies.push({
        dateKey,
        employeeId: null,
        message: "Giornata passata senza nessun turno registrato",
      });
    }
  }

  return anomalies;
}

// Orario di riferimento della copertura (fasce orarie di un'enoteca).
export const COVERAGE_START_HOUR = 8;
export const COVERAGE_END_HOUR = 24;

export function coverageByHour(blocks: { startTime: string; endTime: string }[]): number[] {
  const hours = COVERAGE_END_HOUR - COVERAGE_START_HOUR;
  const counts = new Array<number>(hours).fill(0);
  for (const b of blocks) {
    const start = timeToMinutes(b.startTime);
    const end = timeToMinutes(b.endTime);
    for (let h = 0; h < hours; h++) {
      const slotStart = (COVERAGE_START_HOUR + h) * 60;
      if (start < slotStart + 60 && end > slotStart) counts[h]++;
    }
  }
  return counts;
}

// Le due fasce fisse del locale: mattina fino alle 13, pomeriggio dopo.
export type Period = "mattina" | "pomeriggio";
export const PERIOD_LABEL: Record<Period, string> = { mattina: "Mattina", pomeriggio: "Pomeriggio" };
export const PERIODS: Period[] = ["mattina", "pomeriggio"];

export function periodOf(block: { startTime: string }): Period {
  return timeToMinutes(block.startTime) < 13 * 60 ? "mattina" : "pomeriggio";
}

// Stato della casella ristretto a una singola fascia: nella vista per fascia
// oraria un dipendente che lavora solo di mattina non è "a riposo" il
// pomeriggio, semplicemente non è in turno in quella fascia.
export function entryForPeriod(entry: DayEntry, period: Period): DayEntry {
  if (entry.kind !== "TURNO") return entry;
  const blocks = entry.blocks.filter((b) => periodOf(b) === period);
  if (blocks.length === 0) {
    return { ...EMPTY_ENTRY, kind: "NON_PIANIFICATO" };
  }
  return {
    ...entry,
    blocks,
    hours: sumHours(blocks),
    needsVerification: entry.needsVerification && blocks.some((b) => !b.confirmed),
  };
}

export function formatHours(hours: number): string {
  const rounded = round(hours);
  return Number.isInteger(rounded) ? `${rounded} h` : `${rounded.toString().replace(".", ",")} h`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export { blockHours, sumHours };
