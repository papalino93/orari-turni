"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { aroundTime, availability, bookingsText, dayLong, isIncomplete, missingText, peopleText, whatsappReachable, type BookingSettings } from "@/lib/booking/rules";
import { customerMessage, type MessageKind } from "@/lib/booking/messages";
import { whatsappPending } from "@/lib/booking/whatsapp-queue";
import type { Hours } from "@/lib/menu-venue";
import { eraseRequest, markWhatsapp, replyToRequest, setArrival, type ReplyOutcome } from "./actions";
import { chatLink, clock, confirmationSent, dayLabel, duration, logText, phoneDisplay, REPLY_LABEL, replyHref, sourceText, statusLabel, telLink, viewOf, whenText } from "./format";
import { WhatsappIcon } from "./device";
import type { BookingItem } from "./types";

type Reply = "confirm" | "propose" | "decline" | "cancel";
// Risposte senza pannello: il cliente ha detto sì/no all'orario proposto, oppure non viene più.
type Action = Reply | "accept" | "refuse" | "customerCancel";
const KIND: Record<Reply, MessageKind> = { confirm: "confirmed", propose: "proposed", decline: "declined", cancel: "cancelledByVenue" };
export const ALLERGY_TEXT = "⚠ Allergie: chiedere al tavolo";

// Messaggi rapidi: un tocco li aggiunge al testo, che resta modificabile prima dell'invio.
const QUICK: Record<Reply, string[]> = {
  confirm: ["Ti teniamo il tavolo per 15 minuti: se tardi, scrivici.", "Grazie, a presto!"],
  propose: ["Alle {ora} si libera un tavolo.", "Se preferisci, c'è posto anche al banco."],
  decline: ["Prova a chiederci un altro giorno!", "Puoi passare lo stesso: al banco spesso c'è posto."],
  cancel: ["Abbiamo avuto un imprevisto, ci dispiace.", "Chiamaci e troviamo insieme un altro giorno."],
};

export function StatusChip({ b, now }: { b: BookingItem; now: number }) {
  const v = viewOf(b, now);
  const tone =
    v === "PENDING"
      ? "bg-gold/15 text-gold ring-gold/30"
      : v === "CONFIRMED"
        ? "bg-success-bg text-success ring-success/30"
        : v === "PROPOSED"
          ? "bg-accent/10 text-accent-ink ring-accent/30"
          : "bg-surface-2 text-foreground-muted ring-border";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>{statusLabel(v)}</span>;
}

// Prenotazione segnata al telefono senza il numero: si aggiunge dopo con «Modifica».
export function NoPhoneChip() {
  return <span className="inline-flex items-center rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold ring-1 ring-inset ring-gold/30">Manca il numero</span>;
}

export function TestChip() {
  return <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground-muted ring-1 ring-inset ring-border">Di prova</span>;
}

const bigBtn = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60";
const waBtn = `${bigBtn} bg-[#137a43] text-white hover:bg-[#0f6837]`;

// Grande pulsante verde: apre WhatsApp con il messaggio già scritto e lo segna nella cronologia.
export function WhatsappButton({
  href,
  bookingId,
  label = "Manda la risposta su WhatsApp",
  onOpened,
  compact = false,
}: {
  href: string;
  bookingId: string;
  label?: string;
  onOpened?: () => void;
  // Nell'elenco «Da mandare su WhatsApp»: più piccolo, accanto al nome dal tablet in su.
  compact?: boolean;
}) {
  const router = useRouter();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        onOpened?.();
        markWhatsapp(bookingId, "opened")
          .then(() => router.refresh())
          .catch(() => {});
      }}
      className={compact ? "flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#137a43] px-4 text-sm font-semibold text-white hover:bg-[#0f6837]" : waBtn}
    >
      <WhatsappIcon /> {label}
    </a>
  );
}

