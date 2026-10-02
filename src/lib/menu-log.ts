// Registro delle modifiche del menù (tabella MenuChange): scrittura e confronto
// dei campi. Solo server. Usato da tutte le Server Action di /gestione-menu.

import type { MenuChangeAction, Prisma } from "@prisma/client";

export type Tx = Prisma.TransactionClient;
export type Fields = Record<string, unknown>;

export async function logChange(
  tx: Tx,
  entry: {
    actorName: string;
    action: MenuChangeAction;
    entity: "item" | "group" | "section" | "setting" | "promo";
    entityId: string;
    label: string;
    before?: Fields | null;
    after?: Fields | null;
  },
): Promise<string> {
  const row = await tx.menuChange.create({
    data: {
      actorName: entry.actorName,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      label: entry.label,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  return row.id;
}

// Solo i campi che differiscono, uno snapshot "prima" e uno "dopo".
export function diff(before: Fields, after: Fields): { before: Fields; after: Fields } | null {
  const b: Fields = {};
  const a: Fields = {};
  for (const key of Object.keys(after)) {
    // JSON.stringify perché alcuni campi sono liste (allergeni): due liste
    // uguali sono oggetti diversi per !==.
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      b[key] = before[key] ?? null;
      a[key] = after[key] ?? null;
    }
  }
  return Object.keys(a).length === 0 ? null : { before: b, after: a };
}

