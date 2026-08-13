"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireSelfOrAdmin } from "@/lib/guard";
import {
  assert,
  dateKeyToDate,
  parseDateKey,
  parseEnum,
  parseId,
  parseText,
  runAction,
  type ActionResult,
} from "@/lib/validation";
import { toDateKey } from "@/lib/week";
import { encryptEmployeePassword, generateEmployeePassword, generateEmployeeUsername } from "@/lib/employee-credentials";

const ROLES = ["EMPLOYEE", "OWNER"] as const;

// Limite volutamente basso: la foto viene già ridimensionata lato client a un
// quadrato piccolo (vedi lib/photo.ts), quindi qualsiasi cosa più grande o
// non è passata da lì o non è quello che dice di essere.
const MAX_PHOTO_BYTES = 400 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function revalidateEmployees() {
  revalidatePath("/dipendenti");
  revalidatePath("/orari");
  revalidatePath("/ferie");
}

export async function createEmployee(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const name = parseText(formData.get("name"), "nome", { max: 80, required: true });
    const role = parseEnum(formData.get("role") ?? "EMPLOYEE", ROLES, "ruolo");
    const jobTitle = parseText(formData.get("jobTitle"), "mansione", { max: 60 });

    const last = await prisma.employee.findFirst({ orderBy: { sortOrder: "desc" } });

    // Solo i dipendenti (non il titolare, che ha già un account pieno nella
    // tabella User) ricevono un accesso all'Area Dipendenti — creato subito,
    // non su richiesta: username e password compaiono già pronti in questa
    // pagina appena il dipendente è salvato.
    const credentials =
      role === "EMPLOYEE"
        ? { username: await generateEmployeeUsername(name), password: encryptEmployeePassword(generateEmployeePassword()) }
        : {};

    await prisma.employee.create({
      data: { name, role, jobTitle: jobTitle || null, sortOrder: (last?.sortOrder ?? -1) + 1, ...credentials },
    });
    revalidateEmployees();
  });
}

export async function moveEmployee(idInput: string, directionInput: "up" | "down"): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const direction = parseEnum(directionInput, ["up", "down"] as const, "direzione");

    const target = await prisma.employee.findUnique({ where: { id } });
    assert(target, "Dipendente non trovato.");

    // La UI mostra due liste separate — dipendenti attivi e "Disattivati" —
    // e i pulsanti su/giù sono abilitati in base alla posizione dentro la
    // lista visibile. Se lo scambio avvenisse sull'ordinamento globale, un
    // dipendente disattivato "nascosto" in mezzo potrebbe finire scambiato
    // al posto di quello visibile: il click sembrerebbe non fare nulla.
    // Per questo la riga da spostare si cerca solo tra i dipendenti con lo
    // stesso stato attivo/disattivato del dipendente selezionato.
    const siblings = await prisma.employee.findMany({
      where: { active: target.active },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const index = siblings.findIndex((e) => e.id === id);
    assert(index !== -1, "Dipendente non trovato.");
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= siblings.length) return;

    const a = siblings[index];
    const b = siblings[swapWith];
    // Gli ordinamenti storici possono avere valori uguali: in quel caso lo
    // scambio non sposterebbe nulla, quindi si riscrive l'ordine del gruppo
    // per intero (senza toccare il sortOrder degli altri dipendenti).
    const reordered = siblings.slice();
    reordered[index] = b;
    reordered[swapWith] = a;
    await prisma.$transaction(
      reordered.map((emp, i) => prisma.employee.update({ where: { id: emp.id }, data: { sortOrder: i } })),
    );
    revalidateEmployees();
  });
}

export async function updateEmployee(
  idInput: string,
  fields: { name?: string; jobTitle?: string; role?: "EMPLOYEE" | "OWNER" },
): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    const data: { name?: string; jobTitle?: string | null; role?: "EMPLOYEE" | "OWNER" } = {};
    if (fields.name !== undefined) data.name = parseText(fields.name, "nome", { max: 80, required: true });
    if (fields.jobTitle !== undefined) {
      data.jobTitle = parseText(fields.jobTitle, "mansione", { max: 60 }) || null;
    }
    if (fields.role !== undefined) data.role = parseEnum(fields.role, ROLES, "ruolo");

    if (Object.keys(data).length === 0) return;
    await prisma.employee.update({ where: { id }, data });
    revalidateEmployees();
  });
}

