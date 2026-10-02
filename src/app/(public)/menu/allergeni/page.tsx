import type { Metadata } from "next";
import Link from "next/link";
import { ALLERGENS, allergenState } from "@/lib/allergens";
import { loadMenu } from "@/lib/menu";
import { Ornament } from "../ornament";
import { AllergenExplorer, type ExplorerSection } from "./allergen-explorer";

// Come /menu: in cache, rigenerata ogni minuto e a ogni modifica del menù.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Allergeni — L'Angolo del Vino",
  description: "Allergeni e intolleranze: cosa contiene ogni piatto",
};

export default async function AllergeniPage() {
  const menu = await loadMenu();

  // Solo i piatti: per i vini vale la nota unica sui solfiti. Un gruppo senza
  // voci non compare.
  const sections: ExplorerSection[] = menu
    .filter((s) => s.kind === "FOOD")
    .map((s) => ({
      id: s.id,
      title: s.title,
      groups: s.groups
        .filter((g) => g.items.length > 0)
        .map((g) => ({
          id: g.id,
          title: g.title,
          items: g.items.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            state: allergenState(i),
            allergens: i.allergens,
          })),
        })),
    }))
    .filter((s) => s.groups.length > 0);

  return (
    <>
      <header className="flex flex-col items-center gap-4 bg-[#5A0E18] px-6 pb-8 pt-[max(24px,env(safe-area-inset-top))] text-center text-[#F1E8DA]">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtri CSS */}
        <img
          src="/menu/logo.png"
          alt="L’Angolo del Vino"
          className="h-auto w-[200px] [filter:invert(1)_sepia(0.25)_brightness(0.97)]"
        />
        <Link
          href="/menu"
          className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] !text-[#E3D4BC] no-underline"
        >
          ← Torna al menù
        </Link>
      </header>

      <main className="mx-auto max-w-[720px] px-6 pb-[72px] pt-14">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">Informazioni</div>
          <h1 className="menu-serif m-0 mb-2.5 mt-0.5 text-balance text-[42px] font-medium leading-[1.05] text-[#6B1020]">
            Allergeni e intolleranze
          </h1>
          <Ornament color="#9C7A45" />
        </div>

        <p className="mx-auto mt-8 max-w-[520px] text-balance text-center text-[16.5px] italic leading-normal text-[#3F4540]">
          Se hai un&apos;allergia o un&apos;intolleranza, avvisa il personale prima di ordinare. Qui trovi gli allergeni presenti tra gli
          ingredienti di ogni piatto; in cucina sono possibili tracce di altri allergeni per contaminazione crociata.
        </p>

        <div className="mx-auto mt-6 max-w-[400px] border-y px-1 py-[14px] text-center">
          <p className="menu-sans m-0 text-[12px] font-medium uppercase tracking-[0.18em] text-[#6B1020]">
            I vini contengono solfiti (anidride solforosa)
          </p>
        </div>

        <AllergenExplorer sections={sections} />

        <section className="mt-16">
          <h2 className="menu-serif m-0 text-center text-[34px] font-medium leading-[1.1] text-[#6B1020]">I 14 allergeni</h2>
          <p className="mx-auto mt-2 max-w-[460px] text-center text-[15.5px] italic leading-normal text-[#5B605A]">
            Quelli che la legge (Reg. UE 1169/2011) impone di indicare.
          </p>
          <ol className="mt-6 grid list-none gap-x-8 gap-y-3.5 p-0 sm:grid-cols-2">
            {ALLERGENS.map((a, i) => (
              <li key={a.code} className="flex gap-3">
                <span className="menu-serif w-6 flex-none text-right text-lg font-medium italic text-[#9C7A45]">{i + 1}</span>
                <span>
                  <span className="menu-sans block text-[13px] font-medium uppercase tracking-[0.12em] text-[#1F2621]">{a.label}</span>
                  <span className="block text-[15px] leading-snug text-[#5B605A]">{a.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-16 flex flex-col items-center gap-3.5 text-center">
          <Ornament color="#9C7A45" />
          <Link
            href="/menu"
            className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] underline underline-offset-4"
          >
            Torna al menù
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
