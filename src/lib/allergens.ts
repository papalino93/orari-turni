// I 14 allergeni di cui il Reg. UE 1169/2011 impone l'indicazione. Puro e
// sicuro anche nei componenti client.

export const ALLERGENS = [
  { code: "GLUTINE", label: "Glutine", detail: "cereali contenenti glutine" },
  { code: "CROSTACEI", label: "Crostacei", detail: "e prodotti a base di crostacei" },
  { code: "UOVA", label: "Uova", detail: "e prodotti a base di uova" },
  { code: "PESCE", label: "Pesce", detail: "e prodotti a base di pesce" },
  { code: "ARACHIDI", label: "Arachidi", detail: "e prodotti a base di arachidi" },
  { code: "SOIA", label: "Soia", detail: "e prodotti a base di soia" },
  { code: "LATTE", label: "Latte", detail: "e derivati, incluso il lattosio" },
  { code: "FRUTTA_A_GUSCIO", label: "Frutta a guscio", detail: "mandorle, nocciole, noci, pistacchi…" },
  { code: "SEDANO", label: "Sedano", detail: "e prodotti a base di sedano" },
  { code: "SENAPE", label: "Senape", detail: "e prodotti a base di senape" },
  { code: "SESAMO", label: "Sesamo", detail: "e prodotti a base di semi di sesamo" },
  { code: "SOLFITI", label: "Solfiti", detail: "anidride solforosa, oltre 10 mg/kg o mg/l" },
  { code: "LUPINI", label: "Lupini", detail: "e prodotti a base di lupini" },
  { code: "MOLLUSCHI", label: "Molluschi", detail: "e prodotti a base di molluschi" },
] as const;

export type AllergenCode = (typeof ALLERGENS)[number]["code"];

export const ALLERGEN_CODES: readonly string[] = ALLERGENS.map((a) => a.code);

export function allergenLabel(code: string): string {
  return ALLERGENS.find((a) => a.code === code)?.label ?? code;
}

// Stato degli allergeni di una voce: "non ancora compilato" non è la stessa
// cosa di "nessun allergene", e non deve mai sembrare sicuro.
export type AllergenState = "unknown" | "none" | "some";

export function allergenState(item: { allergens: string[]; allergensReviewed: boolean }): AllergenState {
  if (!item.allergensReviewed) return "unknown";
  return item.allergens.length === 0 ? "none" : "some";
}

// Numero ufficiale dell'allergene (1 = glutine … 14 = molluschi), come nei menù
// stampati: sul piatto compaiono i numeri, in fondo la legenda.
export function allergenNumber(code: string): number {
  return ALLERGEN_CODES.indexOf(code) + 1;
}

export function allergenNumbers(codes: string[]): number[] {
  return codes
    .map(allergenNumber)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
}
