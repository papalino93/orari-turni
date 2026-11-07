import { redirect } from "next/navigation";
import { getMenuEditor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { businessDayKey, formatPrice, isSoldOut, parseFormats, parseVariants } from "@/lib/menu-format";
import { loadBlocks, loadDaily, loadDailyRecent, loadMenu, loadPromosForEditor, loadVenue } from "@/lib/menu";
import { MenuEditor, type EditorPromo, type EditorSection } from "./menu-editor";
import { buildHistory } from "./history";
import type { DailyRecent } from "./daily-ui";

type LoadedSection = Awaited<ReturnType<typeof loadMenu>>[number];

function toEditorSection(s: LoadedSection, dayKey: string): EditorSection {
  return {
    id: s.id,
    slug: s.slug,
    label: s.label,
    title: s.title,
    kicker: s.kicker,
    promoId: s.promoId,
    dailyOnly: s.dailyOnly,
    kind: s.kind,
    note: s.note,
    addonTitle: s.addonTitle,
    addon: s.addon,
    groups: s.groups.map((g) => ({
      id: g.id,
      title: g.title,
      columns: g.columns,
      formats: parseFormats(g.formats),
      items: g.items.map((i) => ({
        id: i.id,
        groupId: i.groupId,
        name: i.name,
        wineName: i.wineName,
        denomination: i.denomination,
        vintage: i.vintage,
        sub: i.sub,
        grapes: i.grapes,
        region: i.region,
        country: i.country,
        description: i.description,
        priceGlassCents: i.priceGlassCents,
        priceBottleCents: i.priceBottleCents,
        priceCents: i.priceCents,
        enomatic: i.enomatic,
        traits: i.traits,
        pairWineId: i.pairWineId,
        recommended: i.recommended,
        pairDishIds: i.pairDishIds,
        pairHideIds: i.pairHideIds,
        variants: parseVariants(i.variants),
        allergens: i.allergens,
        allergensReviewed: i.allergensReviewed,
        allergenTraces: i.allergenTraces,
        soldOut: isSoldOut(i, dayKey),
        textOnly: i.textOnly,
        availableFrom: i.availableFrom,
        availableTo: i.availableTo,
      })),
    })),
  };
}

// Prezzo in una riga, per l'elenco «Riproponi».
function priceLine(i: { priceGlassCents: number | null; priceBottleCents: number | null; priceCents: number | null; variants: unknown }): string {
  const variants = parseVariants(i.variants);
  if (variants) return variants.map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ");
  if (i.priceCents !== null) return `€ ${formatPrice(i.priceCents)}`;
  const parts: string[] = [];
  if (i.priceGlassCents !== null) parts.push(`Calice ${formatPrice(i.priceGlassCents)}`);
  if (i.priceBottleCents !== null) parts.push(`Bottiglia ${formatPrice(i.priceBottleCents)}`);
  return parts.join(" · ");
}

export default async function GestioneMenuPage() {
  // Il Proxy lascia arrivare qui qualsiasi login dipendente (non conosce il
  // permesso): è questa pagina a decidere. Senza permesso si torna alla
  // propria area, come per qualunque altra pagina non concessa.
  const editor = await getMenuEditor();
  if (!editor) redirect("/mie-ore");

  const dayKey = businessDayKey();
  const [menu, promoRows, blocks, venueData, dailyRows, dailyRecent, history] = await Promise.all([
    loadMenu(),
    loadPromosForEditor(),
    loadBlocks(),
    loadVenue(),
    loadDaily(dayKey),
    loadDailyRecent(dayKey),
    prisma.menuChange.findMany({ orderBy: { at: "desc" }, take: 120 }),
  ]);

  const sections = menu.map((s) => toEditorSection(s, dayKey));
  const dailySections = dailyRows.map((s) => toEditorSection(s, dayKey));
  const recent: DailyRecent[] = dailyRecent.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.group.section.kind,
    day: r.onlyDay ?? "",
    summary: priceLine(r),
  }));

  const promos: EditorPromo[] = promoRows.map((p) => ({
    id: p.id,
    kind: p.kind,
    slug: p.slug,
    title: p.title,
    label: p.label,
    body: p.body,
    showFrom: p.showFrom,
    startDate: p.startDate,
    endDate: p.endDate,
    startTime: p.startTime,
    endTime: p.endTime,
    hidden: p.hidden,
    imageVersion: p.imageUpdatedAt ? p.imageUpdatedAt.getTime() : null,
    menuMode: p.menuMode === "FILE" ? "FILE" : "ITEMS",
    hasMenu: p.hasMenu,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.getTime(),
    menuNote: p.menuNote,
    allergenNotice: p.allergenNotice,
    pages: p.pages,
    // Il titolo dell'evento è quello della pagina: la sezione collegata lo segue.
    section: p.section ? { ...toEditorSection(p.section, dayKey), title: p.title, label: p.title } : null,
  }));

  // Storico: per dire «Voce eliminata», i nomi della «Tabella prezzi» e che cosa ha annullato ogni annullamento.
  const idsOf = (entity: string) => [...new Set(history.filter((h) => h.entity === entity && !h.entityId.startsWith("*")).map((h) => h.entityId))];
  const priceIds = history.flatMap((h) => (h.entityId === "*prices" ? Object.keys(((h.after ?? {}) as { items?: Record<string, unknown> }).items ?? {}) : []));
  const restoreIds = history.filter((h) => h.action === "RESTORE").map((h) => h.id);
  const gone = { deletedAt: { not: null } } as const;
  const [deletedItems, deletedGroups, deletedSections, deletedPromos, deletedBlocks, priceNames, originals] = await Promise.all([
    prisma.menuItem.findMany({ where: { id: { in: idsOf("item") }, ...gone }, select: { id: true } }),
    prisma.menuGroup.findMany({ where: { id: { in: idsOf("group") }, ...gone }, select: { id: true } }),
    prisma.menuSection.findMany({ where: { id: { in: idsOf("section") }, ...gone }, select: { id: true } }),
    prisma.menuPromo.findMany({ where: { id: { in: idsOf("promo") }, ...gone }, select: { id: true } }),
    prisma.menuBlock.findMany({ where: { id: { in: idsOf("block") }, ...gone }, select: { id: true } }),
    prisma.menuItem.findMany({ where: { id: { in: [...new Set(priceIds)] } }, select: { id: true, name: true } }),
    prisma.menuChange.findMany({ where: { undoneById: { in: restoreIds } }, select: { undoneById: true, action: true } }),
  ]);
  const deleted = new Set([
    ...deletedItems.map((x) => `item:${x.id}`),
    ...deletedGroups.map((x) => `group:${x.id}`),
    ...deletedSections.map((x) => `section:${x.id}`),
    ...deletedPromos.map((x) => `promo:${x.id}`),
    ...deletedBlocks.map((x) => `block:${x.id}`),
  ]);
  const entries = buildHistory(history, {
    today: dayKey,
    deleted,
    names: new Map(priceNames.map((x) => [x.id, x.name])),
    undoneActions: new Map(originals.map((o) => [o.undoneById as string, o.action])),
  });

  return <MenuEditor sections={sections} daily={{ sections: dailySections, recent }} promos={promos} today={dayKey} blocks={blocks} venue={venueData} history={entries} canSeeStats={editor.role === "ADMIN"} />;
}
