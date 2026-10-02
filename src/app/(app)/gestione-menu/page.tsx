import { redirect } from "next/navigation";
import { getMenuEditor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { businessDayKey, formatPrice, isSoldOut, parseVariants } from "@/lib/menu-format";
import { loadBlocks, loadDaily, loadDailyRecent, loadMenu, loadPromosForEditor, loadVenue } from "@/lib/menu";
import { MenuEditor, type EditorPromo, type EditorSection, type HistoryEntry } from "./menu-editor";
import type { DailyRecent } from "./daily-ui";

type LoadedSection = Awaited<ReturnType<typeof loadMenu>>[number];

function toEditorSection(s: LoadedSection, dayKey: string): EditorSection {
  return {
    id: s.id,
    slug: s.slug,
    label: s.label,
    title: s.title,
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
      items: g.items.map((i) => ({
        id: i.id,
        groupId: i.groupId,
        name: i.name,
        sub: i.sub,
        grapes: i.grapes,
        region: i.region,
        country: i.country,
        description: i.description,
        priceGlassCents: i.priceGlassCents,
        priceBottleCents: i.priceBottleCents,
        priceCents: i.priceCents,
        enomatic: i.enomatic,
        pairWineId: i.pairWineId,
        variants: parseVariants(i.variants),
        allergens: i.allergens,
        allergensReviewed: i.allergensReviewed,
        soldOut: isSoldOut(i, dayKey),
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
    prisma.menuChange.findMany({ orderBy: { at: "desc" }, take: 60 }),
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
    hidden: p.hidden,
    imageVersion: p.imageUpdatedAt ? p.imageUpdatedAt.getTime() : null,
    // Il titolo dell'evento è quello della pagina: la sezione collegata lo segue.
    section: p.section ? { ...toEditorSection(p.section, dayKey), title: p.title, label: p.title } : null,
  }));

  const entries: HistoryEntry[] = history.map((h) => ({
    id: h.id,
    at: h.at.toISOString(),
    actorName: h.actorName,
    action: h.action,
    label: h.label,
    undone: h.undoneById !== null,
  }));

  return <MenuEditor sections={sections} daily={{ sections: dailySections, recent }} promos={promos} today={dayKey} blocks={blocks} venue={venueData} history={entries} />;
}
