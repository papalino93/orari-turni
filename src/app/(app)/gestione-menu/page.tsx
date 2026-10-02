import { redirect } from "next/navigation";
import { getMenuEditor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { businessDayKey, isSoldOut, parseVariants } from "@/lib/menu-format";
import { loadCoverInfo, loadMenu, loadPromosForEditor } from "@/lib/menu";
import { MenuEditor, type EditorPromo, type EditorSection, type HistoryEntry } from "./menu-editor";

type LoadedSection = Awaited<ReturnType<typeof loadMenu>>[number];

function toEditorSection(s: LoadedSection, dayKey: string): EditorSection {
  return {
    id: s.id,
    slug: s.slug,
    label: s.label,
    title: s.title,
    promoId: s.promoId,
    kind: s.kind,
    note: s.note,
    coverApplies: s.coverApplies,
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
        description: i.description,
        priceGlassCents: i.priceGlassCents,
        priceBottleCents: i.priceBottleCents,
        priceCents: i.priceCents,
        enomatic: i.enomatic,
        variants: parseVariants(i.variants),
        allergens: i.allergens,
        allergensReviewed: i.allergensReviewed,
        soldOut: isSoldOut(i, dayKey),
      })),
    })),
  };
}

export default async function GestioneMenuPage() {
  // Il Proxy lascia arrivare qui qualsiasi login dipendente (non conosce il
  // permesso): è questa pagina a decidere. Senza permesso si torna alla
  // propria area, come per qualunque altra pagina non concessa.
  const editor = await getMenuEditor();
  if (!editor) redirect("/mie-ore");

  const dayKey = businessDayKey();
  const [menu, promoRows, coverInfo, history] = await Promise.all([
    loadMenu(),
    loadPromosForEditor(),
    loadCoverInfo(),
    prisma.menuChange.findMany({ orderBy: { at: "desc" }, take: 60 }),
  ]);

  const sections = menu.map((s) => toEditorSection(s, dayKey));

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

  return <MenuEditor sections={sections} promos={promos} today={dayKey} coverInfo={coverInfo} history={entries} />;
}
