// Rubrica: lettura dei contatti da importare, nel browser (niente database). Capisce:
// - i file .vcf della rubrica del telefono (iPhone, Android, Google Contatti), anche con tanti
//   contatti, più email per contatto, accenti, «quoted-printable» e righe spezzate;
// - i .csv di Google Contatti e di Outlook (anche in italiano) e qualsiasi tabella con una
//   colonna di email (Excel, il file di esempio, quello scaricato dalla rubrica stessa);
// - un elenco incollato («Mario Rossi <mario@…>», «mario@…; Mario», una email per riga…);
// - la scelta dei contatti del telefono su Android (Contact Picker).
// Poi planImport confronta con la rubrica: nuovi, già presenti, senza email, cancellati.

import { guessDelimiter, isValidEmail, parseCsv } from "@/lib/mail-text";
import { cleanEmail, cleanName, fold } from "@/lib/mail-rubrica";

// groups: i gruppi scritti nel file (colonna «Gruppo» o «Gruppi», più gruppi separati da virgole).
export type ImportRow = { name: string; emails: string[]; phone: string; groups: string[] };
export type ImportFormat = "vcard" | "google" | "outlook" | "brevo" | "tabella" | "elenco" | "telefono";
export type ParsedImport = {
  format: ImportFormat;
  rows: ImportRow[]; // solo chi ha almeno un'email valida
  noEmail: string[]; // chi non ha un'email valida (nome, con l'indirizzo sbagliato se c'è, o la riga com'era)
};

export const FORMAT_LABEL: Record<ImportFormat, string> = {
  vcard: "rubrica del telefono (.vcf)",
  google: "Google Contatti",
  outlook: "Outlook",
  brevo: "Brevo",
  tabella: "tabella",
  elenco: "elenco",
  telefono: "rubrica del telefono",
};

