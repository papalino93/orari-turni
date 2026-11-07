// Freno ai tentativi di accesso sbagliati (solo server): senza, chi conosce un nome
// utente può provare centinaia di password in pochi minuti. Dopo troppi errori lo
// stesso nome utente, o lo stesso indirizzo, resta fermo per un quarto d'ora, anche
// se poi la password è giusta. In memoria come in lib/widget-auth.ts: vale per ogni
// istanza del server, che per questo uso basta.
//
// Per indirizzo il limite è più alto che per nome: in enoteca tutto il personale esce
// dalla stessa connessione, e qualche password sbagliata di più colleghi non deve
// lasciare fuori il titolare.

const PAUSE_MS = 15 * 60_000;
const LIMIT_PER_NAME = 10;
const LIMIT_PER_IP = 20;

type Entry = { count: number; until: number };
const byName = new Map<string, Entry>();
const byIp = new Map<string, Entry>();

function nameKey(username: string): string {
  return username.trim().toLowerCase();
}

// Minuti di pausa che restano (0 = si può provare).
function remaining(map: Map<string, Entry>, key: string, limit: number, now: number): number {
  const e = map.get(key);
  if (!e || e.until <= now || e.count < limit) return 0;
  return Math.ceil((e.until - now) / 60_000);
}

function note(map: Map<string, Entry>, key: string, now: number) {
  const e = map.get(key);
  // Ogni errore sposta in avanti la fine della pausa: il conteggio si azzera solo dopo
  // 15 minuti senza errori.
  map.set(key, e && e.until > now ? { count: e.count + 1, until: now + PAUSE_MS } : { count: 1, until: now + PAUSE_MS });
  // Pulizia delle voci scadute, così la memoria non cresce all'infinito.
  if (map.size > 2000) {
    for (const [k, v] of map) if (v.until <= now) map.delete(k);
  }
}

export function clientIp(headers: Record<string, unknown> | undefined): string {
  const forwarded = headers?.["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : "";
  const real = headers?.["x-real-ip"];
  return first || (typeof real === "string" ? real.trim() : "") || "?";
}

// Messaggio da mostrare se l'accesso è in pausa, altrimenti null.
export function loginBlocked(username: string, ip: string): string | null {
  const now = Date.now();
  const minutes = Math.max(remaining(byName, nameKey(username), LIMIT_PER_NAME, now), remaining(byIp, ip, LIMIT_PER_IP, now));
  if (minutes <= 0) return null;
  return `Troppi tentativi: riprova tra ${minutes === 1 ? "1 minuto" : `${minutes} minuti`}.`;
}

export function noteLoginFailure(username: string, ip: string) {
  const now = Date.now();
  note(byName, nameKey(username), now);
  note(byIp, ip, now);
}

// Accesso riuscito: si dimenticano gli errori di quel nome (non quelli dell'indirizzo,
// che servono a fermare chi prova tanti nomi diversi).
export function noteLoginSuccess(username: string) {
  byName.delete(nameKey(username));
}

export const LOGIN_BLOCKED_PREFIX = "Troppi tentativi";