export async function toggleEmployeeActive(idInput: string, activeInput: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const active = Boolean(activeInput);
    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    // deactivatedAt segna il confine "vede solo il passato" dell'Area
    // Dipendenti: si azzera alla riattivazione, non un semplice storico di
    // quando è stato disattivato l'ultima volta.
    await prisma.employee.update({ where: { id }, data: { active, deactivatedAt: active ? null : new Date() } });
    revalidateEmployees();
  });
}

// --- Credenziali Area Dipendenti --------------------------------------------

export async function updateEmployeeUsername(idInput: string, usernameInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const username = parseText(usernameInput, "username", { max: 40, required: true }).toLowerCase();
    assert(/^[a-z0-9.]+$/.test(username), "Lo username può contenere solo lettere minuscole, numeri e punti.");

    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    const clash = await prisma.employee.findFirst({ where: { username, id: { not: id } } });
    assert(!clash, "Username già in uso da un altro dipendente.");

    await prisma.employee.update({ where: { id }, data: { username } });
    revalidateEmployees();
  });
}

export async function setEmployeePassword(idInput: string, passwordInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const password = parseText(passwordInput, "password", { max: 60, required: true });
    assert(password.length >= 4, "La password deve avere almeno 4 caratteri.");

    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    await prisma.employee.update({ where: { id }, data: { password: encryptEmployeePassword(password) } });
    revalidateEmployees();
  });
}

// Genera una nuova password "a tema vino" senza doverla inventare a mano —
// resta comunque modificabile liberamente con setEmployeePassword qui sopra.
export async function regenerateEmployeePassword(idInput: string): Promise<ActionResult<{ password: string }>> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    const password = generateEmployeePassword();
    await prisma.employee.update({ where: { id }, data: { password: encryptEmployeePassword(password) } });
    revalidateEmployees();
    return { password };
  });
}

// --- Revisione mensile del dipendente (Area Dipendenti) ---------------------

// Inviato → Approvato: le ore di quel mese sono confermate, il dipendente
// non può più modificarle (vedi saveDayEntry in orari/actions.ts).
export async function approveMonth(idInput: string, year: number, month: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const employeeId = parseId(idInput, "dipendente");

    const submission = await prisma.monthlySubmission.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
    });
    assert(submission, "Nessun invio trovato per questo mese.");
    assert(submission.status === "SUBMITTED", "Questo mese non è in attesa di approvazione.");

    await prisma.monthlySubmission.update({
      where: { id: submission.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedBy: user.username },
    });
    revalidateEmployees();
    revalidatePath("/mie-ore");
  });
}

// Inviato → Riaperto: il titolare ha trovato qualcosa che non torna e
// rimanda il mese al dipendente per un altro giro (con una nota, se serve).
// Torna modificabile esattamente come una bozza.
export async function reopenMonth(idInput: string, year: number, month: number, note: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const employeeId = parseId(idInput, "dipendente");
    const reopenNote = parseText(note, "nota", { max: 300 });

    const submission = await prisma.monthlySubmission.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
    });
    assert(submission, "Nessun invio trovato per questo mese.");
    assert(submission.status === "SUBMITTED", "Questo mese non è in attesa di approvazione.");

    await prisma.monthlySubmission.update({
      where: { id: submission.id },
      data: { status: "REOPENED", reopenedAt: new Date(), reopenNote: reopenNote || null },
    });
    revalidateEmployees();
    revalidatePath("/mie-ore");
  });
}

// Eliminazione definitiva: porta con sé turni, assenze e saldi del
// dipendente (relazioni onDelete: Cascade). Per chi ha smesso di lavorare qui
// la strada giusta è la disattivazione, che conserva lo storico.
export async function deleteEmployee(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    await prisma.employee.delete({ where: { id } });
    revalidateEmployees();
  });
}

// Quanti dati verrebbero cancellati insieme al dipendente: serve a mostrare
// un avviso concreto invece di un generico "sei sicuro?".
export async function getEmployeeDeletionImpact(
  idInput: string,
): Promise<ActionResult<{ shifts: number; leaves: number; balances: number }>> {
  return runAction(async () => {
    await requireUser();
    const employeeId = parseId(idInput, "dipendente");
    const [shifts, leaves, balances] = await Promise.all([
      prisma.shiftBlock.count({ where: { employeeId } }),
      prisma.leaveEntry.count({ where: { employeeId } }),
      prisma.leaveBalance.count({ where: { employeeId } }),
    ]);
    return { shifts, leaves, balances };
  });
}

