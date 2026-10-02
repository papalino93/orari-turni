import Image from "next/image";
import Link from "next/link";
import { businessDayKey, formatPrice, isSoldOut, nb, parseVariants, promoStatus } from "@/lib/menu-format";
import { loadMenu, loadVenue, loadVisibleBlocks, loadVisiblePromos } from "@/lib/menu";
import { VERSION_LABEL } from "@/lib/version";
import { AllergenLegend, AllergenMarks } from "./allergen-marks";
import { InEvidenza } from "./in-evidenza";
import { Variants } from "./item-prices";
import { MenuBlocks } from "./menu-blocks";
import { OpenStatusPill } from "./open-status";
import { VenueInfo } from "./venue-footer";
import { MenuNav } from "./menu-nav";
import { PromoContent } from "./promo-content";
import { Ornament } from "./ornament";

// Pagina in cache, rigenerata ogni minuto e a ogni modifica del menù (vedi
// revalidateMenu): regge i picchi di scansioni del QR senza interrogare il
// database a ogni apertura, e il cambio del giorno commerciale (5:00) viene
// raccolto entro un minuto.
export const revalidate = 60;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function GlassIcon() {
  return (
    <svg width="15" height="20" viewBox="0 0 24 32" fill="none" stroke="#6B1020" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2h14c0 8-3 13-7 13S5 10 5 2z" />
      <path d="M12 15v13" />
      <path d="M7 30h10" />
    </svg>
  );
}

function BottleIcon() {
  return (
    <svg width="11" height="22" viewBox="0 0 16 32" fill="none" stroke="#6B1020" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 1.5h4v7c0 1.5 4 3 4 7.5v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V16c0-4.5 4-6 4-7.5z" />
      <path d="M2 19h12M2 25h12" />
    </svg>
  );
}

