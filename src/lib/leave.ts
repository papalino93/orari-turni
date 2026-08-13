export type LeaveSummary = {
  hasData: boolean;
  maturato: number;
  goduto: number;
  programmato: number;
  residuo: number;
  residuoAl31Dic: number;
};

// `todayKey` va calcolato nel fuso del locale (Europe/Rome, vedi
// week.ts::todayKey()) e non con new Date().toISOString(): quest'ultima è
// in UTC, e nella finestra tra la mezzanotte UTC e quella italiana un
// giorno di ferie "di oggi" verrebbe classificato come "programmato"
// invece che "goduto" (o viceversa) — lo stesso bug già corretto altrove
// nell'app, capitato di nuovo qui perché il calcolo era duplicato.
export function computeLeaveSummary(
  balance: { openingBalance: number; monthlyAccrualRate: number } | null,
  entries: { dateKey: string; quantity: number }[],
  year: number,
  todayKey: string,
): LeaveSummary {
  const opening = balance?.openingBalance ?? 0;
  const rate = balance?.monthlyAccrualRate ?? 0;

  const todayYear = Number(todayKey.slice(0, 4));
  const todayMonth = Number(todayKey.slice(5, 7)); // 1-12
  const isCurrentYear = todayYear === year;
  const monthsElapsed = isCurrentYear ? todayMonth : year < todayYear ? 12 : 0;

  const maturato = opening + rate * monthsElapsed;
  const maturatoFineAnno = opening + rate * 12;

  let goduto = 0;
  let programmato = 0;
  for (const e of entries) {
    if (e.dateKey <= todayKey) goduto += e.quantity;
    else programmato += e.quantity;
  }

  return {
    hasData: balance !== null,
    maturato: round(maturato),
    goduto: round(goduto),
    programmato: round(programmato),
    residuo: round(maturato - goduto - programmato),
    residuoAl31Dic: round(maturatoFineAnno - goduto - programmato),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