export function BookingSheet({
  booking: b,
  rows,
  countTests,
  now,
  today,
  settings,
  hours,
  fullDays,
  canWhatsapp,
  isOwner,
  next,
  onOpen,
  onClose,
  onWaOpened,
  onEdit,
}: {
  booking: BookingItem | null;
  rows: BookingItem[];
  // Con l'agenda spenta tutto è di prova e si conta; accesa, le prove non contano.
  countTests: boolean;
  now: number;
  today: string;
  settings: BookingSettings;
  hours: Hours;
  fullDays: string[];
  canWhatsapp: boolean;
  isOwner: boolean;
  // La prossima richiesta da gestire (per passare dall'una all'altra senza tornare all'elenco).
  next: BookingItem | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  // WhatsApp aperto da qui: la riga resta nella lista «Da mandare» con «Aperto alle…».
  onWaOpened: (id: string, kind: MessageKind) => void;
  // «Modifica»: apre il foglio con gli stessi campi della nuova prenotazione.
  onEdit: (b: BookingItem) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Reply | null>(null);
  // Annullo di una confermata: prima si sceglie chi annulla (il cliente o il locale).
  const [cancelBy, setCancelBy] = useState<"venue" | null>(null);
  const [askGone, setAskGone] = useState(false);
  const [askErase, setAskErase] = useState(false);
  const [message, setMessage] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reply: Action; out: Extract<ReplyOutcome, { mailSent: boolean }>; time: string } | null>(null);
  // «C'è già Rossi sabato alle 20:30 (4 persone): è la stessa?» prima di confermare.
  const [dupAsk, setDupAsk] = useState<{ reply: Action; text: string } | null>(null);
  const [waOpened, setWaOpened] = useState(false);

  const slots = useMemo(() => {
    if (!b) return [];
    const a = availability(b.day, hours, { ...settings, leadMinutes: 0 }, null, new Date(now));
    return a.slots.map((s) => s.time).filter((t) => t !== b.time);
  }, [b, hours, settings, now]);

  if (!b) {
    return (
      <Sheet title="Richiesta" onClose={onClose}>
        <p className="text-sm text-foreground-muted">Questa prenotazione non c&apos;è più: è stata cancellata, oppure è più vecchia di 6 mesi.</p>
      </Sheet>
    );
  }

  const v = viewOf(b, now);
  const incomplete = isIncomplete(b);
  const sameDay = rows.filter((r) => r.day === b.day && r.status === "CONFIRMED" && r.id !== b.id && (countTests || !r.isTest));
  const sameDayPeople = sameDay.reduce((s, r) => s + r.people, 0);
  // Per decidere: quanta gente c'è già intorno all'ora chiesta (±1 ora) e in tutta la serata.
  const around = aroundTime(sameDay, b.day, b.startsAt);
  const waiting = (now - b.createdAt) / 60000;
  const dayFull = fullDays.includes(b.day);

  function openPanel(p: Reply | null) {
    setPanel(p);
    setCancelBy(null);
    setMessage("");
    setTime("");
  }

  async function send(reply: Action, dupOk = false) {
    if (!b) return;
    if (reply === "propose" && !time) {
      toast.showError("Scegli l'orario da proporre.");
      return;
    }
    setBusy(true);
    try {
      const withMessage = reply === "confirm" || reply === "propose" || reply === "decline" || reply === "cancel";
      const res = await replyToRequest(b.id, reply, withMessage ? message : "", reply === "propose" ? time : undefined, { dupOk, selfWa: canWhatsapp });
      if (res.ok && "ask" in res.data && res.data.ask) {
        setDupAsk({ reply, text: res.data.ask });
        return;
      }
      setDupAsk(null);
      if (res.ok) {
        const out = res.data;
        if ("mailSent" in out) setResult({ reply, out, time: reply === "accept" ? (b.proposedTime ?? "") : time });
      } else {
        // «Già confermata da Marta»: si legge il motivo e la vista si aggiorna.
        toast.showError(res.error);
      }
      setPanel(null);
      setCancelBy(null);
      setAskGone(false);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  // «Segna come già mandata» (per esempio se un collega l'ha già scritta a mano), con «Annulla».
  async function markSent() {
    if (!b) return;
    const id = b.id;
    setBusy(true);
    try {
      const res = await markWhatsapp(id, "done");
      if (!res.ok) toast.showError(res.error);
      else
        toast.showSuccess("Segnata come mandata", {
          label: "Annulla",
          onClick: () => {
            markWhatsapp(id, "undo")
              .then(() => router.refresh())
              .catch((e) => showActionError(toast, e));
          },
        });
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  // Agenda: la conferma la manda il telefono del locale (entra nella lista «Da mandare su WhatsApp»).
  async function queueConfirmation() {
    if (!b) return;
    setBusy(true);
    try {
      const res = await markWhatsapp(b.id, "queue");
      if (res.ok) toast.showSuccess("La manda il telefono del locale");
      else toast.showError(res.error);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    if (!b) return;
    setBusy(true);
    try {
      const res = await eraseRequest(b.id);
      if (res.ok) {
        toast.showSuccess("Dati della richiesta cancellati");
        setAskErase(false);
        onClose();
      } else toast.showError(res.error);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  async function arrival(value: boolean | null) {
    if (!b) return;
    setBusy(true);
    try {
      const res = await setArrival(b.id, value);
      if (res.ok) toast.showSuccess(value === null ? "Segno tolto" : value ? "Segnati come arrivati" : "Segnati come non venuti");
      else toast.showError(res.error);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    if (!b) return;
    navigator.clipboard
      ?.writeText(b.statusUrl)
      .then(() => toast.showSuccess("Link copiato: incollalo nel messaggio al cliente"))
      .catch(() => toast.showError("Non riesco a copiare: tieni premuto sul link e copialo a mano."));
  }

  const preview = (reply: Reply) =>
    customerMessage(KIND[reply], {
      name: b.name,
      day: b.day,
      time: b.time,
      people: b.people,
      proposedTime: reply === "propose" ? time || "…" : b.proposedTime,
      staffMessage: message,
      statusUrl: b.statusUrl,
      allergies: b.allergies,
    });

  const messageBox = (reply: Reply) => (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" data-unsaved-ignore>
        {/* «Alle … si libera un tavolo» con i puntini non si capiva: compare appena si sceglie l'orario. */}
        {QUICK[reply].filter((q) => !(q.includes("{ora}") && !time)).map((q) => {
          const text = q.replace("{ora}", time);
          return (
            <button
              key={q}
              type="button"
              onClick={() => setMessage((m) => (m.trim() ? `${m.trim()} ${text}` : text))}
              className="min-h-9 rounded-full border border-border px-3 text-left text-xs text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              + {text}
            </button>
          );
        })}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground-muted">Messaggio per il cliente (facoltativo)</span>
        <textarea value={message} maxLength={300} rows={2} onChange={(e) => setMessage(e.target.value)} className={`${inputClass} resize-y`} placeholder="Scrivi qualcosa in più, se serve" />
      </label>
      <details className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground-muted">
        <summary className="cursor-pointer select-none font-medium">Vedi il messaggio che riceve</summary>
        <p className="mt-2 whitespace-pre-line text-foreground [overflow-wrap:anywhere]">{preview(reply)}</p>
      </details>
    </div>
  );

  // Dopo la risposta: come arriva al cliente.
  const needsWa = (out: Extract<ReplyOutcome, { mailSent: boolean }>) => Boolean(out.whatsappHref) && (b.contact !== "email" || !out.mailSent);
  const RESULT_TITLE: Record<Action, string> = {
    confirm: "✓ Confermata",
    propose: `✓ Proposte le ${result?.time ?? ""}`,
    decline: "✓ Risposto: siamo al completo",
    cancel: "✓ Prenotazione annullata",
    accept: `✓ Confermata alle ${result?.time ?? ""}`,
    refuse: "✓ Segnato: il cliente ha detto no",
    customerCancel: "✓ Annullata: il cliente non viene",
  };
  const resultTitle = result ? RESULT_TITLE[result.reply] : "";
  const resultKind = (r: Action): MessageKind => (r === "propose" ? "proposed" : r === "decline" ? "declined" : r === "cancel" ? "cancelledByVenue" : "confirmed");

  // Fisso o senza telefono, e niente email: annullando, nessun messaggio arriva al cliente.
  const unreachable = !whatsappReachable(b.phone) && !(b.contact === "email" && b.email);

  // Risposta ancora da mandare su WhatsApp (anche riaprendo la scheda più tardi).
  const pendingWa = whatsappPending(b, now);
  const resendHref = (kind: MessageKind) => replyHref(b, kind);

  return (
    <Sheet title={b.name} onClose={onClose} dirty={Boolean(message.trim()) && !result}>
      <div className="space-y-4">
        {/* Dopo una risposta l'etichetta di prima («Da confermare · arrivata…») non vale più. */}
        {!result && (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip b={b} now={now} />
            {b.isTest && <TestChip />}
            {b.manual && !b.phone && v === "CONFIRMED" && <NoPhoneChip />}
            {v === "PENDING" && (
              <span className={`text-xs ${waiting >= 30 ? "font-semibold text-danger" : "text-foreground-muted"}`}>
                {waiting >= 30 ? `in attesa da ${duration(waiting)}` : `arrivata ${duration(waiting)} fa`}
              </span>
            )}
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-3">
          <p className="text-sm font-medium text-foreground-muted first-letter:uppercase">
            {dayLabel(b.day, today) === "Oggi" || dayLabel(b.day, today) === "Domani" ? `${dayLabel(b.day, today)} · ` : ""}
            {dayLong(b.day)}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
            {b.status === "PROPOSED" && b.proposedTime ? (
              <>
                <span className="text-foreground-muted line-through decoration-2">{b.time}</span> {b.proposedTime}
              </>
            ) : b.timeUnknown ? (
              <span className="text-gold">Ora da definire</span>
            ) : (
              b.time
            )}
            <span className="font-normal text-foreground-muted"> · </span>
            {b.peopleUnknown ? <span className="text-gold">persone da definire</span> : peopleText(b.people)}
          </p>
          {b.menu && <p className="mt-1.5 inline-flex rounded-md bg-gold/10 px-2 py-0.5 text-sm font-semibold text-gold ring-1 ring-inset ring-gold/25">{b.menu}</p>}
          {b.status === "PROPOSED" && !result && <p className="mt-1 text-sm text-foreground-muted">Proposto alle {b.proposedTime}: aspettiamo la risposta del cliente.</p>}
          {b.arrivedAt && <p className="mt-1 text-sm font-medium text-success">✓ Arrivati alle {clock(b.arrivedAt)}</p>}
          {b.noShowAt && <p className="mt-1 text-sm font-medium text-danger">Non venuti</p>}
        </div>

        {/* Prenotazione vera ma incompleta: si completa appena il cliente lo dice. */}
        {!result && incomplete && v === "CONFIRMED" && (
          <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-3" data-testid="da-completare-dettaglio">
            <p className="text-sm font-semibold text-foreground">{missingText(b)}</p>
            <p className="text-xs text-foreground-muted">È una prenotazione vera: resta segnalata finché non la completi. La conferma al cliente si manda dopo.</p>
            {b.day >= today && (
              <button type="button" disabled={busy} onClick={() => onEdit(b)} className={`${bigBtn} bg-accent text-accent-foreground hover:bg-accent-hover`}>
                Completa i dati
              </button>
            )}
          </div>
        )}

        {b.allergies && (
          <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger">
            {ALLERGY_TEXT}
          </p>
        )}
        {b.note && (
          <p className="rounded-xl border border-gold/30 bg-gold/[0.07] px-3 py-2.5 text-sm text-foreground">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-gold">{b.manual ? "Nota" : "Nota del cliente"}</span>
            {b.note}
          </p>
        )}

        {/* Risposta appena data */}
        {result && (
          <div className="space-y-3 rounded-xl border border-success/30 bg-success-bg/60 p-4">
            <p className="text-base font-semibold text-success">{resultTitle}</p>
            {result.out.mailSent && <p className="text-sm text-foreground">✓ Email inviata a {result.out.email}</p>}
            {needsWa(result.out) &&
              (canWhatsapp && result.out.whatsappHref ? (
                <>
                  {b.contact === "email" && !result.out.mailSent && <p className="text-sm text-foreground">L&apos;email non è partita: mandala su WhatsApp.</p>}
                  <WhatsappButton
                    href={result.out.whatsappHref}
                    bookingId={b.id}
                    onOpened={() => {
                      setWaOpened(true);
                      onWaOpened(b.id, resultKind(result.reply));
                    }}
                  />
                  <p className="text-xs text-foreground-muted">
                    {waOpened ? "WhatsApp aperto: se non hai toccato Invia, tocca di nuovo il pulsante." : "Si apre WhatsApp con il messaggio già scritto: controlla e tocca Invia."}
                  </p>
                </>
              ) : (
                <p className="text-sm text-foreground">Fatto. La risposta su WhatsApp la manda il telefono del locale.</p>
              ))}
            <div className={`grid gap-2 pt-1 ${next ? "sm:grid-cols-2" : ""}`}>
              {next && (
                <button
                  type="button"
                  onClick={() => onOpen(next.id)}
                  className="min-h-11 whitespace-nowrap rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
                >
                  Prossima richiesta →
                </button>
              )}
              <button type="button" onClick={onClose} className="min-h-11 whitespace-nowrap rounded-full border border-border px-4 text-sm font-medium text-foreground hover:border-accent">
                Torna all&apos;elenco
              </button>
            </div>
          </div>
        )}

        {/* Risposte: richiesta in attesa. Sopra i pulsanti, quanta gente c'è già (senza le prove). */}
        {!result && v === "PENDING" && panel === null && (
          <div className="space-y-2">
            <p data-testid="contesto" className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground">
              <span className="font-semibold">
                Alle {b.time} (±1 ora): {around.near && around.near.count ? `${peopleText(around.near.people)} · ${bookingsText(around.near.count)}` : "nessuna prenotazione"}
              </span>
              <span className="block text-xs text-foreground-muted">
                In tutta la serata: {around.day.count ? `${peopleText(around.day.people)} · ${bookingsText(around.day.count)}` : "nessuna prenotazione"}
                {settings.capacityHint > 0 && ` · di solito pieni oltre ${peopleText(settings.capacityHint)}`}
              </span>
            </p>
            {dayFull && <p className="text-xs text-foreground-muted">Per questo giorno hai chiuso le richieste: puoi comunque rispondere.</p>}
            <button type="button" disabled={busy} onClick={() => send("confirm")} className={`${bigBtn} bg-accent text-accent-foreground hover:bg-accent-hover`}>
              {busy ? "Un attimo…" : "✓ Conferma"}
            </button>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={busy} onClick={() => openPanel("propose")} className={`${bigBtn} border border-border text-foreground hover:border-accent`}>
                Proponi un altro orario
              </button>
              <button type="button" disabled={busy} onClick={() => openPanel("decline")} className={`${bigBtn} border border-border text-foreground hover:border-danger hover:text-danger`}>
                Rispondi: siamo al completo
              </button>
            </div>
            <button type="button" onClick={() => openPanel("confirm")} className="min-h-10 w-full text-center text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
              Conferma con un messaggio
            </button>
          </div>
        )}

        {/* Il cliente ha risposto all'orario proposto fuori dal sito (WhatsApp, telefono): lo segna chi lavora. */}
        {!result && v === "PROPOSED" && panel === null && (
          <div className="space-y-2">
            <button type="button" disabled={busy} onClick={() => send("accept")} className={`${bigBtn} bg-accent text-accent-foreground hover:bg-accent-hover`}>
              {busy ? "Un attimo…" : `Il cliente ha detto sì: conferma alle ${b.proposedTime}`}
            </button>
            <button type="button" disabled={busy} onClick={() => send("refuse")} className={`${bigBtn} border border-border text-foreground hover:border-danger hover:text-danger`}>
              Il cliente ha detto no
            </button>
            <p className="text-xs text-foreground-muted">Se il cliente risponde dalla sua pagina, la richiesta si aggiorna da sola.</p>
          </div>
        )}

        {!result && panel && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              {panel === "confirm" ? "Conferma con un messaggio" : panel === "propose" ? "Proponi un altro orario, stesso giorno" : panel === "decline" ? "Rispondi: siamo al completo" : "Annulla la prenotazione"}
            </p>
            {panel === "cancel" && cancelBy === null && (
              <div className="space-y-2">
                <p className="text-sm text-foreground-muted">Chi annulla?</p>
                <button type="button" disabled={busy} onClick={() => send("customerCancel")} className={`${bigBtn} border border-border text-foreground hover:border-accent`}>
                  Ci ha avvisato il cliente (nessun messaggio)
                </button>
                <button type="button" disabled={busy} onClick={() => setCancelBy("venue")} className={`${bigBtn} border border-danger/40 text-danger hover:bg-danger-bg`}>
                  {unreachable ? "Annulliamo noi (avvisa tu il cliente)" : "Annulliamo noi (il cliente riceve le scuse)"}
                </button>
                <button type="button" disabled={busy} onClick={() => openPanel(null)} className="min-h-11 w-full rounded-full text-sm font-medium text-foreground-muted hover:text-foreground">
                  Indietro
                </button>
              </div>
            )}
            {panel === "cancel" && cancelBy === "venue" && (
              <p className="text-sm text-foreground-muted">{unreachable ? "Il cliente non riceve messaggi: chiamalo tu." : "Il cliente riceve un messaggio di scuse. Non si può tornare indietro."}</p>
            )}
            {panel === "propose" && (
              <div className="space-y-2" data-unsaved-ignore>
                {slots.length ? (
                  <div role="radiogroup" aria-label="Orario da proporre" className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {slots.map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={time === t}
                        onClick={() => setTime(t)}
                        className={`min-h-11 rounded-lg border text-sm font-semibold tabular-nums ${time === t ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground hover:border-accent"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">Quel giorno non ci sono altri orari tra quelli prenotabili: scrivine uno qui sotto.</p>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-foreground-muted">Un altro orario</span>
                  <input type="time" value={slots.includes(time) ? "" : time} onChange={(e) => setTime(e.target.value)} className={`${inputClass} w-36!`} />
                </label>
              </div>
            )}
            {(panel !== "cancel" || (cancelBy === "venue" && !unreachable)) && messageBox(panel)}
            <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${panel === "cancel" && cancelBy === null ? "hidden" : ""}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => (panel === "cancel" ? setCancelBy(null) : openPanel(null))}
                className="min-h-11 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground"
              >
                Indietro
              </button>
              <button
                type="button"
                disabled={busy || (panel === "propose" && !time)}
                onClick={() => send(panel)}
                // Disattivato («Scegli un orario»): grigio leggibile come gli altri pulsanti spenti dell'app,
                // non bordeaux sbiadito (nel tema scuro il testo rosa sul bordeaux non si leggeva).
                className={`min-h-11 rounded-full px-5 text-sm font-semibold ${
                  panel === "cancel" || panel === "decline"
                    ? "bg-danger text-white hover:bg-danger/90 disabled:opacity-60"
                    : "bg-accent text-accent-foreground hover:bg-accent-hover disabled:bg-surface-2 disabled:text-foreground-muted disabled:ring-1 disabled:ring-border"
                }`}
              >
                {busy
                  ? "Un attimo…"
                  : panel === "confirm"
                    ? "✓ Conferma"
                    : panel === "propose"
                      ? time
                        ? `Proponi le ${time}`
                        : "Scegli un orario"
                      : panel === "decline"
                        ? "Rispondi: siamo al completo"
                        : unreachable
                          ? "Sì, annulla"
                          : "Sì, annulla e avvisa"}
              </button>
            </div>
          </div>
        )}

        {/* Segnata al telefono senza numero: si aggiunge con un tocco. */}
        {!result && b.manual && !b.phone && v === "CONFIRMED" && panel === null && b.day >= today && (
          <button type="button" disabled={busy} onClick={() => onEdit(b)} className={`${bigBtn} border border-gold/40 bg-gold/10 text-foreground hover:border-accent`}>
            Aggiungi il numero
          </button>
        )}

        {/* Già gestita: rimandare il messaggio, arrivi, annullare */}
        {!result && v === "CONFIRMED" && panel === null && b.day >= today && !incomplete && (
          <button type="button" disabled={busy} onClick={() => onEdit(b)} className={`${bigBtn} border border-border text-foreground hover:border-accent`}>
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            Modifica
          </button>
        )}

        {!result && v !== "PENDING" && (
          <div className="space-y-2">
            {b.handledBy && b.handledAt && (v === "CONFIRMED" || v === "PROPOSED" || v === "DECLINED" || (v === "CANCELLED" && b.cancelledBy === "locale")) && (
              <p className="text-sm text-foreground-muted">
                Risposta di {b.handledBy}, {whenText(b.handledAt, today)}.
                {b.staffMessage ? ` «${b.staffMessage}»` : ""}
              </p>
            )}
            {v === "CANCELLED" && b.cancelledBy === "cliente" && <p className="text-sm text-foreground-muted">Il cliente ha annullato dalla sua pagina.</p>}
            {v === "EXPIRED" && <p className="text-sm text-foreground-muted">Nessuno ha risposto in tempo. Se vuoi, scrivi al cliente o chiamalo.</p>}

            {pendingWa && (
              <div className="space-y-2 rounded-xl border border-[#137a43]/30 bg-[#137a43]/[0.06] p-3">
                {canWhatsapp ? (
                  <>
                    <p className="text-sm font-medium text-foreground">{REPLY_LABEL[pendingWa]}: non è ancora partito su WhatsApp.</p>
                    {resendHref(pendingWa) && <WhatsappButton href={resendHref(pendingWa)!} bookingId={b.id} onOpened={() => onWaOpened(b.id, pendingWa)} />}
                  </>
                ) : (
                  <p className="text-sm text-foreground-muted">La risposta su WhatsApp la manda il telefono del locale.</p>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={markSent}
                  className="min-h-10 w-full rounded-full text-center text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-60"
                >
                  Segna come già mandata
                </button>
              </div>
            )}

            {v === "CONFIRMED" && b.day <= today && (
              <div className="grid grid-cols-2 gap-2">
                {b.arrivedAt || b.noShowAt ? (
                  <button type="button" disabled={busy} onClick={() => arrival(null)} className={`${bigBtn} col-span-2 border border-border text-foreground-muted hover:text-foreground`}>
                    Togli il segno ({b.arrivedAt ? "arrivati" : "non venuti"})
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={busy} onClick={() => arrival(true)} className={`${bigBtn} border border-success/40 text-success hover:bg-success-bg ${b.startsAt > now || b.timeUnknown ? "col-span-2" : ""}`}>
                      ✓ Arrivati
                    </button>
                    {b.startsAt <= now && !b.timeUnknown && (
                      <button type="button" disabled={busy} onClick={() => arrival(false)} className={`${bigBtn} border border-border text-foreground-muted hover:border-danger hover:text-danger`}>
                        Non venuti
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Agenda: la conferma al cliente è facoltativa e non è ancora partita. */}
            {b.manual && v === "CONFIRMED" && incomplete && b.phone && b.day >= today && (
              <p className="rounded-xl border border-border px-3 py-2.5 text-xs text-foreground-muted" data-testid="conferma-bloccata">
                La conferma su WhatsApp si manda quando ora e persone sono decise: così il cliente non riceve un orario sbagliato.
              </p>
            )}
            {b.manual && v === "CONFIRMED" && !incomplete && !pendingWa && !confirmationSent(b) && b.phone && b.startsAt > now && resendHref("confirmed") && (
              <div className="space-y-1.5 rounded-xl border border-border p-3">
                {canWhatsapp ? (
                  <WhatsappButton href={resendHref("confirmed")!} bookingId={b.id} label="Manda la conferma su WhatsApp" compact onOpened={() => onWaOpened(b.id, "confirmed")} />
                ) : (
                  <button type="button" disabled={busy} onClick={queueConfirmation} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-[#137a43]/40 px-4 text-sm font-semibold text-[#137a43] hover:bg-[#137a43]/10 disabled:opacity-60 dark:text-[#3fae74]">
                    Da mandare dal telefono del locale
                  </button>
                )}
                <p className="text-xs text-foreground-muted">Facoltativo: la conferma su WhatsApp, con il link per annullare.</p>
              </div>
            )}

            {canWhatsapp && !pendingWa && !(b.manual && !confirmationSent(b)) && !(v === "CONFIRMED" && incomplete) && (v === "CONFIRMED" || v === "PROPOSED" || v === "DECLINED") && resendHref(v === "CONFIRMED" ? "confirmed" : v === "PROPOSED" ? "proposed" : "declined") && (
              <a
                href={resendHref(v === "CONFIRMED" ? "confirmed" : v === "PROPOSED" ? "proposed" : "declined")!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-accent"
              >
                <WhatsappIcon className="text-[#137a43] dark:text-[#3fae74]" /> Manda di nuovo: {REPLY_LABEL[v === "CONFIRMED" ? "confirmed" : v === "PROPOSED" ? "proposed" : "declined"].toLowerCase()}
              </a>
            )}

            {v === "CONFIRMED" && panel === null && (b.timeUnknown ? b.day >= today : b.startsAt > now - 3 * 3600000) && (
              <button type="button" disabled={busy} onClick={() => openPanel("cancel")} className="min-h-11 w-full rounded-xl text-sm font-medium text-danger hover:bg-danger-bg">
                Annulla la prenotazione
              </button>
            )}
          </div>
        )}

        {/* Contatti e dettagli */}
        <dl className="divide-y divide-border rounded-xl border border-border text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Telefono</dt>
              <dd className={`whitespace-nowrap font-medium tabular-nums ${b.phone ? "text-foreground" : "text-foreground-muted"}`}>{phoneDisplay(b.phone)}</dd>
            </div>
            <div className={`flex gap-2 ${b.phone ? "" : "hidden"}`}>
              <a href={telLink(b.phone)} className="flex min-h-10 items-center rounded-full border border-border px-3.5 text-xs font-semibold text-foreground hover:border-accent">
                Chiama
              </a>
              {/* WhatsApp al cliente solo dal telefono del locale o dal titolare (decisione del titolare). */}
              {canWhatsapp && whatsappReachable(b.phone) && (
                <a href={chatLink(b.phone)} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground hover:border-accent">
                  <WhatsappIcon className="h-4 w-4 text-[#137a43] dark:text-[#3fae74]" /> Scrivi
                </a>
              )}
            </div>
          </div>
          {b.email && (
            <div className="px-3 py-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Email</dt>
              <dd className="break-all text-foreground">
                <a href={`mailto:${b.email}`} className="underline decoration-dotted underline-offset-2">
                  {b.email}
                </a>
              </dd>
            </div>
          )}
          {!b.manual && (
            <div className="px-3 py-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Vuole la risposta</dt>
              <dd className="text-foreground">{b.contact === "email" ? "Per email" : "Su WhatsApp"}</dd>
            </div>
          )}
          <div className="px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Tavolo</dt>
            <dd className={b.table ? "font-medium text-foreground" : "text-foreground-muted"}>{b.table ?? "Non ancora deciso"}</dd>
          </div>
          <div className="px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Da dove arriva</dt>
            <dd className="text-foreground first-letter:uppercase">
              {sourceText(b.source, b.promoTitle)}
              {b.manual && b.createdBy ? ` · segnata da ${b.createdBy}` : ""}
            </dd>
          </div>
          <div className="px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Quel giorno</dt>
            <dd className="text-foreground">
              {sameDay.length ? `Già confermate: ${bookingsText(sameDay.length)} · ${peopleText(sameDayPeople)}` : "Nessun'altra prenotazione confermata"}
              {settings.capacityHint > 0 && <span className="text-foreground-muted"> · di solito pieni oltre {peopleText(settings.capacityHint)}</span>}
              {dayFull && <span className="text-foreground-muted"> · richieste chiuse</span>}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Codice</dt>
              <dd className="font-mono text-base font-semibold tracking-widest text-foreground">{b.code}</dd>
            </div>
            <button type="button" onClick={copyLink} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground">
              Copia il link della sua pagina
            </button>
          </div>
        </dl>

        <details className="group rounded-xl border border-border px-3 py-2.5">
          <summary className="flex min-h-8 cursor-pointer select-none items-center justify-between text-sm font-semibold text-foreground">
            Cronologia
            <span className="text-xs font-normal text-foreground-muted group-open:hidden">mostra</span>
          </summary>
          <ol className="mt-2 space-y-2 border-l border-border pl-3">
            {b.log.map((l, i) => {
              const t = logText(l);
              return (
                <li key={i} className="text-sm">
                  <p className={t.tone === "ok" ? "text-success" : t.tone === "warn" ? "text-danger" : "text-foreground"}>{t.text}</p>
                  {t.detail && <p className="text-xs text-foreground-muted">{t.detail}</p>}
                  <p className="text-[11px] text-foreground-muted">{whenText(l.at, today)}</p>
                </li>
              );
            })}
          </ol>
        </details>

        {!result && (v === "PENDING" || v === "PROPOSED") && panel === null && (
          <button type="button" disabled={busy} onClick={() => setAskGone(true)} className="min-h-10 w-full text-center text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
            Il cliente non viene più
          </button>
        )}
        {/* Per chi chiede di cancellare i suoi dati (informativa): solo il titolare. */}
        {isOwner && (
          <button type="button" disabled={busy} onClick={() => setAskErase(true)} className="min-h-10 w-full text-center text-xs font-medium text-danger underline decoration-dotted underline-offset-2 hover:opacity-80">
            Cancella i dati di questa richiesta
          </button>
        )}
      </div>
      {askGone && (
        <ConfirmSheet title="Il cliente non viene più?" confirmLabel="Sì, chiudi la richiesta" busy={busy} onConfirm={() => send("customerCancel")} onCancel={() => setAskGone(false)}>
          <p>La richiesta si chiude come annullata dal cliente. Non gli mandiamo nessun messaggio.</p>
        </ConfirmSheet>
      )}
      {dupAsk && (
        <ConfirmSheet title={dupAsk.text} confirmLabel="È un'altra, segna lo stesso" busy={busy} onConfirm={() => send(dupAsk.reply, true)} onCancel={() => setDupAsk(null)}>
          <p>Se è la stessa persona, tocca Annulla: rispondi alla richiesta con «Il cliente non viene più» o dopo averla sentita.</p>
        </ConfirmSheet>
      )}
      {askErase && (
        <ConfirmSheet title="Cancellare i dati di questa richiesta?" confirmLabel="Cancella i dati" danger busy={busy} onConfirm={erase} onCancel={() => setAskErase(false)}>
          <p>Nome, telefono, nota e cronologia di {b.name} spariscono per sempre. Serve quando il cliente chiede di cancellare i suoi dati. Non gli mandiamo nessun messaggio.</p>
        </ConfirmSheet>
      )}
    </Sheet>
  );
}
