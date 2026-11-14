// Notifiche sul telefono (Web Push) per chi gestisce le prenotazioni. Solo server.
//
// Servono tre variabili d'ambiente: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e
// VAPID_SUBJECT (es. «mailto:indirizzo»). Senza, le notifiche sono spente e la pagina lo dice.
// Su iPhone funzionano solo con l'app sulla schermata Home (iOS 16.4 o successivo).

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { parseBookingSettings } from "@/lib/booking/rules";

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

// A chi va un avviso: "staff" tutti quelli che gestiscono le prenotazioni; "whatsapp" chi manda le
// risposte su WhatsApp (il telefono enoteca; titolare e consulente solo se tocca anche a loro, vedi
// «Chi manda i WhatsApp ai clienti», o se un telefono enoteca non c'è); "owner" solo titolare e consulente.
export type PushAudience = "staff" | "whatsapp" | "owner";

// Chi riceve: il titolare/consulente (account User) e i dipendenti attivi con il permesso.
async function recipients(audience: PushAudience = "staff") {
  const subs = await prisma.pushSubscription.findMany({
    include: { employee: { select: { active: true, canManageBookings: true, username: true, isVenueDevice: true } } },
  });
  const valid = subs.filter((s) => (s.employeeId ? s.employee?.active && s.employee.canManageBookings && s.employee.username : s.username));
  if (audience === "staff") return valid;
  const owners = valid.filter((s) => s.username && !s.employeeId);
  if (audience === "owner") return owners;
  const venue = valid.filter((s) => s.employee?.isVenueDevice);
  const [row, venueAccounts] = await Promise.all([
    prisma.menuSetting.findUnique({ where: { id: "bookings" } }),
    prisma.employee.count({ where: { isVenueDevice: true, active: true, canManageBookings: true } }),
  ]);
  // «Solo il telefono enoteca» (se ce n'è uno): i telefoni di titolare e consulente non suonano per niente.
  const onlyVenue = venueAccounts > 0 && parseBookingSettings(row?.value).whatsappSenders === "venue";
  return onlyVenue ? venue : [...venue, ...owners];
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
// only.ids: proprio quei telefoni, chiunque siano (Impostazioni → «Prova» accanto a ogni telefono).
export async function sendPushToStaff(payload: PushPayload, only?: { endpoint?: string; ids?: string[] }, audience: PushAudience = "staff"): Promise<{ sent: number; failed: number }> {
  const pick = async () =>
    only?.ids
      ? await prisma.pushSubscription.findMany({ where: { id: { in: only.ids } } })
      : (await recipients(audience)).filter((s) => !only?.endpoint || s.endpoint === only.endpoint);
  // Modalità di prova (MAIL_PROVIDER=log in locale): non spedisce, conta solo gli iscritti.
  if (process.env.PUSH_PROVIDER === "log") {
    const subs = await pick();
    for (const s of subs) console.log(`[notifica di prova] a ${s.username ?? s.employeeId}${s.localPhone ? " (telefono enoteca)" : ""}: ${payload.title} · ${payload.body}`);
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

// Una password cambiata (o un accesso disattivato) spegne anche gli avvisi di quell'accesso: un
// telefono perso non deve più mostrare nomi e orari dei clienti sullo schermo bloccato. I telefoni
// buoni li riaccendono con un tocco («Attiva gli avvisi»).
export async function forgetPushFor(who: { employeeId?: string | null; username?: string | null }): Promise<number> {
  if (!who.employeeId && !who.username) return 0;
  const r = await prisma.pushSubscription.deleteMany({ where: who.employeeId ? { employeeId: who.employeeId } : { username: who.username!, employeeId: null } });
  return r.count;
}

// Che apparecchio è, in parole semplici, dal nome che il browser dà di sé.
export function deviceKind(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Telefono Android" : "Tablet Android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "Computer";
  return "Apparecchio";
}

export type PushDevice = { id: string; who: string; kind: string; venue: boolean; lastUsed: number | null; createdAt: number; endpoint: string };

// «Telefoni che ricevono gli avvisi» (Impostazioni, solo titolare e consulente).
export async function listPushDevices(): Promise<PushDevice[]> {
  const subs = await prisma.pushSubscription.findMany({
    include: { employee: { select: { name: true, isVenueDevice: true, active: true } } },
    orderBy: { createdAt: "desc" },
  });
  const users = await prisma.user.findMany({ where: { username: { in: subs.map((s) => s.username).filter((u): u is string => Boolean(u)) } }, select: { username: true, name: true } });
  const userName = new Map(users.map((u) => [u.username, u.name]));
  return subs
    .map((s) => ({
      id: s.id,
      who: s.employee ? s.employee.name : (userName.get(s.username ?? "") ?? s.username ?? "—"),
      kind: deviceKind(s.userAgent),
      venue: Boolean(s.employee?.isVenueDevice),
      lastUsed: (s.lastOkAt ?? null)?.getTime() ?? null,
      createdAt: s.createdAt.getTime(),
      // Per riconoscere «questo telefono» nell'elenco (pagina solo del titolare e del consulente).
      endpoint: s.endpoint,
    }))
    // Ordine fisso (sala prima, poi dal più vecchio): dopo «Prova» le righe non saltano più di posto,
    // e il tocco dopo non finisce su «Togli» di un altro telefono.
    .sort((a, b) => Number(b.venue) - Number(a.venue) || a.createdAt - b.createdAt);
}
