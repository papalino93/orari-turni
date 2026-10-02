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
    where: { promoId: null },
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

const promoInclude = {
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
