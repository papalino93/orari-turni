import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { businessDayKey, formatPromoDates } from "@/lib/menu-format";
import { loadPromoBySlug, loadVisibleBlocks } from "@/lib/menu";
import { Ornament } from "../../ornament";
import { PromoContent } from "../../promo-content";

// Come /menu: in cache, rigenerata ogni minuto e a ogni modifica.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const promo = await loadPromoBySlug(slug);
  if (!promo || promo.deletedAt || promo.hidden) return {};
  const title = `${promo.title} — L'Angolo del Vino`;
  const description = promo.body?.slice(0, 160) || `${promo.title}, ${formatPromoDates(promo.startDate, promo.endDate)}`;
  return {
    title,
    description,
    // Anteprima nei messaggi (WhatsApp, Instagram) quando la pagina viene condivisa.
    openGraph: {
      title,
      description,
      images: promo.imageUpdatedAt ? [`/menu/p/${promo.slug}/immagine?v=${promo.imageUpdatedAt.getTime()}`] : undefined,
    },
  };
}

export default async function PromoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dayKey = businessDayKey();
  const [promo, blocks] = await Promise.all([loadPromoBySlug(slug), loadVisibleBlocks(dayKey)]);
  // Una pagina eliminata o nascosta non esiste per i clienti; una non ancora
  // pubblicata (prima di "Mostra dal") nemmeno.
  if (!promo || promo.deletedAt || promo.hidden || dayKey < promo.showFrom) notFound();

  return (
    <>
      <header className="flex flex-col items-center gap-3 bg-[#5A0E18] px-6 pb-6 pt-[max(20px,env(safe-area-inset-top))] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtri CSS */}
        <img src="/menu/logo.png" alt="L’Angolo del Vino" className="h-auto w-[170px] [filter:invert(1)_sepia(0.25)_brightness(0.97)]" />
        <Link
          href="/menu"
          className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] !text-[#E3D4BC] no-underline"
        >
          ← Torna al menù
        </Link>
      </header>

      <main className="menu-main mx-auto max-w-[720px] px-6 pb-[72px] pt-8">
        <PromoContent promo={promo} blocks={blocks} dayKey={dayKey} />

        <div className="mt-14 flex flex-col items-center gap-3.5 text-center">
          <Ornament color="#9C7A45" />
          <Link
            href="/menu"
            className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] underline underline-offset-4"
          >
            Vai al menù
          </Link>
        </div>
      </main>

      <footer className="flex flex-col items-center gap-[18px] bg-[#6B1020] px-5 pb-[60px] pt-14 text-[#F4EEE3]">
        <Ornament color="#C9A96E" />
        <div className="menu-sans text-[10px] uppercase tracking-[0.4em] text-[#E9DCC4]">Enoteca</div>
      </footer>
    </>
  );
}
