import type { NextRequest } from "next/server";
import { addOptOut, emailFromUnsubscribeToken } from "@/lib/mail";

// «Non voglio più ricevere queste email».
// - POST con «List-Unsubscribe=One-Click»: il pulsante del programma di posta (Gmail, Apple Mail…,
//   RFC 8058). Arriva dai loro server, senza pagina: basta il link firmato.
// - POST dal pulsante «Sì, cancellami» della pagina: solo da questo sito (controllo dell'origine).
// Idempotente: cancellarsi due volte non cambia nulla.

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // La pagina non manda il referrer ("no-referrer"): il browser allora scrive «Origin: null» e
  // dice da dove arriva con Sec-Fetch-Site.
  if (!origin || origin === "null") return request.headers.get("sec-fetch-site") === "same-origin";
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return [request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.host].filter(Boolean).includes(host);
}

function backToPage(request: NextRequest, token: string, query: string) {
  return new Response(null, { status: 303, headers: { ...noStore, Location: new URL(`/mail/cancellami/${token}${query}`, request.url).toString() } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await request.text().catch(() => "")).slice(0, 500);
  const oneClick = /(^|&)List-Unsubscribe=One-Click(&|$)/.test(body.trim());
  if (!oneClick && !sameOrigin(request)) return backToPage(request, token, "?errore=1");

  const email = emailFromUnsubscribeToken(token);
  if (!email) return oneClick ? new Response("Link non valido", { status: 400, headers: noStore }) : backToPage(request, token, "");
  try {
    await addOptOut(email, oneClick ? "one-click" : "link");
  } catch (e) {
    console.error("[mail] disiscrizione", e);
    return oneClick ? new Response("Riprova", { status: 500, headers: noStore }) : backToPage(request, token, "?errore=1");
  }
  return oneClick ? new Response("Fatto: non riceverai più le nostre email.", { status: 200, headers: noStore }) : backToPage(request, token, "?fatto=1");
}

// Aperto nel browser (programmi di posta senza il «tocco unico»): alla pagina con il pulsante.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return backToPage(request, token, "");
}