// Le email valide di un testo («a@x.it ::: b@y.it», «Mario <a@x.it>»…), senza doppioni.
function emailsIn(text: string): { good: string[]; bad: boolean } {
  const parts = text.split(/\s*(?::::|[,;\s<>()"'])\s*/).filter((p) => p.includes("@"));
  const good: string[] = [];
  let bad = false;
  for (const p of parts) {
    const e = cleanEmail(p);
    if (isValidEmail(e)) {
      if (!good.includes(e)) good.push(e);
    } else bad = true;
  }
  return { good, bad };
}

const cleanPhone = (s: string) =>
  s
    .replace(/^tel:/i, "")
    .split(":::")[0]
    .replace(/[^\d+()\s./-]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 40);
const looksLikePhone = (s: string) => !s.includes("@") && (s.replace(/\D/g, "").length >= 6) && /^[\d\s+()./-]+$/.test(s.trim());

type RawRow = { name: string; emails: string[]; phone: string; raw: string; groups?: string };

// «Aziende, Clienti» → ["Aziende", "Clienti"], senza doppioni (anche se scritti con maiuscole diverse).
export function splitGroups(cell: string): string[] {
  const out: string[] = [];
  for (const part of cell.split(/[,;|\n]/)) {
    const g = cleanName(part).slice(0, 40);
    if (g && !out.some((x) => fold(x) === fold(g))) out.push(g);
  }
  return out;
}

function finish(format: ImportFormat, list: RawRow[]): ParsedImport {
  const rows: ImportRow[] = [];
  const noEmail: string[] = [];
  for (const r of list) {
    if (r.emails.length) rows.push({ name: cleanName(r.name), emails: r.emails, phone: cleanPhone(r.phone), groups: splitGroups(r.groups ?? "") });
    else if (r.name.trim() || r.raw.trim()) {
      // Un indirizzo scritto male («lucia.example.com», «a@b») si mostra accanto al nome: così si capisce
      // che l'email c'era ma non è giusta, invece di sembrare una colonna vuota.
      const wrong = r.raw.split(/[\s;,\t"<>()]+/).find((t) => /[@]|^[^\d\s]\S*\.[a-z]{2,}$/i.test(t) && !looksLikePhone(t));
      const name = cleanName(r.name);
      noEmail.push(name ? (wrong && wrong !== name ? `${name} (${wrong.slice(0, 60)})` : name) : r.raw.trim().slice(0, 60));
    }
  }
  return { format, rows, noEmail };
}

// ---------- vCard (.vcf)

type VProp = { name: string; params: { types: string[]; encoding: string; charset: string; pref: boolean }; value: string };

function decodeQuotedPrintable(value: string, charset: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // Testo non codificato: è ASCII, ma un carattere già decodificato (file salvato male) si tiene.
      const code = c.charCodeAt(0);
      if (code < 128) bytes.push(code);
      else bytes.push(...new TextEncoder().encode(c));
    }
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

const unescapeV = (s: string) => s.replace(/\\([\\,;nN])/g, (_, c: string) => (c === "n" || c === "N" ? " " : c));
// Divide un valore composto (N, ORG) sui «;» non preceduti da «\».
const splitV = (s: string) => s.split(/(?<!\\);/).map((x) => unescapeV(x).trim());

function parseProp(line: string): VProp | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const [rawName, ...params] = head.split(";");
  const name = rawName.replace(/^[^.]*\./, "").toUpperCase();
  const p = { types: [] as string[], encoding: "", charset: "", pref: false };
  for (const raw of params) {
    const eq = raw.indexOf("=");
    const key = eq < 0 ? "TYPE" : raw.slice(0, eq).toUpperCase();
    const val = (eq < 0 ? raw : raw.slice(eq + 1)).replace(/^"|"$/g, "");
    if (key === "ENCODING" || (eq < 0 && /^(QUOTED-PRINTABLE|BASE64|B)$/i.test(val))) p.encoding = val.toUpperCase();
    else if (key === "CHARSET") p.charset = val;
    else if (key === "PREF") p.pref = true;
    else if (key === "TYPE") for (const t of val.split(",")) p.types.push(t.toLowerCase());
  }
  if (p.types.includes("pref")) p.pref = true;
  return { name, params: p, value: line.slice(colon + 1) };
}

export function parseVcf(text: string): ParsedImport {
  // Righe spezzate (RFC 6350: a capo seguito da spazio o tabulazione) rimesse insieme.
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const cards: RawRow[] = [];
  let cur: VProp[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line) continue;
    const upper = line.slice(0, 12).toUpperCase();
    if (upper.startsWith("BEGIN:VCARD")) {
      cur = [];
      continue;
    }
    if (upper.startsWith("END:VCARD")) {
      if (cur) cards.push(cardToRow(cur));
      cur = null;
      continue;
    }
    if (!cur || /^(PHOTO|LOGO|SOUND|KEY)[;:]/i.test(upper)) continue;
    // vCard 2.1, quoted-printable: una riga che finisce con «=» continua nella successiva.
    if (/ENCODING=QUOTED-PRINTABLE|;QUOTED-PRINTABLE[;:]/i.test(line.slice(0, line.indexOf(":") + 1))) {
      while (line.endsWith("=") && i + 1 < lines.length) line = line.slice(0, -1) + lines[++i];
    }
    const prop = parseProp(line);
    if (!prop) continue;
    if (prop.params.encoding === "QUOTED-PRINTABLE") prop.value = decodeQuotedPrintable(prop.value, prop.params.charset);
    cur.push(prop);
  }
  return finish("vcard", cards);
}

function cardToRow(props: VProp[]): RawRow {
  const get = (n: string) => props.filter((p) => p.name === n);
  let name = unescapeV(get("FN")[0]?.value ?? "").trim();
  if (!name) {
    const n = get("N")[0];
    if (n) {
      const [family = "", given = "", middle = "", prefix = "", suffix = ""] = splitV(n.value);
      name = [prefix, given, middle, family, suffix].filter(Boolean).join(" ");
    }
  }
  if (!name) name = splitV(get("ORG")[0]?.value ?? "")[0] ?? "";
  const emailProps = get("EMAIL").sort((a, b) => Number(b.params.pref) - Number(a.params.pref));
  const emails: string[] = [];
  for (const p of emailProps) for (const e of emailsIn(unescapeV(p.value)).good) if (!emails.includes(e)) emails.push(e);
  const tels = get("TEL");
  const tel =
    tels.find((t) => t.params.pref) ?? tels.find((t) => t.params.types.some((x) => x === "cell" || x === "mobile" || x === "iphone")) ?? tels[0];
  const raw = emailProps.map((p) => p.value).join(" ");
  return { name, emails, phone: tel ? unescapeV(tel.value) : "", raw };
}

// ---------- Tabelle (CSV di Google, Outlook, Excel, il file della rubrica…)

const norm = (h: string) => fold(h).replace(/[^a-z0-9]+/g, " ").trim();

type Columns = { emails: number[]; full: number[]; first: number; middle: number; last: number; company: number; phones: number[]; groups: number };

function classify(headers: string[]): Columns | null {
  const h = headers.map(norm);
  const col: Columns = { emails: [], full: [], first: -1, middle: -1, last: -1, company: -1, phones: [], groups: -1 };
  const mobile: number[] = [];
  const other: number[] = [];
  h.forEach((t, i) => {
    if (!t) return;
    const isMailish = /\b(e ?mail|email|mail|posta elettronica)\b/.test(t);
    if (isMailish) {
      if (!/\b(label|type|tipo|display|visualizzat\w*|nome)\b/.test(t)) col.emails.push(i);
      return;
    }
    if (/^(name|full name|display name|file as|salva come|nome o azienda|nome completo|nome e cognome|destinatario|intestazione|saluto|contatto|cliente)$/.test(t)) col.full.push(i);
    else if (/^(gruppo|gruppi|group|groups|gruppo i)$/.test(t)) col.groups = col.groups < 0 ? i : col.groups;
    else if (/^(first name|given name|firstname|nome|nome di battesimo|prenom)$/.test(t)) col.first = col.first < 0 ? i : col.first;
    else if (/^(middle name|additional name|secondo nome|altro nome)$/.test(t)) col.middle = col.middle < 0 ? i : col.middle;
    else if (/^(last name|family name|lastname|surname|cognome|nom)$/.test(t)) col.last = col.last < 0 ? i : col.last;
    else if (/^(company|organization name|organization 1 name|organization|societa|azienda|ragione sociale|ditta)$/.test(t)) col.company = col.company < 0 ? i : col.company;
    else if (/\b(fax|label|type|tipo)\b/.test(t)) return;
    else if (/\b(mobile|cellulare|cell|sms|whatsapp)\b/.test(t)) mobile.push(i);
    else if (/\b(phone|telefono|tel)\b/.test(t)) other.push(i);
  });
  col.phones = [...mobile, ...other];
  return col.emails.length ? col : null;
}

export function parseTable(table: string[][], hint?: ImportFormat): ParsedImport {
  const rows = table.filter((r) => r.some((c) => c && c.trim()));
  if (rows.length === 0) return { format: hint ?? "tabella", rows: [], noEmail: [] };
  const first = rows[0];
  const cols = first.some((c) => c.includes("@")) ? null : classify(first);
  const list: RawRow[] = [];
  let format: ImportFormat = hint ?? "tabella";
  if (cols) {
    const hs = first.map(norm);
    if (!hint) {
      if (hs.some((t) => /^e mail 1 (value|valore)$/.test(t))) format = "google";
      else if (hs.includes("sms") || (hs.includes("email") && hs.some((t) => /^(firstname|lastname|nome|cognome)$/.test(t)) && first.some((c) => /^[A-Z_]+$/.test(c.trim())))) format = "brevo";
      else if (hs.some((t) => t === "e mail address" || t === "indirizzo posta elettronica")) format = "outlook";
    }
    for (const r of rows.slice(1)) {
      const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
      const emails: string[] = [];
      for (const i of cols.emails) for (const e of emailsIn(cell(i)).good) if (!emails.includes(e)) emails.push(e);
      const full = cols.full.map(cell).find(Boolean) ?? "";
      const parts = [cell(cols.first), cell(cols.middle), cell(cols.last)].filter(Boolean).join(" ");
      const name = full || parts || cell(cols.company);
      const phone = cols.phones.map(cell).find(Boolean) ?? "";
      list.push({ name, emails, phone, raw: r.join(" "), groups: cell(cols.groups) });
    }
    return finish(format, list);
  }
  // Senza titoli: in ogni riga l'email è la casella con la «@», il nome la prima casella di testo,
  // il telefono quella fatta di numeri. Più email nella stessa riga senza nomi = più persone.
  for (const r of rows) {
    const cells = r.map((c) => (c ?? "").trim()).filter(Boolean);
    const withAt = cells.filter((c) => c.includes("@"));
    const text = cells.filter((c) => !c.includes("@") && !looksLikePhone(c));
    const phone = cells.find(looksLikePhone) ?? "";
    const found = withAt.flatMap((c) => emailsIn(c).good);
    if (found.length > 1 && text.length === 0) {
      for (const e of found) list.push({ name: "", emails: [e], phone: "", raw: e });
      continue;
    }
    list.push({ name: text[0] ?? "", emails: [...new Set(found)], phone, raw: cells.join(" ") });
  }
  return finish(format, list);
}

export function parseCsvContacts(text: string): ParsedImport {
  const clean = text.replace(/^\uFEFF/, "");
  // Una riga senza il separatore scelto ma con un altro (elenco scritto un po' così e un po' cosà):
  // si divide con quello che ha, come in «Incolla un elenco».
  const rows = parseCsv(clean.trim(), guessDelimiter(clean)).map((r) => {
    const other = r.length === 1 ? ["\t", ";", ","].find((ch) => r[0].includes(ch)) : undefined;
    return other ? r[0].split(other) : r;
  });
  return parseTable(rows);
}

// ---------- Elenco incollato

// «Mario Rossi <mario@rossi.it>, "Bianchi, Laura" <laura@…>» (copiato dal campo «A:» di una mail),
// oppure righe «email; nome» o una email per riga. Anche un vCard incollato.
export function parsePasted(text: string): ParsedImport {
  if (/BEGIN:VCARD/i.test(text)) return { ...parseVcf(text), format: "elenco" };
  const angle = /(?:"([^"]*)"|([^<>,;\n"]*?))\s*<([^<>\s]+@[^<>\s]+)>/g;
  if (/<[^<>\s]+@[^<>\s]+>/.test(text)) {
    const list: RawRow[] = [];
    let rest = text;
    for (const m of text.matchAll(angle)) {
      const e = cleanEmail(m[3]);
      list.push({ name: (m[1] ?? m[2] ?? "").trim(), emails: isValidEmail(e) ? [e] : [], phone: "", raw: m[0] });
      rest = rest.replace(m[0], " ");
    }
    // Indirizzi senza nome nello stesso elenco.
    for (const e of emailsIn(rest).good) list.push({ name: "", emails: [e], phone: "", raw: e });
    return finish("elenco", list);
  }
  const res = parseCsvContacts(text);
  return { ...res, format: res.format === "tabella" ? "elenco" : res.format };
}

