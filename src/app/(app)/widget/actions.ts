"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireEmployee, requireUser } from "@/lib/guard";
import { assert, parseId, parseText, runAction, type ActionResult } from "@/lib/validation";
import { newWidgetKey } from "@/lib/widget-auth";
import { EMPLOYEE_WIDGETS, WIDGET_THEMES } from "@/lib/widgets";

// Chi sta chiedendo: titolare/consulente (User) o dipendente (Employee). Mai un id dal client.
async function owner(): Promise<{ userId: string } | { employeeId: string; widgets: string[] }> {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "EMPLOYEE") {
    const me = await requireEmployee();
    const emp = await prisma.employee.findUnique({ where: { id: me.id }, select: { widgets: true, active: true } });
    assert(emp && emp.active, "Accesso non valido.");
    return { employeeId: me.id, widgets: emp.widgets };
  }
  const user = await requireUser();
  return { userId: user.id };
}

// Collega questo telefono: crea la chiave e la restituisce una volta sola (va nello script).
export async function createWidgetDevice(nameInput: string): Promise<ActionResult<{ key: string }>> {
  return runAction(async () => {
    const who = await owner();
    if ("employeeId" in who) assert(who.widgets.length > 0, "Il titolare non ti ha ancora dato nessun widget.");
    const name = parseText(nameInput, "nome del telefono", { max: 40, required: true });
    const active = await prisma.widgetDevice.count({ where: { ...("userId" in who ? { userId: who.userId } : { employeeId: who.employeeId }), revokedAt: null } });
    assert(active < 10, "Hai già 10 telefoni collegati: scollegane uno prima.");
    const { key, hash } = newWidgetKey();
    await prisma.widgetDevice.create({
      data: { name, keyHash: hash, userId: "userId" in who ? who.userId : null, employeeId: "employeeId" in who ? who.employeeId : null },
    });
    revalidatePath("/widget");
    return { key };
  });
}

// Scollega un telefono: subito, il widget mostra «Accesso tolto». Titolare e consulente possono
// scollegare qualunque telefono, un dipendente solo i propri.
export async function revokeWidgetDevice(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    const id = parseId(idInput, "telefono");
    const who = await owner();
    const device = await prisma.widgetDevice.findUnique({ where: { id } });
    assert(device && !device.revokedAt, "Telefono non trovato o già scollegato.");
    if ("employeeId" in who) assert(device.employeeId === who.employeeId, "Puoi scollegare solo i tuoi telefoni.");
    await prisma.widgetDevice.update({ where: { id }, data: { revokedAt: new Date() } });
    revalidatePath("/widget");
  });
}

// Quali widget può usare un dipendente (vuoto = nessuno). Solo titolare e consulente.
export async function setEmployeeWidgets(employeeIdInput: string, widgets: string[]): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const employeeId = parseId(employeeIdInput, "dipendente");
    assert(Array.isArray(widgets), "Elenco non valido.");
    const allowed = EMPLOYEE_WIDGETS.map((w) => w.id);
    for (const w of widgets) assert(typeof w === "string" && allowed.includes(w), "Widget non valido.");
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { role: true } });
    assert(emp && emp.role === "EMPLOYEE", "Dipendente non trovato.");
    await prisma.employee.update({ where: { id: employeeId }, data: { widgets: allowed.filter((w) => widgets.includes(w)) } });
    revalidatePath("/widget");
  });
}

// Colori dei widget: valgono per tutti i telefoni di chi li sceglie, anche quelli che collegherà.
// Il telefono li prende al primo aggiornamento, senza toccare niente.
export async function setWidgetTheme(temaInput: string): Promise<ActionResult> {
  return runAction(async () => {
    const who = await owner();
    assert(WIDGET_THEMES.some((t) => t.id === temaInput), "Colori non validi.");
    if ("userId" in who) await prisma.user.update({ where: { id: who.userId }, data: { widgetTheme: temaInput } });
    else await prisma.employee.update({ where: { id: who.employeeId }, data: { widgetTheme: temaInput } });
    revalidatePath("/widget");
  });
}
