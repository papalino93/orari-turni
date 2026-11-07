// Prenotazioni, parte pubblica: piccoli controlli lato server condivisi dalle route del cliente.
// Solo server (usa la chiave segreta del sito).

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getBookingManager } from "@/lib/guard";

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET non configurato.");
  return s;
}

// Orario di apertura del modulo, firmato: chi invia in meno di 3 secondi è quasi sempre un
// programma, non una persona. La firma impedisce di inventarsi un orario vecchio.
export function formStamp(now: number = Date.now()): string {
  const mac = createHmac("sha256", secret()).update(`prenota-form:${now}`).digest("base64url").slice(0, 32);
  return `${now}.${mac}`;
}

export const MIN_FILL_MS = 3000;

// Millisecondi passati dall'apertura del modulo, o null se il timbro manca o è falso.
export function formAge(stamp: unknown, now: number = Date.now()): number | null {
  if (typeof stamp !== "string" || stamp.length > 80) return null;
  const [ts, mac] = stamp.split(".");
  if (!ts || !mac || !/^\d{10,16}$/.test(ts)) return null;
  const expected = createHmac("sha256", secret()).update(`prenota-form:${ts}`).digest("base64url").slice(0, 32);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const age = now - Number(ts);
  // Un modulo aperto da più di 12 ore non vale più (un programma non può riusare un timbro all'infinito).
  if (age > 12 * 3600_000) return null;
  return age;
}

// La chiamata arriva da una pagina di questo sito? (le route accettano JSON solo da qui)
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.host].filter(Boolean);
  return hosts.includes(host);
}

export function clientIp(request: NextRequest): string {
  // Su Vercel x-real-ip è scritto dalla piattaforma; x-forwarded-for solo come riserva (in locale).
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
}

// Indirizzo pubblico della richiesta (per i link nei messaggi al cliente).
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

// Titolare o consulente con l'accesso fatto: vede la pagina anche a funzione spenta (anteprima).
export async function isOwner(): Promise<boolean> {
  const m = await getBookingManager().catch(() => null);
  return m?.role === "ADMIN";
}

// Risposta JSON che il browser non conserva.
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Corpo JSON della richiesta, al massimo `max` caratteri; null se non è un oggetto.
export async function readJson(request: Request, max = 4000): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > max) return null;
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
