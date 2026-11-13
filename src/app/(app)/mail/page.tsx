import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { loadFeatures } from "@/lib/app-features";
import { loadVenue } from "@/lib/menu";
import { prisma } from "@/lib/prisma";
import { isPreviewDeploy, loadMailSender, mailConfigured, mailQuotaToday } from "@/lib/mail";
import { MailForm } from "./mail-form";
import { MailHistory, OptOutBox, SenderBox } from "./mail-extras";

export const metadata = { title: "Mail" };

// Solo titolare e consulente: il Proxy rimanda già i dipendenti, ma il confine
// vero è qui e nelle azioni (requireUser rifiuta il ruolo EMPLOYEE).
export default async function MailPage() {
  try {
    await requireUser();
  } catch {
    redirect("/mie-ore");
  }
  // Sezione spenta: la pagina non si apre (si torna a Impostazioni, che dice perché).
  if (!(await loadFeatures()).mail) redirect("/account?mail=spenta");

  const [quota, sender, venue, sends, optOuts] = await Promise.all([
    mailQuotaToday(),
    loadMailSender(),
    loadVenue(),
    prisma.mailSend.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.mailOptOut.findMany({ orderBy: { createdAt: "desc" }, select: { email: true, createdAt: true, source: true } }),
  ]);
  const preview = isPreviewDeploy();
  const blocked = preview
    ? "Questa è una versione di prova del sito: nelle versioni di prova non si spedisce. Puoi preparare lista e messaggio e vedere l'anteprima."
    : !mailConfigured()
      ? "Manca il collegamento con il servizio di posta (chiave e indirizzo mittente). Puoi comunque preparare la lista e il messaggio e vedere l'anteprima: il pulsante di invio si accende quando il collegamento è pronto."
      : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Mail</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Scrivi una volta sola e ogni persona riceve la <b>sua</b> mail, con il proprio saluto in cima. Mai
        tutti in copia. Tre passaggi: scegli a chi scrivere, scrivi il messaggio, controlla e invia.
      </p>
      <MailForm
        blocked={blocked}
        blockedTitle={preview ? "Versione di prova: non si spedisce" : "L'invio non è ancora attivo"}
        quota={{ available: quota.bulkAvailable, reserve: quota.reserve, limit: quota.limit }}
        from={process.env.MAIL_FROM || null}
        replyTo={process.env.MAIL_REPLY_TO || null}
        footer={{ address: venue.contacts.address, company: sender.company, vat: sender.vat, privacyUrl: sender.privacyUrl }}
        savedTestEmail={sender.testEmail}
        optedOut={optOuts.map((o) => o.email)}
      />
      <div className="mt-8 flex flex-col gap-5">
        <MailHistory
          sends={sends.map((s) => ({
            id: s.id,
            at: s.createdAt.toISOString(),
            by: s.by,
            subject: s.subject,
            recipients: s.recipients,
            sent: s.sent,
            failed: s.failed,
            excluded: s.excluded,
            status: s.status,
          }))}
        />
        <OptOutBox optOuts={optOuts.map((o) => ({ email: o.email, at: o.createdAt.toISOString(), source: o.source }))} />
        <SenderBox sender={sender} address={venue.contacts.address} from={process.env.MAIL_FROM || null} replyTo={process.env.MAIL_REPLY_TO || null} />
      </div>
    </div>
  );
}
