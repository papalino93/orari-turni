import { formatPrice, type MenuVariant } from "@/lib/menu-format";

// Più formati con il loro prezzo (es. birra 0,2 l · 0,4 l · Maß 1 l), impilati
// a destra della voce.
export function Variants({ variants, soldOut }: { variants: MenuVariant[]; soldOut?: boolean }) {
  return (
    <div className={`flex flex-none flex-col items-end gap-0.5 ${soldOut ? "line-through" : ""}`}>
      {variants.map((v) => (
        <div key={v.label} className="menu-sans flex items-baseline gap-2 text-base">
          <span className="text-[13px] text-[#5B605A]">{v.label}</span>
          <span className="min-w-8 text-right font-medium text-[#6B1020]">{formatPrice(v.cents)}</span>
        </div>
      ))}
    </div>
  );
}
