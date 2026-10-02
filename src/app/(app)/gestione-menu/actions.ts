"use server";

import type { MenuChangeAction, MenuSectionKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { businessDayKey } from "@/lib/menu-format";
import { parsePrice, revalidateMenu } from "@/lib/menu";
import { assert, parseEnum, parseId, parseText, runAction, type ActionResult } from "@/lib/validation";

// Ogni azione qui sotto parte da requireMenuEditor(): il Proxy non conosce il
// permesso "può modificare il menù" (vive nel database), quindi questo è il
// confine reale — vedi lib/guard.ts.

type Tx = Prisma.TransactionClient;
type Fields = Record<string, unknown>;

// Il toast "Annulla" usa changeId per tornare indietro con undoChange().
export type ChangeResult = { changeId: string | null };

export type ItemInput = {
  name: string;
  groupId: string;
  sub?: string;
  grapes?: string;
  description?: string;
  priceGlass?: string;
  priceBottle?: string;
  price?: string;
  enomatic?: boolean;
};

const ITEM_KEYS = [
  "name",
  "sub",
  "grapes",
  "description",
  "priceGlassCents",
  "priceBottleCents",
  "priceCents",
  "enomatic",
  "groupId",
] as const;

// Campi che un annullamento può riscrivere, per entità: l'istantanea viene
// dal nostro stesso registro, ma una lista chiusa evita comunque che una riga
// anomala possa toccare campi che non c'entrano.
const RESTORABLE: Record<string, readonly string[]> = {
  item: [...ITEM_KEYS, "soldOutDay", "deletedAt", "allergens", "allergensReviewed"],
  group: ["title", "columns", "deletedAt"],
  section: ["note", "cover", "addonTitle", "addon"],
};

async function logChange(
  tx: Tx,
  entry: {
    actorName: string;
    action: MenuChangeAction;
    entity: "item" | "group" | "section";
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
function diff(before: Fields, after: Fields): { before: Fields; after: Fields } | null {
  const b: Fields = {};
  const a: Fields = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      b[key] = before[key] ?? null;
      a[key] = after[key] ?? null;
    }
  }
  return Object.keys(a).length === 0 ? null : { before: b, after: a };
}

function parseItemInput(kind: MenuSectionKind, input: ItemInput) {
  const name = parseText(input.name, "nome", { max: 120, required: true });
  if (kind === "WINE") {
    const sub = parseText(input.sub, "sottotitolo", { max: 160 }) || null;
    const grapes = parseText(input.grapes, "uvaggio", { max: 200 }) || null;
    const priceGlassCents = parsePrice(input.priceGlass, "al calice");
    const priceBottleCents = parsePrice(input.priceBottle, "alla bottiglia");
    assert(priceGlassCents !== null || priceBottleCents !== null, "Inserisci almeno un prezzo (calice o bottiglia).");
    return {
      name,
      sub,
      grapes,
      description: null,
      priceGlassCents,
      priceBottleCents,
      priceCents: null,
      enomatic: Boolean(input.enomatic),
    };
  }
  const description = parseText(input.description, "descrizione", { max: 300 }) || null;
  const priceCents = parsePrice(input.price, "prezzo");
  assert(priceCents !== null, "Inserisci il prezzo.");
  return {
    name,
    sub: null,
    grapes: null,
    description,
    priceGlassCents: null,
    priceBottleCents: null,
    priceCents,
    enomatic: false,
  };
}

function itemSnapshot(item: Fields): Fields {
  const out: Fields = {};
  for (const key of ITEM_KEYS) out[key] = item[key] ?? null;
  return out;
}

// --- Voci --------------------------------------------------------------------

export async function saveItem(idInput: string | null, input: ItemInput): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const groupId = parseId(input.groupId, "gruppo");
    const group = await prisma.menuGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { section: true },
    });
    assert(group, "Gruppo non trovato.");
    const data = parseItemInput(group.section.kind, input);

    if (!idInput) {
      const last = await prisma.menuItem.findFirst({
        where: { groupId, deletedAt: null },
        orderBy: { sortOrder: "desc" },
      });
      const changeId = await prisma.$transaction(async (tx) => {
        const created = await tx.menuItem.create({ data: { ...data, groupId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
        return logChange(tx, {
          actorName: editor.name,
          action: "CREATE",
          entity: "item",
          entityId: created.id,
          label: created.name,
          after: itemSnapshot(created),
        });
      });
      revalidateMenu();
      return { changeId };
    }

    const id = parseId(idInput, "voce");
    const existing = await prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
      include: { group: { include: { section: true } } },
    });
    assert(existing, "Voce non trovata.");
    // Tra sezioni dello stesso tipo si può spostare (un vino nella sezione
    // sbagliata); da vino a piatto no: i campi non sono gli stessi.
    assert(existing.group.section.kind === group.section.kind, "Non puoi spostare un vino tra i piatti o viceversa.");

    const moved = existing.groupId !== groupId;
    const changed = diff(itemSnapshot(existing), { ...data, groupId });
    if (!changed) return { changeId: null };

    const last = moved
      ? await prisma.menuItem.findFirst({ where: { groupId, deletedAt: null }, orderBy: { sortOrder: "desc" } })
      : null;
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuItem.update({
        where: { id },
        data: { ...data, groupId, ...(moved ? { sortOrder: (last?.sortOrder ?? -1) + 1 } : {}) },
      });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "item",
        entityId: id,
        label: data.name,
        before: changed.before,
        after: changed.after,
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

export async function duplicateItem(idInput: string): Promise<ActionResult<ChangeResult & { id: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "voce");
    const source = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    assert(source, "Voce non trovata.");

    const result = await prisma.$transaction(async (tx) => {
      await tx.menuItem.updateMany({
        where: { groupId: source.groupId, deletedAt: null, sortOrder: { gt: source.sortOrder } },
        data: { sortOrder: { increment: 1 } },
      });
      const copy = await tx.menuItem.create({
        data: {
          groupId: source.groupId,
          name: source.name,
          sub: source.sub,
          grapes: source.grapes,
          description: source.description,
          priceGlassCents: source.priceGlassCents,
          priceBottleCents: source.priceBottleCents,
          priceCents: source.priceCents,
          enomatic: source.enomatic,
          allergens: source.allergens,
          allergensReviewed: source.allergensReviewed,
          sortOrder: source.sortOrder + 1,
        },
      });
      const changeId = await logChange(tx, {
        actorName: editor.name,
        action: "CREATE",
        entity: "item",
        entityId: copy.id,
        label: copy.name,
        after: itemSnapshot(copy),
      });
      return { changeId, id: copy.id };
    });
    revalidateMenu();
    return result;
  });
}

