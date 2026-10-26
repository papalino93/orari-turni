// Gli 8 anni dell'Angolo del Vino (primo brindisi: 29 ottobre 2018).
// - Pagina di benvenuto sul menù dei clienti: da giovedì 29 ottobre 2026 alle 16:30 a lunedì
//   2 novembre alle 10:00 (ora italiana; a fine ottobre è già ora solare, +01:00).
// - Dalla stessa ora il logo del gestionale ha l'«8 rigirato» (∞) dietro, per un anno: fino al
//   29 ottobre 2027 alle 16:30 (ora legale, +02:00).
// Con ?festa=1 nell'indirizzo si vedono in anteprima prima dell'ora (?festa=0 le nasconde).
export const FESTA_DAL = Date.parse("2026-10-29T16:30:00+01:00");
export const FESTA_AL = Date.parse("2026-11-02T10:00:00+01:00");
export const MARCHIO_AL = Date.parse("2027-10-29T16:30:00+02:00");

export const festaInCorso = (t: number) => t >= FESTA_DAL && t < FESTA_AL;
export const marchioOtto = (t: number) => t >= FESTA_DAL && t < MARCHIO_AL;

// Lettura dell'anteprima dall'indirizzo (solo nel browser): true, false o null se non chiesta.
export function festaForzata(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("festa");
  return v === "1" ? true : v === "0" ? false : null;
}
