// Notifiche sul telefono (Web Push) per chi gestisce le prenotazioni. Solo server.
//
// Servono tre variabili d'ambiente: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e
// VAPID_SUBJECT (es. «mailto:indirizzo»). Senza, le notifiche sono spente e la pagina lo dice.
// Su iPhone funzionano solo con l'app sulla schermata Home (iOS 16.4 o successivo).

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      // Di ripiego l'indirizzo del sito (i servizi di notifica vogliono un contatto vero, non un esempio).
      process.env.VAPID_SUBJECT || "https://orari-turni.vercel.app",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

// A chi va un avviso: "staff" tutti quelli che gestiscono le prenotazioni; "whatsapp" chi può mandare
// le risposte su WhatsApp (titolare e consulente, e i dispositivi segnati «telefono del locale»);
// "owner" solo titolare e consulente.
export type PushAudience = "staff" | "whatsapp" | "owner";

// Chi riceve: il titolare/consulente (account User) e i dipendenti attivi con il permesso.
async function recipients(audience: PushAudience = "staff") {
  const subs = await prisma.pushSubscription.findMany({
    include: { employee: { select: { active: true, canManageBookings: true, username: true } } },
  });
  return subs
    .filter((s) => (s.employeeId ? s.employee?.active && s.employee.canManageBookings && s.employee.username : s.username))
    .filter((s) => audience === "staff" || (s.username && !s.employeeId) || (audience === "whatsapp" && s.localPhone));
}

// Dopo tanti errori di fila l'iscrizione non vale più (telefono cambiato, app tolta): si cancella.
const MAX_FAILS = 5;

// Chiave pubblica da dare al browser per iscriversi. In prova (PUSH_PROVIDER=log, in locale)
// senza chiavi se ne genera una finta per questo avvio del server: le notifiche non partono comunque.
let testKey: string | null = null;
export function pushPublicKey(): string | null {
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (process.env.PUSH_PROVIDER === "log") return (testKey ??= webpush.generateVAPIDKeys().publicKey);
  return null;
}

// only.endpoint: solo quel dispositivo («Prova una notifica»).
export async function sendPushToStaff(payload: PushPayload, only?: { endpoint: string }, audience: PushAudience = "staff"): Promise<{ sent: number; failed: number }> {
  const pick = async () => (await recipients(audience)).filter((s) => !only || s.endpoint === only.endpoint);
  // Modalità di prova (MAIL_PROVIDER=log in locale): non spedisce, conta solo gli iscritti.
  if (process.env.PUSH_PROVIDER === "log") {
    const subs = await pick();
    for (const s of subs) console.log(`[notifica di prova] a ${s.username ?? s.employeeId}${s.localPhone ? " (telefono del locale)" : ""}: ${payload.title} · ${payload.body}`);
    if (subs.length) await prisma.pushSubscription.updateMany({ where: { id: { in: subs.map((s) => s.id) } }, data: { lastOkAt: new Date() } });
    return { sent: subs.length, failed: 0 };
  }
  if (!setup()) return { sent: 0, failed: 0 };
  const subs = await pick();
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date(), failCount: 0 } });
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: il telefono ha tolto il permesso o l'iscrizione è scaduta; 403: la chiave non è più
        // quella giusta → si cancella (il telefono la rifà da solo aprendo la pagina).
        if (status === 404 || status === 410 || status === 403) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else {
          const r = await prisma.pushSubscription.update({ where: { id: s.id }, data: { failCount: { increment: 1 } } }).catch(() => null);
          if (r && r.failCount >= MAX_FAILS) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    }),
  );
  return { sent, failed };
}
