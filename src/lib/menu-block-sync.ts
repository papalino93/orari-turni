// Solo server. Tiene allineati i blocchi «sotto il titolo di una sezione» con il
// menù speciale di un evento: chi crea, modifica o duplica un evento sceglie
// quali blocchi (coperto, chiusura cucina…) mostrare anche lì.

import { blockSummary } from "@/lib/menu-format";
import { logChange, type Tx } from "@/lib/menu-log";

export async function setSectionBlocks(tx: Tx, sectionId: string, selectedIds: string[], actorName: string): Promise<void> {
  const blocks = await tx.menuBlock.findMany({ where: { deletedAt: null, placement: "SECTIONS" } });
  for (const block of blocks) {
    const has = block.sectionIds.includes(sectionId);
    const want = selectedIds.includes(block.id);
    if (has === want) continue;
    const next = want ? [...block.sectionIds, sectionId] : block.sectionIds.filter((s) => s !== sectionId);
    await tx.menuBlock.update({ where: { id: block.id }, data: { sectionIds: next } });
    await logChange(tx, {
      actorName,
      action: "UPDATE",
      entity: "block",
      entityId: block.id,
      label: blockSummary({ ...block, kind: block.kind, placement: block.placement }),
      before: { sectionIds: block.sectionIds },
      after: { sectionIds: next },
    });
  }
}

// Duplicazione di un evento: la copia mostra gli stessi blocchi dell'originale.
export async function copySectionBlocks(tx: Tx, fromSectionId: string, toSectionId: string, actorName: string): Promise<void> {
  const blocks = await tx.menuBlock.findMany({ where: { deletedAt: null, placement: "SECTIONS", sectionIds: { has: fromSectionId } } });
  await setSectionBlocks(tx, toSectionId, blocks.map((b) => b.id), actorName);
}
