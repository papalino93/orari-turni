import { formatPrice, type MenuVariant } from "@/lib/menu-format";

// Più formati con il loro prezzo (es. birra 0,2 l · 0,4 l · 1 l), impilati
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

// Formati del gruppo (es. birre 0,2 l · 0,4 l · 1 l): intestazione con i nomi
// in colonna e, per ogni voce, i prezzi allineati sotto («—» se il formato non c'è).
export function FormatHeader({ formats }: { formats: string[] }) {
  return (
    <>
      {formats.map((f) => (
        <div key={f} className="menu-sans w-11 flex-none text-right text-[11px] font-medium leading-tight text-[#5B605A] sm:w-14">
          {f}
        </div>
      ))}
    </>
  );
}

export function FormatPrices({ formats, variants, soldOut }: { formats: string[]; variants: MenuVariant[] | null; soldOut?: boolean }) {
  return (
    <>
      {formats.map((f) => {
        const v = variants?.find((x) => x.label === f);
        return (
          <div key={f} className={`menu-sans w-11 flex-none text-right text-base font-medium text-[#6B1020] sm:w-14 ${soldOut ? "line-through" : ""}`}>
            {v ? formatPrice(v.cents) : "—"}
          </div>
        );
      })}
    </>
  );
}
