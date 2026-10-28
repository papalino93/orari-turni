import { type MenuBlockView, nb, priceLine } from "@/lib/menu-format";

// Informazioni del menù (coperto, chiusura cucina, avvisi…): tre aspetti, uno per
// tipo. Le voci con prezzo sono righe in maiuscoletto bordeaux, i testi paragrafi
// in corsivo, gli avvisi riquadri con filetti. Chi li usa passa già solo quelli da
// mostrare oggi, nell'ordine giusto.
export function MenuBlockItem({ block }: { block: MenuBlockView }) {
  if (block.kind === "PRICE") {
    const line = <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.22em] text-[#6B1020]">{nb(priceLine(block))}</div>;
    if (!block.text) return line;
    // Con descrizione: la riga del prezzo e, sotto, il testo in corsivo.
    return (
      <div className="flex flex-col items-center gap-1">
        {line}
        <p className="m-0 whitespace-pre-line text-balance text-[15.5px] italic leading-normal text-[#3F4540]">{block.text}</p>
      </div>
    );
  }
  // Titolo con l'eventuale prezzo accanto (es. «Novità · Oli aromatizzati € 1,50»).
  const title = block.priceCents !== null ? priceLine(block) : block.label;
  if (block.kind === "NOTICE") {
    return (
      <div className="flex w-full flex-col items-center gap-1.5 border-y-[3px] border-double border-[#C9A96E] px-3 py-3 text-center">
        {title && <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.3em] text-[#6B1020]">{nb(title)}</div>}
        {block.text && <p className="m-0 whitespace-pre-line text-balance text-[16.5px] font-medium leading-normal text-[#1F2621]">{block.text}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      {title && <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.3em] text-[#5B605A]">{nb(title)}</div>}
      {block.text && <p className="m-0 whitespace-pre-line text-balance text-[16.5px] italic leading-normal text-[#3F4540]">{block.text}</p>}
    </div>
  );
}

// Riquadro in vetrina: bordeaux e oro, per proposte speciali (es. «Su prenotazione ·
// Caviale & Tartufo bianco»). La «&» del titolo è in oro.
export function VetrinaCard({ block }: { block: Pick<MenuBlockView, "label" | "title" | "text"> }) {
  const parts = (block.title ?? "").split(/( & )/);
  return (
    <div
      className="mx-auto w-full max-w-[480px] rounded-[18px] px-[22px] pb-6 pt-[26px] text-center text-[#F4EEE3]"
      style={{ background: "radial-gradient(300px 220px at 50% 0%, #7a1428, #4a0c18)", boxShadow: "0 10px 30px rgba(74, 12, 24, 0.18)" }}
    >
      {block.label && <div className="font-[family-name:var(--font-menu-sans)] text-[11px] font-medium uppercase tracking-[0.32em] text-[#D8B97A]">{nb(block.label)}</div>}
      <div className="mt-2.5 text-balance font-[family-name:var(--font-menu-serif)] text-[34px] font-medium italic leading-[1.1]">
        {parts.map((p, i) => (p === " & " ? <span key={i} className="text-[#D8B97A]"> & </span> : p))}
      </div>
      {block.text && (
        <>
          <div aria-hidden className="my-3.5 flex items-center justify-center gap-2 text-[9px] text-[#D8B97A]">
            <span className="h-px w-10 bg-[#D8B97A]" />◆<span className="h-px w-10 bg-[#D8B97A]" />
          </div>
          <p className="m-0 whitespace-pre-line font-[family-name:var(--font-menu-serif)] text-balance text-[18px] italic leading-[1.4] text-[#EFE3CF]">{block.text}</p>
        </>
      )}
    </div>
  );
}

// Riquadro con i blocchi di un punto (in cima, in fondo, sotto il titolo di una
// sezione). `lead` è un contenuto già presente (la nota della sezione) da mettere prima.
// I riquadri in vetrina stanno a sé, sopra gli altri.
export function MenuBlocks({
  blocks,
  lead,
  className = "",
}: {
  blocks: MenuBlockView[];
  lead?: React.ReactNode;
  className?: string;
}) {
  const vetrine = blocks.filter((b) => b.kind === "HIGHLIGHT");
  const others = blocks.filter((b) => b.kind !== "HIGHLIGHT");
  if (others.length === 0 && vetrine.length === 0 && !lead) return null;
  const box = (others.length > 0 || lead) && (
    <div className={`mx-auto flex max-w-[400px] flex-col items-center gap-2.5 border-y px-1 py-[18px] text-center ${vetrine.length > 0 ? "" : className}`}>
      {lead}
      {others.map((b) => (
        <MenuBlockItem key={b.id} block={b} />
      ))}
    </div>
  );
  if (vetrine.length === 0) return box;
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {vetrine.map((b) => (
        <VetrinaCard key={b.id} block={b} />
      ))}
      {box}
    </div>
  );
}
