import Link from "next/link";
import { formatPromoDates, promoStatus, withDay } from "@/lib/menu-format";

export type StripPromo = {
  id: string;
  slug: string;
  kind: "NOTICE" | "EVENT";
  title: string;
  label: string | null;
  showFrom: string;
  startDate: string;
  endDate: string;
  imageUpdatedAt: Date | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

// Striscia compatta sotto la copertina: chi vuole solo ordinare la scorre oltre
// in un attimo, chi è curioso tocca e apre la pagina completa. La scheda
// successiva spunta a destra, così si capisce che si può scorrere.
export function InEvidenza({ promos, dayKey }: { promos: StripPromo[]; dayKey: string }) {
  if (promos.length === 0) return null;
  const single = promos.length === 1;

  return (
    <section aria-label="In evidenza" className="mx-auto max-w-[720px] pt-8">
      <div className="menu-sans px-6 text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">In evidenza</div>
      <div
        className={`mt-3 flex gap-3 px-6 pb-1 ${single ? "" : "snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"}`}
      >
        {promos.map((promo) => {
          const status = promoStatus(promo, dayKey);
          const name = promo.label || (promo.kind === "EVENT" ? "Evento" : "Annuncio");
          const kicker = status === "live" ? `${name} · in corso` : `${name} · ${withDay("dal", promo.startDate)}`;
          return (
            <Link
              key={promo.id}
              href={`/menu/p/${promo.slug}`}
              className={`flex min-h-[148px] items-stretch gap-4 rounded-[16px] border border-[#D9CEBC] bg-[#FBF7EF] p-3 no-underline ${
                single ? "w-full" : "w-[88%] max-w-[400px] flex-none snap-start"
              }`}
            >
              {promo.imageUpdatedAt ? (
                // eslint-disable-next-line @next/next/no-img-element -- locandina servita dalla nostra rotta con cache lunga
                <img
                  src={`/menu/p/${promo.slug}/immagine?v=${promo.imageUpdatedAt.getTime()}`}
                  alt=""
                  width={promo.imageWidth ?? 99}
                  height={promo.imageHeight ?? 124}
                  className="h-[124px] w-[99px] flex-none rounded-[10px] object-cover sm:h-[150px] sm:w-[120px]"
                />
              ) : (
                <div className="menu-serif flex h-[124px] w-[99px] flex-none items-center sm:h-[150px] sm:w-[120px] justify-center rounded-[10px] bg-[#6B1020] text-4xl italic text-[#E3D4BC]">
                  {promo.title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                <div className="menu-sans text-[11px] font-medium uppercase tracking-[0.18em] text-[#9C7A45]">{kicker}</div>
                <div className="menu-serif text-balance text-[27px] font-medium leading-[1.05] sm:text-[32px] text-[#6B1020]">{promo.title}</div>
                <div className="menu-sans text-[14px] text-[#4A504B]">{formatPromoDates(promo.startDate, promo.endDate)}</div>
                <div className="menu-sans text-[12px] font-medium uppercase tracking-[0.18em] text-[#6B1020]">Scopri →</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
