"use client";

import Link from "next/link";

// Barra sopra il foglio (non si stampa): torna alla gestione, esauriti sì/no, stampa.
export function PrintBar({ withSoldOut, soldOutCount }: { withSoldOut: boolean; soldOutCount: number }) {
  return (
    <div className="print-no print-sans sticky top-0 z-10 mb-4 border-b border-black/10 bg-[#fffdf9]/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#1f2420]">
        <Link href="/gestione-menu" className="flex min-h-11 items-center font-medium text-[#6B1020] no-underline hover:underline">
          ← Torna alla gestione
        </Link>
        {soldOutCount > 0 && (
          <Link
            href={withSoldOut ? "/gestione-menu/stampa" : "/gestione-menu/stampa?esauriti=1"}
            replace
            className="flex min-h-11 items-center gap-2 text-[#1f2420] no-underline"
            role="checkbox"
            aria-checked={!withSoldOut}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded border ${withSoldOut ? "border-black/30" : "border-[#6B1020] bg-[#6B1020] text-white"}`}>
              {!withSoldOut && "✓"}
            </span>
            Togli gli esauriti di oggi ({soldOutCount})
          </Link>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto min-h-11 rounded-full bg-[#6B1020] px-5 text-[13px] font-semibold text-white hover:bg-[#5A0E18]"
        >
          Stampa o salva in PDF
        </button>
        <p className="m-0 w-full text-[12px] text-[#5B605A]">Nella finestra di stampa scegli «Salva come PDF» per avere il file. Formato A4, verticale.</p>
      </div>
    </div>
  );
}
