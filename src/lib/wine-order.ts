// Ordine dei vini in carta, deciso con il titolare: prima la Toscana, poi le
// altre regioni italiane in ordine alfabetico, poi l'estero (per paese e
// regione); dentro la stessa regione per nome del produttore. I vini italiani
// senza regione vanno in fondo agli italiani. Si usa solo per scegliere dove
// mettere un vino nuovo: l'ordine scelto a mano non viene mai rifatto.
// La stessa regola è nella migrazione 20261007110000_menu_wines_by_region.

// Varianti di scrittura frequenti → un solo nome.
const ALIASES: Record<string, string> = {
  "trentino-alto adige": "trentino",
  "trentino alto adige": "trentino",
  sudtirolo: "alto adige",
  "friuli": "friuli-venezia giulia",
  "friuli venezia giulia": "friuli-venezia giulia",
  "emilia romagna": "emilia-romagna",
  "valle d’aosta": "valle d'aosta",
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

type WineLike = { name: string; region: string | null; country: string | null };

// Chiave: [italiano/estero, Toscana · altre regioni · senza regione, paese, regione, produttore].
export function wineSortKey(w: WineLike): [number, number, string, string, string] {
  const country = norm(w.country);
  const foreign = country !== "" && country !== "italia" ? 1 : 0;
  const region = ALIASES[norm(w.region)] ?? norm(w.region);
  const tier = foreign ? 0 : region === "toscana" ? 0 : region ? 1 : 2;
  return [foreign, tier, foreign ? country : "", region, norm(w.name)];
}

export function compareWines(a: WineLike, b: WineLike): number {
  const ka = wineSortKey(a);
  const kb = wineSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

// Dove inserire un vino nuovo in un gruppo già ordinato (anche a mano): prima
// del primo vino che, secondo l'ordine della carta, viene dopo di lui. Se
// nessuno viene dopo, in fondo. Restituisce l'indice nella lista.
export function insertionIndex(list: readonly WineLike[], wine: WineLike): number {
  const i = list.findIndex((other) => compareWines(other, wine) > 0);
  return i === -1 ? list.length : i;
}
