// Mail: la parte che serve anche nel browser (lettura della lista, testo, piè di pagina).
// Niente database né chiavi qui: lo usa anche la pagina Mail per l'anteprima, così quello
// che si vede è esattamente quello che parte. Il resto (invio, quota, disiscrizioni) è in mail.ts.

export type Recipient = { email: string; header: string };

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

// Legge un CSV (virgola, punto e virgola o tabulazione; anche incollato a
// mano). Colonne: email e intestazione, con o senza riga di titoli. Se c'è
// solo l'email, l'intestazione resta vuota e si userà il saluto generico.
// titleRow: la prima riga, se è stata presa come titoli delle colonne (per dirlo a chi incolla);
// duplicates: quanti indirizzi ripetuti sono stati tolti.
export function parseRecipients(raw: string): { recipients: Recipient[]; skipped: string[]; titleRow: string | null; duplicates: number } {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return { recipients: [], skipped: [], titleRow: null, duplicates: 0 };

  const delimiter = guessDelimiter(text);
  // Una riga senza il separatore scelto ma con un altro (elenco scritto un po' così e un po' cosà):
  // si divide con quello che ha.
  const rows = parseCsv(text, delimiter)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const other = r.length === 1 ? ["\t", ";", ","].find((ch) => r[0].includes(ch)) : undefined;
      return other ? r[0].split(other) : r;
    });

  let emailCol = 0;
  let headerCol = 1;
  let titleRow: string | null = null;
  const titles = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  if (titles.length && !titles.some((t) => t.includes("@"))) {
    const e = titles.findIndex((t) => /^(e-?mail|mail|indirizzo)/.test(t));
    const h = titles.findIndex((t) => /^(intestazione|saluto|nome|destinatario)/.test(t));
    if (e >= 0) emailCol = e;
    headerCol = h >= 0 ? h : emailCol === 0 ? 1 : 0;
    titleRow = rows[0].map((c) => c.trim()).filter(Boolean).join(delimiter === "\t" ? " · " : `${delimiter} `);
    rows.shift();
  }

  const recipients: Recipient[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const email = (row[emailCol] ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      skipped.push(email || row.join(" ").trim());
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    recipients.push({ email, header: (row[headerCol] ?? "").trim() });
  }
  return { recipients, skipped, titleRow, duplicates };
}

// Separatore delle colonne: quello presente nel maggior numero di righe (tra le prime 50), a pari
// merito punto e virgola, poi tabulazione (colonne copiate da Excel), poi virgola. Così va bene anche se la prima riga ha
// solo l'email, o se qualche nome contiene una virgola in un elenco col punto e virgola.
function guessDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 50);
  const score = (ch: string) => lines.filter((l) => l.includes(ch)).length;
  return [";", "\t", ","].reduce((best, ch) => (score(ch) > score(best) ? ch : best));
}

// La tabella «Scrivili qui»: una riga per persona, scritta a mano. Stesse regole degli altri modi
// (email in minuscolo e controllata, doppioni contati una volta sola); in più dice riga per riga
// cosa non va, per segnarlo sotto la casella.
export type TypedRow = { email: string; header: string };
export type TypedRowState = { kind: "vuota" } | { kind: "ok" } | { kind: "manca" } | { kind: "non valida" } | { kind: "doppia"; of: number };

export function checkTypedRows(rows: TypedRow[]): { recipients: Recipient[]; skipped: string[]; duplicates: number; states: TypedRowState[] } {
  const recipients: Recipient[] = [];
  const skipped: string[] = [];
  const firstAt = new Map<string, number>();
  let duplicates = 0;
  const states = rows.map((row, i): TypedRowState => {
    const email = row.email.trim().toLowerCase();
    const header = row.header.trim();
    if (!email) {
      if (!header) return { kind: "vuota" };
      skipped.push(header);
      return { kind: "manca" };
    }
    if (!isValidEmail(email)) {
      skipped.push(email);
      return { kind: "non valida" };
    }
    const first = firstAt.get(email);
    if (first !== undefined) {
      duplicates++;
      return { kind: "doppia", of: first };
    }
    firstAt.set(email, i);
    recipients.push({ email, header: header.slice(0, 200) });
    return { kind: "ok" };
  });
  return { recipients, skipped, duplicates, states };
}

export type SheetFilters = { headerColumn: string; groups: string[] | null; onlyDocumented: boolean };

// Trova le colonne utili di una tabella (xlsx) dai titoli, senza chiederle.
export function guessColumns(headers: string[]) {
  const find = (re: RegExp) => headers.find((h) => re.test(h));
  return {
    email: find(/^e-?mail/i) ?? "",
    name: find(/azienda|ragione|destinatario|nome/i) ?? "",
    group: find(/priorit/i) ?? "",
    basis: find(/presupposto/i) ?? "",
  };
}

