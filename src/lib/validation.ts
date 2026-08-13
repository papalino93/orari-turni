// Validazione degli input delle Server Action. Tutto ciò che arriva dal
// client va considerato arbitrario — anche quando la UI non permetterebbe
// mai di inviarlo — perché l'azione è raggiungibile via HTTP a prescindere
// dalla pagina che la invoca.

import { AuthError } from "@/lib/guard";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Racchiude il corpo di una Server Action: gli errori attesi (sessione
// scaduta, input non valido) tornano al client come messaggio leggibile,
// tutto il resto viene loggato e riassunto senza esporre dettagli interni.
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AuthError || error instanceof ValidationError) {
      return { ok: false, error: error.message };
    }
    console.error("[action]", error);
    return { ok: false, error: "Qualcosa è andato storto. Riprova." };
  }
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseDateKey(value: unknown, field = "data"): string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) {
    throw new ValidationError(`Campo ${field} non valido.`);
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    y < 2000 ||
    y > 2100
  ) {
    throw new ValidationError(`Campo ${field} non valido.`);
  }
  return value;
}

export function parseTime(value: unknown, field = "orario"): string {
  if (typeof value !== "string" || !TIME.test(value)) {
    throw new ValidationError(`Campo ${field} non valido.`);
  }
  return value;
}

export function parseId(value: unknown, field = "id"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    throw new ValidationError(`Campo ${field} non valido.`);
  }
  return value;
}

export function parseText(value: unknown, field: string, { max = 120, required = false } = {}): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (required) throw new ValidationError(`Campo ${field} obbligatorio.`);
    return "";
  }
  if (text.length > max) throw new ValidationError(`Campo ${field}: massimo ${max} caratteri.`);
  return text;
}

export function parseNumber(
  value: unknown,
  field: string,
  { min = -Infinity, max = Infinity }: { min?: number; max?: number } = {},
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ValidationError(`Campo ${field} non valido.`);
  }
  return Math.round(n * 100) / 100;
}

export function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`Campo ${field} non valido.`);
  }
  return value as T;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}

// Converte una chiave YYYY-MM-DD nel DateTime a mezzanotte UTC usato dalle
// colonne @db.Date.
export function dateKeyToDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}
