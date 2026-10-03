// Lettura dell'elenco incollato in "Aggiungi più voci": una riga per voce, campi
// separati da tabulazione (copia da Excel), punto e virgola o barra verticale.
// Puro: gira nel browser per l'anteprima; il server rilegge e ricontrolla tutto.

import { tryParsePrice } from "@/lib/menu-format";

export type ImportKind = "WINE" | "FOOD";

export type ImportRowInput = {
  name: string;
  sub: string;
  grapes: string;
  description: string;
  priceGlass: string;
  priceBottle: string;
  price: string;
  // Gruppo con i formati (birre 0,2 l · 0,4 l · 1 l): un prezzo per formato, vuoto = non disponibile.
  formatPrices?: string[];
};

export type ParsedRow =
  | { line: number; ok: true; input: ImportRowInput }
  | { line: number; ok: false; error: string; raw: string };

export const IMPORT_COLUMNS: Record<ImportKind, string[]> = {
  WINE: ["Azienda", "Denominazione", "Uvaggio", "Calice", "Bottiglia"],
  FOOD: ["Nome", "Descrizione", "Prezzo"],
};

export const MAX_IMPORT_ROWS = 100;

// Colonne attese: con i formati del gruppo, un prezzo per formato al posto di «Prezzo».
export function importColumns(kind: ImportKind, formats: string[] | null = null): string[] {
  return kind === "FOOD" && formats?.length ? ["Nome", "Descrizione", ...formats] : IMPORT_COLUMNS[kind];
}

function detectDelimiter(text: string): string | null {
  if (text.includes("\t")) return "\t";
  if (text.includes(";")) return ";";
  if (text.includes("|")) return "|";
  return null;
}

export function parseImport(text: string, kind: ImportKind, formats: string[] | null = null): { rows: ParsedRow[]; tooMany: boolean } {
  const delimiter = detectDelimiter(text);
  const columns = importColumns(kind, formats);
  const withFormats = columns !== IMPORT_COLUMNS[kind];
  const expected = columns.length;
  const rows: ParsedRow[] = [];
  let headerChecked = false;

  text
    .replace(/\r/g, "")
    .split("\n")
    .forEach((rawLine, index) => {
      if (!rawLine.trim()) return;
      const line = index + 1;
      let cells = delimiter ? rawLine.split(delimiter).map((c) => c.trim()) : [rawLine.trim()];
      // Una riga che termina con il separatore genera una cella vuota in più.
      if (cells.length === expected + 1 && cells[cells.length - 1] === "") cells = cells.slice(0, -1);

      // Prima riga "Nome; …" o "Azienda; …" = intestazione di una tabella copiata: si salta.
      if (!headerChecked) {
        headerChecked = true;
        if (["nome", "azienda"].includes(cells[0].toLowerCase())) return;
      }

      const fail = (error: string) => rows.push({ line, ok: false, error, raw: rawLine.trim() });

      if (cells.length !== expected) {
        fail(`Servono ${expected} colonne (${columns.join("; ")}), ne ho trovate ${cells.length}.`);
        return;
      }

      const input: ImportRowInput =
        kind === "WINE"
          ? { name: cells[0], sub: cells[1], grapes: cells[2], description: "", priceGlass: cells[3], priceBottle: cells[4], price: "" }
          : withFormats
            ? { name: cells[0], sub: "", grapes: "", description: cells[1], priceGlass: "", priceBottle: "", price: "", formatPrices: cells.slice(2) }
            : { name: cells[0], sub: "", grapes: "", description: cells[1], priceGlass: "", priceBottle: "", price: cells[2] };

      if (!input.name) return fail("Manca il nome.");
      if (input.name.length > 120) return fail("Nome troppo lungo (massimo 120 caratteri).");
      if (input.sub.length > 160) return fail(kind === "WINE" ? "Denominazione troppo lunga (massimo 160 caratteri)." : "Testo troppo lungo (massimo 160 caratteri).");
      if (input.grapes.length > 200) return fail("Uvaggio troppo lungo (massimo 200 caratteri).");
      if (input.description.length > 300) return fail("Descrizione troppo lunga (massimo 300 caratteri).");

      if (kind === "WINE") {
        const glass = tryParsePrice(input.priceGlass);
        const bottle = tryParsePrice(input.priceBottle);
        if (!glass.ok) return fail(`Prezzo al calice non valido: «${input.priceGlass}».`);
        if (!bottle.ok) return fail(`Prezzo alla bottiglia non valido: «${input.priceBottle}».`);
        if (glass.cents === null && bottle.cents === null) return fail("Serve almeno un prezzo (calice o bottiglia).");
      } else if (input.formatPrices) {
        const prices = input.formatPrices.map((x) => tryParsePrice(x));
        const bad = prices.findIndex((x) => !x.ok);
        if (bad !== -1) return fail(`Prezzo non valido per ${columns[bad + 2]}: «${input.formatPrices[bad]}».`);
        if (prices.every((x) => x.ok && x.cents === null)) return fail("Serve almeno un prezzo.");
      } else {
        const price = tryParsePrice(input.price);
        if (!price.ok) return fail(`Prezzo non valido: «${input.price}».`);
        if (price.cents === null) return fail("Manca il prezzo.");
      }

      rows.push({ line, ok: true, input });
    });

  return { rows, tooMany: rows.length > MAX_IMPORT_ROWS };
}