// ---------- File scelto

export function parseContactsText(fileName: string, text: string): ParsedImport {
  if (/\.vcf$/i.test(fileName) || /^\s*BEGIN:VCARD/i.test(text)) return parseVcf(text);
  return parseCsvContacts(text);
}

// ---------- Contact Picker (Chrome su Android)

export type PickedContact = { name?: string[]; email?: string[]; tel?: string[] };
export function fromPicker(list: PickedContact[]): ParsedImport {
  return finish(
    "telefono",
    list.map((c) => {
      const emails: string[] = [];
      for (const raw of c.email ?? []) for (const e of emailsIn(raw).good) if (!emails.includes(e)) emails.push(e);
      return { name: c.name?.[0] ?? "", emails, phone: c.tel?.[0] ?? "", raw: (c.email ?? []).join(" ") };
    }),
  );
}

// ---------- Confronto con la rubrica

export type PlanKind = "nuovo" | "uguale" | "riempie" | "diverso" | "nonvuole";
export type PlanItem = { row: number; email: string; name: string; phone: string; groups: string[]; kind: PlanKind; current: string };
export type ImportPlan = {
  items: PlanItem[];
  counts: Record<PlanKind, number> & { doppi: number; senzaEmail: number };
  multi: number[]; // righe con più di un'email (si può scegliere quale usare)
  // I gruppi scritti nel file: quanti contatti per gruppo e quali ancora non esistono (si creano importando).
  fileGroups: { name: string; count: number; isNew: boolean }[];
};

