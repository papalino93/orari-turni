// «Telefono enoteca»: il telefono che resta in sala, con un accesso condiviso (Employee.isVenueDevice).
// Chi lo usa sceglie una volta «Chi sei?» (Marta, Giulia…): il nome va nella cronologia come
// «Marta (telefono enoteca)». E chi manda i WhatsApp ai clienti (impostazione «Chi manda i WhatsApp»).
// Solo server.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { BookingManager } from "@/lib/guard";
import type { BookingSettings } from "@/lib/booking/rules";

export const VENUE_LABEL = "telefono enoteca";
export const WHO_COOKIE = "enoteca-chi";
// Quanto vale la scelta «Chi sei?» sul telefono enoteca: un turno, più o meno.
export const WHO_HOURS = 5;
export const NEED_WHO = "Prima scegli chi sei: tocca «Chi sei?» in cima a Prenotazioni.";

export class NeedWhoError extends Error {
  constructor() {
    super(NEED_WHO);
  }
}

// La persona scelta su questo telefono enoteca (cookie «id:scadenza»), se vale ancora ed è attiva.
export async function venueWho(m: BookingManager): Promise<{ id: string; name: string } | null> {
  if (!m.venueDevice) return null;
  const raw = (await cookies()).get(WHO_COOKIE)?.value ?? "";
  const [id, exp] = raw.split(":");
  if (!id || !/^[a-z0-9]{10,40}$/i.test(id) || !(Number(exp) > Date.now())) return null;
  const e = await prisma.employee.findUnique({ where: { id }, select: { id: true, name: true, active: true, isVenueDevice: true } });
  return e && e.active && !e.isVenueDevice ? { id: e.id, name: e.name } : null;
}

// Il nome da scrivere in cronologia: «Marta (telefono enoteca)» dal telefono della sala, sennò il nome.
export async function actorName(m: BookingManager): Promise<string> {
  if (!m.venueDevice) return m.name;
  const who = await venueWho(m);
  if (!who) throw new NeedWhoError();
  return `${who.name} (${VENUE_LABEL})`;
}

// Sceglie chi usa il telefono enoteca: solo da una sessione del telefono enoteca, solo un dipendente attivo.
export async function setVenueWho(m: BookingManager, employeeId: unknown): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!m.venueDevice) return { ok: false, error: "«Chi sei?» serve solo sul telefono enoteca." };
  if (typeof employeeId !== "string" || !/^[a-z0-9]{10,40}$/i.test(employeeId)) return { ok: false, error: "Scegli un nome dall'elenco." };
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true, active: true, isVenueDevice: true } });
  if (!e || !e.active || e.isVenueDevice) return { ok: false, error: "Questa persona non c'è più tra i dipendenti attivi: scegline un'altra." };
  (await cookies()).set(WHO_COOKIE, `${employeeId}:${Date.now() + WHO_HOURS * 3600000}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WHO_HOURS * 3600,
  });
  return { ok: true, name: e.name };
}

export async function clearVenueWho(): Promise<void> {
  (await cookies()).delete(WHO_COOKIE);
}

// Le persone tra cui scegliere: prima chi è in turno oggi (dagli orari), poi gli altri.
export async function whoChoices(dateKey: string): Promise<{ id: string; name: string; onShift: string | null }[]> {
  const [people, blocks] = await Promise.all([
    prisma.employee.findMany({ where: { active: true, isVenueDevice: false }, select: { id: true, name: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.shiftBlock.findMany({ where: { date: new Date(`${dateKey}T00:00:00Z`) }, select: { employeeId: true, startTime: true, endTime: true }, orderBy: { startTime: "asc" } }),
  ]);
  const shift = new Map<string, string>();
  for (const b of blocks) shift.set(b.employeeId, shift.has(b.employeeId) ? `${shift.get(b.employeeId)} · ${b.startTime}–${b.endTime}` : `${b.startTime}–${b.endTime}`);
  return people
    .map((p) => ({ id: p.id, name: p.name, onShift: shift.get(p.id) ?? null }))
    .sort((a, b) => Number(Boolean(b.onShift)) - Number(Boolean(a.onShift)));
}

export async function venueDeviceExists(): Promise<boolean> {
  return (await prisma.employee.count({ where: { isVenueDevice: true, active: true, canManageBookings: true } })) > 0;
}

// Chi manda i WhatsApp ai clienti, in pratica: «solo il telefono enoteca» vale se ce n'è uno collegato.
export type WhatsappMode = "venue" | "all";
export function effectiveMode(settings: Pick<BookingSettings, "whatsappSenders">, venueExists: boolean): WhatsappMode {
  return settings.whatsappSenders === "venue" && venueExists ? "venue" : "all";
}

// Che cosa può fare questo dispositivo con i WhatsApp ai clienti:
// "send" li manda (telefono enoteca, o titolare/consulente se tocca anche a loro);
// "override" li vede e può mandarli lui solo scegliendo «Mandalo io dal mio WhatsApp» (titolare/consulente);
// "none" li vede soltanto (dipendente dal suo telefono).
export type WhatsappRole = "send" | "override" | "none";
export function whatsappRole(m: Pick<BookingManager, "role" | "venueDevice">, mode: WhatsappMode): WhatsappRole {
  if (m.venueDevice) return "send";
  if (m.role === "ADMIN") return mode === "all" ? "send" : "override";
  return "none";
}

// Da dove parte il messaggio, per la cronologia.
export const sentFrom = (m: Pick<BookingManager, "venueDevice">) => (m.venueDevice ? "dal numero dell'enoteca" : "dal WhatsApp personale");
