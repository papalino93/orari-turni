// Lato server del menù pubblico (/menu) e della sua gestione (/gestione-menu):
// lettura dal database, validazione dei prezzi, rigenerazione della cache.
// Le funzioni pure (formattazione, giorno commerciale) stanno in menu-format.ts.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { blockStatus, tryParsePrice, type MenuBlockView } from "@/lib/menu-format";
import { parseContacts, parseHero, parseHours } from "@/lib/menu-venue";
import { ValidationError } from "@/lib/validation";

// Come tryParsePrice, ma lancia un errore leggibile se non è un prezzo.
export function parsePrice(value: unknown, field: string): number | null {
  const parsed = tryParsePrice(value);
  if (!parsed.ok) throw new ValidationError(`Prezzo ${field} non valido (esempio: 7 oppure 7,50).`);
  return parsed.cents;
}

// Sezioni → gruppi → voci non eliminate, nell'ordine di visualizzazione.
// Le voci esaurite sono incluse: spetta a chi mostra decidere cosa farne.
export async function loadMenu() {
  return prisma.menuSection.findMany({
    // Le sezioni collegate a un evento (promoId) non sono sezioni fisse del menù:
    // stanno nella pagina dell'evento (vedi loadVisiblePromos / loadPromoBySlug).
    where: { promoId: null, dailyOnly: false },
    orderBy: { sortOrder: "asc" },
    include: {
      groups: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: { items: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

// Blocchi informativi (coperto, chiusura cucina, avvisi…) non eliminati, nell'ordine
// in cui compaiono. Chi li mostra filtra quelli scaduti o nascosti (blockStatus).
export async function loadBlocks(): Promise<MenuBlockView[]> {
  const rows = await prisma.menuBlock.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((b) => ({
    id: b.id,
    kind: b.kind,
    label: b.label,
    text: b.text,
    priceCents: b.priceCents,
    placement: b.placement,
    sectionIds: b.sectionIds,
    startDate: b.startDate,
    endDate: b.endDate,
    hidden: b.hidden,
  }));
}

// Quelli da mostrare oggi sul menù dei clienti.
export async function loadVisibleBlocks(dayKey: string): Promise<MenuBlockView[]> {
  return (await loadBlocks()).filter((b) => blockStatus(b, dayKey) === "live");
}

// «Oggi fuori menù»: sezioni speciali (piatti e vini) con le sole voci valide nel
// giorno commerciale indicato. Le sezioni senza voci di oggi tornano vuote.
export async function loadDaily(dayKey: string) {
  return prisma.menuSection.findMany({
    where: { dailyOnly: true },
    orderBy: { sortOrder: "asc" },
    include: {
      groups: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: { items: { where: { deletedAt: null, onlyDay: dayKey }, orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

// Voci proposte negli ultimi giorni e non ancora riproposte oggi, la più recente
// per nome: servono a «Riproponi». Le più vecchie di 60 giorni si eliminano.
export async function loadDailyRecent(dayKey: string) {
  const cutoff = new Date(`${dayKey}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 14);
  const since = cutoff.toISOString().slice(0, 10);
  const rows = await prisma.menuItem.findMany({
    where: { deletedAt: null, onlyDay: { not: null, gte: since, lt: dayKey }, group: { section: { dailyOnly: true } } },
    orderBy: [{ onlyDay: "desc" }, { sortOrder: "asc" }],
    include: { group: { select: { id: true, section: { select: { kind: true } } } } },
  });
  const today = await prisma.menuItem.findMany({
    where: { deletedAt: null, onlyDay: dayKey, group: { section: { dailyOnly: true } } },
    select: { name: true },
  });
  const taken = new Set(today.map((i) => i.name.toLowerCase()));
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = r.name.toLowerCase();
    if (taken.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Copertina, orari e contatti (impostazioni JSON); se mancano valgono i valori
// di partenza. heroImage = versione della foto personalizzata (null = predefinita).
export async function loadVenue() {
  const [rows, image] = await Promise.all([
    prisma.menuSetting.findMany({ where: { id: { in: ["hero", "hours", "contacts"] } } }),
    prisma.menuHeroImage.findUnique({ where: { id: "hero" }, select: { updatedAt: true } }),
  ]);
  const raw = (id: string) => rows.find((r) => r.id === id)?.value ?? null;
  return {
    hero: parseHero(raw("hero")),
    hours: parseHours(raw("hours")),
    contacts: parseContacts(raw("contacts")),
    heroImageVersion: image ? image.updatedAt.getTime() : null,
  };
}

// Statistiche: «Inizia a contare» (acceso/spento) e da che giorno.
export type StatsSetting = { enabled: boolean; since: string | null };

export async function loadStatsSetting(): Promise<StatsSetting> {
  const row = await prisma.menuSetting.findUnique({ where: { id: "stats" } });
  try {
    const v = row ? (JSON.parse(row.value) as Partial<StatsSetting>) : null;
    return { enabled: Boolean(v?.enabled), since: typeof v?.since === "string" ? v.since : null };
  } catch {
    return { enabled: false, since: null };
  }
}

const promoInclude = {
  pages: { orderBy: { sortOrder: "asc" as const }, select: { id: true, width: true, height: true } },
  section: {
    include: {
      groups: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" as const },
        include: { items: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" as const } } },
      },
    },
  },
};

// Pagine promozionali con la locandina visibile oggi (giorno commerciale).
export async function loadVisiblePromos(dayKey: string) {
  return prisma.menuPromo.findMany({
    where: { deletedAt: null, hidden: false, showFrom: { lte: dayKey }, endDate: { gte: dayKey } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    include: promoInclude,
  });
}

export async function loadPromoBySlug(slug: string) {
  return prisma.menuPromo.findUnique({ where: { slug }, include: promoInclude });
}

// Per la gestione: tutte le pagine non eliminate, comprese concluse e nascoste.
export async function loadPromosForEditor() {
  return prisma.menuPromo.findMany({
    where: { deletedAt: null },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    include: promoInclude,
  });
}

export type LoadedMenu = Awaited<ReturnType<typeof loadMenu>>;

// Dopo ogni modifica: le pagine pubbliche sono in cache e vanno rigenerate.
export function revalidateMenu() {
  revalidatePath("/menu");
  revalidatePath("/menu/allergeni");
  revalidatePath("/menu/p/[slug]", "page");
  revalidatePath("/gestione-menu");
}