export default async function MenuPage() {
  const dayKey = businessDayKey();
  const [loaded, blocks, promos, venue] = await Promise.all([loadMenu(), loadVisibleBlocks(dayKey), loadVisiblePromos(dayKey), loadVenue()]);
  const heroLines = venue.hero.title.split("\n");
  const topBlocks = blocks.filter((b) => b.placement === "TOP");
  const bottomBlocks = blocks.filter((b) => b.placement === "BOTTOM");

  // Vini esauriti: spariscono. Piatti esauriti: restano, sbiaditi. Un gruppo
  // o una sezione senza nulla da mostrare non compare (né il suo chip).
  const sections = loaded
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          items: group.items
            .map((item) => ({ ...item, soldOut: isSoldOut(item, dayKey) }))
            .filter((item) => !(section.kind === "WINE" && item.soldOut)),
        }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((section) => section.groups.length > 0);

  const chips = sections.map((s) => ({ id: s.slug, label: s.label }));
  // Evento in corso: si apre da solo a pagina piena subito dopo la copertina.
  // Negli altri casi (annunciato, o un annuncio) resta una scheda in «In evidenza».
  const liveEvents = promos.filter((p) => p.kind === "EVENT" && promoStatus(p, dayKey) === "live");
  const stripPromos = promos.filter((p) => !liveEvents.includes(p));

  return (
    <>
      <header className="relative flex min-h-[min(100svh,560px)] flex-col items-center justify-between overflow-hidden bg-[#5A0E18] px-6 pb-[30px] pt-[max(28px,env(safe-area-inset-top))] text-center text-[#F1E8DA]">
        {venue.heroImageVersion ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto caricata dal titolare, servita con cache lunga
          <img
            src={`/menu/copertina?v=${venue.heroImageVersion}`}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover [filter:saturate(0.75)_contrast(1.05)_brightness(0.95)] [object-position:50%_40%]"
          />
        ) : (
          <Image
            src="/menu/hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover [filter:saturate(0.75)_contrast(1.05)_brightness(0.95)] [object-position:50%_40%]"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[#6E1424] opacity-50 mix-blend-color" />
        <div className="pointer-events-none absolute inset-0 bg-[#4A0A15] opacity-[0.32]" />
        <div className="pointer-events-none absolute inset-0 [background:linear-gradient(180deg,rgba(38,4,10,0.45)_0%,rgba(38,4,10,0.12)_38%,rgba(38,4,10,0.35)_62%,rgba(38,4,10,0.88)_100%)]" />
        <div className="relative h-2.5" />
        <div className="relative flex w-full flex-col items-center gap-10">
          <h1 className="m-0 flex w-full justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtri CSS, niente ottimizzazione */}
            <img
              src="/menu/logo.png"
              alt="L’Angolo del Vino"
              className="h-auto w-[76%] max-w-[380px] [filter:invert(1)_sepia(0.25)_brightness(0.97)_drop-shadow(0_2px_14px_rgba(20,2,6,0.5))]"
            />
          </h1>
          <div className="flex flex-col items-center gap-3.5">
            <div className="h-9 w-px bg-[#B8955E]" />
            <div className="menu-serif text-[32px] font-medium leading-[1.2] tracking-[0.01em] text-[#F4EDE1] [text-shadow:0_1px_12px_rgba(20,2,6,0.6)]">
              {heroLines.map((line, i) => {
                // «e Menù»: la «e» iniziale resta in corsivo, come nel titolo di partenza.
                const lead = line.match(/^e\s+(.*)$/);
                return (
                  <span key={i} className="block">
                    {lead ? (
                      <>
                        <span className="text-[27px] italic text-[#E3D4BC]">e</span> {lead[1]}
                      </>
                    ) : (
                      line
                    )}
                  </span>
                );
              })}
            </div>
            <OpenStatusPill hours={venue.hours} />
          </div>
        </div>
        {chips.length > 0 ? (
          <a
            href={topBlocks.length > 0 ? "#carta" : `#${chips[0].id}`}
            className="menu-sans relative flex min-h-11 flex-col items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.3em] !text-[#E3D4BC] no-underline"
          >
            Sfoglia
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="#B8955E" strokeWidth="1.2" aria-hidden>
              <path d="M1 1.5l5 5 5-5" />
            </svg>
          </a>
        ) : (
          <div />
        )}
      </header>

      {liveEvents.map((promo) => (
        <section key={promo.id} id={`evento-${promo.slug}`} aria-label={promo.title} className="mx-auto max-w-[720px] px-6 pb-4 pt-8">
          <PromoContent promo={promo} blocks={blocks} dayKey={dayKey} inline />
        </section>
      ))}

      <InEvidenza promos={stripPromos} dayKey={dayKey} />

      <div id="carta" className="scroll-mt-0" />
      {topBlocks.length > 0 && (
        <div className="px-6 pb-2 pt-10">
          <MenuBlocks blocks={topBlocks} />
        </div>
      )}
      {chips.length > 0 && <MenuNav chips={chips} />}

      <main className="mx-auto max-w-[720px] px-6 pb-[72px]">
        {sections.length === 0 && (
          <p className="pt-20 text-center text-lg italic text-[#5B605A]">Il menù è in aggiornamento. Torna tra poco.</p>
        )}

        {sections.map((section, index) => (
          <section key={section.id} id={section.slug} className="menu-fade-up scroll-mt-[50px] pt-[72px]">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="menu-serif text-xl font-medium italic text-[#9C7A45]">{ROMAN[index] ?? ""}</div>
              <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">{section.kicker}</div>
              <h2 className="menu-serif mx-0 mb-2.5 mt-0.5 text-balance text-[46px] font-medium leading-[1.05] tracking-[0.005em] text-[#6B1020]">
                {section.title}
              </h2>
              <Ornament color="#9C7A45" />
            </div>

            {(() => {
              const sectionBlocks = blocks.filter((b) => b.placement === "SECTIONS" && b.sectionIds.includes(section.id));
              return (
                <MenuBlocks
                  blocks={sectionBlocks}
                  className="mt-8"
                  lead={section.note ? <p className="m-0 text-balance text-[16.5px] italic leading-normal text-[#3F4540]">{section.note}</p> : undefined}
                />
              );
            })()}

            {section.groups.map((group) => (
              <div key={group.id} className="mt-11">
                <div className="flex items-end gap-2.5 pb-2.5">
                  <div className="menu-sans flex-initial text-xs font-medium uppercase leading-normal tracking-[0.2em] text-[#1F2621]">
                    {group.title}
                  </div>
                  <div className="mb-2 h-px min-w-3 flex-1 bg-[#D9CEBC]" />
                  {group.columns && (
                    <>
                      <div title="Calice" className="flex w-9 flex-none justify-end">
                        <GlassIcon />
                      </div>
                      <div title="Bottiglia" className="flex w-10 flex-none justify-end">
                        <BottleIcon />
                      </div>
                    </>
                  )}
                </div>

                {group.items.map((item) => {
                  const price = section.kind === "WINE" ? item.priceBottleCents : item.priceCents;
                  const variants = parseVariants(item.variants);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-baseline gap-2.5 menu-rule-soft border-b py-3.5 ${item.soldOut ? "opacity-50" : ""}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-[3px] [overflow-wrap:anywhere]">
                        <div className="text-pretty text-[19px] font-medium leading-tight text-[#1F2621]">
                          {nb(item.name)}
                          {item.enomatic && (
                            <span className="menu-sans ml-[9px] whitespace-nowrap align-[2px] text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B1020]">
                              Enomatic
                            </span>
                          )}
                          {item.soldOut && (
                            <span className="menu-sans ml-[9px] whitespace-nowrap align-[2px] text-[10px] font-medium uppercase tracking-[0.18em] text-[#5B605A]">
                              Esaurito
                            </span>
                          )}
                        </div>
                        {item.sub && <div className="menu-sans text-sm leading-[1.45] text-[#4A504B]">{item.sub}</div>}
                        {item.grapes && (
                          <div className="text-pretty text-[15.5px] italic leading-[1.4] text-[#5B605A]">{nb(item.grapes)}</div>
                        )}
                        {item.description && (
                          <div className="text-pretty text-[16.5px] leading-[1.45] text-[#3F4540]">{nb(item.description)}</div>
                        )}
                        {section.kind === "FOOD" && <AllergenMarks item={item} />}
                      </div>
                      {group.columns && (
                        <div className="menu-sans min-w-9 flex-none whitespace-nowrap text-right text-base text-[#1F2621]">
                          {formatPrice(item.priceGlassCents)}
                        </div>
                      )}
                      {variants ? (
                        <Variants variants={variants} soldOut={item.soldOut} />
                      ) : (
                        <div
                          className={`menu-sans min-w-10 flex-none whitespace-nowrap text-right text-base font-medium text-[#6B1020] ${item.soldOut ? "line-through" : ""}`}
                        >
                          {price === null || price === undefined ? (group.columns ? "—" : "") : formatPrice(price)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {section.addon && (
              <div className="mx-auto mt-9 flex max-w-[480px] flex-col items-center gap-2.5 text-center">
                {section.addonTitle && (
                  <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.3em] text-[#6B1020]">
                    {section.addonTitle}
                  </div>
                )}
                <div className="text-balance text-[16.5px] italic leading-normal text-[#3F4540]">{section.addon}</div>
              </div>
            )}
          </section>
        ))}

        {bottomBlocks.length > 0 && <MenuBlocks blocks={bottomBlocks} className="mt-[72px]" />}

        {sections.some((s) => s.kind === "FOOD") && <AllergenLegend />}

        <div className="mt-[72px] flex flex-col items-center gap-3.5 text-center">
          <Ornament color="#9C7A45" />
          <p className="m-0 max-w-[420px] text-balance text-[15.5px] italic leading-normal text-[#5B605A]">
            Prezzi in euro. I vini indicati “Enomatic” fanno parte del Progetto Enomatic.
          </p>
          <Link
            href="/menu/allergeni"
            className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] underline underline-offset-4"
          >
            Allergeni e intolleranze
          </Link>
        </div>
      </main>

      <footer className="flex flex-col items-center gap-[18px] bg-[#6B1020] px-5 pb-[60px] pt-14 text-[#F4EEE3]">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtri CSS */}
        <img src="/menu/logo.png" alt="L’Angolo del Vino" className="h-auto w-[200px] [filter:invert(1)_sepia(0.25)]" />
        <Ornament color="#C9A96E" />
        <div className="menu-sans text-[10px] uppercase tracking-[0.4em] text-[#E9DCC4]">Enoteca</div>
        <VenueInfo hours={venue.hours} contacts={venue.contacts} />
        <div className="menu-sans text-[10px] tracking-[0.1em] text-[#E9DCC4]/60">{VERSION_LABEL}</div>
      </footer>
    </>
  );
}
