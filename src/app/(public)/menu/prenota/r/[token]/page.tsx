import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadVenue } from "@/lib/menu";
import { telHref, whatsappHref } from "@/lib/menu-venue";
import { prisma } from "@/lib/prisma";
import { addDays, businessDay, dayLong, dayRelative, peopleText, phoneReadable, romeInstant, UNKNOWN_TIME_MINUTES, viewStatus, type BookingView } from "@/lib/booking/rules";
import { findByToken, loadBookingSettings } from "@/lib/booking/service";
import { effectiveMode, venueDeviceExists } from "@/lib/booking/venue";
import { MenuFooter } from "../../../venue-footer";
import { Ornament } from "../../../ornament";
import { ContactButtons, PrenotaHeader, PreviewBand, pillFilled, pillOutline } from "../../ui";
import { AutoRefresh, CancelButton, ProposalButtons, SaveLink } from "./status-actions";
import { LargeText } from "../../large-text";

// Ogni volta dal database: lo stato cambia quando il locale risponde.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La tua richiesta — L'Angolo del Vino",
  robots: { index: false, follow: false },
  // Il link è la chiave della pagina: non lo si passa ad altri siti.
  referrer: "no-referrer",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function BookingStatusPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ gia?: string }> }) {
  const { token } = await params;
  const sentTwice = (await searchParams).gia === "1";
  const b = await findByToken(token);
  if (!b) notFound();
  const [venue, settings, promo] = await Promise.all([
    loadVenue(),
    loadBookingSettings(),
    b.promoId ? prisma.menuPromo.findUnique({ where: { id: b.promoId }, select: { title: true } }) : null,
  ]);

  const now = new Date();
  const view: BookingView = viewStatus(b, now);
  // Prenotazione segnata in agenda con ora o persone ancora da definire: mai un orario inventato.
  const when = b.timeUnknown ? cap(dayRelative(b.day, now)) : `${cap(dayRelative(b.day, now))} alle ${b.time}`;
  // Ora da definire: «iniziata» solo a giornata finita (le 5 del mattino dopo), non dalle 5 di quel giorno.
  const started = b.timeUnknown ? romeInstant(addDays(b.day, 1), UNKNOWN_TIME_MINUTES).getTime() <= now.getTime() : b.startsAt.getTime() <= now.getTime();
  // Per oggi, ancora senza risposta: nei primi 15 minuti «ti rispondiamo appena possibile»; dopo,
  // se manca meno di un'ora e mezza, meglio telefonare.
  const forToday = view === "PENDING" && b.day === businessDay(now);
  const fresh = now.getTime() - b.createdAt.getTime() < 15 * 60000;
  const late = forToday && !fresh && b.startsAt.getTime() - now.getTime() < 90 * 60000;
  const tonight = forToday && fresh;

  const { contacts } = venue;
  const fromVenue = effectiveMode(settings, await venueDeviceExists()) === "venue";
  const tel = contacts.phone ? telHref(contacts.phone) : null;
  const wa = contacts.phone
    ? whatsappHref(contacts.phone, `Ciao! Ho chiesto un tavolo per ${dayLong(b.day)}${b.timeUnknown ? "" : ` alle ${b.time}`}${b.peopleUnknown ? "" : `, ${peopleText(b.people)}`}, a nome ${b.name}.`)
    : null;
  const again = settings.enabled ? "/menu/prenota" : null;
  // Il recapito per intero: se è sbagliato, il cliente se ne accorge adesso.
  const replyBy =
    b.contact === "email" && b.email
      ? `per email a ${b.email}. L'indirizzo è sbagliato?`
      : // Spazi che non vanno a capo: il numero si legge tutto su una riga.
        `su WhatsApp al ${phoneReadable(b.phone).replace(/ /g, "\u00a0")}. Il numero è sbagliato?`;

  const head = ((): { icon: IconKind; kicker: string; title: string; text: string } => {
    switch (view) {
      case "PENDING":
        return {
          icon: "wait",
          kicker: "Da confermare",
          title: "Richiesta inviata",
          text: `Non è ancora confermata: ti rispondiamo ${replyBy} Annulla la richiesta qui sotto e rifalla.`,
        };
      case "PROPOSED":
        return {
          icon: "clock",
          kicker: "Ti proponiamo un altro orario",
          title: `Ti va bene alle ${b.proposedTime}?`,
          text: `${cap(dayRelative(b.day, now))} alle ${b.time} siamo al completo, ma alle ${b.proposedTime} abbiamo un tavolo per te.`,
        };
      case "CONFIRMED":
        return started
          ? { icon: "ok", kicker: "Confermata", title: "Grazie della visita", text: `Il tavolo era per ${dayLong(b.day)}${b.timeUnknown ? "" : ` alle ${b.time}`}. Speriamo di rivederti presto!` }
          : { icon: "ok", kicker: "Confermata", title: "Ti aspettiamo", text: b.peopleUnknown ? `${when}.` : `${when}, tavolo per ${peopleText(b.people)}.` };
      case "DECLINED":
        return b.cancelledBy === "cliente"
          ? {
              icon: "no",
              kicker: "Richiesta chiusa",
              title: "Va bene, alla prossima",
              text: `Ci hai detto che ${b.proposedTime ? `alle ${b.proposedTime}` : "l'orario proposto"} non va bene: la richiesta è chiusa.`,
            }
          : { icon: "no", kicker: "Non c'è posto", title: "Ci dispiace, siamo al completo", text: `${when} non abbiamo un tavolo libero.` };
      case "CANCELLED":
        return b.cancelledBy === "locale"
          ? { icon: "no", kicker: "Annullata", title: "Prenotazione annullata", text: "Ci dispiace: abbiamo dovuto annullare il tavolo. Ci scusiamo davvero." }
          : { icon: "no", kicker: "Annullata", title: "Annullata, come ci hai chiesto", text: "Grazie per averci avvisato! Ti aspettiamo un'altra volta." };
      case "EXPIRED":
        return {
          icon: "expired",
          kicker: "Senza risposta",
          title: "Non siamo riusciti a risponderti in tempo",
          text: "Ci dispiace davvero: la tua richiesta è rimasta senza risposta.",
        };
    }
  })();

  const active = view === "PENDING" || view === "PROPOSED" || (view === "CONFIRMED" && !started);

  return (
    <>
      {b.isTest && <PreviewBand>Richiesta di prova: non avvisa nessuno e non la vedono i clienti.</PreviewBand>}
      <PrenotaHeader />
      <LargeText />
      <main className="menu-prenota mx-auto max-w-[560px] px-6 pb-[72px] pt-10 [color-scheme:light]">
        <div className="flex flex-col items-center gap-2 text-center">
          <StatusIcon kind={head.icon} />
          <div className="menu-sans mt-2 text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">{head.kicker}</div>
          <h1 className="menu-serif m-0 mb-1 text-balance text-[38px] font-medium leading-[1.05] text-[#6B1020]">{head.title}</h1>
          <Ornament color="#9C7A45" />
          <p className="m-0 mt-3 max-w-[440px] text-balance text-[17.5px] leading-normal text-[#3F4540]">{head.text}</p>
          {/* La stessa richiesta (telefono, giorno e ora) era già partita poco fa: non se ne crea un'altra. */}
          {sentTwice && active && (
            <p className="m-0 mt-4 max-w-[440px] rounded-2xl border !border-[#E3D2AE] bg-[#FBF5EA] px-4 py-3 text-balance text-[15.5px] leading-normal text-[#5A4520]" data-testid="gia-mandata">
              Questa richiesta l&apos;avevi già mandata poco fa: è la stessa, non ne abbiamo fatta un&apos;altra. Se volevi cambiare nome o altro, annullala qui sotto e rifalla.
            </p>
          )}
        </div>

        {/* Da quale numero gli scriviamo: un messaggio da un numero sconosciuto si ignora, o finisce nello spam. */}
        {/* Solo se partono davvero dal telefono dell'enoteca: altrimenti scrive il titolare dal suo numero. */}
        {active && b.contact !== "email" && b.phone && contacts.phone && fromVenue && (
          <div className="mx-auto mt-6 max-w-[440px] rounded-2xl border !border-[#BFD3C4] bg-[#F1F7F2] px-5 py-4 text-center" data-testid="numero-enoteca">
            <p className="m-0 text-balance text-[16px] leading-normal text-[#23402D]">
              Ti scriviamo dal numero WhatsApp dell&apos;enoteca, <strong className="whitespace-nowrap font-semibold">{contacts.phone}</strong>: salvalo in rubrica.
            </p>
            {view === "PENDING" && wa && (
              // La chat parte dal cliente, sul numero del locale: il link della richiesta resta nel suo WhatsApp.
              <a href={wa} className={`${pillOutline} mt-3 inline-flex min-w-[240px]`}>
                Scrivici su WhatsApp
              </a>
            )}
          </div>
        )}

        {b.staffMessage && view !== "PENDING" && (
          <figure className="mx-auto mt-6 max-w-[440px] border-y-[3px] border-double !border-[#C9A96E] px-2 py-3.5 text-center">
            <figcaption className="menu-sans text-[10.5px] font-medium uppercase tracking-[0.22em] text-[#7A5A22]">Messaggio dal locale</figcaption>
            <blockquote className="m-0 mt-1.5 whitespace-pre-line text-pretty text-[17px] italic leading-normal text-[#1F2621]">{b.staffMessage}</blockquote>
          </figure>
        )}

        {late && (
          <div className="mt-7 rounded-2xl border !border-[#C9A96E] bg-[#FBF7EF] px-5 py-5 text-center">
            <p className="menu-serif m-0 text-[24px] font-medium leading-tight text-[#6B1020]">Non siamo ancora riusciti a risponderti</p>
            <p className="m-0 mt-1.5 text-[16.5px] text-[#3F4540]">Manca poco: chiamaci, ti diciamo subito se c&apos;è posto.</p>
            <ContactButtons tel={tel} wa={wa} className="mt-4" />
          </div>
        )}

        {tonight && (
          <div className="mt-7 rounded-2xl border bg-[#FBF7EF] px-5 py-5 text-center">
            <p className="menu-serif m-0 text-[24px] font-medium leading-tight text-[#6B1020]">È per stasera</p>
            <p className="m-0 mt-1.5 text-balance text-[16.5px] text-[#3F4540]">Ti rispondiamo appena possibile. Se hai fretta, chiamaci: ti diciamo subito se c&apos;è posto.</p>
            <ContactButtons tel={tel} wa={null} className="mt-4" />
          </div>
        )}

        {view === "PROPOSED" && b.proposedTime && <ProposalButtons token={token} proposedTime={b.proposedTime} />}

        {view === "EXPIRED" && (
          <div className="mt-7 flex flex-col items-center gap-3">
            {again && (
              <Link href={again} className={`${pillFilled} min-w-[240px]`}>
                Chiedi un altro giorno
              </Link>
            )}
            <ContactButtons tel={tel} wa={wa} />
          </div>
        )}

        {(view === "DECLINED" || view === "CANCELLED") && (
          <div className="mt-7 flex flex-col items-center gap-2.5">
            {again ? (
              <Link href={again} className={`${pillFilled} min-w-[240px]`}>
                Chiedi un altro giorno
              </Link>
            ) : (
              <ContactButtons tel={tel} wa={wa} />
            )}
          </div>
        )}

        {view === "CONFIRMED" && !started && !b.timeUnknown && (
          <div className="mt-7 flex flex-col items-center gap-2.5">
            <a href={`/menu/prenota/r/${token}/calendario`} className={`${pillOutline} min-w-[240px]`}>
              Aggiungi al calendario
            </a>
          </div>
        )}

        <dl className="mt-9 overflow-hidden rounded-2xl border bg-[#FBF7EF]">
          <Row label="Giorno">{cap(dayLong(b.day))}</Row>
          <Row label={view === "PROPOSED" ? "Ora chiesta" : "Ora"}>{b.timeUnknown ? "da definire" : b.time}</Row>
          {view === "PROPOSED" && b.proposedTime && (
            <Row label="Ora proposta">
              <strong className="font-medium text-[#6B1020]">{b.proposedTime}</strong>
            </Row>
          )}
          <Row label="Persone">{b.peopleUnknown ? "da definire" : b.people}</Row>
          <Row label="Nome">{b.name}</Row>
          {/* Le prenotazioni segnate a mano di chi è passato di persona possono non avere il telefono. */}
          {/* Per intero, come nel testo in alto (prima qui era coperto a metà e sembravano due numeri diversi). */}
          {b.phone && <Row label="Telefono"><span className="whitespace-nowrap">{phoneReadable(b.phone)}</span></Row>}
          {b.contact === "email" && b.email && (
            <Row label="Email" stacked>
              {b.email}
            </Row>
          )}
          {promo && <Row label="Evento">{promo.title}</Row>}
          {b.note && (
            <Row label="Nota" stacked>
              {b.note}
            </Row>
          )}
          {b.allergies && <Row label="Allergie">Sì, ne parliamo al tavolo</Row>}
        </dl>

        {active && (
          <div className="mt-7 text-center">
            <p className="m-0 text-balance text-[16px] italic leading-normal text-[#5B605A]">Salva questa pagina: qui vedi sempre a che punto è.</p>
            <SaveLink />
          </div>
        )}

        {(view === "PENDING" || (view === "CONFIRMED" && !started)) && (
          // id «annulla»: il pulsante «Annulla» delle email porta qui.
          <div id="annulla" className="mt-10 scroll-mt-6">
            <CancelButton
              token={token}
              label={view === "CONFIRMED" ? "Annulla la prenotazione" : "Annulla la richiesta"}
              question={view === "CONFIRMED" ? "Vuoi annullare la prenotazione?" : "Vuoi annullare la richiesta?"}
            />
          </div>
        )}

        {/* In fondo «Hai una domanda?», ma non se i pulsanti per chiamare sono già poco sopra (scaduta, rifiutata). */}
        {view !== "EXPIRED" && !late && !tonight && !((view === "DECLINED" || view === "CANCELLED") && !again) && (tel || wa) && (
          <div className="mt-12 flex flex-col items-center gap-3.5 text-center">
            <Ornament color="#9C7A45" />
            <p className="m-0 text-[16px] italic text-[#5B605A]">Hai una domanda? Chiamaci o scrivici.</p>
            <ContactButtons tel={tel} wa={wa} />
          </div>
        )}
      </main>
      <MenuFooter hours={venue.hours} contacts={contacts} hideBooking />
      <AutoRefresh active={view === "PENDING"} />
    </>
  );
}