export async function deleteItem(idInput: string): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "voce");
    const item = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    assert(item, "Voce non trovata.");
    const now = new Date();
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuItem.update({ where: { id }, data: { deletedAt: now } });
      return logChange(tx, {
        actorName: editor.name,
        action: "DELETE",
        entity: "item",
        entityId: id,
        label: item.name,
        before: { deletedAt: null },
        after: { deletedAt: now.toISOString() },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

export async function setSoldOut(idInput: string, soldOutInput: boolean): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "voce");
    const item = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    assert(item, "Voce non trovata.");

    const soldOutDay = soldOutInput ? businessDayKey() : null;
    if (item.soldOutDay === soldOutDay) return { changeId: null };
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuItem.update({ where: { id }, data: { soldOutDay } });
      return logChange(tx, {
        actorName: editor.name,
        action: soldOutInput ? "SOLD_OUT" : "AVAILABLE",
        entity: "item",
        entityId: id,
        label: item.name,
        before: { soldOutDay: item.soldOutDay },
        after: { soldOutDay },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

// "Riattiva tutto" a inizio turno. Azzera anche eventuali segni vecchi (di
// giorni passati, già senza effetto) per non lasciare dati morti in giro.
export async function resetSoldOut(): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const today = businessDayKey();
    const marked = await prisma.menuItem.findMany({
      where: { deletedAt: null, soldOutDay: { not: null } },
      select: { id: true, name: true, soldOutDay: true },
    });
    if (marked.length === 0) return { changeId: null };

    const activeToday = marked.filter((m) => m.soldOutDay === today);
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuItem.updateMany({
        where: { id: { in: marked.map((m) => m.id) } },
        data: { soldOutDay: null },
      });
      if (activeToday.length === 0) return null;
      return logChange(tx, {
        actorName: editor.name,
        action: "RESET_SOLD_OUT",
        entity: "item",
        entityId: "*",
        label: activeToday.length === 1 ? activeToday[0].name : `${activeToday.length} voci`,
        before: { items: activeToday.map((m) => ({ id: m.id, soldOutDay: m.soldOutDay })) },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

export async function moveItem(idInput: string, directionInput: "up" | "down"): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    const id = parseId(idInput, "voce");
    const direction = parseEnum(directionInput, ["up", "down"] as const, "direzione");
    const item = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    assert(item, "Voce non trovata.");

    const siblings = await prisma.menuItem.findMany({
      where: { groupId: item.groupId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const index = siblings.findIndex((s) => s.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= siblings.length) return;

    // Gli ordini possono avere valori uguali: si riscrive l'intero gruppo
    // invece di scambiare solo due numeri (che in quel caso non sposterebbe nulla).
    const reordered = siblings.slice();
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await prisma.$transaction(
      reordered.map((s, i) => prisma.menuItem.update({ where: { id: s.id }, data: { sortOrder: i } })),
    );
    revalidateMenu();
  });
}

// --- Gruppi ------------------------------------------------------------------

export async function createGroup(sectionIdInput: string, titleInput: string): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const sectionId = parseId(sectionIdInput, "sezione");
    const title = parseText(titleInput, "nome del gruppo", { max: 80, required: true });
    const section = await prisma.menuSection.findUnique({ where: { id: sectionId } });
    assert(section, "Sezione non trovata.");

    const last = await prisma.menuGroup.findFirst({
      where: { sectionId, deletedAt: null },
      orderBy: { sortOrder: "desc" },
    });
    const changeId = await prisma.$transaction(async (tx) => {
      const group = await tx.menuGroup.create({
        data: { sectionId, title, columns: section.kind === "WINE", sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
      return logChange(tx, {
        actorName: editor.name,
        action: "CREATE",
        entity: "group",
        entityId: group.id,
        label: title,
        after: { title, columns: group.columns },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

export async function renameGroup(idInput: string, titleInput: string): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "gruppo");
    const title = parseText(titleInput, "nome del gruppo", { max: 80, required: true });
    const group = await prisma.menuGroup.findFirst({ where: { id, deletedAt: null } });
    assert(group, "Gruppo non trovato.");
    if (group.title === title) return { changeId: null };

    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuGroup.update({ where: { id }, data: { title } });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "group",
        entityId: id,
        label: title,
        before: { title: group.title },
        after: { title },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

export async function moveGroup(idInput: string, directionInput: "up" | "down"): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    const id = parseId(idInput, "gruppo");
    const direction = parseEnum(directionInput, ["up", "down"] as const, "direzione");
    const group = await prisma.menuGroup.findFirst({ where: { id, deletedAt: null } });
    assert(group, "Gruppo non trovato.");

    const siblings = await prisma.menuGroup.findMany({
      where: { sectionId: group.sectionId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    const index = siblings.findIndex((s) => s.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= siblings.length) return;

    const reordered = siblings.slice();
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await prisma.$transaction(
      reordered.map((s, i) => prisma.menuGroup.update({ where: { id: s.id }, data: { sortOrder: i } })),
    );
    revalidateMenu();
  });
}

// Eliminazione "morbida": il gruppo (e con lui le sue voci) sparisce dal menù
// ma resta recuperabile dallo storico.
export async function deleteGroup(idInput: string): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "gruppo");
    const group = await prisma.menuGroup.findFirst({ where: { id, deletedAt: null } });
    assert(group, "Gruppo non trovato.");
    const now = new Date();
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuGroup.update({ where: { id }, data: { deletedAt: now } });
      return logChange(tx, {
        actorName: editor.name,
        action: "DELETE",
        entity: "group",
        entityId: id,
        label: group.title,
        before: { deletedAt: null },
        after: { deletedAt: now.toISOString() },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

// --- Testi della sezione -----------------------------------------------------

export async function updateSectionTexts(
  idInput: string,
  input: { note?: string; cover?: string; addonTitle?: string; addon?: string },
): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "sezione");
    const section = await prisma.menuSection.findUnique({ where: { id } });
    assert(section, "Sezione non trovata.");

    const next = {
      note: parseText(input.note, "nota", { max: 300 }) || null,
      cover: parseText(input.cover, "coperto", { max: 80 }) || null,
      addonTitle: parseText(input.addonTitle, "titolo dell'avviso", { max: 120 }) || null,
      addon: parseText(input.addon, "avviso", { max: 500 }) || null,
    };
    const changed = diff(
      { note: section.note, cover: section.cover, addonTitle: section.addonTitle, addon: section.addon },
      next,
    );
    if (!changed) return { changeId: null };

    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuSection.update({ where: { id }, data: next });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "section",
        entityId: id,
        label: section.title,
        before: changed.before,
        after: changed.after,
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

// --- Annulla / ripristina ----------------------------------------------------

function toColumn(key: string, value: unknown): unknown {
  if (key === "deletedAt") return typeof value === "string" ? new Date(value) : null;
  return value;
}

// Riscrive i campi "prima" di una modifica registrata. Vale sia per il toast
// "Annulla" subito dopo, sia per "Ripristina" dallo storico (anche a distanza
// di giorni: torna al valore di allora, senza guardare cosa è successo dopo).
export async function undoChange(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "modifica");
    const change = await prisma.menuChange.findUnique({ where: { id } });
    assert(change, "Modifica non trovata.");
    assert(!change.undoneById, "Questa modifica è già stata annullata.");

    await prisma.$transaction(async (tx) => {
      const entity = change.entity as "item" | "group" | "section";
      const before = (change.before ?? {}) as Fields;

      if (change.action === "RESET_SOLD_OUT") {
        const items = (before.items ?? []) as { id: string; soldOutDay: string | null }[];
        for (const it of items) {
          await tx.menuItem.updateMany({ where: { id: it.id, deletedAt: null }, data: { soldOutDay: it.soldOutDay } });
        }
        const undoId = await logChange(tx, {
          actorName: editor.name,
          action: "RESTORE",
          entity: "item",
          entityId: "*",
          label: change.label,
        });
        await tx.menuChange.update({ where: { id }, data: { undoneById: undoId } });
        return;
      }

      // Creazione annullata = eliminazione morbida; il resto riscrive i campi
      // "prima" (per un'eliminazione includono deletedAt: null).
      const writeBack: Fields =
        change.action === "CREATE" ? { deletedAt: new Date().toISOString() } : { ...before };
      const allowed = RESTORABLE[entity] ?? [];
      const data: Fields = {};
      for (const key of Object.keys(writeBack)) {
        if (allowed.includes(key)) data[key] = toColumn(key, writeBack[key]);
      }
      assert(Object.keys(data).length > 0, "Niente da ripristinare.");

      const delegate =
        entity === "item" ? tx.menuItem : entity === "group" ? tx.menuGroup : tx.menuSection;
      const current = await (delegate as unknown as {
        findUnique: (args: { where: { id: string } }) => Promise<Fields | null>;
      }).findUnique({ where: { id: change.entityId } });
      assert(current, "L'elemento non esiste più.");
      await (delegate as unknown as {
        update: (args: { where: { id: string }; data: Fields }) => Promise<unknown>;
      }).update({ where: { id: change.entityId }, data });

      const currentValues: Fields = {};
      const newValues: Fields = {};
      for (const key of Object.keys(data)) {
        const cur = current[key];
        currentValues[key] = cur instanceof Date ? cur.toISOString() : (cur ?? null);
        const next = data[key];
        newValues[key] = next instanceof Date ? next.toISOString() : (next ?? null);
      }
      const undoId = await logChange(tx, {
        actorName: editor.name,
        action: "RESTORE",
        entity,
        entityId: change.entityId,
        label: change.label,
        before: currentValues,
        after: newValues,
      });
      await tx.menuChange.update({ where: { id }, data: { undoneById: undoId } });
    });
    revalidateMenu();
  });
}
