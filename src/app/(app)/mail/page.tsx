import { MailForm } from "./mail-form";
import { dailyLimit, mailConfigured } from "@/lib/mail";

export default function MailPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Mail</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Carica un file con email e intestazione, scrivi il testo una volta sola: ogni persona riceve
        la sua mail, con il proprio saluto in cima.
      </p>
      <MailForm
        configured={mailConfigured()}
        limit={dailyLimit()}
        replyTo={process.env.MAIL_REPLY_TO || null}
      />
    </div>
  );
}
