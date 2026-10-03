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

// --- Formati e prezzo (es. birra 0,2 l · 0,4 l · Maß 1 l) -------------------

export type MenuVariant = { label: string; cents: number };

// Il campo è JSON nel database: si rilegge in modo difensivo.
// Riga sotto il nome del vino: «denominazione · annata». Per i vini non ancora
// divisi nei campi nuovi resta il vecchio sottotitolo libero.
export function wineDetail(item: { denomination?: string | null; vintage?: string | null; sub?: string | null }): string {
  const parts = [item.denomination, item.vintage].filter((x): x is string => Boolean(x && x.trim()));
  return parts.length > 0 ? parts.join(" · ") : (item.sub ?? "");
}

// Provenienza di un vino da mostrare: la regione, e il paese solo se non è
// l'Italia (in un'enoteca italiana «Italia» non aggiunge nulla).
export function originLabel(item: { region: string | null; country: string | null }, sep = " · "): string {
  const country = item.country && item.country.trim().toLowerCase() !== "italia" ? item.country : null;
  return [item.region, country].filter(Boolean).join(sep);
}

export function parseVariants(value: unknown): MenuVariant[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const { label, cents } = v as { label?: unknown; cents?: unknown };
    return typeof label === "string" && typeof cents === "number" ? [{ label, cents }] : [];
  });
  return list.length > 0 ? list : null;
}

// --- Eventi e annunci -------------------------------------------------------

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

function dayParts(key: string): { d: number; m: number; y: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { d, m: m - 1, y };
}

// "9 ottobre", "9–12 ottobre", "30 ottobre – 2 novembre", con l'anno solo se cambia.
export function formatPromoDates(startKey: string, endKey: string): string {
  const a = dayParts(startKey);
  const b = dayParts(endKey);
  if (startKey === endKey) return `${a.d} ${MONTHS[a.m]}`;
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m]} ${a.y} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
  if (a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m]}`;
  return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]}`;
}

export function formatPromoDay(key: string): string {
  const p = dayParts(key);
  return `${p.d} ${MONTHS[p.m]}`;
}

type PromoDates = { showFrom: string; startDate: string; endDate: string };

// scheduled = non ancora visibile; announced = locandina visibile, evento non
// ancora iniziato; live = in corso; past = concluso. `today` è un giorno commerciale.
export type PromoStatus = "scheduled" | "announced" | "live" | "past";

export function promoStatus(p: PromoDates, today: string): PromoStatus {
  if (today > p.endDate) return "past";
  if (today >= p.startDate) return "live";
  if (today >= p.showFrom) return "announced";
  return "scheduled";
}

export function isPosterVisible(p: PromoDates & { hidden: boolean; deletedAt: Date | null }, today: string): boolean {
  return !p.hidden && !p.deletedAt && today >= p.showFrom && today <= p.endDate;
}

export function isPromoMenuVisible(p: PromoDates & { hidden: boolean; deletedAt: Date | null }, today: string): boolean {
  return !p.hidden && !p.deletedAt && today >= p.startDate && today <= p.endDate;
}


// --- Blocchi informativi (coperto, chiusura cucina, avvisi…) -----------------

export type BlockKind = "TEXT" | "PRICE" | "NOTICE";
export type BlockPlacement = "TOP" | "BOTTOM" | "SECTIONS";

export type MenuBlockView = {
  id: string;
  kind: BlockKind;
  label: string | null;
  text: string | null;
  priceCents: number | null;
  placement: BlockPlacement;
  sectionIds: string[];
  startDate: string | null;
  endDate: string | null;
  hidden: boolean;
};

// live = si vede oggi; scheduled = parte più avanti; expired = finito; hidden = nascosto a mano.
export type BlockStatus = "live" | "scheduled" | "expired" | "hidden";

export function blockStatus(b: Pick<MenuBlockView, "startDate" | "endDate" | "hidden">, today: string): BlockStatus {
  if (b.hidden) return "hidden";
  if (b.endDate && today > b.endDate) return "expired";
  if (b.startDate && today < b.startDate) return "scheduled";
  return "live";
}

// "1,00": per i prezzi dei blocchi (coperto, servizio) si scrivono sempre i centesimi.
export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

// Come si legge una voce con prezzo: «Coperto € 1,00».
export function priceLine(b: Pick<MenuBlockView, "label" | "priceCents">): string {
  const money = b.priceCents === null ? "" : `\u20AC\u00A0${formatMoney(b.priceCents)}`;
  return [b.label, money].filter(Boolean).join(" ");
}

export const PLACEMENT_LABELS: Record<BlockPlacement, string> = {
  TOP: "In cima al menù",
  BOTTOM: "In fondo al menù",
  SECTIONS: "Sotto il titolo delle sezioni",
};

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  TEXT: "Testo",
  PRICE: "Voce con prezzo",
  NOTICE: "Avviso",
};

// Riassunto di una riga: la voce con prezzo, oppure il testo accorciato.
export function blockSummary(b: MenuBlockView): string {
  const text = (b.text ?? "").replace(/\s+/g, " ").trim();
  if (b.kind === "PRICE") {
    const full = text ? `${priceLine(b)} · ${text}` : priceLine(b);
    return full.length > 90 ? `${full.slice(0, 87)}…` : full;
  }
  const title = b.priceCents !== null ? priceLine(b) : b.label;
  const head = title ? `${title}: ` : "";
  const full = `${head}${text}`;
  return full.length > 90 ? `${full.slice(0, 87)}…` : full;
}

export function formatBlockDates(startKey: string | null, endKey: string | null): string | null {
  if (!startKey && !endKey) return null;
  if (startKey && endKey) return startKey === endKey ? `solo il ${formatPromoDay(startKey)}` : `dal ${formatPromoDay(startKey)} al ${formatPromoDay(endKey)}`;
  if (startKey) return `dal ${formatPromoDay(startKey)}`;
  return `fino al ${formatPromoDay(endKey as string)}`;
}
