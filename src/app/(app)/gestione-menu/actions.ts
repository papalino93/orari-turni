"use server";

import { Prisma, type MenuSectionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { ALLERGEN_CODES } from "@/lib/allergens";
import { WINE_TRAIT_CODES, sortTraits } from "@/lib/wine-traits";
import { insertionIndex, isItalianWine } from "@/lib/wine-order";
import { diff, logChange, type Fields } from "@/lib/menu-log";
import { businessDayKey, parseFormats, parseVariants, type MenuVariant } from "@/lib/menu-format";
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
  // Solo vini: nome proprio, denominazione, annata (il nome della voce è l'azienda).
  wineName?: string;
  denomination?: string;
  vintage?: string;
  grapes?: string;
  // Solo vini, facoltativi.
  region?: string;
  country?: string;
  description?: string;
  priceGlass?: string;
  priceBottle?: string;
  price?: string;
  enomatic?: boolean;
  // Solo vini: caratteristiche (vedi lib/wine-traits.ts).
  traits?: string[];
  // Solo piatti: il vino da abbinare (uno solo), vuoto = nessuno.
  pairWineId?: string | null;
  // Solo piatti. allergensReviewed false = "da compilare" (non è "nessuno").
  allergens?: string[];
  allergensReviewed?: boolean;
  // Più formati con prezzo (es. birra 0,2 l · 0,4 l · 1 l): alternativi al prezzo singolo.
  variants?: { label: string; price: string }[];
};

