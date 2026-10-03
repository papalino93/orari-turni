"use server";

import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { diff, logChange } from "@/lib/menu-log";
import { blockSummary } from "@/lib/menu-format";
import { parsePrice, revalidateMenu } from "@/lib/menu";
import { assert, parseDateKey, parseEnum, parseId, parseText, runAction, type ActionResult } from "@/lib/validation";
import type { ChangeResult } from "./actions";

// Blocchi informativi del menù (coperto, chiusura cucina, avvisi…). Stesso
// schema delle altre azioni: permesso riletto dal database a ogni chiamata,
// modifica registrata nello storico (con «Annulla»), cache rigenerata.

export type BlockInput = {
  kind: "TEXT" | "PRICE" | "NOTICE";
  label?: string;
  text?: string;
  price?: string;
  placement: "TOP" | "BOTTOM" | "SECTIONS";
  sectionIds?: string[];
  startDate?: string;
  endDate?: string;
  hidden?: boolean;
};

async function parseBlockInput(input: BlockInput) {
  const kind = parseEnum(input.kind, ["TEXT", "PRICE", "NOTICE"] as const, "tipo");
  const placement = parseEnum(input.placement, ["TOP", "BOTTOM", "SECTIONS"] as const, "posizione");

  let label: string | null = null;
  let text: string | null = null;
  let priceCents: number | null = null;
  if (kind === "PRICE") {
    label = parseText(input.label, "nome", { max: 60, required: true });
    priceCents = parsePrice(input.price, "");
    assert(priceCents !== null, "Inserisci il prezzo (esempio: 1 oppure 1,50).");
    // Descrizione facoltativa sotto la riga del prezzo (es. «Oli all'arancia, basilico o peperoncino»).
    text = parseText(input.text, "descrizione", { max: 400 }) || null;
  } else {
    label = parseText(input.label, "titoletto", { max: 60 }) || null;
    text = parseText(input.text, "testo", { max: 400, required: true });
    // Prezzo facoltativo anche per testi e avvisi (es. «Novità · Oli aromatizzati € 1,50»).
    priceCents = parsePrice(input.price, "");
  }

  let sectionIds: string[] = [];
  if (placement === "SECTIONS") {
    const raw = Array.isArray(input.sectionIds) ? input.sectionIds : [];
    assert(raw.length > 0, "Scegli almeno una sezione in cui mostrarlo.");
    assert(raw.length <= 60, "Troppe sezioni.");
    const ids = Array.from(new Set(raw.map((id) => parseId(id, "sezione"))));
    const found = await prisma.menuSection.findMany({ where: { id: { in: ids } }, select: { id: true } });
    assert(found.length === ids.length, "Una delle sezioni scelte non esiste più.");
    sectionIds = ids;
  }

  const startDate = input.startDate ? parseDateKey(input.startDate, "«dal»") : null;
  const endDate = input.endDate ? parseDateKey(input.endDate, "«al»") : null;
  assert(!startDate || !endDate || startDate <= endDate, "La data «al» non può essere prima di «dal».");

  return { kind, placement, label, text, priceCents, sectionIds, startDate, endDate, hidden: Boolean(input.hidden) };
}

const FIELDS = ["kind", "label", "text", "priceCents", "placement", "sectionIds", "startDate", "endDate", "hidden"] as const;

function snapshot(b: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) out[key] = b[key] ?? null;
  return out;
}

function summaryOf(data: Awaited<ReturnType<typeof parseBlockInput>>) {
  return blockSummary({ id: "", ...data });
}

export async function saveBlock(idInput: string | null, input: BlockInput): Promise<ActionResult<ChangeResult & { id: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const data = await parseBlockInput(input);

    if (!idInput) {
      const last = await prisma.menuBlock.findFirst({
        where: { deletedAt: null, placement: data.placement },
        orderBy: { sortOrder: "desc" },
      });
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.menuBlock.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
        const changeId = await logChange(tx, {
          actorName: editor.name,
          action: "CREATE",
          entity: "block",
          entityId: created.id,
          label: summaryOf(data),
          after: snapshot(created),
        });
        return { changeId, id: created.id };
      });
      revalidateMenu();
      return result;
    }

    const id = parseId(idInput, "blocco");
    const existing = await prisma.menuBlock.findFirst({ where: { id, deletedAt: null } });
    assert(existing, "Blocco non trovato.");
    const changed = diff(snapshot(existing), data);
    if (!changed) return { changeId: null, id };

    // Se cambia posizione, va in fondo al nuovo gruppo.
    const moved = existing.placement !== data.placement;
    const last = moved
      ? await prisma.menuBlock.findFirst({ where: { deletedAt: null, placement: data.placement }, orderBy: { sortOrder: "desc" } })
      : null;
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuBlock.update({ where: { id }, data: { ...data, ...(moved ? { sortOrder: (last?.sortOrder ?? -1) + 1 } : {}) } });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "block",
        entityId: id,
        label: summaryOf(data),
        before: changed.before,
        after: changed.after,
      });
    });
    revalidateMenu();
    return { changeId, id };
  });
}

export async function deleteBlock(idInput: string): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "blocco");
    const block = await prisma.menuBlock.findFirst({ where: { id, deletedAt: null } });
    assert(block, "Blocco non trovato.");
    const now = new Date();
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuBlock.update({ where: { id }, data: { deletedAt: now } });
      return logChange(tx, {
        actorName: editor.name,
        action: "DELETE",
        entity: "block",
        entityId: id,
        label: blockSummary({ ...block, kind: block.kind, placement: block.placement }),
        before: { deletedAt: null },
        after: { deletedAt: now.toISOString() },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

// Riordino dentro lo stesso punto (cima, fondo, sezioni): l'ordine conta solo tra blocchi
// che compaiono insieme.
export async function moveBlock(idInput: string, directionInput: "up" | "down"): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    const id = parseId(idInput, "blocco");
    const direction = parseEnum(directionInput, ["up", "down"] as const, "direzione");
    const block = await prisma.menuBlock.findFirst({ where: { id, deletedAt: null } });
    assert(block, "Blocco non trovato.");

    const siblings = await prisma.menuBlock.findMany({
      where: { deletedAt: null, placement: block.placement },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const index = siblings.findIndex((s) => s.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= siblings.length) return;

    const reordered = siblings.slice();
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await prisma.$transaction(reordered.map((s, i) => prisma.menuBlock.update({ where: { id: s.id }, data: { sortOrder: i } })));
    revalidateMenu();
  });
}
