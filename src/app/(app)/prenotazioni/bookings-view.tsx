"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { runWithToast, showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { addDays, availability, dayLong, peopleText, SOURCE_LABEL, type BookingSettings } from "@/lib/booking/rules";
import { whatsappPending } from "@/lib/booking/whatsapp-queue";
import type { MessageKind } from "@/lib/booking/messages";
import type { Hours } from "@/lib/menu-venue";
import { markWhatsapp, setArrival, setBookingsEnabled, setDayClosed } from "./actions";
import { BookingSheet, StatusChip, TestChip, WhatsappButton } from "./booking-sheet";
import { SettingsSheet } from "./settings-sheet";
import { BellIcon, LocalPhoneBox, PushBox, useLocalPhone, usePush, WhatsappIcon } from "./device";
import { clock, dayLabel, duration, phoneDisplay, REPLY_LABEL, replyHref, telLink, viewOf } from "./format";
import type { BookingItem, BookingStatsData } from "./types";

type Tab = "todo" | "tonight" | "next" | "archive" | "numbers";
const PUSH_LATER_KEY = "prenotazioni-avvisi-non-ora";

export function BookingsView({
  now: serverNow,
  today,
  rows,
  fullDays,
  settings,
  hours,
  stats,
  isOwner,
  mailReady,
  push: pushConfig,
  googleLink,
}: {
  now: number;
  today: string;
  rows: BookingItem[];
  fullDays: string[];
  settings: BookingSettings;
  hours: Hours;
  stats: BookingStatsData;
  isOwner: boolean;
  mailReady: boolean;
  push: { publicKey: string | null; myEndpoints: string[] };
  googleLink: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(serverNow);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showDevice, setShowDevice] = useState(false);
  const [askEnable, setAskEnable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askClose, setAskClose] = useState<{ day: string; pending: number } | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [localPhone, setLocalPhone] = useLocalPhone();
  const push = usePush(pushConfig.publicKey, pushConfig.myEndpoints);
  const [pushLater, setPushLater] = useState(true);
  const canWhatsapp = isOwner || localPhone;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage non c'è al primo disegno sul server
      setPushLater(localStorage.getItem(PUSH_LATER_KEY) === "1");
    } catch {
      setPushLater(false);
    }
  }, []);

  // Si aggiorna da sola ogni 30 secondi mentre la pagina è in vista, e quando torna in primo piano.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      router.refresh();
    };
    const id = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [router]);
  // Dopo ogni aggiornamento dal server, l'ora giusta (per «in attesa da…» e le scadute).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- segue i dati appena arrivati dal server
    setNow((n) => Math.max(n, serverNow));
  }, [serverNow]);

  const lists = useMemo(() => {
    const live = rows.map((b) => ({ b, v: viewOf(b, now) }));
    const pending = live.filter((x) => x.v === "PENDING").map((x) => x.b);
    const proposed = live.filter((x) => x.v === "PROPOSED").map((x) => x.b);
    const wa = rows
      .map((b) => ({ b, kind: whatsappPending(b, now) }))
      .filter((x): x is { b: BookingItem; kind: MessageKind } => x.kind !== null)
      .sort((a, b) => a.b.startsAt - b.b.startsAt);
    const tonight = live.filter((x) => x.v === "CONFIRMED" && x.b.day === today).map((x) => x.b);
    const upcoming = live.filter((x) => x.v === "CONFIRMED" && x.b.day > today).map((x) => x.b);
    const archive = live
      .filter((x) => x.v === "DECLINED" || x.v === "CANCELLED" || x.v === "EXPIRED" || (x.v === "CONFIRMED" && x.b.day < today))
      .map((x) => x.b)
      .sort((a, b) => b.startsAt - a.startsAt);
    return { pending, proposed, wa, tonight, upcoming, archive };
  }, [rows, now, today]);

  // Una nuova richiesta arrivata con la pagina aperta: un messaggio, oltre al numero.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(lists.pending.map((b) => b.id));
    if (seen.current) {
      const fresh = lists.pending.filter((b) => !seen.current!.has(b.id));
      if (fresh.length === 1) toast.showSuccess(`Nuova richiesta: ${fresh[0].name}, ${peopleText(fresh[0].people)}`);
      else if (fresh.length > 1) toast.showSuccess(`${fresh.length} nuove richieste`);
    }
    seen.current = ids;
  }, [lists.pending, toast]);

  const [tab, setTab] = useState<Tab>(() => (lists.pending.length || lists.wa.length || !lists.tonight.length ? "todo" : "tonight"));

  const open = useCallback((id: string) => {
    setOpenId(id);
    setSheetKey((k) => k + 1);
  }, []);
  const opened = openId ? (rows.find((r) => r.id === openId) ?? null) : null;
  const next = lists.pending.find((b) => b.id !== openId) ?? null;

  const todayClosed = fullDays.includes(today);
  const todayOpen = availability(today, hours, settings, null, new Date(now)).state !== "closed";

  async function closeDay(day: string, full: boolean) {
    setBusy(true);
    await runWithToast(toast, () => setDayClosed(day, full), full ? (day === today ? "Stasera niente più richieste online" : `Richieste chiuse per ${dayLong(day)}`) : "Richieste riaperte");
    setBusy(false);
    setAskClose(null);
    router.refresh();
  }
  function requestClose(day: string) {
    const n = lists.pending.filter((b) => b.day === day).length;
    if (n > 0) setAskClose({ day, pending: n });
    else closeDay(day, true);
  }

  async function toggleEnabled() {
    setBusy(true);
    const ok = await runWithToast(toast, () => setBookingsEnabled(!settings.enabled), settings.enabled ? "Prenotazioni online spente" : "Prenotazioni online accese");
    setBusy(false);
    if (ok !== null) setAskEnable(false);
    router.refresh();
  }

  const q = query.trim().toLowerCase();
  const results = q
    ? rows
        .filter((b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || (q.replace(/\D/g, "").length >= 3 && b.phone.includes(q.replace(/\D/g, ""))))
        .sort((a, b) => b.startsAt - a.startsAt)
    : [];

  const todoCount = lists.pending.length + lists.wa.length;
  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "todo", label: "Da gestire", count: todoCount },
    { id: "tonight", label: "Stasera", count: lists.tonight.length },
    { id: "next", label: "Prossimi giorni" },
    { id: "archive", label: "Archivio" },
    { id: "numbers", label: "Numeri" },
  ];

  return (
    <div className="app-wide mx-auto max-w-5xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Prenotazioni</h1>
          <p className="mt-1 text-sm text-foreground-muted">Le richieste di tavolo dal sito: rispondi a ognuna, il cliente riceve il messaggio.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton label="Cerca" active={searching} onClick={() => (searching ? (setSearching(false), setQuery("")) : setSearching(true))}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </IconButton>
          <IconButton label="Questo telefono" onClick={() => setShowDevice(true)} dot={push.state === "on"}>
            <BellIcon />
          </IconButton>
          {isOwner && (
            <IconButton label="Impostazioni delle prenotazioni" onClick={() => setShowSettings(true)}>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
                <circle cx="16" cy="6" r="2" />
                <circle cx="10" cy="12" r="2" />
                <circle cx="18" cy="18" r="2" />
              </svg>
            </IconButton>
          )}
        </div>
      </div>

      {!settings.enabled && (
        <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-foreground">
            <span className="font-semibold">Le prenotazioni online sono spente:</span> i clienti non le vedono.
            {isOwner && " Puoi provarle tu: le tue richieste sono di prova e non avvisano nessuno."}
          </p>
          {isOwner && (
            <div className="flex shrink-0 gap-2">
              <a
                href="/menu/prenota"
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground hover:border-accent"
              >
                Prova la pagina ↗
              </a>
              <button type="button" onClick={() => setAskEnable(true)} className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
                Accendi
              </button>
            </div>
          )}
        </div>
      )}

      {push.state === "off" && !pushLater && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2 text-sm text-foreground">
            <BellIcon className="mt-0.5 shrink-0 text-gold" /> Vuoi un avviso su questo telefono quando arriva una richiesta?
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setPushLater(true);
                try {
                  localStorage.setItem(PUSH_LATER_KEY, "1");
                } catch {
                  /* solo per questa volta */
                }
              }}
              className="min-h-11 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Non ora
            </button>
            <button type="button" disabled={push.busy} onClick={push.activate} className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
              {push.busy ? "Un attimo…" : "Attiva le notifiche"}
            </button>
          </div>
        </div>
      )}

      {/* Stasera: chiudere le richieste con un tocco quando il locale è pieno. */}
      {todayOpen && (
        <div
          className={`mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border px-4 py-2.5 ${todayClosed ? "border-danger/30 bg-danger-bg" : "border-border bg-surface"}`}
        >
          <p className="min-w-0 text-sm text-foreground">
            {todayClosed ? (
              <>
                <span className="font-semibold text-danger">Stasera siete pieni:</span> niente più richieste online per oggi.
              </>
            ) : (
              <>
                <span className="font-semibold">Stasera</span>{" "}
                <span className="text-foreground-muted">
                  · {lists.tonight.length ? `${peopleText(lists.tonight.reduce((s, b) => s + b.people, 0))} confermate` : "nessuna prenotazione confermata"} · richieste aperte
                </span>
              </>
            )}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => (todayClosed ? closeDay(today, false) : requestClose(today))}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${
              todayClosed ? "border border-border bg-surface text-foreground hover:border-accent" : "border border-danger/40 text-danger hover:bg-danger-bg"
            }`}
          >
            {todayClosed ? "Riapri le richieste" : "Siamo pieni stasera"}
          </button>
        </div>
      )}

      {searching && (
        <div className="mb-4">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome, telefono o codice"
            aria-label="Cerca per nome, telefono o codice"
            className={inputClass}
          />
        </div>
      )}

      {q ? (
        <section aria-label="Risultati della ricerca" className="space-y-2">
          <p className="text-xs text-foreground-muted">{results.length ? `${results.length} ${results.length === 1 ? "richiesta trovata" : "richieste trovate"} (ultimi 30 giorni e prossimi)` : "Nessuna richiesta trovata."}</p>
          <CardList>
            {results.map((b) => (
              <RequestCard key={b.id} b={b} now={now} today={today} onOpen={open} showStatus />
            ))}
          </CardList>
        </section>
      ) : (
        <>
          <div role="tablist" aria-label="Prenotazioni" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`scheda-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="prenotazioni-scheda"
                onClick={() => setTab(t.id)}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium ${
                  tab === t.id ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground-muted hover:border-accent hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count ? (
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${
                      tab === t.id ? "bg-accent-foreground text-accent" : t.id === "todo" ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"
                    }`}
                  >
                    {t.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div id="prenotazioni-scheda" role="tabpanel" aria-labelledby={`scheda-${tab}`}>
            {tab === "todo" && (
              <div className="space-y-6">
                {lists.wa.length > 0 && (
                  <section aria-labelledby="wa-titolo" className="rounded-2xl border border-[#137a43]/30 bg-[#137a43]/[0.06] p-4">
                    <h2 id="wa-titolo" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <WhatsappIcon className="text-[#137a43] dark:text-[#3fae74]" /> Da mandare su WhatsApp ({lists.wa.length})
                    </h2>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {canWhatsapp ? "Un tocco apre WhatsApp con il messaggio già scritto: controlla e tocca Invia." : "Le risposte su WhatsApp partono dal telefono del locale."}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {lists.wa.map(({ b, kind }) => (
                        <WaRow key={b.id} b={b} kind={kind} today={today} canWhatsapp={canWhatsapp} onOpen={open} />
                      ))}
                    </ul>
                    {!isOwner && !localPhone && (
                      <button type="button" onClick={() => setShowDevice(true)} className="mt-3 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
                        Questo è il telefono del locale?
                      </button>
                    )}
                  </section>
                )}

                <section aria-label="Richieste da confermare">
                  {lists.pending.length === 0 ? (
                    <Empty
                      title="Nessuna richiesta da confermare"
                      text={push.state === "on" ? "Quando un cliente chiede un tavolo, arriva qui e ti arriva un avviso sul telefono." : "Quando un cliente chiede un tavolo, arriva qui."}
                    />
                  ) : (
                    <CardList>
                      {lists.pending.map((b) => (
                        <RequestCard key={b.id} b={b} now={now} today={today} onOpen={open} />
                      ))}
                    </CardList>
                  )}
                </section>

                {lists.proposed.length > 0 && (
                  <section aria-labelledby="proposte-titolo">
                    <h2 id="proposte-titolo" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                      Aspettano la risposta del cliente ({lists.proposed.length})
                    </h2>
                    <CardList>
                      {lists.proposed.map((b) => (
                        <RequestCard key={b.id} b={b} now={now} today={today} onOpen={open} />
                      ))}
                    </CardList>
                  </section>
                )}
              </div>
            )}

            {tab === "tonight" && <Tonight rows={lists.tonight} now={now} today={today} onOpen={open} />}

            {tab === "next" && (
              <Upcoming rows={lists.upcoming} pending={lists.pending} fullDays={fullDays} today={today} settings={settings} now={now} busy={busy} onOpen={open} onClose={requestClose} onReopen={(d) => closeDay(d, false)} />
            )}

            {tab === "archive" &&
              (lists.archive.length ? (
                <>
                  <p className="mb-2 px-1 text-xs text-foreground-muted">Non c&apos;era posto, annullate, scadute e passate degli ultimi 30 giorni.</p>
                  <CardList>
                    {lists.archive.map((b) => (
                      <RequestCard key={b.id} b={b} now={now} today={today} onOpen={open} showStatus />
                    ))}
                  </CardList>
                </>
              ) : (
                <Empty title="L'archivio è vuoto" text="Qui finiscono le richieste rifiutate, annullate, scadute e passate degli ultimi 30 giorni." />
              ))}

            {tab === "numbers" && <Numbers stats={stats} />}
          </div>
        </>
      )}

      {opened !== undefined && openId && (
        <BookingSheet
          key={sheetKey}
          booking={opened}
          rows={rows}
          now={now}
          today={today}
          settings={settings}
          hours={hours}
          fullDays={fullDays}
          canWhatsapp={canWhatsapp}
          next={next}
          onOpen={open}
          onClose={() => setOpenId(null)}
        />
      )}

      {showSettings && isOwner && (
        <SettingsSheet settings={settings} mailReady={mailReady} googleLink={googleLink} onToggleEnabled={() => setAskEnable(true)} onClose={() => setShowSettings(false)} />
      )}

      {showDevice && (
        <Sheet title="Questo telefono" onClose={() => setShowDevice(false)}>
          <div className="space-y-3" data-unsaved-ignore>
            <PushBox push={push} />
            <LocalPhoneBox isOwner={isOwner} localPhone={localPhone} setLocalPhone={setLocalPhone} />
          </div>
        </Sheet>
      )}

      {askEnable && (
        <ConfirmSheet
          title={settings.enabled ? "Spegnere le prenotazioni online?" : "Accendere le prenotazioni online?"}
          confirmLabel={settings.enabled ? "Spegni" : "Accendi"}
          danger={settings.enabled}
          busy={busy}
          onConfirm={toggleEnabled}
          onCancel={() => setAskEnable(false)}
        >
          {settings.enabled ? (
            <p>I clienti non vedranno più la pagina per chiedere un tavolo. Le richieste già arrivate restano qui e puoi ancora rispondere.</p>
          ) : (
            <>
              <p>I clienti potranno chiedere un tavolo dal menù e dal link per Google. Le richieste arrivano qui e vanno confermate una per una.</p>
              {push.state !== "on" && <p>Consiglio: attiva anche gli avvisi sul telefono (campanella in alto).</p>}
            </>
          )}
        </ConfirmSheet>
      )}

      {askClose && (
        <ConfirmSheet
          title={askClose.day === today ? "Siamo pieni stasera?" : `Chiudere le richieste di ${dayLong(askClose.day)}?`}
          confirmLabel="Chiudi le richieste"
          busy={busy}
          onConfirm={() => closeDay(askClose.day, true)}
          onCancel={() => setAskClose(null)}
        >
          <p>
            {askClose.pending === 1 ? "C'è 1 richiesta" : `Ci sono ${askClose.pending} richieste`} in attesa per {askClose.day === today ? "stasera" : "quel giorno"}: rispondi a ognuna (non si chiudono da
            sole).
          </p>
          <p>Da adesso nessun cliente può chiederne altre per {askClose.day === today ? "stasera" : "quel giorno"}.</p>
        </ConfirmSheet>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children, active = false, dot = false }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; dot?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      onClick={onClick}
      className={`relative flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
        active ? "border-accent bg-accent/15 text-foreground" : "border-border bg-surface text-foreground-muted hover:border-accent hover:text-foreground"
      }`}
    >
      {children}
      {dot && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-success ring-2 ring-surface" />}
    </button>
  );
}

function CardList({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[repeat(2,minmax(0,1fr))]">{children}</ul>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">{text}</p>
    </div>
  );
}

// Una richiesta nell'elenco: tutta toccabile, apre il dettaglio con le risposte.
function RequestCard({ b, now, today, onOpen, showStatus = false }: { b: BookingItem; now: number; today: string; onOpen: (id: string) => void; showStatus?: boolean }) {
  const v = viewOf(b, now);
  const waiting = (now - b.createdAt) / 60000;
  const day = dayLabel(b.day, today);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(b.id)}
        className={`flex w-full items-stretch gap-3 rounded-2xl border bg-surface p-3 text-left shadow-sm transition-colors hover:border-accent ${
          v === "PENDING" && waiting >= 30 ? "border-danger/40" : "border-border"
        }`}
      >
        <span className={`flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl py-2 ${day === "Oggi" ? "bg-accent/15" : "bg-surface-2"}`}>
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${day === "Oggi" ? "text-accent-ink" : "text-foreground-muted"}`}>{day}</span>
          <span className="text-lg font-semibold tabular-nums leading-tight text-foreground">{v === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time}</span>
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-foreground">{b.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{peopleText(b.people)}</span>
          </span>
          {b.note && <span className="mt-0.5 block truncate text-sm text-foreground-muted">«{b.note}»</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {(showStatus || v === "PROPOSED") && <StatusChip b={b} now={now} />}
            {b.isTest && <TestChip />}
            {b.allergies && <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">⚠ Allergie</span>}
            {v === "PENDING" &&
              (waiting >= 30 ? (
                <span className="font-semibold text-danger">in attesa da {duration(waiting)}</span>
              ) : (
                <span className="text-foreground-muted">arrivata {duration(waiting)} fa</span>
              ))}
            {v === "PROPOSED" && <span className="text-foreground-muted">aveva chiesto le {b.time}</span>}
            {b.source && b.source !== "altro" && <span className="text-foreground-muted">{SOURCE_LABEL[b.source]}</span>}
          </span>
        </span>
        <span aria-hidden className="self-center text-foreground-muted">
          ›
        </span>
      </button>
    </li>
  );
}

function WaRow({ b, kind, today, canWhatsapp, onOpen }: { b: BookingItem; kind: MessageKind; today: string; canWhatsapp: boolean; onOpen: (id: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const href = replyHref(b, kind);
  async function done() {
    setBusy(true);
    await runWithToast(toast, () => markWhatsapp(b.id, "done"), "Segnata come mandata");
    setBusy(false);
    router.refresh();
  }
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center">
      <button type="button" onClick={() => onOpen(b.id)} className="block min-w-0 flex-1 text-left">
        <span className="flex items-baseline justify-between gap-2 sm:justify-start">
          <span className="truncate text-sm font-semibold text-foreground">{b.name}</span>
          <span className="shrink-0 text-xs font-medium text-foreground-muted">{REPLY_LABEL[kind]}</span>
        </span>
        <span className="block text-xs text-foreground-muted">
          {dayLabel(b.day, today)} alle {kind === "proposed" ? b.proposedTime : b.time} · {peopleText(b.people)} · {phoneDisplay(b.phone)}
        </span>
      </button>
      {canWhatsapp && href ? (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row-reverse sm:items-center">
          <WhatsappButton href={href} bookingId={b.id} label="Manda su WhatsApp" compact />
          <button type="button" disabled={busy} onClick={done} className="min-h-11 rounded-xl px-3 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-60">
            Segna come già mandata
          </button>
        </div>
      ) : (
        // Da un telefono qualsiasi si può solo segnare (es. il collega ha già scritto dal telefono del locale).
        <div className="flex shrink-0 justify-end">
          <button type="button" disabled={busy} onClick={done} className="min-h-10 rounded-full px-3 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-60">
            Segna come già mandata
          </button>
        </div>
      )}
    </li>
  );
}

function Tonight({ rows, now, today, onOpen }: { rows: BookingItem[]; now: number; today: string; onOpen: (id: string) => void }) {
  if (!rows.length) return <Empty title="Nessuna prenotazione per stasera" text="Le prenotazioni confermate per oggi compaiono qui, in ordine di orario." />;
  const people = rows.reduce((s, b) => s + b.people, 0);
  const arrived = rows.filter((b) => b.arrivedAt).length;
  return (
    <section aria-label="Stasera">
      <p className="mb-3 px-1 text-sm text-foreground">
        <span className="font-semibold">{peopleText(people)}</span>
        <span className="text-foreground-muted">
          {" "}
          · {rows.length} {rows.length === 1 ? "tavolo" : "tavoli"} · arrivati {arrived} su {rows.length}
        </span>
      </p>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
        {rows.map((b) => (
          <TonightRow key={b.id} b={b} now={now} today={today} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

function TonightRow({ b, now, onOpen }: { b: BookingItem; now: number; today: string; onOpen: (id: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function mark(value: boolean | null) {
    setBusy(true);
    try {
      const res = await setArrival(b.id, value);
      if (!res.ok) toast.showError(res.error);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }
  const late = !b.arrivedAt && !b.noShowAt && b.startsAt < now;
  return (
    <li className={`rounded-2xl border bg-surface p-3 shadow-sm ${b.arrivedAt ? "border-success/30 opacity-80" : b.noShowAt ? "border-border opacity-60" : "border-border"}`}>
      <button type="button" onClick={() => onOpen(b.id)} className="flex w-full items-start gap-3 text-left">
        <span className="w-14 shrink-0 text-xl font-semibold tabular-nums text-foreground">{b.time}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-foreground">{b.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{peopleText(b.people)}</span>
          </span>
          {b.note && <span className="mt-0.5 block text-sm text-foreground-muted">«{b.note}»</span>}
          <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {b.isTest && <TestChip />}
            {b.allergies && <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">⚠ Allergie: chiedere al tavolo</span>}
            {b.arrivedAt && <span className="font-semibold text-success">✓ Arrivati alle {clock(b.arrivedAt)}</span>}
            {b.noShowAt && <span className="font-semibold text-danger">Non venuti</span>}
            {late && <span className="font-medium text-gold">in ritardo di {duration((now - b.startsAt) / 60000)}</span>}
          </span>
        </span>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-[4.25rem]">
        <a href={telLink(b.phone)} className="flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-medium tabular-nums text-foreground hover:border-accent">
          📞 {phoneDisplay(b.phone)}
        </a>
        {b.arrivedAt || b.noShowAt ? (
          <button type="button" disabled={busy} onClick={() => mark(null)} className="min-h-10 rounded-full px-3 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-60">
            Togli il segno
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => mark(true)} className="min-h-10 rounded-full border border-success/40 px-4 text-xs font-semibold text-success hover:bg-success-bg disabled:opacity-60">
              ✓ Arrivati
            </button>
            {b.startsAt <= now && (
              <button type="button" disabled={busy} onClick={() => mark(false)} className="min-h-10 rounded-full border border-border px-3 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger disabled:opacity-60">
                Non venuti
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Upcoming({
  rows,
  pending,
  fullDays,
  today,
  settings,
  now,
  busy,
  onOpen,
  onClose,
  onReopen,
}: {
  rows: BookingItem[];
  pending: BookingItem[];
  fullDays: string[];
  today: string;
  settings: BookingSettings;
  now: number;
  busy: boolean;
  onOpen: (id: string) => void;
  onClose: (day: string) => void;
  onReopen: (day: string) => void;
}) {
  const [pick, setPick] = useState("");
  const days = [...new Set([...rows.map((b) => b.day), ...fullDays.filter((d) => d > today)])].sort();
  const last = addDays(today, settings.daysAhead);
  return (
    <div className="space-y-5">
      {days.length === 0 && <Empty title="Nessuna prenotazione nei prossimi giorni" text="Le prenotazioni confermate da domani in poi compaiono qui, giorno per giorno." />}
      {days.map((day) => {
        const list = rows.filter((b) => b.day === day);
        const people = list.reduce((s, b) => s + b.people, 0);
        const waiting = pending.filter((b) => b.day === day).length;
        const closed = fullDays.includes(day);
        const overHint = settings.capacityHint > 0 && people >= settings.capacityHint;
        return (
          <section key={day} aria-label={dayLong(day)}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground first-letter:uppercase">
                  {dayLabel(day, today) === "Domani" ? "Domani · " : ""}
                  {dayLong(day)}
                </h2>
                <p className="text-xs text-foreground-muted">
                  {list.length ? `${peopleText(people)} · ${list.length} ${list.length === 1 ? "tavolo" : "tavoli"}` : "Nessuna prenotazione confermata"}
                  {settings.capacityHint > 0 && <span className={overHint ? "font-semibold text-danger" : ""}> · di solito pieni oltre {settings.capacityHint}</span>}
                  {waiting > 0 && <span className="font-semibold text-gold"> · {waiting} da confermare</span>}
                </p>
              </div>
              {closed ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-danger">Richieste chiuse</span>
                  <button type="button" disabled={busy} onClick={() => onReopen(day)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground hover:border-accent disabled:opacity-60">
                    Riapri
                  </button>
                </span>
              ) : (
                <button type="button" disabled={busy} onClick={() => onClose(day)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger disabled:opacity-60">
                  Chiudi le richieste
                </button>
              )}
            </div>
            {list.length > 0 && (
              <CardList>
                {list.map((b) => (
                  <RequestCard key={b.id} b={b} now={now} today={today} onOpen={onOpen} />
                ))}
              </CardList>
            )}
          </section>
        );
      })}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Chiudi le richieste di un altro giorno</h2>
        <p className="mt-0.5 text-xs text-foreground-muted">Per una serata già piena o un evento privato: i clienti vedono quel giorno come «Completo».</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="date" value={pick} min={addDays(today, 1)} max={last} onChange={(e) => setPick(e.target.value)} aria-label="Giorno da chiudere" className={`${inputClass} w-auto`} />
          <button
            type="button"
            disabled={busy || !pick || pick <= today || fullDays.includes(pick)}
            onClick={() => {
              onClose(pick);
              setPick("");
            }}
            className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            Chiudi le richieste
          </button>
        </div>
        {pick && fullDays.includes(pick) && <p className="mt-2 text-xs text-foreground-muted">Quel giorno è già chiuso.</p>}
      </section>
    </div>
  );
}

function Numbers({ stats }: { stats: BookingStatsData }) {
  if (!stats.total) return <Empty title="Ancora nessun numero" text="Qui vedrai quante richieste arrivano, quante ne confermi e da dove arrivano (ultimi 90 giorni, senza le prove)." />;
  const pct = (n: number) => `${Math.round((n / stats.total) * 100)}%`;
  const tiles: { label: string; value: string; note?: string }[] = [
    { label: "Richieste", value: String(stats.total), note: "ultimi 90 giorni" },
    { label: "Confermate", value: String(stats.confirmed), note: `${pct(stats.confirmed)} · ${peopleText(stats.people)}` },
    { label: "Al completo", value: String(stats.declined), note: pct(stats.declined) },
    { label: "Annullate", value: String(stats.cancelled), note: pct(stats.cancelled) },
    { label: "Non venuti", value: String(stats.noShow) },
    { label: "Risposta tipica", value: stats.medianResponseMinutes === null ? "—" : duration(stats.medianResponseMinutes), note: "dall'arrivo della richiesta" },
  ];
  const max = Math.max(...stats.bySource.map(([, n]) => n), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{t.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{t.value}</p>
            {t.note && <p className="mt-0.5 text-xs text-foreground-muted">{t.note}</p>}
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Da dove arrivano</h2>
        <ul className="mt-3 space-y-2">
          {stats.bySource.map(([source, n]) => (
            <li key={source} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate text-foreground">{SOURCE_LABEL[source] ?? "Link diretto"}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-chart" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-foreground-muted">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