// Trasforma le righe di una tabella in destinatari. L'intestazione è il valore
// della colonna scelta (solo la parte di ognuno, es. «Dott. Rossi»).
// onlyDocumented: tiene solo le righe con un presupposto di invio compilato
// (vuoto o «Da verificare» = non documentato).
export function tableToRecipients(
  rows: Record<string, string>[],
  headers: string[],
  { headerColumn, groups, onlyDocumented }: SheetFilters,
): { recipients: Recipient[]; skipped: string[]; duplicates: number } {
  const cols = guessColumns(headers);
  const recipients: Recipient[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    if (groups && cols.group && !groups.includes(row[cols.group] ?? "")) continue;
    if (onlyDocumented && cols.basis && !/\S/.test(row[cols.basis] ?? "")) continue;
    if (onlyDocumented && cols.basis && /verificare/i.test(row[cols.basis] ?? "")) continue;
    const email = (row[cols.email] ?? "").trim().toLowerCase();
    if (!email) continue;
    if (!isValidEmail(email)) {
      skipped.push(email);
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    recipients.push({ email, header: (headerColumn ? row[headerColumn] ?? "" : "").trim() });
  }
  return { recipients, skipped, duplicates };
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// Segnaposto del nome di ognuno nel testo. «{intestazione}» è il nome vecchio: vale ancora.
export const HEADER_TAG = "{nome}";
export const HEADER_TAG_RE = /\{(?:nome|intestazione)\}/i;

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Intestazione e oggetto non possono contenere ritorni a capo (iniezione di
// intestazioni mail): vengono appiattiti.
export function oneLine(s: string) {
  return s.replace(/[\r\n]+/g, " ").trim();
}

// Mette l'intestazione di ognuno al posto di {intestazione} nel testo uguale
// per tutti. Se la persona non ha intestazione, toglie il segnaposto e
// sistema gli spazi ("Spett.le ," diventa "Spett.le,").
export function applyHeader(body: string, header: string): string {
  const h = oneLine(header);
  return body
    .replace(/\{(?:nome|intestazione)\}/gi, () => h)
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

export const VENUE_NAME = "L'Angolo del Vino";

// Dati del mittente per il piè di pagina obbligatorio delle mail a una lista.
export type MailFooterInfo = {
  address: string; // dai contatti del menù
  company: string; // ragione sociale (facoltativa)
  vat: string; // partita IVA (facoltativa)
  privacyUrl: string; // informativa; vuota = la sezione «I tuoi dati» della pagina di disiscrizione
};

// Il piè di pagina di legge, uguale nell'anteprima e nella mail vera: nome del locale e indirizzo,
// ragione sociale e partita IVA se ci sono, informativa e link per non ricevere più le email.
export function mailFooter(info: MailFooterInfo, unsubscribeUrl: string): { lines: string[]; text: string; html: string } {
  const privacyUrl = info.privacyUrl.trim() || `${unsubscribeUrl}#privacy`;
  const who = [VENUE_NAME, oneLine(info.address)].filter(Boolean).join(" · ");
  const legal = [oneLine(info.company), info.vat.trim() ? `P. IVA ${oneLine(info.vat)}` : ""].filter(Boolean).join(" · ");
  const lines = [who, legal, `Ricevi questa email perché sei tra i contatti dell'${VENUE_NAME.replace(/^L'/, "")}.`].filter(Boolean);
  const text = [...lines, `Informativa sulla privacy: ${privacyUrl}`, `Non voglio più ricevere queste email: ${unsubscribeUrl}`].join("\n");
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:#6B1020;text-decoration:underline">${escapeHtml(label)}</a>`;
  const html =
    `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e4ddd2;font-size:12.5px;line-height:1.55;color:#6b6b6b">` +
    lines.map((l) => `<p style="margin:0 0 4px">${escapeHtml(l)}</p>`).join("") +
    `<p style="margin:10px 0 0">${link(privacyUrl, "Informativa sulla privacy")} · ${link(unsubscribeUrl, "Non voglio più ricevere queste email")}</p>` +
    `</div>`;
  return { lines, text, html };
}

// Una mail della lista: testo con l'intestazione della persona, piè di pagina di legge e le
// intestazioni per cancellarsi con un tocco dal programma di posta (Gmail, Apple Mail…).
// unsubscribeUrl: la pagina «Non voglio più ricevere queste email» di questa persona;
// oneClickUrl: dove il programma di posta manda la richiesta (RFC 8058).
export function buildMail(
  r: Recipient,
  opts: { subject: string; body: string; footer: MailFooterInfo; unsubscribeUrl: string; oneClickUrl?: string; replyTo?: string },
): OutgoingMail {
  const message = applyHeader(opts.body.trim(), r.header);
  const subject = oneLine(opts.subject);
  const footer = mailFooter(opts.footer, opts.unsubscribeUrl);
  const text = `${message}\n\n--\n${footer.text}`;
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html =
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f4efe7">` +
    `<div style="max-width:600px;margin:0 auto;padding:28px 22px;background:#ffffff;color:#222222;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6">` +
    `<p style="margin:0 0 20px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#6B1020">${escapeHtml(VENUE_NAME)}</p>` +
    paragraphs +
    footer.html +
    `</div></body></html>`;
  const unsubscribe = [opts.oneClickUrl ?? opts.unsubscribeUrl, opts.replyTo ? `mailto:${opts.replyTo}?subject=Cancellami` : ""]
    .filter(Boolean)
    .map((u) => `<${u}>`)
    .join(", ");
  const headers: Record<string, string> = { "List-Unsubscribe": unsubscribe };
  if (/^https:\/\//.test(opts.oneClickUrl ?? opts.unsubscribeUrl)) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  return { to: r.email, subject, text, html, headers };
}
