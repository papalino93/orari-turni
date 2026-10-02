"use server";

import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { diff, logChange } from "@/lib/menu-log";
import { revalidateMenu } from "@/lib/menu";
import { copySectionBlocks, setSectionBlocks } from "@/lib/menu-block-sync";
import { assert, parseDateKey, parseEnum, parseId, parseText, runAction, type ActionResult } from "@/lib/validation";
import type { ChangeResult } from "./actions";

// Eventi e annunci ("In evidenza"). Stesso schema delle altre azioni: permesso
// riletto dal database a ogni chiamata, modifica registrata nello storico (con
// "Annulla"), cache delle pagine pubbliche rigenerata.

export type PromoInput = {
  kind: "NOTICE" | "EVENT";
  title: string;
  label?: string;
  body?: string;
  showFrom: string;
  startDate: string;
  endDate: string;
  // Solo eventi: quali blocchi del menù (coperto, chiusura cucina…) compaiono anche nel menù speciale.
  blockIds?: string[];
};

const MAX_IMAGE_BYTES = 900 * 1024;

function parsePromoFields(input: Pick<PromoInput, "title" | "label" | "body" | "showFrom" | "startDate" | "endDate">) {
  const title = parseText(input.title, "titolo", { max: 80, required: true });
  const label = parseText(input.label, "tipo", { max: 30 }) || null;
  const body = parseText(input.body, "testo", { max: 600 }) || null;
  const showFrom = parseDateKey(input.showFrom, "«mostra dal»");
  const startDate = parseDateKey(input.startDate, "di inizio");
  const endDate = parseDateKey(input.endDate, "di fine");
  assert(showFrom <= startDate, "«Mostra dal» non può essere dopo l'inizio.");
  assert(startDate <= endDate, "La data di fine non può essere prima dell'inizio.");
  return { title, label, body, showFrom, startDate, endDate };
}

// Indirizzo stabile e leggibile: resta lo stesso anche se il titolo cambia,
// così un link già condiviso non si rompe.
async function uniqueSlug(title: string): Promise<string> {
  const base =
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "pagina";
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await prisma.menuPromo.findUnique({ where: { slug } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function parseBlockIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 60).map((id) => parseId(id, "blocco"));
}

function snapshot(p: {
  title: string;
  label: string | null;
  body: string | null;
  showFrom: string;
  startDate: string;
  endDate: string;
  hidden: boolean;
}) {
  return { title: p.title, label: p.label, body: p.body, showFrom: p.showFrom, startDate: p.startDate, endDate: p.endDate, hidden: p.hidden };
}

export async function createPromo(input: PromoInput): Promise<ActionResult<ChangeResult & { id: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const kind = parseEnum(input.kind, ["NOTICE", "EVENT"] as const, "tipo");
    const fields = parsePromoFields(input);
    const slug = await uniqueSlug(fields.title);

    const result = await prisma.$transaction(async (tx) => {
      const promo = await tx.menuPromo.create({ data: { kind, slug, ...fields } });
      if (kind === "EVENT") {
        const section = await tx.menuSection.create({
          data: {
            slug: `evento-${promo.id}`,
            label: fields.title,
            kicker: "Evento",
            title: fields.title,
            kind: "FOOD",
            sortOrder: 100,
            promoId: promo.id,
          },
        });
        await setSectionBlocks(tx, section.id, parseBlockIds(input.blockIds), editor.name);
      }
      const changeId = await logChange(tx, {
        actorName: editor.name,
        action: "CREATE",
        entity: "promo",
        entityId: promo.id,
        label: fields.title,
        after: snapshot(promo),
      });
      return { changeId, id: promo.id };
    });
    revalidateMenu();
    return result;
  });
}