// stacked: testi lunghi (nota, email) a sinistra con l'etichetta sopra, invece che allineati a destra.
function Row({ label, stacked = false, children }: { label: string; stacked?: boolean; children: React.ReactNode }) {
  if (stacked) {
    return (
      <div className="menu-rule-soft border-b px-5 py-3">
        <dt className="menu-sans text-[11px] font-medium uppercase tracking-[0.2em] text-[#5B605A]">{label}</dt>
        <dd className="m-0 mt-1 text-left text-[17px] leading-snug text-[#1F2621] [overflow-wrap:anywhere]">{children}</dd>
      </div>
    );
  }
  return (
    <div className="menu-rule-soft flex items-baseline justify-between gap-4 border-b px-5 py-3">
      <dt className="menu-sans flex-none text-[11px] font-medium uppercase tracking-[0.2em] text-[#5B605A]">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-[17px] leading-snug text-[#1F2621] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

type IconKind = "wait" | "clock" | "ok" | "no" | "expired";

function StatusIcon({ kind }: { kind: IconKind }) {
  const filled = kind === "ok";
  return (
    <div
      aria-hidden
      className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${
        filled ? "!border-[#6B1020] bg-[#6B1020] text-[#F4EEE3]" : kind === "no" || kind === "expired" ? "!border-[#9C9A92] text-[#7A7A72]" : "!border-[#C9A96E] text-[#9C7A45]"
      }`}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === "wait" && <path d="M7 3h10M7 21h10M8 3v3a4 4 0 0 0 1.6 3.2L12 11l2.4-1.8A4 4 0 0 0 16 6V3M8 21v-3a4 4 0 0 1 1.6-3.2L12 13l2.4 1.8A4 4 0 0 1 16 18v3" />}
        {kind === "clock" && (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </>
        )}
        {kind === "ok" && <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.2" />}
        {kind === "no" && <path d="M7 7l10 10M17 7L7 17" />}
        {/* Scaduta: un orologio con il segno «passato» (diverso da «annullata»). */}
        {kind === "expired" && (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2M5.5 5.5l13 13" />
          </>
        )}
      </svg>
    </div>
  );
}
