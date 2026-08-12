export type LeaveSummary = {
  hasData: boolean;
  maturato: number;
  goduto: number;
  programmato: number;
  residuo: number;
  residuoAl31Dic: number;
};

export function computeLeaveSummary(
  balance: { openingBalance: number; monthlyAccrualRate: number } | null,
  entries: { dateKey: string; quantity: number }[],
  year: number,
  today: Date,
): LeaveSummary {
  const opening = balance?.openingBalance ?? 0;
  const rate = balance?.monthlyAccrualRate ?? 0;

  const isCurrentYear = today.getUTCFullYear() === year;
  const monthsElapsed = isCurrentYear ? today.getUTCMonth() + 1 : year < today.getUTCFullYear() ? 12 : 0;

  const maturato = opening + rate * monthsElapsed;
  const maturatoFineAnno = opening + rate * 12;

  const todayKey = today.toISOString().slice(0, 10);
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
