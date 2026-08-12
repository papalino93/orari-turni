"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { EmployeeRole } from "@prisma/client";

export async function createEmployee(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const role = (formData.get("role") as EmployeeRole) ?? "EMPLOYEE";
  if (!name) return;

  const last = await prisma.employee.findFirst({ orderBy: { sortOrder: "desc" } });
  await prisma.employee.create({ data: { name, role, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidatePath("/dipendenti");
  revalidatePath("/orari");
  revalidatePath("/ferie");
}

export async function moveEmployee(id: string, direction: "up" | "down") {
  const all = await prisma.employee.findMany({ orderBy: { sortOrder: "asc" } });
  const index = all.findIndex((e) => e.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= all.length) return;

  const a = all[index];
  const b = all[swapWith];
  await prisma.$transaction([
    prisma.employee.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.employee.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  revalidatePath("/dipendenti");
  revalidatePath("/orari");
  revalidatePath("/ferie");
}

export async function renameEmployee(id: string, name: string) {
  if (!name.trim()) return;
  await prisma.employee.update({ where: { id }, data: { name: name.trim() } });
  revalidatePath("/dipendenti");
  revalidatePath("/orari");
  revalidatePath("/ferie");
}

export async function toggleEmployeeActive(id: string, active: boolean) {
  await prisma.employee.update({ where: { id }, data: { active } });
  revalidatePath("/dipendenti");
  revalidatePath("/orari");
  revalidatePath("/ferie");
}

export async function setJobTitle(id: string, jobTitle: string) {
  await prisma.employee.update({ where: { id }, data: { jobTitle: jobTitle.trim() || null } });
  revalidatePath("/dipendenti");
}

export async function deleteEmployee(id: string) {
  await prisma.employee.delete({ where: { id } });
  revalidatePath("/dipendenti");
  revalidatePath("/orari");
  revalidatePath("/ferie");
}

// Orari di un dipendente in un intervallo di date qualsiasi (settimana,
// mese o personalizzato), per l'export PDF dalla pagina Dipendenti.
export async function getEmployeeScheduleRange(employeeId: string, fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${toKey}T00:00:00.000Z`);

  const [employee, blocks, leaveEntries] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    prisma.shiftBlock.findMany({ where: { employeeId, date: { gte: from, lte: to } } }),
    prisma.leaveEntry.findMany({ where: { employeeId, date: { gte: from, lte: to } } }),
  ]);

  return {
    employee: employee ? { id: employee.id, name: employee.name, jobTitle: employee.jobTitle } : null,
    blocks: blocks.map((b) => ({
      dateKey: b.date.toISOString().slice(0, 10),
      startTime: b.startTime,
      endTime: b.endTime,
    })),
    leaveEntries: leaveEntries.map((l) => ({
      dateKey: l.date.toISOString().slice(0, 10),
      type: l.type,
      quantity: l.quantity,
    })),
  };
}
