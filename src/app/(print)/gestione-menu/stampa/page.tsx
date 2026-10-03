import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ALLERGENS, allergenNumbers, allergenState } from "@/lib/allergens";
import { getMenuEditor } from "@/lib/guard";
import { businessDayKey, formatPrice, isSoldOut, nb, originLabel, parseVariants, priceLine, wineDetail, type MenuBlockView } from "@/lib/menu-format";
import { loadMenu, loadVisibleBlocks } from "@/lib/menu";
import { traitLabel } from "@/lib/wine-traits";
import { PrintBar } from "./print-bar";

export const metadata: Metadata = {
  title: "Menù da stampare — L'Angolo del Vino",
  robots: { index: false, follow: false },
};

// Il menù fisso su fogli A4, da stampare o salvare in PDF dal browser. Solo per
// chi gestisce il menù (come /gestione-menu). Gli esauriti di oggi, di norma,
// non si stampano: il foglio deve valere anche domani.
export default async function StampaMenuPage({ searchParams }: { searchParams: Promise<{ esauriti?: string }> }) {
  const editor = await getMenuEditor();
  if (!editor) redirect("/mie-ore");
  const { esauriti } = await searchParams;
  const withSoldOut = esauriti === "1";
  const dayKey = businessDayKey();
  const [menu, blocks] = await Promise.all([loadMenu(), loadVisibleBlocks(dayKey)]);

  const sections = menu
    .map((s) => ({
      ...s,
      groups: s.groups
        .map((g) => ({ ...g, items: g.items.filter((i) => withSoldOut || !isSoldOut(i, dayKey)) }))
        .filter((g) => g.items.length > 0),
    }))
    .filter((s) => s.groups.length > 0);
  const soldOutCount = menu.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.filter((i) => isSoldOut(i, dayKey)).length, 0), 0);
  const hasFood = sections.some((s) => s.kind === "FOOD");
  const hasUnknown = sections.some((s) => s.kind === "FOOD" && s.groups.some((g) => g.items.some((i) => !i.textOnly && allergenState(i) === "unknown")));
  const date = new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const top = blocks.filter((b) => b.placement === "TOP");
  const bottom = blocks.filter((b) => b.placement === "BOTTOM");

  return (
    <>
      <PrintBar withSoldOut={withSoldOut} soldOutCount={soldOutCount} />
      <main className="print-sheet">
        <header className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo statico, va anche in stampa */}
          <img src="/menu/logo.png" alt="L’Angolo del Vino" className="h-auto w-[170px]" />
          <p className="print-sans mt-3 text-[10px] uppercase tracking-[0.3em] text-[#6B1020]">Carta dei vini e menù</p>
          <p className="mt-1 text-[13px] italic text-[#5B605A]">Aggiornato al {date}</p>
          {top.length > 0 && <Blocks list={top} className="mt-4" />}
        </header>

        {sections.map((section) => {
          const sectionBlocks = blocks.filter((b) => b.placement === "SECTIONS" && b.sectionIds.includes(section.id));
          return (
            <section key={section.id} className="mb-8">
              <div className="print-keep mb-3 border-b border-[#6B1020]/30 pb-1.5 text-center">
                <h2 className="text-[24px] font-semibold leading-tight text-[#6B1020]">{section.title}</h2>
                {section.note && <p className="mt-0.5 text-[13px] italic text-[#3F4540]">{section.note}</p>}
                {sectionBlocks.length > 0 && <Blocks list={sectionBlocks} className="mt-1" />}
              </div>
              {section.groups.map((group) => (
                <div key={group.id} className="mb-4">
                  {(section.groups.length > 1 || group.title !== section.title) && (
                    <div className="print-keep print-sans mb-1.5 flex items-end gap-3 text-[9.5px] uppercase tracking-[0.16em] text-[#5B605A]">
                      <span className="min-w-0 flex-1 font-medium text-[#1f2420]">{group.title}</span>
                      {section.kind === "WINE" && (
                        <>
                          <span className="w-16 text-right">Calice</span>
                          <span className="w-16 text-right">Bottiglia</span>
                        </>
                      )}
                    </div>
                  )}
                  <ul className="m-0 list-none p-0">
                    {group.items.map((item) => {
                      if (item.textOnly) {
                        return (
                          <li key={item.id} className="print-avoid border-b border-dotted border-[#1f2420]/15 py-1 text-[12.5px] italic text-[#3F4540]">
                            {nb(item.name)}
                          </li>
                        );
                      }
                      const sold = isSoldOut(item, dayKey);
                      if (section.kind === "WINE") {
                        const detail = [wineDetail(item), item.grapes, originLabel(item)].filter(Boolean).join(" · ");
                        return (
                          <li key={item.id} className="print-avoid flex items-baseline gap-3 border-b border-dotted border-[#1f2420]/15 py-1">
                            <div className="min-w-0 flex-1">
                              <p className="m-0 text-[14.5px] leading-snug">
                                <span className="font-semibold">{item.name}</span>
                                {item.wineName && <span className="italic text-[#6B1020]"> {item.wineName}</span>}
                                {sold && <span className="print-sans ml-2 text-[9px] uppercase tracking-[0.15em] text-[#8A6A2E]">esaurito oggi</span>}
                              </p>
                              {detail && <p className="m-0 text-[12px] leading-snug text-[#4A504B]">{nb(detail)}</p>}
                              {item.traits.length > 0 && (
                                <p className="print-sans m-0 text-[9.5px] uppercase tracking-[0.12em] text-[#4A504B]">{item.traits.map(traitLabel).join(" · ")}</p>
                              )}
                            </div>
                            <span className="w-16 shrink-0 text-right print-sans text-[12.5px] print-num">{item.priceGlassCents === null ? "—" : formatPrice(item.priceGlassCents)}</span>
                            <span className="w-16 shrink-0 text-right print-sans text-[12.5px] print-num">{item.priceBottleCents === null ? "—" : formatPrice(item.priceBottleCents)}</span>
                          </li>
                        );
                      }
                      const variants = parseVariants(item.variants);
                      const state = allergenState(item);
                      return (
                        <li key={item.id} className="print-avoid flex items-baseline gap-3 border-b border-dotted border-[#1f2420]/15 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-[14.5px] font-semibold leading-snug">
                              {item.name}
                              {state === "some" && (
                                <sup className="print-sans ml-1 text-[9px] font-medium tracking-[0.06em] text-[#6B1020]">{allergenNumbers(item.allergens).join(" · ")}</sup>
                              )}
                              {state === "unknown" && <sup className="print-sans ml-1 text-[10px] text-[#8A6A2E]">*</sup>}
                              {sold && <span className="print-sans ml-2 text-[9px] font-normal uppercase tracking-[0.15em] text-[#8A6A2E]">esaurito oggi</span>}
                            </p>
                            {item.description && <p className="m-0 text-[12.5px] italic leading-snug text-[#4A504B]">{nb(item.description)}</p>}
                          </div>
                          {variants ? (
                            <span className="shrink-0 text-right print-sans text-[12px] print-num">{variants.map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ")}</span>
                          ) : (
                            <span className="w-16 shrink-0 text-right print-sans text-[12.5px] print-num">{formatPrice(item.priceCents)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {section.addon && (
                <div className="print-avoid mt-2 text-center">
                  {section.addonTitle && <p className="print-sans m-0 text-[9.5px] uppercase tracking-[0.2em] text-[#6B1020]">{section.addonTitle}</p>}
                  <p className="m-0 text-[13px] italic text-[#3F4540]">{section.addon}</p>
                </div>
              )}
            </section>
          );
        })}

        <footer className="print-avoid mt-6 border-t border-[#6B1020]/30 pt-3">
          {bottom.length > 0 && <Blocks list={bottom} className="mb-3" />}
          {hasFood && (
            <>
              <p className="print-sans m-0 mb-1 text-center text-[9.5px] uppercase tracking-[0.25em] text-[#5B605A]">Allergeni</p>
              <p className="m-0 mb-2 text-center text-[12px] italic text-[#4A504B]">
                I numeri accanto ai piatti indicano gli allergeni presenti. I vini contengono solfiti.
                {hasUnknown && " * Allergeni da verificare con il personale."}
              </p>
              <ol className="print-sans m-0 grid list-none grid-cols-4 gap-x-3 gap-y-0.5 p-0 text-[10px] text-[#3F4540]">
                {ALLERGENS.map((a, i) => (
                  <li key={a.code}>
                    <span className="font-semibold text-[#6B1020]">{i + 1}</span> {a.label}
                  </li>
                ))}
              </ol>
            </>
          )}
        </footer>
      </main>
    </>
  );
}

function Blocks({ list, className = "" }: { list: MenuBlockView[]; className?: string }) {
  return (
    <div className={`space-y-0.5 text-center ${className}`}>
      {list.map((b) =>
        b.kind === "PRICE" ? (
          <div key={b.id}>
            <p className="print-sans m-0 text-[10px] uppercase tracking-[0.2em] text-[#6B1020]">{nb(priceLine(b))}</p>
            {b.text && <p className="m-0 text-[12.5px] italic text-[#3F4540]">{b.text}</p>}
          </div>
        ) : (
          <p key={b.id} className="m-0 text-[13px] italic text-[#3F4540]">
            {(b.label || b.priceCents !== null) && <span className="font-semibold not-italic">{b.priceCents !== null ? nb(priceLine(b)) : b.label}: </span>}
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}
