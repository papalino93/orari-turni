import Link from "next/link";
import { ALLERGENS, allergenLabel, allergenNumbers, allergenState } from "@/lib/allergens";
import { Ornament } from "./ornament";

// Numeri degli allergeni accanto al piatto. Un piatto "da compilare" non risulta
// mai sicuro: lo dice. Nessun allergene = nessuna riga.
export function AllergenMarks({ item }: { item: { allergens: string[]; allergensReviewed: boolean } }) {
  const state = allergenState(item);
  if (state === "none") return null;
  if (state === "unknown") {
    return <div className="menu-sans mt-0.5 text-[12px] italic text-[#8A6A2E]">Allergeni da verificare con il personale</div>;
  }
  const numbers = allergenNumbers(item.allergens);
  return (
    <div
      className="menu-sans mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12.5px] font-medium tracking-[0.06em] text-[#6B1020]"
      aria-label={`Allergeni: ${item.allergens.map(allergenLabel).join(", ")}`}
    >
      <span aria-hidden className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#5B605A]">
        Allergeni
      </span>
      <span aria-hidden>{numbers.join(" · ")}</span>
    </div>
  );
}

// Legenda 1–14 in fondo al menù.
export function AllergenLegend() {
  return (
    <section aria-label="Legenda degli allergeni" className="mx-auto mt-[72px] max-w-[560px] text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">Allergeni</div>
        <Ornament color="#9C7A45" />
        <p className="m-0 mt-1 max-w-[420px] text-balance text-[15.5px] italic leading-normal text-[#5B605A]">
          I numeri accanto ai piatti indicano gli allergeni presenti. I vini contengono solfiti.
        </p>
      </div>
      <ol className="mt-6 grid list-none grid-cols-2 gap-x-5 gap-y-2 p-0 text-left">
        {ALLERGENS.map((a, i) => (
          <li key={a.code} className="flex items-baseline gap-2.5">
            <span className="menu-serif w-6 flex-none text-right text-lg font-medium italic text-[#9C7A45]">{i + 1}</span>
            <span className="menu-sans text-[12px] font-medium uppercase leading-snug tracking-[0.08em] text-[#1F2621]">{a.label}</span>
          </li>
        ))}
      </ol>
      <Link
        href="/menu/allergeni"
        className="menu-sans mt-5 inline-flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] underline underline-offset-4"
      >
        Cerca per allergene
      </Link>
    </section>
  );
}
