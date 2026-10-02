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
};

export type ParsedRow =
  | { line: number; ok: true; input: ImportRowInput }
  | { line: number; ok: false; error: string; raw: string };

export const IMPORT_COLUMNS: Record<ImportKind, string[]> = {
  WINE: ["Nome", "Sottotitolo", "Uvaggio", "Calice", "Bottiglia"],
  FOOD: ["Nome", "Descrizione", "Prezzo"],
};

export const MAX_IMPORT_ROWS = 100;

function detectDelimiter(text: string): string | null {
  if (text.includes("\t")) return "\t";
  if (text.includes(";")) return ";";
  if (text.includes("|")) return "|";
  return null;
}

export function parseImport(text: string, kind: ImportKind): { rows: ParsedRow[]; tooMany: boolean } {
  const delimiter = detectDelimiter(text);
  const expected = IMPORT_COLUMNS[kind].length;
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

      // Prima riga "Nome; Sottotitolo; …" = intestazione di una tabella copiata: si salta.
      if (!headerChecked) {
        headerChecked = true;
        if (cells[0].toLowerCase() === "nome") return;
      }

      const fail = (error: string) => rows.push({ line, ok: false, error, raw: rawLine.trim() });

      if (cells.length !== expected) {
        fail(`Servono ${expected} colonne (${IMPORT_COLUMNS[kind].join("; ")}), ne ho trovate ${cells.length}.`);
        return;
      }

      const input: ImportRowInput =
        kind === "WINE"
          ? { name: cells[0], sub: cells[1], grapes: cells[2], description: "", priceGlass: cells[3], priceBottle: cells[4], price: "" }
          : { name: cells[0], sub: "", grapes: "", description: cells[1], priceGlass: "", priceBottle: "", price: cells[2] };

      if (!input.name) return fail("Manca il nome.");
      if (input.name.length > 120) return fail("Nome troppo lungo (massimo 120 caratteri).");
      if (input.sub.length > 160) return fail("Sottotitolo troppo lungo (massimo 160 caratteri).");
      if (input.grapes.length > 200) return fail("Uvaggio troppo lungo (massimo 200 caratteri).");
      if (input.description.length > 300) return fail("Descrizione troppo lunga (massimo 300 caratteri).");

      if (kind === "WINE") {
        const glass = tryParsePrice(input.priceGlass);
        const bottle = tryParsePrice(input.priceBottle);
        if (!glass.ok) return fail(`Prezzo al calice non valido: «${input.priceGlass}».`);
        if (!bottle.ok) return fail(`Prezzo alla bottiglia non valido: «${input.priceBottle}».`);
        if (glass.cents === null && bottle.cents === null) return fail("Serve almeno un prezzo (calice o bottiglia).");
      } else {
        const price = tryParsePrice(input.price);
        if (!price.ok) return fail(`Prezzo non valido: «${input.price}».`);
        if (price.cents === null) return fail("Manca il prezzo.");
      }

      rows.push({ line, ok: true, input });
    });

  return { rows, tooMany: rows.length > MAX_IMPORT_ROWS };
}
