import { lastCompletedMonth, parseDateKey, todayKey } from "@/lib/week";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REOPENED";

export function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// Quali mesi un dipendente può ancora correggere nella revisione delle ore:
// il mese in corso (solo i giorni già passati), l'ultimo mese concluso finché
// non l'ha inviato, e qualsiasi mese che il titolare gli ha rimandato
// indietro. I mesi più vecchi restano in bozza per sempre se nessuno li ha
// inviati: prima si potevano ancora modificare e inviare (marzo 2026 «Bozza»
// con il pulsante d'invio), mentre ormai li gestisce il titolare.
// Mai prima del mese di assunzione né dopo il mese in corso.
export function employeeCanEditMonth({
  year,
  month,
  status,
  hireMonthKey,
  today = todayKey(),
}: {
  year: number;
  month: number;
  /** null = il dipendente non ha ancora aperto quel mese (vale come bozza). */
  status: SubmissionStatus | null;
  /** "AAAA-MM" del mese di assunzione. */
  hireMonthKey: string;
  /** "AAAA-MM-GG" di oggi (fuso del locale). */
  today?: string;
}): boolean {
  const monthKey = monthKeyOf(year, month);
  const currentMonthKey = today.slice(0, 7);
  if (monthKey < hireMonthKey || monthKey > currentMonthKey) return false;
  if (status === "REOPENED") return true;
  if (status === "SUBMITTED" || status === "APPROVED") return false;
  const last = lastCompletedMonth(parseDateKey(today));
  return monthKey === currentMonthKey || monthKey === monthKeyOf(last.year, last.month);
}
