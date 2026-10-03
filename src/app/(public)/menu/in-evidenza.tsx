import Link from "next/link";
import { formatPromoDates, promoStatus } from "@/lib/menu-format";

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

  // Poster e titolo: più grandi con una scheda sola; con più schede, su telefono
  // si scorrono di lato e da tablet in su stanno in griglia, tutte alte uguali.
  const poster = single ? "h-[124px] w-[99px] sm:h-[150px] sm:w-[120px]" : "h-[124px] w-[99px]";
  const titleSize = single ? "text-[27px] sm:text-[32px]" : "text-[25px]";

  return (
    <section aria-label="In evidenza" className="mx-auto max-w-[720px] pt-8">
      <div className="menu-sans px-6 text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">In evidenza</div>
      <div
        className={`mt-3 px-6 pb-1 ${
          single ? "flex" : "flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible"
        }`}
      >
        {promos.map((promo) => {
          const status = promoStatus(promo, dayKey);
          const name = promo.label || (promo.kind === "EVENT" ? "Evento" : "Annuncio");
          const kicker = status === "live" ? `${name} · in corso` : name;
          return (
            <Link
              key={promo.id}
              href={`/menu/p/${promo.slug}`}
              className={`flex items-start gap-4 rounded-[16px] border border-[#D9CEBC] bg-[#FBF7EF] p-3 no-underline ${
                single ? "w-full" : "w-[88%] max-w-[400px] flex-none snap-start sm:w-auto sm:max-w-none"
              }`}
            >
              {promo.imageUpdatedAt ? (
                // eslint-disable-next-line @next/next/no-img-element -- locandina servita dalla nostra rotta con cache lunga
                <img
                  src={`/menu/p/${promo.slug}/immagine?v=${promo.imageUpdatedAt.getTime()}`}
                  alt=""
                  width={promo.imageWidth ?? 99}
                  height={promo.imageHeight ?? 124}
                  className={`${poster} flex-none rounded-[10px] object-cover`}
                />
              ) : (
                <div className={`menu-serif ${poster} flex flex-none items-center justify-center rounded-[10px] bg-[#6B1020] text-4xl italic text-[#E3D4BC]`}>
                  {promo.title.slice(0, 1).toUpperCase()}
                </div>
              )}
              {/* Tutto allineato in alto e «Scopri» sempre in fondo: due schede
                  affiancate restano in riga anche con titoli di lunghezza diversa. */}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-stretch py-0.5">
                <div className="menu-sans truncate text-[11px] font-medium uppercase leading-snug tracking-[0.18em] text-[#9C7A45]">{kicker}</div>
                <div className="menu-sans -mt-1 truncate text-[14px] text-[#4A504B]">{formatPromoDates(promo.startDate, promo.endDate)}</div>
                <div className={`menu-serif mt-0.5 line-clamp-3 text-balance font-medium leading-[1.05] text-[#6B1020] ${titleSize}`}>{promo.title}</div>
                <div className="menu-sans mt-auto pt-1 text-[12px] font-medium uppercase tracking-[0.18em] text-[#6B1020]">Scopri →</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
