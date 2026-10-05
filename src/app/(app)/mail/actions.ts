"use server";

import { requireUser } from "@/lib/guard";
import { buildMail, dailyLimit, getProvider, isValidEmail, mailConfigured, type Recipient } from "@/lib/mail";
import { parseText, runAction, ValidationError, type ActionResult } from "@/lib/validation";

const MAX_CHUNK = 50;

export type MailStatus = { configured: boolean; dailyLimit: number; replyTo: string | null };

export async function getMailStatus(): Promise<ActionResult<MailStatus>> {
  return runAction(async () => {
    await requireUser();
    return { configured: mailConfigured(), dailyLimit: dailyLimit(), replyTo: process.env.MAIL_REPLY_TO || null };
  });
}

// Invia un gruppo di destinatari (il client spezza la lista in gruppi). Il
// provider rifiuta l'intero gruppo se uno solo è sbagliato, quindi i dati
// vengono ricontrollati qui prima di partire.
export async function sendMailChunk(input: {
  recipients: Recipient[];
  subject: string;
  body: string;
}): Promise<ActionResult<{ sent: number }>> {
  return runAction(async () => {
    await requireUser();
    if (!mailConfigured()) throw new ValidationError("Invio mail non configurato: manca la chiave del provider.");

    const subject = parseText(input?.subject, "oggetto", { max: 200, required: true });
    const body = parseText(input?.body, "testo", { max: 20000, required: true });
    const list = Array.isArray(input?.recipients) ? input.recipients : [];
    if (list.length === 0 || list.length > MAX_CHUNK) throw new ValidationError("Gruppo di destinatari non valido.");

    const recipients = list.map((r) => ({
      email: typeof r?.email === "string" ? r.email.trim().toLowerCase() : "",
      header: typeof r?.header === "string" ? r.header.slice(0, 200) : "",
    }));
    if (recipients.some((r) => !isValidEmail(r.email))) throw new ValidationError("Indirizzo email non valido.");

    const replyTo = process.env.MAIL_REPLY_TO || undefined;
    await getProvider().sendBatch(recipients.map((r) => buildMail(r, { subject, body, replyTo })));
    return { sent: recipients.length };
  });
}
