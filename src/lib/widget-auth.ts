// Chiavi dei widget (solo server). Una chiave per telefono, 256 bit casuali; nel
// database solo l'impronta SHA-256. La chiave apre in sola lettura i dati dei widget
// permessi a chi l'ha creata: non è una sessione del sito e non modifica nulla.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { KEY_IDLE_DAYS, widgetById } from "@/lib/widgets";

const PREFIX = "adv_";

export function newWidgetKey(): { key: string; hash: string } {
  const key = PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashWidgetKey(key) };
}

export function hashWidgetKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Freni contro chi prova chiavi a caso e contro un telefono impazzito. In memoria:
// valgono per ogni istanza del server, che per questo uso basta.
const failures = new Map<string, { count: number; until: number }>();
const perKey = new Map<string, { count: number; minute: number }>();
const FAIL_LIMIT = 20;
const FAIL_WINDOW = 10 * 60_000;
const PER_MINUTE = 60;

export type WidgetOwner =
  | { kind: "admin"; userId: string; name: string }
  | { kind: "employee"; employeeId: string; name: string; widgets: string[] };

export type WidgetAuth =
  | { ok: true; owner: WidgetOwner; deviceId: string }
  | { ok: false; status: number; code: "chiave" | "tolto" | "permesso" | "troppe" | "scaduta" };

export async function authenticateWidget(req: Request, widgetId: string): Promise<WidgetAuth> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const now = Date.now();
  const fail = failures.get(ip);
  if (fail && fail.count >= FAIL_LIMIT && fail.until > now) return { ok: false, status: 429, code: "troppe" };

  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const noteFailure = () => {
    const f = failures.get(ip);
    failures.set(ip, f && f.until > now ? { count: f.count + 1, until: f.until } : { count: 1, until: now + FAIL_WINDOW });
  };
  if (!key.startsWith(PREFIX) || key.length > 80) {
    noteFailure();
    return { ok: false, status: 401, code: "chiave" };
  }

  const device = await prisma.widgetDevice.findUnique({ where: { keyHash: hashWidgetKey(key) } });
  if (!device) {
    noteFailure();
    return { ok: false, status: 401, code: "chiave" };
  }
  if (device.revokedAt) return { ok: false, status: 403, code: "tolto" };
  const lastSeen = (device.lastUsedAt ?? device.createdAt).getTime();
  if (now - lastSeen > KEY_IDLE_DAYS * 86_400_000) return { ok: false, status: 403, code: "scaduta" };

  const minute = Math.floor(now / 60_000);
  const rate = perKey.get(device.id);
  if (rate && rate.minute === minute && rate.count >= PER_MINUTE) return { ok: false, status: 429, code: "troppe" };
  perKey.set(device.id, rate && rate.minute === minute ? { count: rate.count + 1, minute } : { count: 1, minute });

  let owner: WidgetOwner | null = null;
  if (device.userId) {
    const user = await prisma.user.findUnique({ where: { id: device.userId }, select: { id: true, name: true } });
    if (user) owner = { kind: "admin", userId: user.id, name: user.name };
  } else if (device.employeeId) {
    const emp = await prisma.employee.findUnique({ where: { id: device.employeeId }, select: { id: true, name: true, active: true, role: true, widgets: true } });
    if (emp && emp.active && emp.role === "EMPLOYEE" && emp.widgets.length > 0) owner = { kind: "employee", employeeId: emp.id, name: emp.name, widgets: emp.widgets };
  }
  if (!owner) return { ok: false, status: 403, code: "tolto" };

  const def = widgetById(widgetId);
  const allowed =
    !!def &&
    (owner.kind === "admin" ? def.per !== "dipendente" : def.per !== "admin" && owner.widgets.includes(def.id));
  if (!allowed) return { ok: false, status: 403, code: "permesso" };

  // Ultimo uso e telefono: se la stessa chiave arriva da un altro telefono, lo si segnala.
  const deviceName = (req.headers.get("x-device-name") ?? "").slice(0, 60) || null;
  await prisma.widgetDevice.update({
    where: { id: device.id },
    data: {
      lastUsedAt: new Date(now),
      ...(deviceName && !device.deviceName ? { deviceName } : {}),
      ...(deviceName && device.deviceName && deviceName !== device.deviceName ? { otherDeviceAt: new Date(now) } : {}),
    },
  });
  return { ok: true, owner, deviceId: device.id };
}