export async function updatePromo(idInput: string, input: PromoInput): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "pagina");
    const promo = await prisma.menuPromo.findFirst({ where: { id, deletedAt: null }, include: { section: true } });
    assert(promo, "Pagina non trovata.");
    const fields = parsePromoFields(input);

    const changed = diff(snapshot(promo), fields);
    const blockIds = promo.section && input.blockIds !== undefined ? parseBlockIds(input.blockIds) : null;
    const blocksChanged =
      blockIds !== null &&
      promo.section !== null &&
      (await prisma.menuBlock.findMany({ where: { deletedAt: null, placement: "SECTIONS" } })).some(
        (b) => b.sectionIds.includes(promo.section!.id) !== blockIds.includes(b.id),
      );
    if (!changed && !blocksChanged) return { changeId: null };

    const changeId = await prisma.$transaction(async (tx) => {
      if (changed) await tx.menuPromo.update({ where: { id }, data: fields });
      if (blocksChanged && promo.section && blockIds) await setSectionBlocks(tx, promo.section.id, blockIds, editor.name);
      if (!changed) return null;
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "promo",
        entityId: id,
        label: fields.title,
        before: changed.before,
        after: changed.after,
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

export async function setPromoHidden(idInput: string, hiddenInput: boolean): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "pagina");
    const hidden = Boolean(hiddenInput);
    const promo = await prisma.menuPromo.findFirst({ where: { id, deletedAt: null } });
    assert(promo, "Pagina non trovata.");
    if (promo.hidden === hidden) return { changeId: null };

    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuPromo.update({ where: { id }, data: { hidden } });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "promo",
        entityId: id,
        label: promo.title,
        before: { hidden: promo.hidden },
        after: { hidden },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

// Eliminazione "morbida": sparisce dal menù e dalla gestione, ma resta recuperabile dallo storico.
export async function deletePromo(idInput: string): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "pagina");
    const promo = await prisma.menuPromo.findFirst({ where: { id, deletedAt: null } });
    assert(promo, "Pagina non trovata.");
    const now = new Date();
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuPromo.update({ where: { id }, data: { deletedAt: now } });
      return logChange(tx, {
        actorName: editor.name,
        action: "DELETE",
        entity: "promo",
        entityId: id,
        label: promo.title,
        before: { deletedAt: null },
        after: { deletedAt: now.toISOString() },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

// Copia pagina, menù speciale (gruppi, voci, formati, allergeni) e locandina;
// si scelgono nuovo titolo e nuove date. L'esaurito non si copia.
export async function duplicatePromo(
  idInput: string,
  input: Pick<PromoInput, "title" | "showFrom" | "startDate" | "endDate">,
): Promise<ActionResult<ChangeResult & { id: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "pagina");
    const source = await prisma.menuPromo.findFirst({
      where: { id, deletedAt: null },
      include: {
        image: true,
        section: {
          include: {
            groups: {
              where: { deletedAt: null },
              orderBy: { sortOrder: "asc" },
              include: { items: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
            },
          },
        },
      },
    });
    assert(source, "Pagina non trovata.");
    const fields = parsePromoFields({ ...input, label: source.label ?? "", body: source.body ?? "" });
    const slug = await uniqueSlug(fields.title);

    const result = await prisma.$transaction(async (tx) => {
      const copy = await tx.menuPromo.create({
        data: {
          kind: source.kind,
          slug,
          ...fields,
          imageUpdatedAt: source.image ? new Date() : null,
          imageWidth: source.imageWidth,
          imageHeight: source.imageHeight,
        },
      });
      if (source.image) {
        await tx.menuPromoImage.create({
          data: { promoId: copy.id, data: source.image.data, mimeType: source.image.mimeType },
        });
      }
      if (source.section) {
        const section = await tx.menuSection.create({
          data: {
            slug: `evento-${copy.id}`,
            label: fields.title,
            kicker: source.section.kicker,
            title: fields.title,
            kind: source.section.kind,
            note: source.section.note,
            addonTitle: source.section.addonTitle,
            addon: source.section.addon,
            sortOrder: source.section.sortOrder,
            promoId: copy.id,
          },
        });
        await copySectionBlocks(tx, source.section.id, section.id, editor.name);
        for (const group of source.section.groups) {
          const newGroup = await tx.menuGroup.create({
            data: { sectionId: section.id, title: group.title, columns: group.columns, sortOrder: group.sortOrder },
          });
          if (group.items.length > 0) {
            await tx.menuItem.createMany({
              data: group.items.map((item) => ({
                groupId: newGroup.id,
                name: item.name,
                sub: item.sub,
                grapes: item.grapes,
                description: item.description,
                priceGlassCents: item.priceGlassCents,
                priceBottleCents: item.priceBottleCents,
                priceCents: item.priceCents,
                variants: item.variants ?? undefined,
                enomatic: item.enomatic,
                allergens: item.allergens,
                allergensReviewed: item.allergensReviewed,
                sortOrder: item.sortOrder,
              })),
            });
          }
        }
      }
      const changeId = await logChange(tx, {
        actorName: editor.name,
        action: "CREATE",
        entity: "promo",
        entityId: copy.id,
        label: fields.title,
        after: snapshot(copy),
      });
      return { changeId, id: copy.id };
    });
    revalidateMenu();
    return result;
  });
}

// Locandina: la foto arriva già ridimensionata dal telefono (JPEG); qui si
// controlla comunque tipo reale, peso e dimensioni.
export async function savePromoImage(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    const id = parseId(formData.get("promoId"), "pagina");
    const promo = await prisma.menuPromo.findFirst({ where: { id, deletedAt: null } });
    assert(promo, "Pagina non trovata.");

    const file = formData.get("file");
    assert(file instanceof Blob && file.size > 0, "Nessuna foto selezionata.");
    assert(file.size <= MAX_IMAGE_BYTES, "La foto è troppo pesante.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45;
    assert(isJpeg || isPng || isWebp, "Formato non supportato: usa una foto JPEG, PNG o WebP.");
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));
    assert(Number.isInteger(width) && width >= 100 && width <= 4000, "Dimensioni della foto non valide.");
    assert(Number.isInteger(height) && height >= 100 && height <= 4000, "Dimensioni della foto non valide.");

    const mimeType = isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";
    const data = Buffer.from(bytes);
    await prisma.$transaction([
      prisma.menuPromoImage.upsert({
        where: { promoId: id },
        create: { promoId: id, data, mimeType },
        update: { data, mimeType },
      }),
      prisma.menuPromo.update({
        where: { id },
        data: { imageUpdatedAt: new Date(), imageWidth: width, imageHeight: height },
      }),
    ]);
    revalidateMenu();
  });
}

export async function removePromoImage(idInput: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    const id = parseId(idInput, "pagina");
    const promo = await prisma.menuPromo.findFirst({ where: { id, deletedAt: null } });
    assert(promo, "Pagina non trovata.");
    await prisma.$transaction([
      prisma.menuPromoImage.deleteMany({ where: { promoId: id } }),
      prisma.menuPromo.update({ where: { id }, data: { imageUpdatedAt: null, imageWidth: null, imageHeight: null } }),
    ]);
    revalidateMenu();
  });
}