// --- Foto ------------------------------------------------------------------

export async function saveEmployeePhoto(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(formData.get("employeeId"), "dipendente");
    const file = formData.get("photo");

    assert(file instanceof File && file.size > 0, "Nessuna immagine selezionata.");
    assert(
      ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number]),
      "Formato non supportato: usa JPG, PNG o WEBP.",
    );
    assert(file.size <= MAX_PHOTO_BYTES, "Immagine troppo grande. Riprova con una foto più leggera.");

    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    const bytes = Buffer.from(await file.arrayBuffer());
    assert(isSupportedImage(bytes, file.type), "Il file non sembra un'immagine valida.");

    const updatedAt = new Date();
    await prisma.$transaction([
      prisma.employeePhoto.upsert({
        where: { employeeId: id },
        update: { data: bytes, mimeType: file.type, updatedAt },
        create: { employeeId: id, data: bytes, mimeType: file.type },
      }),
      prisma.employee.update({ where: { id }, data: { photoUpdatedAt: updatedAt } }),
    ]);

    revalidateEmployees();
  });
}

export async function deleteEmployeePhoto(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const employee = await prisma.employee.findUnique({ where: { id } });
    assert(employee, "Dipendente non trovato.");

    await prisma.$transaction([
      prisma.employeePhoto.deleteMany({ where: { employeeId: id } }),
      prisma.employee.update({ where: { id }, data: { photoUpdatedAt: null } }),
    ]);
    revalidateEmployees();
  });
}

// Controlla i magic bytes: il Content-Type dichiarato dal client non è una
// garanzia di cosa contenga davvero il file.
function isSupportedImage(bytes: Buffer, mimeType: string): boolean {
  if (bytes.length < 12) return false;
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

// --- Export ----------------------------------------------------------------

// Orari di un dipendente in un intervallo qualsiasi (settimana, mese o
// personalizzato), per l'export dalla pagina Dipendenti.
export async function getEmployeeScheduleRange(
  employeeIdInput: string,
  fromKeyInput: string,
  toKeyInput: string,
): Promise<
  ActionResult<{
    employee: { id: string; name: string; jobTitle: string | null; photoVersion: string | null } | null;
    blocks: { dateKey: string; startTime: string; endTime: string }[];
    leaveEntries: { dateKey: string; type: string; quantity: number }[];
    closures: { dateKey: string; reason: string | null }[];
  }>
> {
  return runAction(async () => {
    const employeeId = parseId(employeeIdInput, "dipendente");
    // Il titolare può esportare l'orario di chiunque; un dipendente solo il
    // proprio — usata sia dalla scheda dipendente in Dipendenti sia da
    // "Le mie ore" (Area Dipendenti).
    await requireSelfOrAdmin(employeeId);
    const fromKey = parseDateKey(fromKeyInput, "data di inizio");
    const toKey = parseDateKey(toKeyInput, "data di fine");
    assert(fromKey <= toKey, "La data di inizio deve precedere quella di fine.");

    const from = dateKeyToDate(fromKey);
    const to = dateKeyToDate(toKey);

    const [employee, blocks, leaveEntries, closures] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId } }),
      prisma.shiftBlock.findMany({ where: { employeeId, date: { gte: from, lte: to } } }),
      prisma.leaveEntry.findMany({ where: { employeeId, date: { gte: from, lte: to } } }),
      prisma.closureDay.findMany({ where: { date: { gte: from, lte: to } } }),
    ]);

    return {
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            jobTitle: employee.jobTitle,
            photoVersion: employee.photoUpdatedAt ? String(employee.photoUpdatedAt.getTime()) : null,
          }
        : null,
      blocks: blocks.map((b) => ({
        dateKey: toDateKey(b.date),
        startTime: b.startTime,
        endTime: b.endTime,
      })),
      leaveEntries: leaveEntries.map((l) => ({
        dateKey: toDateKey(l.date),
        type: l.type,
        quantity: l.quantity,
      })),
      closures: closures.map((c) => ({ dateKey: toDateKey(c.date), reason: c.reason })),
    };
  });
}
