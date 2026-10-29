import Link from "next/link";
import { ALLERGENS, allergenNumbers, allergenState } from "@/lib/allergens";
import { Ornament } from "./ornament";

// Allergeni sotto il piatto, per nome. Un piatto "da compilare" non risulta
// mai sicuro: lo dice. Nessun allergene = nessuna riga.
export function AllergenMarks({ item }: { item: { allergens: string[]; allergensReviewed: boolean; allergenTraces?: string[] } }) {
  const state = allergenState(item);
  const traces = allergenNumbers(item.allergenTraces ?? []).map((n) => ALLERGENS[n - 1].label.toLowerCase());
  const tracesLine = traces.length > 0 && state !== "unknown" && (
    <div className="mt-0.5 text-[14px] italic leading-snug text-[#5B605A]">Può contenere tracce di {traces.join(", ")}.</div>
  );
  if (state === "none") return tracesLine || null;
  if (state === "unknown") {
    return <div className="menu-sans mt-0.5 text-[12px] italic text-[#8A6A2E]">Allergeni da verificare con il personale</div>;
  }
  // I nomi, non i numeri: si leggono senza andare a cercare la legenda in fondo.
  const names = allergenNumbers(item.allergens).map((n) => ALLERGENS[n - 1].label);
  return (
    <>
      <div className="menu-sans mt-0.5 text-[12.5px] font-medium leading-snug text-[#6B1020]">
        <span className="mr-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#5B605A]">Allergeni</span>
        {names.join(" · ")}
      </div>
      {tracesLine}
    </>
  );
}

// Nota sugli allergeni in fondo al menù, con il filtro per chi deve evitarne qualcuno.
export function AllergenLegend() {
  return (
    <section aria-label="Allergeni" className="mx-auto mt-[72px] max-w-[560px] text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">Allergeni</div>
        <Ornament color="#9C7A45" />
        <p className="m-0 mt-1 max-w-[420px] text-balance text-[15.5px] italic leading-normal text-[#4A504B]">
          Sotto ogni piatto sono scritti gli allergeni presenti. I vini contengono solfiti. Per dubbi chiedete al personale.
        </p>
      </div>
      <Link
        href="/menu/allergeni"
        className="menu-sans mt-4 inline-flex min-h-11 items-center rounded-full border !border-[#6B1020] px-5 text-[11px] font-medium uppercase tracking-[0.22em] !text-[#6B1020]"
      >
        Filtra per allergene
      </Link>
    </section>
  );
}
