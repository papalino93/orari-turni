"use server";

import { Prisma, type MenuSectionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { ALLERGEN_CODES } from "@/lib/allergens";
import { diff, logChange, type Fields } from "@/lib/menu-log";
import { businessDayKey, parseVariants, type MenuVariant } from "@/lib/menu-format";
import { MAX_IMPORT_ROWS, type ImportRowInput } from "@/lib/menu-import";
import { parsePrice, revalidateMenu } from "@/lib/menu";
import { assert, parseEnum, parseId, parseText, runAction, ValidationError, type ActionResult } from "@/lib/validation";

// Ogni azione qui sotto parte da requireMenuEditor(): il Proxy non conosce il
// permesso "può modificare il menù" (vive nel database), quindi questo è il
// confine reale — vedi lib/guard.ts.

// Il toast "Annulla" usa changeId per tornare indietro con undoChange().
export type ChangeResult = { changeId: string | null };

export type ItemInput = {
  name: string;
  groupId: string;
  sub?: string;
  grapes?: string;
  // Solo vini, facoltativi.
  region?: string;
  country?: string;
  description?: string;
  priceGlass?: string;
  priceBottle?: string;
  price?: string;
  enomatic?: boolean;
  // Solo vini: etichetta «Consigliato».
  recommended?: boolean;
  // Solo piatti: il vino da abbinare (uno solo), vuoto = nessuno.
  pairWineId?: string | null;
  // Solo piatti. allergensReviewed false = "da compilare" (non è "nessuno").
  allergens?: string[];
  allergensReviewed?: boolean;
  // Più formati con prezzo (es. birra 0,2 l · 0,4 l · Maß 1 l): alternativi al prezzo singolo.
  variants?: { label: string; price: string }[];
};

const ITEM_KEYS = [
  "name",
  "sub",
  "grapes",
  "region",
  "country",
  "description",
  "priceGlassCents",
  "priceBottleCents",
  "priceCents",
  "enomatic",
  "recommended",
  "pairWineId",
  "allergens",
  "allergensReviewed",
  "variants",
  "groupId",
] as const;

// Campi che un annullamento può riscrivere, per entità: l'istantanea viene
// dal nostro stesso registro, ma una lista chiusa evita comunque che una riga
// anomala possa toccare campi che non c'entrano.
const RESTORABLE: Record<string, readonly string[]> = {
  item: [...ITEM_KEYS, "soldOutDay", "deletedAt"],
  group: ["title", "columns", "deletedAt"],
  section: ["note", "addonTitle", "addon"],
  promo: ["title", "label", "body", "showFrom", "startDate", "endDate", "hidden", "deletedAt"],
  block: ["kind", "label", "text", "priceCents", "placement", "sectionIds", "startDate", "endDate", "hidden", "deletedAt"],
};

function parseAllergens(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  for (const code of list) {
    assert(typeof code === "string" && ALLERGEN_CODES.includes(code), "Allergene non valido.");
  }
  // Ordine fisso (quello della legge) e senza doppioni.
  return ALLERGEN_CODES.filter((code) => list.includes(code));
}

function parseVariantInput(value: unknown): MenuVariant[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  assert(value.length <= 8, "Al massimo 8 formati per voce.");
  return value.map((v: { label?: unknown; price?: unknown }, i) => {
    const label = parseText(v?.label, `del formato ${i + 1}`, { max: 30, required: true });
    const cents = parsePrice(v?.price, `del formato «${label}»`);
    assert(cents !== null, `Manca il prezzo del formato «${label}».`);
    return { label, cents };
  });
}

// I formati si salvano come JSON; nessun formato = colonna vuota (null SQL).
function toItemData<T extends { variants: MenuVariant[] | null }>(data: T) {
  return { ...data, variants: data.variants && data.variants.length > 0 ? data.variants : Prisma.DbNull };
}

function parseItemInput(kind: MenuSectionKind, input: ItemInput) {
  const name = parseText(input.name, "nome", { max: 120, required: true });
  if (kind === "WINE") {
    const sub = parseText(input.sub, "sottotitolo", { max: 160 }) || null;
    const grapes = parseText(input.grapes, "uvaggio", { max: 200 }) || null;
    const region = parseText(input.region, "regione", { max: 60 }) || null;
    const country = parseText(input.country, "nazione", { max: 60 }) || null;
    const priceGlassCents = parsePrice(input.priceGlass, "al calice");
    const priceBottleCents = parsePrice(input.priceBottle, "alla bottiglia");
    assert(priceGlassCents !== null || priceBottleCents !== null, "Inserisci almeno un prezzo (calice o bottiglia).");
    return {
      name,
      sub,
      grapes,
      region,
      country,
      description: null,
      priceGlassCents,
      priceBottleCents,
      priceCents: null,
      enomatic: Boolean(input.enomatic),
      recommended: Boolean(input.recommended),
      pairWineId: null as string | null,
      // I vini non hanno allergeni per voce: vale la nota unica "solfiti".
      allergens: [] as string[],
      allergensReviewed: false,
      variants: null as MenuVariant[] | null,
    };
  }
  const description = parseText(input.description, "descrizione", { max: 300 }) || null;
  const allergensReviewed = Boolean(input.allergensReviewed);
  const variants = parseVariantInput(input.variants);
  const priceCents = variants ? null : parsePrice(input.price, "prezzo");
  assert(variants !== null || priceCents !== null, "Inserisci il prezzo, oppure almeno un formato con il suo prezzo.");
  return {
    name,
    sub: null,
    grapes: null,
    region: null,
    country: null,
    description,
    priceGlassCents: null,
    priceBottleCents: null,
    priceCents,
    enomatic: false,
    recommended: false,
    // Controllato in saveItem (deve essere un vino del menù): qui solo la forma.
    pairWineId: input.pairWineId ? parseId(input.pairWineId, "vino da abbinare") : null,
    allergens: allergensReviewed ? parseAllergens(input.allergens) : [],
    allergensReviewed,
    variants,
  };
}

function itemSnapshot(item: Fields): Fields {
  const out: Fields = {};
  for (const key of ITEM_KEYS) {
    // Righe registrate prima di «Consigliato»: assente vale «spento».
    out[key] = key === "variants" ? parseVariants(item[key]) : key === "recommended" ? Boolean(item[key]) : (item[key] ?? null);
  }
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
    // «Abbinalo con»: solo per i piatti del menù fisso, e solo con un vino del menù
    // fisso (non di un evento né di «Oggi fuori menù», che spariscono).
    if (data.pairWineId) {
      if (group.section.promoId || group.section.dailyOnly) data.pairWineId = null;
      else {
        const wine = await prisma.menuItem.findFirst({
          where: { id: data.pairWineId, deletedAt: null, group: { deletedAt: null, section: { kind: "WINE", promoId: null, dailyOnly: false } } },
          select: { id: true },
        });
        assert(wine, "Il vino da abbinare non è più nel menù: scegline un altro.");
      }
    }

    if (!idInput) {
      const last = await prisma.menuItem.findFirst({
        where: { groupId, deletedAt: null },
        orderBy: { sortOrder: "desc" },
      });
      const changeId = await prisma.$transaction(async (tx) => {
        const created = await tx.menuItem.create({
          data: {
            ...toItemData(data),
            groupId,
            sortOrder: (last?.sortOrder ?? -1) + 1,
            // «Oggi fuori menù»: la voce vale solo per il giorno commerciale in corso.
            ...(group.section.dailyOnly ? { onlyDay: businessDayKey() } : {}),
          },
        });
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
        data: { ...toItemData(data), groupId, ...(moved ? { sortOrder: (last?.sortOrder ?? -1) + 1 } : {}) },
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

// "Aggiungi più voci": l'anteprima è già stata controllata nel browser, ma ogni
// riga viene comunque rivalidata qui. Tutto in una sola transazione e un solo
// record di storico, così un solo "Annulla" toglie l'intero inserimento.
export async function importItems(
  groupIdInput: string,
  rows: ImportRowInput[],
): Promise<ActionResult<ChangeResult & { count: number }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const groupId = parseId(groupIdInput, "gruppo");
    assert(Array.isArray(rows) && rows.length > 0, "Nessuna voce da aggiungere.");
    assert(rows.length <= MAX_IMPORT_ROWS, `Massimo ${MAX_IMPORT_ROWS} voci per volta.`);
    const group = await prisma.menuGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { section: true },
    });
    assert(group, "Gruppo non trovato.");

    const parsed = rows.map((row, i) => {
      try {
        return parseItemInput(group.section.kind, { ...row, groupId });
      } catch (error) {
        if (error instanceof ValidationError) throw new ValidationError(`Voce ${i + 1}: ${error.message}`);
        throw error;
      }
    });

    const last = await prisma.menuItem.findFirst({
      where: { groupId, deletedAt: null },
      orderBy: { sortOrder: "desc" },
    });
    const base = (last?.sortOrder ?? -1) + 1;
    const result = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const [i, data] of parsed.entries()) {
        const created = await tx.menuItem.create({ data: { ...toItemData(data), groupId, sortOrder: base + i } });
        ids.push(created.id);
      }
      const changeId = await logChange(tx, {
        actorName: editor.name,
        action: "CREATE",
        entity: "item",
        entityId: "*",
        label: `${ids.length} voci in «${group.title}»`,
        after: { itemIds: ids, group: group.title },
      });
      return { changeId, count: ids.length };
    });
    revalidateMenu();
    return result;
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
          region: source.region,
          country: source.country,
          description: source.description,
          priceGlassCents: source.priceGlassCents,
          priceBottleCents: source.priceBottleCents,
          priceCents: source.priceCents,
          enomatic: source.enomatic,
          // L'abbinamento segue il piatto; «Consigliato» resta solo sull'originale.
          pairWineId: source.pairWineId,
          allergens: source.allergens,
          allergensReviewed: source.allergensReviewed,
          variants: source.variants === null ? Prisma.DbNull : (source.variants as Prisma.InputJsonValue),
          onlyDay: source.onlyDay,
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

