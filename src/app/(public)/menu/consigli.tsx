import { Ornament } from "./ornament";

export type Consiglio = { id: string; name: string; sub: string | null; kind: "WINE" | "FOOD"; price: string };

// «I consigli della casa»: fino a 4 voci (vini e piatti) scelte dal titolare, sotto la copertina.
// Il tocco porta alla voce (e in basso compare «Torna a …», come per gli abbinamenti: vedi pairing.tsx).
export function ConsigliCasa({ items }: { items: Consiglio[] }) {
  if (items.length === 0) return null;
  return (
    <section id="v-consigli" aria-label="I consigli della casa" className="mx-auto max-w-[720px] px-6 pb-2 pt-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">La casa consiglia</div>
        <h2 className="menu-serif m-0 text-balance text-[34px] font-medium leading-[1.1] text-[#6B1020]">I consigli della casa</h2>
        <Ornament color="#9C7A45" />
      </div>
      <ul className="m-0 mt-6 grid list-none grid-cols-2 gap-2.5 p-0">
        {items.map((i) => (
          <li key={i.id} className="flex">
            <a
              href={`#v-${i.id}`}
              data-pair-from="consigli"
              data-pair-name="I consigli della casa"
              className="flex w-full flex-col gap-1 rounded-[10px] bg-[#C9A96E]/[0.13] px-3.5 pb-3 pt-2.5 !text-[#1F2621] no-underline"
            >
              <span className="menu-sans text-[9.5px] font-medium uppercase tracking-[0.28em] text-[#8A6A2E]">{i.kind === "WINE" ? "Vino" : "Piatto"}</span>
              <span className="menu-serif text-pretty text-[21px] font-medium italic leading-[1.12] text-[#6B1020] [overflow-wrap:anywhere]">{i.name}</span>
              {i.sub && <span className="menu-sans line-clamp-2 text-[12.5px] leading-[1.35] text-[#5B605A]">{i.sub}</span>}
              {i.price && <span className="menu-sans mt-auto pt-1 text-[14px] font-medium text-[#6B1020]">{i.price}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
