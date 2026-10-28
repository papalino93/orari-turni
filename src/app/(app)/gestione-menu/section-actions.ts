"use server";

import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { diff, logChange } from "@/lib/menu-log";
import { revalidateMenu } from "@/lib/menu";
import { assert, parseEnum, parseId, parseText, runAction, type ActionResult } from "@/lib/validation";
import type { ChangeResult } from "./actions";

// Categorie del menù (le sezioni fisse: Bollicine, Tartare, Salatini…): si creano,
// si rinominano e si eliminano dalla gestione. Eliminazione morbida, come gruppi e
// voci: dallo storico si annulla tutto. Le sezioni degli eventi e di «Oggi» no.

// Indirizzi già usati dal menù (/menu#…): una categoria non può chiamarsi così.
const RESERVED = new Set(["oggi", "carta", "consigli", "v-consigli", "menu", "evento", "allergeni"]);

function slugify(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "categoria";
}

async function freeSlug(title: string): Promise<string> {
  const base = slugify(title);
  const taken = new Set(
    (await prisma.menuSection.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((s) => s.slug),
  );
  if (!taken.has(base) && !RESERVED.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const regular = { promoId: null, dailyOnly: false, deletedAt: null } as const;

export type SectionInput = {
  title: string;
  label?: string;
  kicker?: string;
  kind?: "WINE" | "FOOD";
  // Nuova categoria: dopo quale va (null = prima di tutte).
  afterId?: string | null;
};

export async function createSection(input: SectionInput): Promise<ActionResult<ChangeResult & { slug: string }>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const title = parseText(input.title, "nome", { max: 40, required: true });
    const kind = parseEnum(input.kind, ["WINE", "FOOD"] as const, "tipo");
    const kicker = parseText(input.kicker, "riga sopra al titolo", { max: 40 }) || (kind === "WINE" ? "Vini" : "Cucina");
    const existing = await prisma.menuSection.findMany({ where: regular, orderBy: { sortOrder: "asc" } });
    assert(existing.length < 30, "Troppe categorie.");
    assert(
      !existing.some((s) => s.title.toLowerCase() === title.toLowerCase()),
      `C'è già una categoria «${title}».`,
    );
    let position = existing.length;
    if (input.afterId === null) position = 0;
    else if (input.afterId) {
      const afterId = parseId(input.afterId, "categoria");
      const index = existing.findIndex((s) => s.id === afterId);
      assert(index !== -1, "La categoria scelta non esiste più.");
      position = index + 1;
    }
    const slug = await freeSlug(title);

    const changeId = await prisma.$transaction(async (tx) => {
      const section = await tx.menuSection.create({ data: { slug, label: title, kicker, title, kind, sortOrder: 0 } });
      // Un primo gruppo con lo stesso nome: si può subito aggiungere le voci.
      await tx.menuGroup.create({ data: { sectionId: section.id, title, columns: kind === "WINE", sortOrder: 0 } });
      const order = [...existing.slice(0, position).map((s) => s.id), section.id, ...existing.slice(position).map((s) => s.id)];
      for (const [i, id] of order.entries()) await tx.menuSection.update({ where: { id }, data: { sortOrder: i } });
      return logChange(tx, {
        actorName: editor.name,
        action: "CREATE",
        entity: "section",
        entityId: section.id,
        label: `Nuova categoria «${title}»`,
        after: { title, kind },
      });
    });
    revalidateMenu();
    return { changeId, slug };
  });
}

export async function updateSection(idInput: string, input: SectionInput): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "categoria");
    const section = await prisma.menuSection.findFirst({ where: { id, ...regular } });
    assert(section, "Categoria non trovata.");
    const next = {
      title: parseText(input.title, "nome", { max: 40, required: true }),
      label: parseText(input.label, "nome nella barra", { max: 40 }) || "",
      kicker: parseText(input.kicker, "riga sopra al titolo", { max: 40, required: true }),
    };
    if (!next.label) next.label = next.title;
    const others = await prisma.menuSection.findMany({ where: { ...regular, NOT: { id } }, select: { title: true } });
    assert(!others.some((s) => s.title.toLowerCase() === next.title.toLowerCase()), `C'è già una categoria «${next.title}».`);
    const changed = diff({ title: section.title, label: section.label, kicker: section.kicker }, next);
    if (!changed) return { changeId: null };
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuSection.update({ where: { id }, data: next });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "section",
        entityId: id,
        label: next.title,
        before: changed.before,
        after: changed.after,
      });
    });
    revalidateMenu();
    return { changeId };
  });
}

export async function deleteSection(idInput: string): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    const id = parseId(idInput, "categoria");
    const section = await prisma.menuSection.findFirst({ where: { id, ...regular } });
    assert(section, "Categoria non trovata.");
    const left = await prisma.menuSection.count({ where: regular });
    assert(left > 1, "Il menù deve avere almeno una categoria.");
    const now = new Date();
    const changeId = await prisma.$transaction(async (tx) => {
      await tx.menuSection.update({ where: { id }, data: { deletedAt: now } });
      return logChange(tx, {
        actorName: editor.name,
        action: "DELETE",
        entity: "section",
        entityId: id,
        label: `Categoria «${section.title}»`,
        before: { deletedAt: null },
        after: { deletedAt: now.toISOString() },
      });
    });
    revalidateMenu();
    return { changeId };
  });
}
