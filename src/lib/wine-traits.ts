// Caratteristiche di un vino (spunte nella scheda, disegnino e parola sul menù).
// Puro e sicuro anche nei componenti client. «Senza solfiti aggiunti» e non
// «senza solfiti»: un po' di solfiti si formano sempre da soli nel vino.

export const WINE_TRAITS = [
  { code: "BIO", label: "Biologico", short: "Bio" },
  { code: "BIODYNAMIC", label: "Biodinamico", short: "Biodinamico" },
  { code: "VEGAN", label: "Vegano", short: "Vegano" },
  { code: "NO_ADDED_SULFITES", label: "Senza solfiti aggiunti", short: "Senza solfiti aggiunti" },
] as const;

export type WineTraitCode = (typeof WINE_TRAITS)[number]["code"];

export const WINE_TRAIT_CODES: readonly string[] = WINE_TRAITS.map((t) => t.code);

// Solo codici noti, nell'ordine fisso dell'elenco e senza doppioni.
export function sortTraits(list: readonly string[]): WineTraitCode[] {
  return WINE_TRAITS.filter((t) => list.includes(t.code)).map((t) => t.code);
}

export function traitLabel(code: string): string {
  return WINE_TRAITS.find((t) => t.code === code)?.label ?? code;
}
