import { redirect } from "next/navigation";
import { getMenuEditor } from "@/lib/guard";
import { businessDayKey, formatPrice, isPromoMenuVisible, isSoldOut, parseVariants } from "@/lib/menu-format";
import { loadDaily, loadMenu, loadPromosForEditor } from "@/lib/menu";
import { ServiceView, type ServiceItem } from "./service-view";

type Row = {
  id: string;
  name: string;
  sub: string | null;
  description: string | null;
  priceGlassCents: number | null;
  priceBottleCents: number | null;
  priceCents: number | null;
  variants: unknown;
  soldOutDay: string | null;
};

function priceLine(i: Row): string {
  const variants = parseVariants(i.variants);
  if (variants) return variants.map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ");
  if (i.priceCents !== null) return `€ ${formatPrice(i.priceCents)}`;
  const parts: string[] = [];
  if (i.priceGlassCents !== null) parts.push(`Calice ${formatPrice(i.priceGlassCents)}`);
  if (i.priceBottleCents !== null) parts.push(`Bottiglia ${formatPrice(i.priceBottleCents)}`);
  return parts.join(" · ");
}

// Modalità servizio: un elenco unico di tutto ciò che si può segnare «Esaurito»,
// pensato per la sala (interruttori grandi, niente modifica per sbaglio).
export default async function ServicePage() {
  const editor = await getMenuEditor();
  if (!editor) redirect("/mie-ore");

  const dayKey = businessDayKey();
  const [menu, daily, promos] = await Promise.all([loadMenu(), loadDaily(dayKey), loadPromosForEditor()]);

  const items: ServiceItem[] = [];
  const push = (place: string, kind: "WINE" | "FOOD", groups: { title: string; items: Row[] }[]) => {
    for (const g of groups) {
      for (const i of g.items) {
        items.push({
          id: i.id,
          name: i.name,
          sub: (i.sub || i.description || "").slice(0, 90) || null,
          place,
          group: g.title,
          kind,
          price: priceLine(i),
          soldOut: isSoldOut(i, dayKey),
        });
      }
    }
  };
  // Prima «Oggi fuori menù» e gli eventi in corso: sono ciò che cambia più spesso.
  for (const s of daily) push("Oggi fuori menù", s.kind, s.groups);
  for (const p of promos) {
    if (p.kind === "EVENT" && p.section && isPromoMenuVisible(p, dayKey)) push(`Evento · ${p.title}`, p.section.kind, p.section.groups);
  }
  for (const s of menu) push(s.label, s.kind, s.groups);

  return <ServiceView items={items} />;
}
