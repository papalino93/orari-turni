import { type MenuBlockView, nb, priceLine } from "@/lib/menu-format";

// Informazioni del menù (coperto, chiusura cucina, avvisi…): tre aspetti, uno per
// tipo. Le voci con prezzo sono righe in maiuscoletto bordeaux, i testi paragrafi
// in corsivo, gli avvisi riquadri con filetti. Chi li usa passa già solo quelli da
// mostrare oggi, nell'ordine giusto.
export function MenuBlockItem({ block }: { block: MenuBlockView }) {
  if (block.kind === "PRICE") {
    return <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.22em] text-[#6B1020]">{nb(priceLine(block))}</div>;
  }
  if (block.kind === "NOTICE") {
    return (
      <div className="flex w-full flex-col items-center gap-1.5 border-y-[3px] border-double border-[#C9A96E] px-3 py-3 text-center">
        {block.label && (
          <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.3em] text-[#6B1020]">{block.label}</div>
        )}
        {block.text && <p className="m-0 whitespace-pre-line text-balance text-[16.5px] font-medium leading-normal text-[#1F2621]">{block.text}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      {block.label && <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.3em] text-[#5B605A]">{block.label}</div>}
      {block.text && <p className="m-0 whitespace-pre-line text-balance text-[16.5px] italic leading-normal text-[#3F4540]">{block.text}</p>}
    </div>
  );
}

// Riquadro con i blocchi di un punto (in cima, in fondo, sotto il titolo di una
// sezione). `lead` è un contenuto già presente (la nota della sezione) da mettere prima.
export function MenuBlocks({
  blocks,
  lead,
  className = "",
}: {
  blocks: MenuBlockView[];
  lead?: React.ReactNode;
  className?: string;
}) {
  if (blocks.length === 0 && !lead) return null;
  return (
    <div className={`mx-auto flex max-w-[400px] flex-col items-center gap-2.5 border-y px-1 py-[18px] text-center ${className}`}>
      {lead}
      {blocks.map((b) => (
        <MenuBlockItem key={b.id} block={b} />
      ))}
    </div>
  );
}
