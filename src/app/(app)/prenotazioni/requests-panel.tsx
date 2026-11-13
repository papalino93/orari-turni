"use client";

// «Richieste»: tutto quello che aspetta qualcuno, in un solo posto (era la scheda «Da gestire»).
// - Da mandare su WhatsApp: una sola coda per tutti, con il lucchetto «In invio da …»;
// - Da confermare: le richieste dei clienti dal sito;
// - Da completare: prenotazioni vere con ora o persone ancora da definire;
// - Aspettano il cliente: altro orario proposto, si aspetta la risposta.

import type { MessageKind } from "@/lib/booking/messages";
import { activeClaim } from "@/lib/booking/whatsapp-queue";
import { WhatsappIcon } from "./device";
import { clock, dayLabel, REPLY_SHORT, replyHref } from "./format";
import { CardList, Empty, InboxIcon, RequestCard } from "./lists";
import { SidePanel } from "./panel";
import { PERSONAL_WARNING, WhatsappButton, type WaInfo } from "./wa-send";
import type { BookingItem } from "./types";

export type RequestLists = {
  pending: BookingItem[];
  proposed: BookingItem[];
  incomplete: BookingItem[];
  wa: { b: BookingItem; kind: MessageKind }[];
  waDone: { b: BookingItem; openedAt: number; by: string }[];
};

// Il numero sul pulsante «Richieste» (e sul pallino del menù in alto): da confermare, da mandare, da completare.
export const requestsCount = (l: Pick<RequestLists, "pending" | "wa" | "incomplete">) => l.pending.length + l.wa.length + l.incomplete.length;

