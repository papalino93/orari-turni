"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { availability, dayLong, peopleText, SOURCE_LABEL, type BookingSettings } from "@/lib/booking/rules";
import { customerMessage, type MessageKind } from "@/lib/booking/messages";
import { whatsappPending } from "@/lib/booking/whatsapp-queue";
import type { Hours } from "@/lib/menu-venue";
import { markWhatsapp, replyToRequest, setArrival, type ReplyOutcome } from "./actions";
import { chatLink, clock, dayLabel, duration, logText, phoneDisplay, REPLY_LABEL, replyHref, statusLabel, telLink, viewOf, whenText } from "./format";
import { WhatsappIcon } from "./device";
import type { BookingItem } from "./types";

type Reply = "confirm" | "propose" | "decline" | "cancel";
const KIND: Record<Reply, MessageKind> = { confirm: "confirmed", propose: "proposed", decline: "declined", cancel: "cancelledByVenue" };

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
  now,
  today,
  settings,
  hours,
  fullDays,
  canWhatsapp,
  next,
  onOpen,
  onClose,
}: {
  booking: BookingItem | null;
  rows: BookingItem[];
  now: number;
  today: string;
  settings: BookingSettings;
  hours: Hours;
  fullDays: string[];
  canWhatsapp: boolean;
  // La prossima richiesta da gestire (per passare dall'una all'altra senza tornare all'elenco).
  next: BookingItem | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Reply | null>(null);
  const [message, setMessage] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reply: Reply; out: ReplyOutcome; time: string } | null>(null);
  const [waOpened, setWaOpened] = useState(false);

  const slots = useMemo(() => {
    if (!b) return [];
    const a = availability(b.day, hours, { ...settings, leadMinutes: 0 }, null, new Date(now));
    return a.slots.map((s) => s.time).filter((t) => t !== b.time);
  }, [b, hours, settings, now]);

  if (!b) {
    return (
      <Sheet title="Richiesta" onClose={onClose}>
        <p className="text-sm text-foreground-muted">Questa richiesta non c&apos;è più (è più vecchia di 30 giorni o è stata cancellata).</p>
      </Sheet>
    );
  }

  const v = viewOf(b, now);
  const sameDay = rows.filter((r) => r.day === b.day && r.status === "CONFIRMED" && r.id !== b.id);
  const sameDayPeople = sameDay.reduce((s, r) => s + r.people, 0);
  const waiting = (now - b.createdAt) / 60000;
  const dayFull = fullDays.includes(b.day);

  function openPanel(p: Reply | null) {
    setPanel(p);
    setMessage("");
    setTime("");
  }

  async function send(reply: Reply) {
    if (!b) return;
    if (reply === "propose" && !time) {
      toast.showError("Scegli l'orario da proporre.");
      return;
    }
    setBusy(true);
    try {
      const res = await replyToRequest(b.id, reply, message, reply === "propose" ? time : undefined);
      if (res.ok) {
        setResult({ reply, out: res.data, time });
        setPanel(null);
      } else {
        // «Già confermata da Marta»: si legge il motivo e la vista si aggiorna.
        toast.showError(res.error);
        setPanel(null);
      }
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
        {QUICK[reply].map((q) => {
          const text = q.replace("{ora}", time || "…");
          return (
            <button
              key={q}
              type="button"
              disabled={reply === "propose" && q.includes("{ora}") && !time}
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
        <p className="mt-2 whitespace-pre-line text-foreground">{preview(reply)}</p>
      </details>
    </div>
  );

  // Dopo la risposta: come arriva al cliente.
  const needsWa = (out: ReplyOutcome) => Boolean(out.whatsappHref) && (b.contact !== "email" || !out.mailSent);
  const resultTitle = result
    ? result.reply === "confirm"
      ? "✓ Confermata"
      : result.reply === "propose"
        ? `✓ Proposte le ${result.time}`
        : result.reply === "decline"
          ? "✓ Risposto: siamo al completo"
          : "✓ Prenotazione annullata"
    : "";

  // Risposta ancora da mandare su WhatsApp (anche riaprendo la scheda più tardi).
  const pendingWa = whatsappPending(b, now);
  const resendHref = (kind: MessageKind) => replyHref(b, kind);

  return (
    <Sheet title={b.name} onClose={onClose} dirty={Boolean(message.trim()) && !result}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip b={b} now={now} />
          {b.isTest && <TestChip />}
          {v === "PENDING" && (
            <span className={`text-xs ${waiting >= 30 ? "font-semibold text-danger" : "text-foreground-muted"}`}>
              {waiting >= 30 ? `in attesa da ${duration(waiting)}` : `arrivata ${duration(waiting)} fa`}
            </span>
          )}
        </div>

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
            ) : (
              b.time
            )}
            <span className="font-normal text-foreground-muted"> · </span>
            {peopleText(b.people)}
          </p>
          {b.status === "PROPOSED" && <p className="mt-1 text-sm text-foreground-muted">Proposto alle {b.proposedTime}: aspettiamo la risposta del cliente.</p>}
          {b.arrivedAt && <p className="mt-1 text-sm font-medium text-success">✓ Arrivati alle {clock(b.arrivedAt)}</p>}
          {b.noShowAt && <p className="mt-1 text-sm font-medium text-danger">Non venuti</p>}
        </div>

        {b.allergies && (
          <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger">
            <span aria-hidden>⚠</span> Qualcuno ha allergie o intolleranze: ne parliamo al tavolo.
          </p>
        )}
        {b.note && (
          <p className="rounded-xl border border-gold/30 bg-gold/[0.07] px-3 py-2.5 text-sm text-foreground">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-gold">Nota del cliente</span>
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
                  <WhatsappButton href={result.out.whatsappHref} bookingId={b.id} onOpened={() => setWaOpened(true)} />
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

        {/* Risposte: richiesta in attesa */}
        {!result && v === "PENDING" && panel === null && (
          <div className="space-y-2">
            {dayFull && <p className="text-xs text-foreground-muted">Per questo giorno hai chiuso le richieste: puoi comunque rispondere.</p>}
            <button type="button" disabled={busy} onClick={() => send("confirm")} className={`${bigBtn} bg-accent text-accent-foreground hover:bg-accent-hover`}>
              {busy ? "Un attimo…" : "✓ Conferma"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => openPanel("propose")} className={`${bigBtn} border border-border text-foreground hover:border-accent`}>
                Proponi un altro orario
              </button>
              <button type="button" disabled={busy} onClick={() => openPanel("decline")} className={`${bigBtn} border border-border text-foreground hover:border-danger hover:text-danger`}>
                Siamo al completo
              </button>
            </div>
            <button type="button" onClick={() => openPanel("confirm")} className="min-h-10 w-full text-center text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
              Conferma con un messaggio
            </button>
          </div>
        )}

        {!result && panel && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              {panel === "confirm" ? "Conferma con un messaggio" : panel === "propose" ? "Proponi un altro orario, stesso giorno" : panel === "decline" ? "Rispondi: siamo al completo" : "Annulla la prenotazione"}
            </p>
            {panel === "cancel" && <p className="text-sm text-foreground-muted">Il cliente riceve un messaggio di scuse. Non si può tornare indietro.</p>}
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
                <label className="flex items-center gap-2 text-xs text-foreground-muted">
                  Un altro orario:
                  <input type="time" value={slots.includes(time) ? "" : time} onChange={(e) => setTime(e.target.value)} className={`${inputClass} w-32`} aria-label="Un altro orario" />
                </label>
              </div>
            )}
            {messageBox(panel)}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={busy} onClick={() => openPanel(null)} className="min-h-11 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground">
                Indietro
              </button>
              <button
                type="button"
                disabled={busy || (panel === "propose" && !time)}
                onClick={() => send(panel)}
                className={`min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-60 ${panel === "cancel" || panel === "decline" ? "bg-danger text-white hover:bg-danger/90" : "bg-accent text-accent-foreground hover:bg-accent-hover"}`}
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
                        ? "Rispondi: al completo"
                        : "Sì, annulla e avvisa"}
              </button>
            </div>
          </div>
        )}

        {/* Già gestita: rimandare il messaggio, arrivi, annullare */}
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

            {pendingWa &&
              (canWhatsapp ? (
                <>
                  <p className="text-sm font-medium text-foreground">La risposta su WhatsApp non è ancora partita.</p>
                  {resendHref(pendingWa) && <WhatsappButton href={resendHref(pendingWa)!} bookingId={b.id} />}
                </>
              ) : (
                <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground-muted">La risposta su WhatsApp la manda il telefono del locale.</p>
              ))}

            {v === "CONFIRMED" && b.day <= today && (
              <div className="grid grid-cols-2 gap-2">
                {b.arrivedAt || b.noShowAt ? (
                  <button type="button" disabled={busy} onClick={() => arrival(null)} className={`${bigBtn} col-span-2 border border-border text-foreground-muted hover:text-foreground`}>
                    Togli il segno ({b.arrivedAt ? "arrivati" : "non venuti"})
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={busy} onClick={() => arrival(true)} className={`${bigBtn} border border-success/40 text-success hover:bg-success-bg ${b.startsAt > now ? "col-span-2" : ""}`}>
                      ✓ Arrivati
                    </button>
                    {b.startsAt <= now && (
                      <button type="button" disabled={busy} onClick={() => arrival(false)} className={`${bigBtn} border border-border text-foreground-muted hover:border-danger hover:text-danger`}>
                        Non venuti
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {canWhatsapp && !pendingWa && (v === "CONFIRMED" || v === "PROPOSED" || v === "DECLINED") && resendHref(v === "CONFIRMED" ? "confirmed" : v === "PROPOSED" ? "proposed" : "declined") && (
              <a
                href={resendHref(v === "CONFIRMED" ? "confirmed" : v === "PROPOSED" ? "proposed" : "declined")!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-accent"
              >
                <WhatsappIcon className="text-[#137a43] dark:text-[#3fae74]" /> Manda di nuovo il messaggio ({REPLY_LABEL[v === "CONFIRMED" ? "confirmed" : v === "PROPOSED" ? "proposed" : "declined"].toLowerCase()})
              </a>
            )}

            {v === "PROPOSED" && panel === null && (
              <button type="button" disabled={busy} onClick={() => openPanel("decline")} className={`${bigBtn} border border-border text-foreground hover:border-danger hover:text-danger`}>
                Siamo al completo
              </button>
            )}
            {v === "CONFIRMED" && panel === null && b.startsAt > now - 3 * 3600000 && (
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
              <dd className="font-medium tabular-nums text-foreground">{phoneDisplay(b.phone)}</dd>
            </div>
            <div className="flex gap-2">
              <a href={telLink(b.phone)} className="flex min-h-10 items-center rounded-full border border-border px-3.5 text-xs font-semibold text-foreground hover:border-accent">
                Chiama
              </a>
              <a href={chatLink(b.phone)} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground hover:border-accent">
                <WhatsappIcon className="h-4 w-4 text-[#137a43] dark:text-[#3fae74]" /> Scrivi
              </a>
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
          <div className="px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Vuole la risposta</dt>
            <dd className="text-foreground">{b.contact === "email" ? "Per email" : "Su WhatsApp"}</dd>
          </div>
          <div className="px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Da dove arriva</dt>
            <dd className="text-foreground">
              {SOURCE_LABEL[b.source ?? "altro"] ?? "Link diretto"}
              {b.promoTitle ? ` · «${b.promoTitle}»` : ""}
            </dd>
          </div>
          <div className="px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Quel giorno</dt>
            <dd className="text-foreground">
              {sameDay.length ? `Già confermate ${peopleText(sameDayPeople)} (${sameDay.length} ${sameDay.length === 1 ? "tavolo" : "tavoli"})` : "Nessun'altra prenotazione confermata"}
              {settings.capacityHint > 0 && <span className="text-foreground-muted"> · di solito pieni oltre {settings.capacityHint}</span>}
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
      </div>
    </Sheet>
  );
}
