import { redirect } from "next/navigation";
import { getMenuEditor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { businessDayKey, isSoldOut } from "@/lib/menu-format";
import { loadCover, loadMenu } from "@/lib/menu";
import { MenuEditor, type EditorSection, type HistoryEntry } from "./menu-editor";

export default async function GestioneMenuPage() {
  // Il Proxy lascia arrivare qui qualsiasi login dipendente (non conosce il
  // permesso): è questa pagina a decidere. Senza permesso si torna alla
  // propria area, come per qualunque altra pagina non concessa.
  const editor = await getMenuEditor();
  if (!editor) redirect("/mie-ore");

  const dayKey = businessDayKey();
  const [menu, cover, history] = await Promise.all([
    loadMenu(),
    loadCover(),
    prisma.menuChange.findMany({ orderBy: { at: "desc" }, take: 60 }),
  ]);

  const sections: EditorSection[] = menu.map((s) => ({
    id: s.id,
    slug: s.slug,
    label: s.label,
    title: s.title,
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
        allergens: i.allergens,
        allergensReviewed: i.allergensReviewed,
        soldOut: isSoldOut(i, dayKey),
      })),
    })),
  }));

  const entries: HistoryEntry[] = history.map((h) => ({
    id: h.id,
    at: h.at.toISOString(),
    actorName: h.actorName,
    action: h.action,
    label: h.label,
    undone: h.undoneById !== null,
  }));

  return <MenuEditor sections={sections} cover={cover} history={entries} />;
}
