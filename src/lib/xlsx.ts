// Lettura minima di un .xlsx (primo foglio) nel browser: uno xlsx è uno zip di
// XML. Basta per liste di contatti; niente formule, date o stili.
import { unzipSync, strFromU8 } from "fflate";

export type Sheet = { headers: string[]; rows: Record<string, string>[] };

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function parseXml(files: Record<string, Uint8Array>, name: string): Document | null {
  const f = files[name];
  return f ? new DOMParser().parseFromString(strFromU8(f), "application/xml") : null;
}

// Le intestazioni stanno nella prima riga che contiene una colonna "email"
// (nel file reale ci sono alcune righe di titolo sopra).
export function readXlsx(buffer: ArrayBuffer): Sheet {
  const files = unzipSync(new Uint8Array(buffer));
  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")))[0];
  const sheet = sheetName && parseXml(files, sheetName);
  if (!sheet) throw new Error("File non valido: nessun foglio trovato.");

  const shared: string[] = [];
  const sst = parseXml(files, "xl/sharedStrings.xml");
  if (sst) {
    for (const si of Array.from(sst.getElementsByTagNameNS("*", "si"))) {
      shared.push(Array.from(si.getElementsByTagNameNS("*", "t")).map((t) => t.textContent ?? "").join(""));
    }
  }

  const grid: string[][] = [];
  for (const row of Array.from(sheet.getElementsByTagNameNS("*", "row"))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagNameNS("*", "c"))) {
      const type = c.getAttribute("t");
      let value = "";
      if (type === "inlineStr") {
        value = Array.from(c.getElementsByTagNameNS("*", "t")).map((t) => t.textContent ?? "").join("");
      } else {
        const v = c.getElementsByTagNameNS("*", "v")[0]?.textContent ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : v;
      }
      cells[colIndex(c.getAttribute("r") ?? "A1")] = value.trim();
    }
    grid.push(cells);
  }

  const at = grid.findIndex((r) => r.some((c) => /^e-?mail/i.test(c ?? "")));
  if (at < 0) throw new Error("Non trovo una colonna «Email» nel file.");
  const headers = grid[at].map((h) => h ?? "");
  const rows = grid.slice(at + 1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) o[h] = r[i] ?? "";
    });
    return o;
  });
  return { headers: headers.filter(Boolean), rows };
}