// choice: per le righe con più email, quella scelta (altrimenti la prima).
// existing: i contatti in rubrica (non eliminati), per email; optedOut: chi non vuole più email.
export function planImport(
  parsed: ParsedImport,
  choice: Record<number, string>,
  existing: Map<string, { name: string }>,
  optedOut: Set<string>,
  groupNames: string[] = [],
): ImportPlan {
  const counts = { nuovo: 0, uguale: 0, riempie: 0, diverso: 0, nonvuole: 0, doppi: 0, senzaEmail: parsed.noEmail.length };
  const items: PlanItem[] = [];
  const at = new Map<string, number>();
  const multi: number[] = [];
  parsed.rows.forEach((r, row) => {
    if (r.emails.length > 1) multi.push(row);
    const email = choice[row] && r.emails.includes(choice[row]) ? choice[row] : r.emails[0];
    const seen = at.get(email);
    if (seen !== undefined) {
      counts.doppi++;
      const first = items[seen];
      if (!first.name && r.name) first.name = r.name;
      if (!first.phone && r.phone) first.phone = r.phone;
      for (const g of r.groups) if (!first.groups.some((x) => fold(x) === fold(g))) first.groups.push(g);
      return;
    }
    at.set(email, items.length);
    items.push({ row, email, name: r.name, phone: r.phone, groups: [...r.groups], kind: "nuovo", current: "" });
  });
  for (const it of items) {
    const cur = existing.get(it.email);
    if (optedOut.has(it.email)) it.kind = "nonvuole";
    else if (!cur) it.kind = "nuovo";
    else {
      it.current = cur.name;
      it.kind = !it.name || fold(cur.name.trim()) === fold(it.name.trim()) ? "uguale" : !cur.name.trim() ? "riempie" : "diverso";
    }
    counts[it.kind]++;
  }
  const known = new Set(groupNames.map(fold));
  const tally = new Map<string, { name: string; count: number; isNew: boolean }>();
  for (const it of items) {
    if (it.kind === "nonvuole") continue;
    for (const g of it.groups) {
      const k = fold(g);
      const t = tally.get(k) ?? { name: g, count: 0, isNew: !known.has(k) };
      t.count++;
      tally.set(k, t);
    }
  }
  return { items, counts, multi, fileGroups: [...tally.values()] };
}
