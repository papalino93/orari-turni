"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
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
    await prisma.employee.create({
      data: { name, role, jobTitle: jobTitle || null, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    revalidateEmployees();
  });
}

export async function moveEmployee(idInput: string, directionInput: "up" | "down"): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const id = parseId(idInput, "dipendente");
    const direction = parseEnum(directionInput, ["up", "down"] as const, "direzione");

    const all = await prisma.employee.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const index = all.findIndex((e) => e.id === id);
    assert(index !== -1, "Dipendente non trovato.");
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= all.length) return;

    const a = all[index];
    const b = all[swapWith];
    // Gli ordinamenti storici possono avere valori uguali: in quel caso lo
    // scambio non sposterebbe nulla, quindi si riscrive l'ordine per intero.
    const reordered = all.slice();
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

    await prisma.employee.update({ where: { id }, data: { active } });
    revalidateEmployees();
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
    await requireUser();
    const employeeId = parseId(employeeIdInput, "dipendente");
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
