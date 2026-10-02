// Funzioni pure del menù, sicure anche nei componenti client: niente accesso
// al database né a next/cache (quelli stanno in lib/menu.ts, solo server).

import { todayKey } from "@/lib/week";

// Il giorno "commerciale" cambia alle 5:00 ora italiana, non a mezzanotte:
// il locale può restare aperto dopo la mezzanotte e una voce segnata esaurita
// a cena non deve riapparire a metà serata. Spostare l'istante indietro di 5
// ore e prenderne la data nel fuso del negozio dà esattamente questo confine.
const BUSINESS_DAY_START_HOUR = 5;

export function businessDayKey(now: Date = new Date()): string {
  return todayKey(new Date(now.getTime() - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000));
}

// Una voce è esaurita solo se è stata segnata nel giorno commerciale
// corrente: il ripristino del giorno dopo avviene da solo, senza cron.
export function isSoldOut(item: { soldOutDay: string | null }, dayKey: string): boolean {
  return item.soldOutDay === dayKey;
}

// "12" per i prezzi interi, "1,30" altrimenti; "—" quando il prezzo non c'è
// (es. un vino non disponibile al calice).
export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace(".", ",");
}

// Accetta "7", "7,5", "7,50", "7.50", "€ 7" e i simboli di "nessun prezzo"
// ("", "—", "-"). cents null = nessun prezzo; ok false = non è un prezzo.
export function tryParsePrice(value: unknown): { ok: true; cents: number | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, cents: null };
  const raw = String(value).replace(/€/g, "").replace(/\s/g, "");
  if (raw === "" || raw === "—" || raw === "-" || raw === "–") return { ok: true, cents: null };
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(raw)) return { ok: false };
  const cents = Math.round(Number(raw.replace(",", ".")) * 100);
  return cents > 0 ? { ok: true, cents } : { ok: false };
}

// Evita righe spezzate male: tiene uniti numero e parola ("45% Pinot Noir",
// "160 g") e il punto medio con ciò che lo precede.
export function nb(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/(\d[\d,]*%?) (?=[A-Za-zÀ-ÿ€])/g, "$1\u00A0").replace(/ · /g, "\u00A0· ");
}
