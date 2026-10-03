import {
  type MenuBlockView,
  formatPrice,
  formatPromoDates,
  isPromoMenuVisible,
  nb,
  parseFormats,
  parseVariants,
  promoStatus,
  withDay,
} from "@/lib/menu-format";
import type { loadPromoBySlug } from "@/lib/menu";
import { AllergenLegend, AllergenMarks } from "./allergen-marks";
import { FormatHeader, FormatPrices, Variants } from "./item-prices";
import { MenuBlocks } from "./menu-blocks";
import { Ornament } from "./ornament";

export type PromoWithSection = NonNullable<Awaited<ReturnType<typeof loadPromoBySlug>>>;

// Contenuto di una pagina promozionale: locandina, titolo, date, testo e, per un
// evento in corso, il menù speciale. Usato sia nella pagina dedicata
// (/menu/p/<slug>) sia, già aperto, subito dopo la copertina di /menu nei
// giorni dell'evento (inline).
export function PromoContent({
  promo,
  blocks,
  dayKey,
  inline = false,
}: {
  promo: PromoWithSection;
  // Blocchi da mostrare oggi (quelli «sotto il titolo di una sezione» che includono il menù speciale).
  blocks: MenuBlockView[];
  dayKey: string;
  inline?: boolean;
}) {
  const Heading = inline ? "h2" : "h1";
  const status = promoStatus(promo, dayKey);
  const fileMenu = promo.menuMode === "FILE";
  // Un evento senza voci né pagine (es. una serata fuori sede) non ha un «menù speciale» da annunciare.
  const hasMenu = Boolean(
    promo.kind === "EVENT" &&
      promo.hasMenu &&
      promo.section &&
      (promo.menuNote || (fileMenu ? promo.pages.length > 0 : promo.section.groups.some((g) => g.items.length > 0))),
  );
  const showMenu = hasMenu && isPromoMenuVisible(promo, dayKey);
  const groups = showMenu && !fileMenu ? (promo.section?.groups ?? []).filter((g) => g.items.length > 0) : [];

  return (
    <div>
      {inline && (
        <div className="mb-5 flex justify-end">
          <a
            href="#carta"
            className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] underline underline-offset-4"
          >
            Vai al menù ↓
          </a>
        </div>
      )}

      {promo.imageUpdatedAt && (
        // eslint-disable-next-line @next/next/no-img-element -- locandina servita dalla nostra rotta con cache lunga
        <img
          src={`/menu/p/${promo.slug}/immagine?v=${promo.imageUpdatedAt.getTime()}`}
          alt={`Locandina: ${promo.title}`}
          width={promo.imageWidth ?? undefined}
          height={promo.imageHeight ?? undefined}
          className="mx-auto h-auto max-h-[78svh] w-auto max-w-full rounded-[14px] object-contain shadow-[0_6px_28px_rgba(40,8,14,0.18)]"
        />
      )}

      <div className="mt-8 flex flex-col items-center gap-2 text-center">
        <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">
          {status === "past" ? "Concluso" : promo.label || (promo.kind === "EVENT" ? "Evento" : "Annuncio")}
        </div>
        <Heading className="menu-serif m-0 mb-1 text-balance text-[42px] font-medium leading-[1.05] text-[#6B1020]">{promo.title}</Heading>
        <div className="menu-sans text-[13px] font-medium uppercase tracking-[0.14em] text-[#4A504B]">
          {formatPromoDates(promo.startDate, promo.endDate)}
        </div>
        <Ornament color="#9C7A45" />
      </div>

      {promo.body && (
        <p className="mx-auto mt-7 max-w-[520px] whitespace-pre-line text-pretty text-center text-[17px] leading-normal text-[#3F4540]">
          {promo.body}
        </p>
      )}

      {status === "past" && (
        <p className="mt-7 text-center text-[16.5px] italic text-[#5B605A]">Questo appuntamento si è concluso. Grazie a chi c&apos;era!</p>
      )}

      {hasMenu && status !== "live" && status !== "past" && (
        <p className="mx-auto mt-7 max-w-[420px] border-y px-1 py-3.5 text-center text-[16.5px] italic text-[#3F4540]">
          Il menù speciale sarà disponibile {withDay("dal", promo.startDate)}.
        </p>
      )}

      {showMenu && (
        <section className="mt-12">
          <h2 className="menu-serif m-0 text-center text-[34px] font-medium leading-[1.1] text-[#6B1020]">Menù speciale</h2>
          {promo.section && (
            <MenuBlocks
              className="mt-4 !py-[14px]"
              blocks={blocks.filter((b) => b.placement === "SECTIONS" && b.sectionIds.includes(promo.section!.id))}
            />
          )}
          {promo.menuNote && (
            <p className="mx-auto mt-5 max-w-[480px] whitespace-pre-line text-balance text-center text-[16.5px] italic leading-normal text-[#3F4540]">{promo.menuNote}</p>
          )}
          {fileMenu && promo.pages.length > 0 && (
            <div className="mt-7 flex flex-col gap-4">
              {promo.pages.map((p, i) => (
                <a key={p.id} href={`/menu/p/${promo.slug}/pagina/${p.id}`} target="_blank" rel="noopener" className="block" aria-label={`Apri la pagina ${i + 1} del menù a tutto schermo`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- pagina del menù caricato, servita dalla sua rotta */}
                  <img
                    src={`/menu/p/${promo.slug}/pagina/${p.id}`}
                    alt={`Menù speciale, pagina ${i + 1}`}
                    width={p.width}
                    height={p.height}
                    loading={i === 0 ? "eager" : "lazy"}
                    className="h-auto w-full rounded-xl border border-[#D9CEBC] bg-white shadow-sm"
                  />
                </a>
              ))}
              <p className="menu-sans m-0 text-center text-[11px] text-[#5B605A]">Tocca una pagina per vederla più grande.</p>
            </div>
          )}
          {!promo.menuNote && ((fileMenu && promo.pages.length === 0) || (!fileMenu && groups.length === 0)) && (
            <p className="mt-6 text-center italic text-[#5B605A]">Il menù sarà pubblicato a breve.</p>
          )}
          {groups.map((group) => (
            <div key={group.id} className="mt-9">
              <div className="flex items-end gap-2.5 pb-2.5">
                <div className="menu-sans flex-initial text-xs font-medium uppercase leading-normal tracking-[0.2em] text-[#1F2621]">
                  {group.title}
                </div>
                <div className="mb-2 h-px min-w-3 flex-1 bg-[#D9CEBC]" />
                {parseFormats(group.formats) && <FormatHeader formats={parseFormats(group.formats)!} />}
              </div>
              {group.items.map((item) => {
                if (item.textOnly) {
                  return (
                    <p key={item.id} className="menu-rule-soft m-0 border-b py-3 text-pretty text-[16.5px] italic leading-normal text-[#3F4540]">
                      {nb(item.name)}
                    </p>
                  );
                }
                const soldOut = item.soldOutDay === dayKey;
                const variants = parseVariants(item.variants);
                return (
                  <div key={item.id} className={`menu-rule-soft flex items-baseline gap-2.5 border-b py-3.5 ${soldOut ? "opacity-50" : ""}`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <div className="text-pretty text-[19px] font-medium leading-tight text-[#1F2621]">
                        {nb(item.name)}
                        {soldOut && (
                          <span className="menu-sans ml-[9px] whitespace-nowrap align-[2px] text-[10px] font-medium uppercase tracking-[0.18em] text-[#5B605A]">
                            Esaurito
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <div className="text-pretty text-[16.5px] leading-[1.45] text-[#3F4540]">{nb(item.description)}</div>
                      )}
                      {!(promo.allergenNotice && !item.allergensReviewed) && <AllergenMarks item={item} />}
                    </div>
                    {parseFormats(group.formats) ? (
                      <FormatPrices formats={parseFormats(group.formats)!} variants={variants} soldOut={soldOut} price={item.priceCents} />
                    ) : variants ? (
                      <Variants variants={variants} soldOut={soldOut} />
                    ) : (
                      <div className={`menu-sans w-12 flex-none text-right text-base font-medium text-[#6B1020] ${soldOut ? "line-through" : ""}`}>
                        {item.priceCents === null ? "" : formatPrice(item.priceCents)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {promo.allergenNotice && (
            <div className="mx-auto mt-8 flex max-w-[420px] flex-col items-center gap-1.5 border-y-[3px] border-double border-[#C9A96E] px-3 py-3 text-center">
              <p className="m-0 text-balance text-[16.5px] font-medium leading-normal text-[#1F2621]">{promo.allergenNotice}</p>
            </div>
          )}
          {groups.length > 0 && !promo.allergenNotice && (
            <div className="-mt-10">
              <AllergenLegend />
            </div>
          )}
        </section>
      )}

      {inline && (
        <div className="mt-10 flex justify-center">
          <a
            href="#carta"
            className="menu-sans flex min-h-12 items-center rounded-full border border-[#6B1020] px-7 text-[12px] font-medium uppercase tracking-[0.22em] no-underline"
          >
            Vai al menù ↓
          </a>
        </div>
      )}
    </div>
  );
}