export function requestsSummary(l: Pick<RequestLists, "pending" | "wa" | "incomplete">): string {
  return [
    l.pending.length ? `${l.pending.length} da confermare` : "",
    l.wa.length ? `${l.wa.length} da mandare su WhatsApp` : "",
    l.incomplete.length ? `${l.incomplete.length} da completare` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RequestsPanel({
  lists,
  wa,
  now,
  today,
  pushOn,
  onOpen,
  onClose,
}: {
  lists: RequestLists;
  wa: WaInfo;
  now: number;
  today: string;
  pushOn: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const canWhatsapp = wa.role !== "none";
  const total = requestsCount(lists);
  const nothing = total === 0 && lists.proposed.length === 0 && lists.waDone.length === 0;
  return (
    <SidePanel title="Richieste" subtitle={total ? requestsSummary(lists) : "Niente da fare adesso"} onClose={onClose} testId="pannello-richieste">
      <div className="space-y-6">
        {nothing && (
          <Empty
            icon={<InboxIcon className="h-6 w-6" />}
            title="Tutto a posto"
            text={
              pushOn
                ? "Nessuna richiesta da confermare e nessun messaggio da mandare. Quando un cliente chiede un tavolo, arriva qui e ti arriva un avviso."
                : "Nessuna richiesta da confermare e nessun messaggio da mandare. Quando un cliente chiede un tavolo dal sito, arriva qui."
            }
          />
        )}

        {(lists.wa.length > 0 || lists.waDone.length > 0) && (
          <section aria-labelledby="wa-titolo" className="rounded-2xl border border-[#137a43]/30 bg-[#137a43]/[0.06] p-3.5" data-testid="sezione-whatsapp">
            <h3 id="wa-titolo" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <WhatsappIcon className="text-[#137a43] dark:text-[#3fae74]" /> Da mandare su WhatsApp ({lists.wa.length})
            </h3>
            {canWhatsapp ? (
              <>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  {wa.role === "override"
                    ? "Le manda il telefono enoteca. Se serve, puoi mandarne una tu con «Mandalo io»."
                    : "Il pulsante verde apre WhatsApp con il messaggio già scritto: tocca Invia, poi «Mandato». Chi la prende la vede solo lui: gli altri leggono «In invio da…»."}
                </p>
                {!wa.venueDevice && (
                  <p className="mt-1 text-xs font-medium text-foreground" data-testid="wa-avviso-personale">
                    {PERSONAL_WARNING}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-foreground-muted">Le manda il telefono enoteca: qui le vedi soltanto.</p>
            )}
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface" data-testid="coda-whatsapp">
              {lists.wa.map(({ b, kind }) => (
                <WaRow key={b.id} b={b} kind={kind} today={today} now={now} canSend={canWhatsapp} onOpen={onOpen} />
              ))}
              {lists.waDone.map(({ b, openedAt, by }) => (
                <li key={b.id} className="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm text-foreground-muted" data-testid="wa-mandato">
                  <button type="button" onClick={() => onOpen(b.id)} className="min-w-0 flex-1 truncate text-left">
                    <span className="font-semibold text-foreground">{b.name}</span> · Già mandato da {by} alle {clock(openedAt)}
                  </button>
                  <span aria-hidden className="text-success">
                    ✓
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lists.pending.length > 0 && (
          <section aria-labelledby="da-confermare-titolo">
            <SectionTitle id="da-confermare-titolo" tone="accent" count={lists.pending.length} hint="Richieste dei clienti dal sito: rispondi a ognuna.">
              Da confermare
            </SectionTitle>
            <CardList single>
              {lists.pending.map((b) => (
                <RequestCard key={b.id} b={b} now={now} today={today} onOpen={onOpen} />
              ))}
            </CardList>
          </section>
        )}

        {lists.incomplete.length > 0 && (
          <section aria-labelledby="da-completare-titolo" data-testid="da-completare">
            <SectionTitle id="da-completare-titolo" tone="gold" count={lists.incomplete.length} hint="Prenotazioni vere con ora o persone ancora da definire: chiedile al cliente e completale.">
              Da completare
            </SectionTitle>
            <CardList single>
              {lists.incomplete.map((b) => (
                <RequestCard key={b.id} b={b} now={now} today={today} onOpen={onOpen} />
              ))}
            </CardList>
          </section>
        )}

        {lists.proposed.length > 0 && (
          <section aria-labelledby="proposte-titolo">
            <SectionTitle id="proposte-titolo" tone="muted" count={lists.proposed.length} hint="Hai proposto un altro orario: si aspetta che il cliente risponda.">
              Aspettano il cliente
            </SectionTitle>
            <CardList single>
              {lists.proposed.map((b) => (
                <RequestCard key={b.id} b={b} now={now} today={today} onOpen={onOpen} />
              ))}
            </CardList>
          </section>
        )}
      </div>
    </SidePanel>
  );
}

function SectionTitle({ id, tone, count, hint, children }: { id: string; tone: "accent" | "gold" | "muted"; count: number; hint: string; children: React.ReactNode }) {
  const dot = tone === "accent" ? "bg-accent" : tone === "gold" ? "bg-gold" : "bg-foreground-muted/60";
  return (
    <div className="mb-2 px-1">
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        {children} ({count})
      </h3>
      <p className="mt-0.5 text-xs text-foreground-muted">{hint}</p>
    </div>
  );
}

// Una riga della coda WhatsApp: nome · tipo di risposta · giorno e ora, lo stato («In invio da
// Marta…») e il pulsante verde con il lucchetto condiviso.
function WaRow({ b, kind, today, now, canSend, onOpen }: { b: BookingItem; kind: MessageKind; today: string; now: number; canSend: boolean; onOpen: (id: string) => void }) {
  const href = replyHref(b, kind);
  const claim = activeClaim(b, now);
  return (
    <li className="flex items-center gap-2 py-1 pl-3 pr-1.5" data-testid="wa-riga">
      <button type="button" onClick={() => onOpen(b.id)} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
        {/* Si accorcia solo il nome: tipo di risposta, giorno e ora restano sempre interi. */}
        <span className="flex min-w-0 items-baseline text-sm">
          <span className="min-w-0 truncate font-semibold text-foreground">{b.name}</span>
          <span className="shrink-0 whitespace-nowrap text-foreground-muted">
            &nbsp;· {REPLY_SHORT[kind]} · {dayLabel(b.day, today)} {kind === "proposed" ? b.proposedTime : b.time}
          </span>
        </span>
        {claim && !canSend && <span className="text-xs font-medium text-gold">In invio da {claim.by}…</span>}
      </button>
      {href && canSend && <WhatsappButton key={`${b.id}-${b.waClaimAt ?? 0}`} href={href} bookingId={b.id} icon name={b.name} claim={{ by: b.waClaimBy, at: b.waClaimAt, device: b.waClaimDevice }} />}
    </li>
  );
}
