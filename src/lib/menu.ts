// Lato server del menù pubblico (/menu) e della sua gestione (/gestione-menu):
// lettura dal database, validazione dei prezzi, rigenerazione della cache.
// Le funzioni pure (formattazione, giorno commerciale) stanno in menu-format.ts.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tryParsePrice } from "@/lib/menu-format";
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

// Testo del coperto (es. "Coperto € 1,00"), uguale per tutte le sezioni di
// cucina; null se non c'è.
export async function loadCover(): Promise<string | null> {
  const setting = await prisma.menuSetting.findUnique({ where: { id: "cover" } });
  return setting?.value.trim() ? setting.value : null;
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
