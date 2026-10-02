// Lato server del menù pubblico (/menu) e della sua gestione (/gestione-menu):
// lettura dal database, validazione dei prezzi, rigenerazione della cache.
// Le funzioni pure (formattazione, giorno commerciale) stanno in menu-format.ts.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/validation";

// Accetta "7", "7,5", "7,50", "7.50", "€ 7" e i simboli di "nessun prezzo"
// ("", "—", "-"). Restituisce i centesimi, oppure null se non c'è prezzo.
export function parsePrice(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(/€/g, "").replace(/\s/g, "");
  if (raw === "" || raw === "—" || raw === "-" || raw === "–") return null;
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(raw)) {
    throw new ValidationError(`Prezzo ${field} non valido (esempio: 7 oppure 7,50).`);
  }
  const cents = Math.round(Number(raw.replace(",", ".")) * 100);
  if (cents <= 0) throw new ValidationError(`Prezzo ${field} non valido.`);
  return cents;
}

// Sezioni → gruppi → voci non eliminate, nell'ordine di visualizzazione.
// Le voci esaurite sono incluse: spetta a chi mostra decidere cosa farne.
export async function loadMenu() {
  return prisma.menuSection.findMany({
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

export type LoadedMenu = Awaited<ReturnType<typeof loadMenu>>;

// Dopo ogni modifica: le pagine pubbliche sono in cache e vanno rigenerate.
export function revalidateMenu() {
  revalidatePath("/menu");
  revalidatePath("/menu/allergeni");
  revalidatePath("/gestione-menu");
}
