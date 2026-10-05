import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { MailForm } from "./mail-form";
import { dailyLimit, mailConfigured } from "@/lib/mail";

// Solo titolare e consulente: il Proxy rimanda già i dipendenti, ma il confine
// vero è qui e in sendMailChunk (requireUser rifiuta il ruolo EMPLOYEE).
export default async function MailPage() {
  try {
    await requireUser();
  } catch {
    redirect("/mie-ore");
  }
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Mail</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Scrivi una volta sola e ogni persona riceve la <b>sua</b> mail, con il proprio saluto in cima. Mai
        tutti in copia. Tre passaggi: scegli a chi scrivere, scrivi il messaggio, controlla e invia.
      </p>
      <MailForm
        configured={mailConfigured()}
        limit={dailyLimit()}
        from={process.env.MAIL_FROM || null}
        replyTo={process.env.MAIL_REPLY_TO || null}
      />
    </div>
  );
}
