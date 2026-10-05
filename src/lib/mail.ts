// Invio di una stessa mail a una lista di destinatari, ognuno con la propria
// intestazione (il saluto in cima). Il provider è dietro l'interfaccia
// MailProvider: oggi Resend, passare a Brevo o SES vuol dire scrivere un
// secondo adattatore qui sotto, senza toccare pagina e azioni.
// Chiave e mittente vivono solo nelle variabili d'ambiente.

export type Recipient = { email: string; header: string };

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

export interface MailProvider {
  // Una mail per destinatario, mai tutti in copia. Lancia se il provider rifiuta il gruppo.
  sendBatch(mails: OutgoingMail[]): Promise<void>;
}

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

// Legge un CSV (virgola, punto e virgola o tabulazione; anche incollato a
// mano). Colonne: email e intestazione, con o senza riga di titoli. Se c'è
// solo l'email, l'intestazione resta vuota e si userà il saluto generico.
export function parseRecipients(raw: string): { recipients: Recipient[]; skipped: string[] } {
  const text = raw.replace(/^﻿/, "").trim();
  if (!text) return { recipients: [], skipped: [] };

  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = [";", "\t", ","].sort((a, b) => count(firstLine, b) - count(firstLine, a))[0];
  const rows = parseCsv(text, delimiter).filter((r) => r.some((c) => c.trim()));

  let emailCol = 0;
  let headerCol = 1;
  const titles = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  if (titles.length && !titles.some((t) => t.includes("@"))) {
    const e = titles.findIndex((t) => /^(e-?mail|mail|indirizzo)/.test(t));
    const h = titles.findIndex((t) => /^(intestazione|saluto|nome|destinatario)/.test(t));
    if (e >= 0) emailCol = e;
    headerCol = h >= 0 ? h : emailCol === 0 ? 1 : 0;
    rows.shift();
  }

  const recipients: Recipient[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const email = (row[emailCol] ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      skipped.push(email || row.join(" ").trim());
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, header: (row[headerCol] ?? "").trim() });
  }
  return { recipients, skipped };
}

function count(s: string, ch: string) {
  return s.split(ch).length - 1;
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

const DEFAULT_GREETING = "Buongiorno,";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Intestazione e oggetto non possono contenere ritorni a capo (iniezione di
// intestazioni mail): vengono appiattiti.
export function oneLine(s: string) {
  return s.replace(/[\r\n]+/g, " ").trim();
}

export function buildMail(
  r: Recipient,
  { subject, body, replyTo }: { subject: string; body: string; replyTo?: string },
): OutgoingMail {
  const greeting = oneLine(r.header) || DEFAULT_GREETING;
  const footer = "Se non vuoi più ricevere queste mail, rispondi scrivendo «cancellami».";
  const text = `${greeting}\n\n${body.trim()}\n\n--\n${footer}`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">` +
    `<p>${escapeHtml(greeting)}</p>` +
    body
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("") +
    `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px">` +
    `<p style="font-size:12px;color:#777">${escapeHtml(footer)}</p></div>`;
  return {
    to: r.email,
    subject: oneLine(subject),
    text,
    html,
    headers: replyTo ? { "List-Unsubscribe": `<mailto:${replyTo}?subject=Cancellami>` } : undefined,
  };
}

// Limite del piano gratuito di Resend: 100 mail al giorno (3.000 al mese).
export function dailyLimit(): number {
  const n = Number(process.env.MAIL_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export function getProvider(): MailProvider {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) throw new Error("Invio mail non configurato: mancano RESEND_API_KEY o MAIL_FROM.");
  const replyTo = process.env.MAIL_REPLY_TO || undefined;

  return {
    async sendBatch(mails) {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          mails.map((m) => ({
            from,
            to: [m.to],
            subject: m.subject,
            text: m.text,
            html: m.html,
            reply_to: replyTo,
            headers: m.headers,
          })),
        ),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
      }
    },
  };
}