const ITEM_KEYS = [
  "name",
  "wineName",
  "denomination",
  "vintage",
  "sub",
  "grapes",
  "region",
  "country",
  "description",
  "priceGlassCents",
  "priceBottleCents",
  "priceCents",
  "enomatic",
  "traits",
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
  group: ["title", "columns", "formats", "deletedAt"],
  section: ["note", "addonTitle", "addon"],
  promo: ["title", "label", "body", "showFrom", "startDate", "endDate", "hidden", "hasMenu", "deletedAt"],
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

function parseTraits(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  for (const code of list) assert(typeof code === "string" && WINE_TRAIT_CODES.includes(code), "Caratteristica del vino non valida.");
  return sortTraits(list as string[]);
}

function parseVariantInput(value: unknown): MenuVariant[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  assert(value.length <= 8, "Al massimo 8 formati per voce.");
  return value.map((v: { label?: unknown; price?: unknown }, i) => {
    assert(typeof v?.label === "string" && v.label.trim(), `Manca il nome del formato ${i + 1} (es. 0,4 l).`);
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

// requireRegion: dalla scheda la regione dei vini italiani è obbligatoria; «Incolla più
// voci» non ha la colonna, e la gestione segnala poi «Manca la regione».
function parseItemInput(kind: MenuSectionKind, input: ItemInput, { requireRegion = false } = {}) {
  const name = parseText(input.name, "nome", { max: 120, required: true });
  if (kind === "WINE") {
    const wineName = parseText(input.wineName, "nome del vino", { max: 120 }) || null;
    const vintage = parseText(input.vintage, "annata", { max: 20 }) || null;
    // «Incolla più voci» manda la seconda colonna come `sub`: diventa la denominazione.
    const denomination = parseText(input.denomination ?? (input.wineName === undefined ? input.sub : undefined), "denominazione", { max: 120 }) || null;
    // Il vecchio sottotitolo resta solo se la scheda lo rimanda (vini non ancora divisi).
    const sub = input.wineName === undefined ? null : parseText(input.sub, "sottotitolo", { max: 160 }) || null;
    const grapes = parseText(input.grapes, "uvaggio", { max: 200 }) || null;
    const region = parseText(input.region, "regione", { max: 60 }) || null;
    const country = parseText(input.country, "nazione", { max: 60 }) || null;
    assert(!requireRegion || region || !isItalianWine({ country }), "Per i vini italiani la regione è obbligatoria (es. Toscana). Per un vino estero scrivi la nazione.");
    const priceGlassCents = parsePrice(input.priceGlass, "al calice");
    const priceBottleCents = parsePrice(input.priceBottle, "alla bottiglia");
    assert(priceGlassCents !== null || priceBottleCents !== null, "Inserisci almeno un prezzo (calice o bottiglia).");
    return {
      name,
      wineName,
      denomination,
      vintage,
      sub,
      grapes,
      region,
      country,
      description: null,
      priceGlassCents,
      priceBottleCents,
      priceCents: null,
      enomatic: Boolean(input.enomatic),
      traits: parseTraits(input.traits),
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
  const priceCents = variants ? null : parsePrice(input.price, "");
  assert(variants !== null || priceCents !== null, "Inserisci il prezzo, oppure almeno un formato con il suo prezzo.");
  return {
    name,
    wineName: null,
    denomination: null,
    vintage: null,
    sub: null,
    grapes: null,
    region: null,
    country: null,
    description,
    priceGlassCents: null,
    priceBottleCents: null,
    priceCents,
    enomatic: false,
    traits: [] as string[],
    // Controllato in saveItem (deve essere un vino del menù): qui solo la forma.
    pairWineId: input.pairWineId ? parseId(input.pairWineId, "vino da abbinare") : null,
    allergens: allergensReviewed ? parseAllergens(input.allergens) : [],
    allergensReviewed,
    variants,
  };
}

// Posto di un vino nuovo (o spostato in un altro gruppo) nel menù fisso: secondo
// l'ordine della carta (Toscana, poi nord → sud, poi estero; vedi lib/wine-order.ts),
// rispetto a com'è ordinato il gruppo adesso, anche a mano. Fa spazio spostando
// in giù chi viene dopo e restituisce il sortOrder da usare.
async function wineSortOrder(
  tx: Prisma.TransactionClient,
  groupId: string,
  wine: { name: string; region: string | null; country: string | null },
): Promise<number> {
  const list = await tx.menuItem.findMany({
    where: { groupId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, region: true, country: true, sortOrder: true },
  });
  const i = insertionIndex(list, wine);
  if (i >= list.length) return (list.at(-1)?.sortOrder ?? -1) + 1;
  const at = list[i].sortOrder;
  await tx.menuItem.updateMany({ where: { groupId, deletedAt: null, sortOrder: { gte: at } }, data: { sortOrder: { increment: 1 } } });
  return at;
}

function itemSnapshot(item: Fields): Fields {
  const out: Fields = {};
  for (const key of ITEM_KEYS) {
    if (key === "variants") out[key] = parseVariants(item[key]);
    else if (key === "traits") out[key] = Array.isArray(item[key]) ? item[key] : [];
    else out[key] = item[key] ?? null;
  }
  return out;
}

// --- Voci --------------------------------------------------------------------

export async function saveItem(idInput: string | null, input: ItemInput): Promise<ActionResult<ChangeResult & { id?: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const groupId = parseId(input.groupId, "gruppo");
    const group = await prisma.menuGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { section: true },
    });
    assert(group, "Gruppo non trovato.");
    const data = parseItemInput(group.section.kind, input, { requireRegion: true });
    // Abbinamento consigliato: solo per i piatti del menù fisso, e solo con un vino del menù
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
      // Vini del menù fisso: al posto della loro regione. Il resto: in fondo al gruppo.
      const byRegion = group.section.kind === "WINE" && !group.section.dailyOnly && !group.section.promoId;
      const { changeId, created } = await prisma.$transaction(async (tx) => {
        const created = await tx.menuItem.create({
          data: {
            ...toItemData(data),
            groupId,
            sortOrder: byRegion ? await wineSortOrder(tx, groupId, data) : (last?.sortOrder ?? -1) + 1,
            // «Oggi fuori menù»: la voce vale solo per il giorno commerciale in corso.
            ...(group.section.dailyOnly ? { onlyDay: businessDayKey() } : {}),
          },
        });
        const changeId = await logChange(tx, {
          actorName: editor.name,
          action: "CREATE",
          entity: "item",
          entityId: created.id,
          label: created.name,
          after: itemSnapshot(created),
        });
        return { changeId, created };
      });
      revalidateMenu();
      return { changeId, id: created.id };
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
      // Spostato in un altro gruppo: un vino va al posto della sua regione, il resto in fondo.
      const movedOrder = !moved
        ? null
        : group.section.kind === "WINE" && !group.section.dailyOnly && !group.section.promoId
          ? await wineSortOrder(tx, groupId, data)
          : (last?.sortOrder ?? -1) + 1;
      await tx.menuItem.update({
        where: { id },
        data: { ...toItemData(data), groupId, ...(movedOrder !== null ? { sortOrder: movedOrder } : {}) },
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

    // Gruppo con i formati: i prezzi per colonna diventano i formati della voce.
    const formats = group.section.kind === "FOOD" ? parseFormats(group.formats) : null;
    const parsed = rows.map((row, i) => {
      try {
        const variants =
          formats && Array.isArray(row.formatPrices)
            ? formats.flatMap((label, j) => (String(row.formatPrices?.[j] ?? "").trim() ? [{ label, price: String(row.formatPrices?.[j]) }] : []))
            : undefined;
        return parseItemInput(group.section.kind, { ...row, groupId, ...(variants ? { variants, price: "" } : {}) });
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
          wineName: source.wineName,
          denomination: source.denomination,
          vintage: source.vintage,
          sub: source.sub,
          grapes: source.grapes,
          region: source.region,
          country: source.country,
          description: source.description,
          priceGlassCents: source.priceGlassCents,
          priceBottleCents: source.priceBottleCents,
          priceCents: source.priceCents,
          enomatic: source.enomatic,
          traits: source.traits,
          // L'abbinamento segue il piatto.
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
          wineName: source.wineName,
          denomination: source.denomination,
          vintage: source.vintage,
          sub: source.sub,
          grapes: source.grapes,
          region: source.region,
          country: source.country,
          description: source.description,
          priceGlassCents: source.priceGlassCents,
          priceBottleCents: source.priceBottleCents,
          priceCents: source.priceCents,
          enomatic: source.enomatic,
          traits: source.traits,
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

export async function moveItem(idInput: string, directionInput: "up" | "down" | "top" | "bottom"): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    const id = parseId(idInput, "voce");
    const direction = parseEnum(directionInput, ["up", "down", "top", "bottom"] as const, "direzione");
    const item = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    assert(item, "Voce non trovata.");

    const siblings = await prisma.menuItem.findMany({
      where: { groupId: item.groupId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const index = siblings.findIndex((s) => s.id === id);
    if (index === -1) return;
    const reordered = siblings.slice();
    if (direction === "top" || direction === "bottom") {
      // «In cima» / «In fondo»: la voce va prima o ultima del suo gruppo.
      const [moving] = reordered.splice(index, 1);
      if (direction === "top") reordered.unshift(moving);
      else reordered.push(moving);
    } else {
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= siblings.length) return;
      // Gli ordini possono avere valori uguali: si riscrive l'intero gruppo
      // invece di scambiare solo due numeri (che in quel caso non sposterebbe nulla).
      [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    }
    await prisma.$transaction(
      reordered.map((s, i) => prisma.menuItem.update({ where: { id: s.id }, data: { sortOrder: i } })),
    );
    revalidateMenu();
  });
}

// «Riordina»: nuovo ordine di sezioni (menù fisso), gruppi di una sezione o voci
// di un gruppo, tutto insieme. Un solo record di storico: «Annulla» rimette
// l'ordine di prima. Gli id devono essere esattamente quelli attuali.
export async function reorder(
  levelInput: "section" | "group" | "item",
  parentIdInput: string | null,
  idsInput: string[],
): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const level = parseEnum(levelInput, ["section", "group", "item"] as const, "livello");
    assert(Array.isArray(idsInput) && idsInput.length > 0 && idsInput.length <= 500, "Elenco non valido.");
    const ids = idsInput.map((x) => parseId(x, "elemento"));

    let current: { id: string; sortOrder: number }[];
    let label: string;
    if (level === "section") {
      current = await prisma.menuSection.findMany({ where: { promoId: null, dailyOnly: false }, select: { id: true, sortOrder: true } });
      label = "Ordine delle sezioni";
    } else if (level === "group") {
      const sectionId = parseId(parentIdInput, "sezione");
      const section = await prisma.menuSection.findUnique({ where: { id: sectionId } });
      assert(section, "Sezione non trovata.");
      current = await prisma.menuGroup.findMany({ where: { sectionId, deletedAt: null }, select: { id: true, sortOrder: true } });
      label = `Ordine dei gruppi · ${section.label}`;
    } else {
      const groupId = parseId(parentIdInput, "gruppo");
      const group = await prisma.menuGroup.findFirst({ where: { id: groupId, deletedAt: null } });
      assert(group, "Gruppo non trovato.");
      current = await prisma.menuItem.findMany({ where: { groupId, deletedAt: null }, select: { id: true, sortOrder: true } });
      label = `Ordine delle voci · ${group.title}`;
    }
    assert(
      current.length === ids.length && new Set(ids).size === ids.length && ids.every((id) => current.some((c) => c.id === id)),
      "Il menù è cambiato nel frattempo: chiudi e riapri «Riordina».",
    );

    const before: Record<string, number> = Object.fromEntries(current.map((c) => [c.id, c.sortOrder]));
    const after: Record<string, number> = Object.fromEntries(ids.map((id, i) => [id, i]));
    const changeId = await prisma.$transaction(async (tx) => {
      for (const [id, sortOrder] of Object.entries(after)) {
        if (level === "section") await tx.menuSection.update({ where: { id }, data: { sortOrder } });
        else if (level === "group") await tx.menuGroup.update({ where: { id }, data: { sortOrder } });
        else await tx.menuItem.update({ where: { id }, data: { sortOrder } });
      }
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: level,
        entityId: "*order",
        label,
        before: { order: before },
        after: { order: after },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

// Riga di solo testo tra le voci di un gruppo (es. «Tutti i piatti con pane fatto
// in casa»): niente prezzo né allergeni. Si sposta ed elimina come le voci.
export async function saveTextRow(idInput: string | null, groupIdInput: string, textInput: string): Promise<ActionResult<ChangeResult & { id: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const groupId = parseId(groupIdInput, "gruppo");
    const text = parseText(textInput, "testo", { max: 300, required: true });
    const group = await prisma.menuGroup.findFirst({ where: { id: groupId, deletedAt: null } });
    assert(group, "Gruppo non trovato.");
    if (idInput) {
      const id = parseId(idInput, "riga");
      const row = await prisma.menuItem.findFirst({ where: { id, deletedAt: null, textOnly: true } });
      assert(row, "Riga non trovata.");
      if (row.name === text) return { changeId: null, id };
      const changeId = await prisma.$transaction(async (tx) => {
        await tx.menuItem.update({ where: { id }, data: { name: text } });
        return logChange(tx, { actorName: editor.name, action: "UPDATE", entity: "item", entityId: id, label: text.slice(0, 60), before: { name: row.name }, after: { name: text } });
      });
      revalidateMenu();
      return { changeId, id };
    }
    const last = await prisma.menuItem.findFirst({ where: { groupId, deletedAt: null }, orderBy: { sortOrder: "desc" } });
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.menuItem.create({
        data: { groupId, name: text, textOnly: true, allergensReviewed: true, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
      const changeId = await logChange(tx, { actorName: editor.name, action: "CREATE", entity: "item", entityId: row.id, label: text.slice(0, 60), after: { name: text } });
      return { changeId, id: row.id };
    });
    revalidateMenu();
    return result;
  });
}

// «Tabella prezzi»: tanti prezzi in una volta (calice/bottiglia per i vini,
// prezzo o prezzi dei formati per il resto). Un solo record di storico con i
// prezzi di prima: «Annulla» li rimette tutti.
// `formats`: un prezzo per formato del gruppo (birre 0,2 l · 0,4 l · 1 l), vuoto = non disponibile.
export type PriceChange = { id: string; priceGlass?: string; priceBottle?: string; price?: string; variants?: string[]; formats?: string[] };

export async function savePrices(changesInput: PriceChange[]): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    assert(Array.isArray(changesInput) && changesInput.length > 0 && changesInput.length <= 500, "Nessun prezzo da salvare.");
    const ids = changesInput.map((c) => parseId(c?.id, "voce"));
    assert(new Set(ids).size === ids.length, "Elenco non valido.");
    const items = await prisma.menuItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { group: { select: { formats: true, section: { select: { kind: true, label: true } } } } },
    });
    assert(items.length === ids.length, "Il menù è cambiato nel frattempo: chiudi e riapri la tabella dei prezzi.");

    const before: Record<string, Fields> = {};
    const after: Record<string, Fields> = {};
    for (const [i, change] of changesInput.entries()) {
      const item = items.find((x) => x.id === ids[i])!;
      const who = `«${item.name}»`;
      if (item.group.section.kind === "WINE") {
        const priceGlassCents = parsePrice(change.priceGlass, `al calice di ${who}`);
        const priceBottleCents = parsePrice(change.priceBottle, `alla bottiglia di ${who}`);
        assert(priceGlassCents !== null || priceBottleCents !== null, `${who}: serve almeno un prezzo (calice o bottiglia).`);
        before[item.id] = { priceGlassCents: item.priceGlassCents, priceBottleCents: item.priceBottleCents };
        after[item.id] = { priceGlassCents, priceBottleCents };
        continue;
      }
      const groupFormats = parseFormats(item.group.formats);
      if (groupFormats && Array.isArray(change.formats)) {
        const list = change.formats;
        assert(list.length === groupFormats.length, "Il menù è cambiato nel frattempo: chiudi e riapri la tabella dei prezzi.");
        const next = groupFormats.flatMap((label, j) => {
          const cents = parsePrice(list[j], `del formato «${label}» di ${who}`);
          return cents === null ? [] : [{ label, cents }];
        });
        assert(next.length > 0, `${who}: serve almeno un prezzo.`);
        before[item.id] = { variants: parseVariants(item.variants), priceCents: item.priceCents };
        after[item.id] = { variants: next, priceCents: null };
        continue;
      }
      const variants = parseVariants(item.variants);
      if (variants && variants.length > 0) {
        const list = Array.isArray(change.variants) ? change.variants : [];
        assert(list.length === variants.length, "Il menù è cambiato nel frattempo: chiudi e riapri la tabella dei prezzi.");
        const next = variants.map((v, j) => {
          const cents = parsePrice(list[j], `del formato «${v.label}» di ${who}`);
          assert(cents !== null, `Manca il prezzo del formato «${v.label}» di ${who}.`);
          return { label: v.label, cents };
        });
        before[item.id] = { variants };
        after[item.id] = { variants: next };
        continue;
      }
      const priceCents = parsePrice(change.price, `di ${who}`);
      assert(priceCents !== null, `${who}: manca il prezzo.`);
      before[item.id] = { priceCents: item.priceCents };
      after[item.id] = { priceCents };
    }

    const labels = [...new Set(items.map((x) => x.group.section.label))];
    const changeId = await prisma.$transaction(async (tx) => {
      for (const [id, data] of Object.entries(after)) await tx.menuItem.update({ where: { id }, data: data as Prisma.MenuItemUpdateInput });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "item",
        entityId: "*prices",
        label: `Prezzi di ${ids.length === 1 ? "1 voce" : `${ids.length} voci`} · ${labels.join(", ")}`,
        before: { items: before },
        after: { items: after },
      });
    });
    revalidateMenu();
    return { changeId };
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

// Formati del gruppo (colonne di prezzi): da 2 a 4 nomi, oppure nessuno.
// I prezzi già scritti nelle voci con lo stesso nome di formato restano validi.
export async function setGroupFormats(idInput: string, formatsInput: string[]): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "gruppo");
    assert(Array.isArray(formatsInput) && formatsInput.length <= 4, "Al massimo 4 formati per gruppo.");
    const formats = formatsInput.map((f, i) => parseText(f, `formato ${i + 1}`, { max: 20 })).filter(Boolean);
    assert(formats.length === 0 || formats.length >= 2, "Servono almeno 2 formati (oppure nessuno).");
    assert(new Set(formats.map((f) => f.toLowerCase())).size === formats.length, "Due formati hanno lo stesso nome.");
    const group = await prisma.menuGroup.findFirst({ where: { id, deletedAt: null } });
    assert(group, "Gruppo non trovato.");
    const before = parseFormats(group.formats);
    const after = formats.length ? formats : null;
    if (JSON.stringify(before) === JSON.stringify(after)) return { changeId: null };
    // Stesso numero di formati con nomi corretti (es. «0,2l» → «0,2 l»): i prezzi
    // delle voci seguono il nuovo nome, così nessuna colonna resta vuota.
    const renames =
      before && after && before.length === after.length ? before.map((b, j) => [b, after[j]] as const).filter(([b, a]) => b !== a) : [];
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuGroup.update({ where: { id }, data: { formats: after ?? Prisma.DbNull } });
      if (renames.length > 0) {
        const items = await tx.menuItem.findMany({ where: { groupId: id, deletedAt: null } });
        for (const it of items) {
          const variants = parseVariants(it.variants);
          if (!variants?.some((v) => renames.some(([b]) => b === v.label))) continue;
          const next = variants.map((v) => ({ ...v, label: renames.find(([b]) => b === v.label)?.[1] ?? v.label }));
          await tx.menuItem.update({ where: { id: it.id }, data: { variants: next } });
        }
      }
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "group",
        entityId: id,
        label: `Formati · ${group.title}`,
        before: { formats: before },
        after: { formats: after },
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
  if (key === "variants" || key === "formats") return value === null || value === undefined ? Prisma.DbNull : value;
  if (key === "traits") return Array.isArray(value) ? value : [];
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

      // Nuovo ordine («Riordina»): si rimette l'ordine di prima.
      if (change.entityId === "*order") {
        const order = (before.order ?? {}) as Record<string, number>;
        for (const [rowId, sortOrder] of Object.entries(order)) {
          // Eventi e annunci: null = di nuovo in ordine per data.
          if (entity === "promo") await tx.menuPromo.updateMany({ where: { id: rowId }, data: { sortOrder: sortOrder as number | null } });
          else if (entity === "section") await tx.menuSection.updateMany({ where: { id: rowId }, data: { sortOrder } });
          else if (entity === "group") await tx.menuGroup.updateMany({ where: { id: rowId }, data: { sortOrder } });
          else await tx.menuItem.updateMany({ where: { id: rowId }, data: { sortOrder } });
        }
        const undoId = await logChange(tx, {
          actorName: editor.name,
          action: "RESTORE",
          entity: entity === "section" || entity === "group" || entity === "promo" ? entity : "item",
          entityId: "*order",
          label: change.label,
        });
        await tx.menuChange.update({ where: { id }, data: { undoneById: undoId } });
        return;
      }

      // «Tabella prezzi»: si rimettono i prezzi di prima di tutte le voci.
      if (change.entityId === "*prices") {
        const items = (before.items ?? {}) as Record<string, Fields>;
        for (const [rowId, fields] of Object.entries(items)) {
          const data: Fields = {};
          for (const key of ["priceGlassCents", "priceBottleCents", "priceCents", "variants"]) if (key in fields) data[key] = fields[key];
          await tx.menuItem.updateMany({ where: { id: rowId, deletedAt: null }, data: data as Prisma.MenuItemUpdateManyMutationInput });
        }
        const undoId = await logChange(tx, {
          actorName: editor.name,
          action: "RESTORE",
          entity: "item",
          entityId: "*prices",
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
