import { loadVenue } from "@/lib/menu";
import { emailFromUnsubscribeToken, isOptedOut, loadMailSender, VENUE_NAME } from "@/lib/mail";
import { Ornament } from "../../../menu/ornament";

// Ogni volta dal database (chi si è già cancellato vede «Fatto»).
export const dynamic = "force-dynamic";

const pill =
  "menu-sans inline-flex min-h-12 items-center justify-center gap-2 rounded-full border !border-[#6B1020] bg-[#6B1020] px-7 text-[12px] font-medium uppercase tracking-[0.18em] !text-[#F4EEE3] no-underline";

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fatto?: string | string[]; errore?: string | string[] }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const email = emailFromUnsubscribeToken(token);
  const [venue, sender, already] = await Promise.all([loadVenue(), loadMailSender(), email ? isOptedOut(email) : false]);
  const done = Boolean(email && (already || query.fatto));
  const replyTo = process.env.MAIL_REPLY_TO || "";

  const head = !email
    ? {
        title: "Questo link non funziona",
        text: "Forse è stato copiato a metà. Per non ricevere più le nostre email rispondi «cancellami» a una nostra mail e ti togliamo noi.",
      }
    : done
      ? { title: "Fatto", text: "Non riceverai più le nostre email. Se ti sei cancellato per sbaglio, rispondi a una nostra mail e ti rimettiamo." }
      : { title: `Vuoi smettere di ricevere le email dell'Angolo del Vino?`, text: `Le email arrivano a ${email}.` };

  return (
    <>
      <header className="flex justify-center bg-[#5A0E18] px-6 pb-5 pt-[max(20px,env(safe-area-inset-top))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtri CSS */}
        <img src="/menu/logo.png" alt={VENUE_NAME} className="h-auto w-[150px] [filter:invert(1)_sepia(0.25)_brightness(0.97)]" />
      </header>
      <main className="mx-auto max-w-[560px] px-6 pb-[72px] pt-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">Le nostre email</div>
          <h1 className="menu-serif m-0 mb-1 text-balance text-[34px] font-medium leading-[1.08] text-[#6B1020]">{head.title}</h1>
          <Ornament color="#9C7A45" />
          <p className="m-0 mt-3 max-w-[440px] text-balance break-words text-[17.5px] leading-normal text-[#3F4540]">{head.text}</p>
          {query.errore && !done && (
            <p role="alert" className="m-0 mt-3 text-[16px] text-[#8A1C1C]">
              Non è andata: ricarica la pagina e tocca di nuovo il pulsante.
            </p>
          )}
        </div>

        {email && !done && (
          <form method="post" action={`/mail/cancellami/${token}/conferma`} className="mt-8 flex justify-center">
            <button type="submit" className={`${pill} min-w-[240px]`}>
              Sì, cancellami
            </button>
          </form>
        )}

        <section id="privacy" className="mt-14 rounded-2xl border bg-[#FBF7EF] px-5 py-5 text-[15.5px] leading-normal text-[#3F4540]">
          <h2 className="menu-sans m-0 text-[11px] font-medium uppercase tracking-[0.22em] text-[#7A5A22]">I tuoi dati</h2>
          <p className="m-0 mt-2">
            Le email le manda {sender.company.trim() || VENUE_NAME}
            {sender.vat.trim() ? ` (P. IVA ${sender.vat.trim()})` : ""}
            {venue.contacts.address ? `, ${venue.contacts.address}` : ""}. Del tuo contatto teniamo l&apos;indirizzo email, il nome con cui
            ti salutiamo, il telefono se ce l&apos;hai dato e quando ti abbiamo scritto, per mandarti le notizie dell&apos;enoteca; non li diamo a
            nessuno.
          </p>
          <p className="m-0 mt-2">
            Puoi smettere di riceverle quando vuoi, da questa pagina
            {replyTo ? (
              <>
                {" "}
                o scrivendo a <a href={`mailto:${replyTo}`} className="underline underline-offset-2">{replyTo}</a>, anche per sapere quali dati abbiamo o
                farli cancellare
              </>
            ) : (
              " o rispondendo a una nostra mail, anche per sapere quali dati abbiamo o farli cancellare"
            )}
            .
          </p>
          {sender.privacyUrl && (
            <p className="m-0 mt-2">
              <a href={sender.privacyUrl} className="underline underline-offset-2">
                Informativa completa
              </a>
            </p>
          )}
        </section>
      </main>
    </>
  );
}
