"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { EmployeeRole } from "@prisma/client";

export async function createEmployee(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const role = (formData.get("role") as EmployeeRole) ?? "EMPLOYEE";
  if (!name) return;

  await prisma.employee.create({ data: { name, role } });
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