// «Riproponi»: rimette tra le voci di oggi un piatto o un vino già proposto
// in un giorno passato (copia, la voce di ieri resta nello storico).
export async function reproposeItem(idInput: string): Promise<ActionResult<ChangeResult & { id: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "voce");
    const source = await prisma.menuItem.findFirst({ where: { id, deletedAt: null }, include: { group: { include: { section: true } } } });
    assert(source && source.group.section.dailyOnly, "Voce non trovata.");
    const today = businessDayKey();
    assert(source.onlyDay !== today, "È già tra le voci di oggi.");

    const result = await prisma.$transaction(async (tx) => {
      const last = await tx.menuItem.findFirst({ where: { groupId: source.groupId, deletedAt: null, onlyDay: today }, orderBy: { sortOrder: "desc" } });
      const copy = await tx.menuItem.create({
        data: {
          groupId: source.groupId,
          name: source.name,
          sub: source.sub,
          grapes: source.grapes,
          region: source.region,
          country: source.country,
          description: source.description,
          priceGlassCents: source.priceGlassCents,
          priceBottleCents: source.priceBottleCents,
          priceCents: source.priceCents,
          enomatic: source.enomatic,
          allergens: source.allergens,
          allergensReviewed: source.allergensReviewed,
          variants: source.variants === null ? Prisma.DbNull : (source.variants as Prisma.InputJsonValue),
          onlyDay: today,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      // Pulizia: le voci «oggi fuori menù» più vecchie di 60 giorni non servono più.
      const cutoff = new Date(`${today}T12:00:00Z`);
      cutoff.setUTCDate(cutoff.getUTCDate() - 60);
      await tx.menuItem.deleteMany({
        where: { onlyDay: { lt: cutoff.toISOString().slice(0, 10) }, group: { section: { dailyOnly: true } } },
      });
      const changeId = await logChange(tx, {
        actorName: editor.name,
        action: "CREATE",
        entity: "item",
        entityId: copy.id,
        label: `${copy.name} (riproposto oggi)`,
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
  input: { note?: string; addonTitle?: string; addon?: string },
): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "sezione");
    const section = await prisma.menuSection.findUnique({ where: { id } });
    assert(section, "Sezione non trovata.");

    const next = {
      note: parseText(input.note, "nota", { max: 300 }) || null,
      addonTitle: parseText(input.addonTitle, "titolo dell'avviso", { max: 120 }) || null,
      addon: parseText(input.addon, "avviso", { max: 500 }) || null,
    };
    const changed = diff(
      { note: section.note, addonTitle: section.addonTitle, addon: section.addon },
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
  if (key === "variants") return value === null || value === undefined ? Prisma.DbNull : value;
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
      const entity = change.entity as "item" | "group" | "section" | "promo" | "block";
      const before = (change.before ?? {}) as Fields;

      // Inserimento in blocco: l'annullamento toglie tutte le voci aggiunte insieme.
      if (change.action === "CREATE" && change.entityId === "*") {
        const ids = (((change.after ?? {}) as Fields).itemIds ?? []) as string[];
        assert(ids.length > 0, "Niente da annullare.");
        await tx.menuItem.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } });
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
        entity === "item"
          ? tx.menuItem
          : entity === "group"
            ? tx.menuGroup
            : entity === "block"
              ? tx.menuBlock
              : entity === "promo"
                ? tx.menuPromo
                : tx.menuSection;
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
