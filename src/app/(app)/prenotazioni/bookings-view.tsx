"use client";

// Prenotazioni: la pagina è l'agenda (Giorno · Settimana · Mese). In alto una sola barra con
// «Richieste (N)» (richieste online da confermare, WhatsApp da mandare, prenotazioni da completare),
// «+ Prenotazione» e «⋯» (Importa dal librone, Cerca, Numeri, Avvisi, Impostazioni, Prova la pagina).
// Dove sono finite le vecchie schede: «Da gestire» → pannello Richieste; «Stasera» → vista Giorno di
// oggi; «Prossimi giorni» → Settimana e Mese; «Archivio» → Cerca; «Numeri» → ⋯ → Numeri.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { runWithToast, showActionError, useToast } from "@/components/toast";
import { Sheet } from "../gestione-menu/sheet";
import { dayLong, isIncomplete, pausedNow, peopleText, type BookingSettings } from "@/lib/booking/rules";
import { lastSent, whatsappPending } from "@/lib/booking/whatsapp-queue";
import type { MessageKind } from "@/lib/booking/messages";
import type { AgendaView } from "@/lib/booking/agenda";
import type { Hours } from "@/lib/menu-venue";
import { chooseVenueWho, markWhatsapp, reopenOnline, setBookingSwitch, setDayClosed, setPushLocalPhone, undoNewBooking } from "./actions";
import { deviceId, WaContext, type WaInfo } from "./wa-send";
import { BookingSheet } from "./booking-sheet";
import { SettingsSheet } from "./settings-sheet";
import { arrivesText, BellIcon, PushBox, useDeviceWord, usePush, WhatsappIcon, WhatsappInfoBox } from "./device";
import { clock, viewOf } from "./format";
import { BookingForm, type SavedInfo } from "./agenda";
import { AgendaCalendar } from "./calendar";
import { ImportSheet } from "./import-sheet";
import { InboxIcon, SearchIcon } from "./lists";
import { MoreMenu, type MenuItem } from "./panel";
import { RequestsPanel, requestsCount, requestsSummary } from "./requests-panel";
import { SearchSheet } from "./search-sheet";
import { NumbersSheet } from "./numbers";
import type { BookingItem, BookingStatsData } from "./types";
import type { PushDevice } from "@/lib/booking/push";

// Il suggerimento «Avvisi su questo telefono» si mostra una volta per dispositivo; poi resta in ⋯.
const PUSH_HINT_KEY = "prenotazioni-avvisi-suggerito";

// Dove portare chi arriva da un link o da una notifica (anche i vecchi ?tab=…).
export type PageLink = { panel?: "richieste" | "cerca" | "numeri" | "impostazioni" | "avvisi"; view?: AgendaView; today?: boolean };

function remember(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* solo per questa volta */
  }
}

export function BookingsView({
  now: serverNow,
  today,
  rows,
  fullDays,
  settings,
  hours,
  menus = [],
  phoneUA = false,
  wa = { role: "send", mode: "all", me: null, venueDevice: false, venueExists: false },
  venueDevice = null,
  stats,
  isOwner,
  mailReady,
  push: pushConfig,
  googleLink,
  openRequest,
  link = null,
  devices = [],
  preview = false,
}: {
  now: number;
  today: string;
  rows: BookingItem[];
  fullDays: string[];
  settings: BookingSettings;
  hours: Hours;
  // Menù già usati (suggerimenti nel foglio) e telefono secondo il browser (vista di partenza dell'agenda).
  menus?: string[];
  phoneUA?: boolean;
  // Chi manda i WhatsApp da questo dispositivo (telefono enoteca, impostazione «Chi manda i WhatsApp»).
  wa?: WaInfo;
  // Solo sul telefono enoteca: chi lo sta usando adesso e tra chi scegliere (prima chi è in turno).
  venueDevice?: { who: string | null; choices: { id: string; name: string; onShift: string | null }[]; label: string } | null;
  stats: BookingStatsData;
  isOwner: boolean;
  mailReady: boolean;
  push: { publicKey: string | null; myEndpoints: string[]; localPhoneEndpoints?: string[] };
  googleLink: string;
  // Anteprima di Vercel: si lavora solo con le prove.
  preview?: boolean;
  // ?r=<id> nell'indirizzo (tocco sulla notifica): si apre subito quella richiesta.
  openRequest: string | null;
  // ?richieste=1, ?vista=oggi, ?tab=… : il pannello o la vista da aprire.
  link?: PageLink | null;
  // Telefoni che ricevono gli avvisi (solo per titolare e consulente, nelle Impostazioni).
  devices?: PushDevice[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(serverNow);
  // Dalla notifica: /prenotazioni?r=<id> apre subito il foglio di quella richiesta.
  const [openId, setOpenId] = useState<string | null>(openRequest);
  const [sheetKey, setSheetKey] = useState(0);
  const [askedFor, setAskedFor] = useState(openRequest);
  // Pannelli e fogli aperti dalla barra in alto (o da un link).
  type Panel = NonNullable<PageLink["panel"]> | null;
  const [panel, setPanel] = useState<Panel>(link?.panel ?? null);
  const [jump, setJump] = useState<{ view?: AgendaView; day?: string; n: number } | null>(() =>
    link?.view || link?.today ? { view: link.view ?? "day", day: link.today ? today : undefined, n: 1 } : null,
  );
  // Confronto per valore: a ogni aggiornamento dal server l'oggetto è nuovo ma il link è lo stesso.
  const linkKey = link ? JSON.stringify(link) : "";
  const [linkSeen, setLinkSeen] = useState(linkKey);
  if (openRequest !== askedFor) {
    setAskedFor(openRequest);
    if (openRequest) {
      setOpenId(openRequest);
      setSheetKey((k) => k + 1);
    }
  }
  if (linkKey !== linkSeen) {
    setLinkSeen(linkKey);
    if (link?.panel) setPanel(link.panel);
    if (link?.view || link?.today) setJump((j) => ({ view: link.view ?? "day", day: link.today ? today : undefined, n: (j?.n ?? 0) + 1 }));
  }
  // Poi l'indirizzo torna pulito, così ricaricando la pagina il foglio non si riapre.
  useEffect(() => {
    if (!openRequest && !linkKey) return;
    try {
      window.history.replaceState(window.history.state, "", "/prenotazioni");
    } catch {
      /* resta l'indirizzo con ?r= */
    }
  }, [openRequest, linkKey]);
  // Agenda: il giorno mostrato e il foglio «Nuova prenotazione» / «Modifica» (booking null = nuova).
  const [agendaDay, setAgendaDay] = useState(today);
  const [form, setForm] = useState<{ booking: BookingItem | null; day: string; key: number } | null>(null);
  // «Importa dal librone»: tante prenotazioni insieme da una lista incollata.
  const [showImport, setShowImport] = useState(false);
  // Un interruttore toccato (da confermare) e, dopo, la domanda sulle prenotazioni di prova.
  const [askSwitch, setAskSwitch] = useState<{ which: "agenda" | "online"; on: boolean } | null>(null);
  const [askTests, setAskTests] = useState<{ which: "agenda" | "online"; on: boolean; tests: number; keepable: number } | null>(null);
  // Appena segnata dal foglio «Nuova prenotazione»: «✓ Segnata: Rossi, sab 20:30, 4 persone» con «Annulla».
  const [justSaved, setJustSaved] = useState<SavedInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [askClose, setAskClose] = useState<{ day: string; pending: number } | null>(null);
  const push = usePush(pushConfig.publicKey, pushConfig.myEndpoints);
  const device = useDeviceWord();
  // Il server deve sapere se questo dispositivo è il telefono enoteca (avvisi «da mandare su WhatsApp»):
  // lo decide l'accesso; un'iscrizione fatta prima (o da un altro accesso) si riallinea da sola.
  const serverLocal = push.endpoint ? (pushConfig.localPhoneEndpoints ?? []).includes(push.endpoint) : null;
  useEffect(() => {
    if (push.state !== "on" || !push.endpoint || serverLocal === null || serverLocal === wa.venueDevice) return;
    setPushLocalPhone(push.endpoint)
      .then(() => router.refresh())
      .catch(() => {});
  }, [push.state, push.endpoint, serverLocal, wa.venueDevice, router]);
  // «Chi sei?» sul telefono enoteca: si chiede subito se nessuno l'ha ancora detto.
  const [askWho, setAskWho] = useState(Boolean(venueDevice && !venueDevice.who));
  const [hintSeen, setHintSeen] = useState(true);
  // WhatsApp aperto dal foglio di una prenotazione: la coda si rilegge (il lucchetto è cambiato).
  const noteWaOpened = useCallback(() => router.refresh(), [router]);
  const canWhatsapp = wa.role !== "none";

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage non c'è al primo disegno sul server
      setHintSeen(localStorage.getItem(PUSH_HINT_KEY) === "1");
    } catch {
      setHintSeen(false);
    }
  }, []);

  // Si aggiorna da sola ogni 75 secondi mentre la pagina è in vista (non di più: i limiti del piano
  // gratuito), e quando torna in primo piano.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      router.refresh();
    };
    const id = setInterval(tick, 75000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [router]);
  // Coda di WhatsApp condivisa: mentre c'è qualcosa da mandare (o qualcuno lo sta mandando), ogni 8
  // secondi un'impronta leggera dal server; se è cambiata (preso in mano, mandato) la pagina si aggiorna.
  const waBusy = rows.some((b) => whatsappPending(b, now) !== null);
  const sigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!waBusy) return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/prenotazioni/agenda?coda=1", { cache: "no-store" });
        const j = (await r.json()) as { sig?: string };
        if (!alive || !j.sig) return;
        if (sigRef.current !== null && sigRef.current !== j.sig) router.refresh();
        sigRef.current = j.sig;
      } catch {
        /* la prossima volta */
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [waBusy, router]);
  useEffect(() => {
    // Dopo un aggiornamento della pagina l'impronta si rilegge da capo (niente doppio aggiornamento).
    sigRef.current = null;
  }, [serverNow]);

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
    const waIds = new Set(wa.map((x) => x.b.id));
    // Mandate da poco (da chiunque): restano in fondo, chiare, con «Già mandato da … alle …».
    const waDone = rows
      .filter((b) => !waIds.has(b.id))
      .map((b) => ({ b, sent: lastSent(b) }))
      .filter((x): x is { b: BookingItem; sent: { by: string; at: number } } => x.sent !== null && now - x.sent.at < 30 * 60000 && x.sent.at <= now + 60000)
      .map((x) => ({ b: x.b, openedAt: x.sent.at, by: x.sent.by }))
      .sort((a, b) => b.openedAt - a.openedAt);
    const confirmed = live.filter((x) => x.v === "CONFIRMED").map((x) => x.b);
    // Prenotazioni vere con ora o persone ancora da definire, da oggi in poi (le prove no, con l'agenda accesa).
    const incomplete = live
      .filter((x) => x.v === "CONFIRMED" && x.b.day >= today && isIncomplete(x.b) && (!settings.agendaEnabled || !x.b.isTest))
      .map((x) => x.b)
      .sort((a, b) => a.startsAt - b.startsAt);
    // «Cerca» senza testo: passate, annullate, al completo e scadute degli ultimi 30 giorni (era l'Archivio).
    const archive = live
      .filter((x) => x.v === "DECLINED" || x.v === "CANCELLED" || x.v === "EXPIRED" || (x.v === "CONFIRMED" && x.b.day < today))
      .map((x) => x.b)
      .sort((a, b) => b.startsAt - a.startsAt);
    return { pending, proposed, wa, waDone, confirmed, archive, incomplete };
  }, [rows, now, today, settings.agendaEnabled]);
  const todo = requestsCount(lists);

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

  // Una prenotazione aperta dall'agenda ma fuori da quelle caricate dalla pagina (più vecchia di 30
  // giorni, o trovata con «Cerca»): si legge intera, con la cronologia.
  const [fetched, setFetched] = useState<{ id: string; booking: BookingItem | null } | null>(null);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const open = useCallback((id: string) => {
    setOpenId(id);
    setSheetKey((k) => k + 1);
    if (rowsRef.current.some((r) => r.id === id)) return;
    setFetched({ id, booking: null });
    fetch(`/prenotazioni/agenda?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { booking?: BookingItem }) => setFetched({ id, booking: j.booking ?? null }))
      .catch(() => setFetched({ id, booking: null }));
  }, []);
  const newBooking = useCallback((day: string) => {
    // Il messaggio «✓ Segnata…» di prima si chiude: quello nuovo arriva dopo il salvataggio.
    setJustSaved(null);
    setForm({ booking: null, day, key: Date.now() });
  }, []);
  const openImport = useCallback(() => {
    setJustSaved(null);
    setShowImport(true);
  }, []);
  const opened = openId ? (rows.find((r) => r.id === openId) ?? (fetched?.id === openId ? fetched.booking : null)) : null;
  const loadingOpened = Boolean(openId && !opened && fetched?.id === openId && fetched.booking === null && !rows.some((r) => r.id === openId));
  const next = lists.pending.find((b) => b.id !== openId) ?? null;

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

  // Interruttori: si accende/spegne; se ci sono prove, prima si chiede che cosa farne.
  const SWITCH_DONE: Record<string, string> = {
    "agenda-on": "Agenda accesa",
    "agenda-off": "Agenda spenta",
    "online-on": "Richieste online accese",
    "online-off": "Richieste online spente",
  };
  async function applySwitch(which: "agenda" | "online", on: boolean, tests?: "delete" | "keep") {
    setBusy(true);
    try {
      const res = await setBookingSwitch(which, on, tests);
      if (!res.ok) {
        toast.showError(res.error);
        return;
      }
      if (!res.data.done) {
        setAskSwitch(null);
        setAskTests({ which, on, tests: res.data.tests, keepable: res.data.keepable });
        return;
      }
      const d = res.data;
      const extra = d.deleted || d.kept ? ` · ${[d.kept ? `${d.kept} rese vere` : "", d.deleted ? `${d.deleted} prove cancellate` : ""].filter(Boolean).join(", ")}` : "";
      toast.showSuccess(`${SWITCH_DONE[`${which}-${on ? "on" : "off"}`]}${extra}`);
      setAskSwitch(null);
      setAskTests(null);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }
  const askToggle = (which: "agenda" | "online") => setAskSwitch({ which, on: which === "agenda" ? !settings.agendaEnabled : !settings.enabled });
  const paused = pausedNow(settings, new Date(now));
  async function reopen() {
    setBusy(true);
    await runWithToast(toast, () => reopenOnline(), "Richieste online riaperte");
    setBusy(false);
    router.refresh();
  }

  // «Annulla» nel messaggio «✓ Segnata…»: la prenotazione appena segnata sparisce.
  async function undoSaved(info: SavedInfo) {
    setJustSaved(null);
    try {
      const res = await undoNewBooking(info.id);
      if (res.ok) toast.showSuccess(`Tolta: ${info.name}`);
      else toast.showError(res.error);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    }
  }
  async function queueSaved(info: SavedInfo) {
    setJustSaved(null);
    try {
      const res = await markWhatsapp(info.id, "queue");
      if (res.ok) toast.showSuccess("La conferma la manda il telefono enoteca");
      else toast.showError(res.error);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    }
  }

  function dismissHint() {
    setHintSeen(true);
    remember(PUSH_HINT_KEY);
  }

  // ---------- Barra in alto

  const onlineState = !settings.enabled ? "off" : paused ? "paused" : "on";
  const onlineText = onlineState === "on" ? "accese" : onlineState === "paused" ? `in pausa fino alle ${clock(paused!.getTime())}` : "spente";
  const dot = onlineState === "on" ? "bg-success" : onlineState === "paused" ? "bg-gold" : "bg-foreground-muted/50";
  const statusPill = (
    <StatusPill
      dot={dot}
      text={onlineState === "paused" ? "Online: in pausa" : `Online: ${onlineText}`}
      label={`Richieste online dai clienti: ${onlineText}${isOwner ? ". Tocca per gli interruttori" : ""}`}
      onClick={isOwner ? () => setPanel("impostazioni") : undefined}
    />
  );
  const whoChip = venueDevice ? <WhoChip who={venueDevice.who} onClick={() => setAskWho(true)} /> : null;
  const requestsButton = (
    <button
      type="button"
      onClick={() => setPanel("richieste")}
      aria-label={`Richieste (${todo})${todo ? `: ${requestsSummary(lists)}` : ""}`}
      aria-haspopup="dialog"
      data-testid="pulsante-richieste"
      className={`relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 ring-inset transition-colors sm:gap-2 sm:px-3.5 ${
        todo ? "bg-accent/10 text-foreground ring-accent/45 hover:ring-accent" : "bg-surface text-foreground-muted ring-border hover:text-foreground hover:ring-accent"
      }`}
    >
      <InboxIcon className={`max-sm:hidden ${todo ? "text-accent-ink" : ""}`} />
      <span className="max-[374px]:sr-only">Richieste</span>
      <span
        aria-hidden
        className={`min-w-[1.375rem] rounded-full px-1.5 text-center text-xs font-bold leading-[1.375rem] tabular-nums ${todo ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground-muted"}`}
      >
        {todo}
      </span>
      {lists.wa.length > 0 && canWhatsapp && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[#1f9d55] ring-2 ring-background" />}
    </button>
  );
  const addButton = (
    <button
      type="button"
      onClick={() => newBooking(agendaDay >= today ? agendaDay : today)}
      aria-label="Nuova prenotazione"
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-[0_6px_16px_-8px_var(--accent-glow)] hover:bg-accent-hover"
    >
      <span aria-hidden className="text-lg leading-none">
        +
      </span>
      Prenotazione
    </button>
  );
  const moreItems: MenuItem[] = [
    {
      kind: "header",
      node: (
        // Sul telefono lo stato delle richieste online sta qui (nella barra non c'è posto).
        <div className="mb-1 flex items-center justify-between gap-2 border-b border-border px-3 pb-2.5 pt-1.5 md:hidden">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            Richieste online {onlineText}
          </span>
        </div>
      ),
    },
    { label: "Importa dal librone", hint: "Tante prenotazioni insieme", icon: <BookIcon />, onSelect: openImport },
    { label: "Cerca", hint: "Anche le prenotazioni passate", icon: <SearchIcon />, onSelect: () => setPanel("cerca") },
    { label: "Numeri", hint: "Quante, da dove, quanti non venuti", icon: <ChartIcon />, onSelect: () => setPanel("numeri") },
    { label: `Avvisi su questo ${device}`, hint: push.state === "on" ? "Attivi" : "Spenti", icon: <BellIcon />, onSelect: () => setPanel("avvisi") },
    ...(isOwner
      ? ([
          { kind: "separator" },
          { label: "Impostazioni", hint: "Interruttori, orari prenotabili, WhatsApp", icon: <SlidersIcon />, onSelect: () => setPanel("impostazioni"), testId: "menu-impostazioni" },
          { kind: "link", label: "Prova la pagina dei clienti", icon: <EyeIcon />, href: "/menu/prenota", external: true },
        ] as MenuItem[])
      : []),
  ];
  const more = <MoreMenu label="Altre azioni" items={moreItems} />;

  return (
    <WaContext.Provider value={wa}>
      <div className="app-wide mx-auto max-w-6xl">
        <h1 className="sr-only">Prenotazioni</h1>

        {preview && (
          <p role="status" className="mb-3 rounded-xl border border-danger/30 bg-danger-bg px-3.5 py-2 text-sm text-foreground">
            <span className="font-semibold text-danger">Anteprima di prova del sito.</span> Le prenotazioni vere si guardano ma si cambiano solo dal sito vero.
          </p>
        )}

        {/* Agenda spenta (in prova): una riga sola, chiara. */}
        {!settings.agendaEnabled && (
          <div role="status" data-testid="agenda-in-prova" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-gold/12 px-3.5 py-2 ring-1 ring-inset ring-gold/35">
            <p className="min-w-0 flex-1 text-sm text-foreground">
              <span className="font-semibold">Agenda in prova: quello che segni non è vero.</span>{" "}
              <span className="text-foreground-muted max-sm:block">{isOwner ? "La vedi solo tu e non avvisa nessuno." : "Non conta e non avvisa nessuno."}</span>
            </p>
            {isOwner && (
              <button type="button" disabled={busy} onClick={() => askToggle("agenda")} className="min-h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
                Accendi l&apos;agenda
              </button>
            )}
          </div>
        )}

        {settings.enabled && paused && (
          <div role="status" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-gold/12 px-3.5 py-2 ring-1 ring-inset ring-gold/35">
            <p className="min-w-0 flex-1 text-sm text-foreground">
              <span className="font-semibold">Richieste online in pausa fino alle {clock(paused.getTime())}.</span>{" "}
              <span className="text-foreground-muted">Troppe richieste in pochi minuti: i clienti vedono «chiamaci».</span>
            </p>
            {isOwner && (
              <button type="button" disabled={busy} onClick={reopen} className="min-h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
                Riapri ora
              </button>
            )}
          </div>
        )}

        {/* Avvisi: un suggerimento piccolo, una volta sola su questo dispositivo (poi in ⋯). */}
        {!hintSeen && (push.state === "off" || push.state === "ios-install") && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-surface px-3.5 py-1.5 ring-1 ring-inset ring-border" data-testid="suggerimento-avvisi">
            <BellIcon className="shrink-0 text-gold" />
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground sm:text-sm">{push.state === "ios-install" ? "Per gli avvisi serve l'app sulla schermata Home." : "Vuoi un avviso qui quando arriva una richiesta?"}</p>
            {push.state === "ios-install" ? (
              <Link href="/installa" onClick={dismissHint} className="flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-accent-ink hover:bg-accent/10">
                Come si fa
              </Link>
            ) : (
              <button
                type="button"
                disabled={push.busy}
                onClick={() => {
                  dismissHint();
                  push.activate();
                }}
                className="min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-accent-ink hover:bg-accent/10 disabled:opacity-60"
              >
                Attiva
              </button>
            )}
            <button type="button" onClick={dismissHint} aria-label={`Non ora: lo trovi in ⋯ → Avvisi su questo ${device}`} title="Non ora" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-2 hover:text-foreground">
              <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
        )}

        {/* Telefono enoteca: «Chi sei?» sopra la barra (sul tablet e sul computer sta nella barra). */}
        {whoChip && <div className="mb-2 md:hidden">{whoChip}</div>}

        <AgendaCalendar
          today={today}
          now={now}
          version={serverNow}
          settings={settings}
          hours={hours}
          countTests={!settings.agendaEnabled}
          isOwner={isOwner}
          phoneUA={phoneUA}
          busy={busy}
          onOpen={open}
          onNew={newBooking}
          onImport={openImport}
          onCloseRequests={requestClose}
          onReopenRequests={(d) => closeDay(d, false)}
          onDayChange={setAgendaDay}
          jump={jump}
          bar={{ status: statusPill, who: whoChip, requests: requestsButton, add: addButton, more }}
        />

        {/* Telefono: il «+» tondo in basso a destra, sopra la barra di navigazione. */}
        {!justSaved && (
          <button
            type="button"
            onClick={() => newBooking(agendaDay >= today ? agendaDay : today)}
            aria-label="Nuova prenotazione"
            title="Nuova prenotazione"
            className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_10px_24px_-8px_var(--accent-glow),0_4px_10px_rgb(0_0_0/0.25)] hover:bg-accent-hover md:hidden [body:has(.brand-band-bar-bottom)_&]:bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
          >
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}

        {panel === "richieste" && <RequestsPanel lists={lists} wa={wa} now={now} today={today} pushOn={push.state === "on"} onOpen={open} onClose={() => setPanel(null)} />}

        {panel === "cerca" && <SearchSheet rows={rows} archive={lists.archive} now={now} today={today} onOpen={open} onClose={() => setPanel(null)} />}

        {panel === "numeri" && <NumbersSheet stats={stats} onClose={() => setPanel(null)} />}

        {panel === "avvisi" && (
          <Sheet title={`Avvisi su questo ${device}`} onClose={() => setPanel(null)}>
            <div className="space-y-3" data-unsaved-ignore>
              <PushBox push={push} arrives={arrivesText(wa)} />
              <WhatsappInfoBox wa={wa} />
            </div>
          </Sheet>
        )}

        {panel === "impostazioni" && isOwner && (
          <SettingsSheet devices={devices} venueExists={wa.venueExists} settings={settings} mailReady={mailReady} googleLink={googleLink} busy={busy} onToggle={askToggle} onReopen={reopen} onClose={() => setPanel(null)} />
        )}

        {loadingOpened && (
          <Sheet title="Prenotazione" onClose={() => setOpenId(null)}>
            <p className="text-sm text-foreground-muted" aria-busy="true">
              Un attimo…
            </p>
          </Sheet>
        )}
        {openId && !loadingOpened && (
          <BookingSheet
            key={sheetKey}
            booking={opened}
            rows={rows}
            countTests={!settings.agendaEnabled}
            now={now}
            today={today}
            settings={settings}
            hours={hours}
            fullDays={fullDays}
            canWhatsapp={canWhatsapp}
            isOwner={isOwner}
            next={next}
            onOpen={open}
            onClose={() => setOpenId(null)}
            onWaOpened={noteWaOpened}
            onEdit={(bk) => {
              setOpenId(null);
              setForm({ booking: bk, day: bk.day, key: Date.now() });
            }}
          />
        )}

        {form && (
          <BookingForm
            key={form.key}
            booking={form.booking}
            initialDay={form.day}
            today={today}
            settings={settings}
            hours={hours}
            canWhatsapp={canWhatsapp}
            confirmed={lists.confirmed}
            countTests={!settings.agendaEnabled}
            menus={menus}
            onClose={() => setForm(null)}
            onShow={(id) => {
              setForm(null);
              open(id);
            }}
            onSaved={(info) => {
              setForm(null);
              setJustSaved(info);
            }}
          />
        )}

        {showImport && <ImportSheet now={now} testMode={!settings.agendaEnabled} onClose={() => setShowImport(false)} />}

        {justSaved && (
          <SavedBar
            key={justSaved.id}
            info={justSaved}
            canWhatsapp={wa.role === "send"}
            onUndo={() => undoSaved(justSaved)}
            onQueue={() => queueSaved(justSaved)}
            onOpen={() => {
              setJustSaved(null);
              open(justSaved.id);
            }}
            onClose={() => setJustSaved(null)}
          />
        )}

        {askWho && venueDevice && <WhoPicker choices={venueDevice.choices} current={venueDevice.who} onClose={() => setAskWho(false)} />}

        {askSwitch && (
          <ConfirmSheet
            title={
              askSwitch.which === "agenda"
                ? askSwitch.on
                  ? "Accendere l'agenda?"
                  : "Spegnere l'agenda?"
                : askSwitch.on
                  ? "Accendere le richieste online?"
                  : "Spegnere le richieste online?"
            }
            confirmLabel={askSwitch.on ? "Accendi" : "Spegni"}
            danger={!askSwitch.on}
            busy={busy}
            onConfirm={() => applySwitch(askSwitch.which, askSwitch.on)}
            onCancel={() => setAskSwitch(null)}
          >
            {askSwitch.which === "agenda" ? (
              askSwitch.on ? (
                <p>I dipendenti con il permesso vedono «Prenotazioni» nel menù e segnano le prenotazioni al telefono. Da adesso sono prenotazioni vere. I clienti non possono ancora chiedere un tavolo dal sito.</p>
              ) : (
                <>
                  <p>I dipendenti non vedranno più le prenotazioni e quello che segni tornerà «di prova».</p>
                  {settings.enabled && <p>Si spengono anche le richieste online dai clienti.</p>}
                </>
              )
            ) : askSwitch.on ? (
              <>
                <p>I clienti potranno chiedere un tavolo dal menù, dagli eventi e dal link per Google. Le richieste arrivano in «Richieste» e vanno confermate una per una.</p>
                {!settings.agendaEnabled && <p>Si accende anche l&apos;agenda per i dipendenti con il permesso.</p>}
                {push.state !== "on" && <p>Consiglio: attiva anche gli avvisi su questo {device} (⋯ → Avvisi su questo {device}).</p>}
              </>
            ) : (
              <p>I clienti non vedranno più la pagina per chiedere un tavolo. L&apos;agenda resta accesa: le prenotazioni al telefono si segnano come sempre, e alle richieste già arrivate puoi ancora rispondere.</p>
            )}
          </ConfirmSheet>
        )}

        {askTests && (
          <TestsDialog
            tests={askTests.tests}
            keepable={askTests.keepable}
            busy={busy}
            onDelete={() => applySwitch(askTests.which, askTests.on, "delete")}
            onKeep={() => applySwitch(askTests.which, askTests.on, "keep")}
            onCancel={() => setAskTests(null)}
          />
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
    </WaContext.Provider>
  );
}

// «● Online: accese»: lo stato delle richieste dal sito, piccolo; per il titolare apre gli interruttori.
function StatusPill({ dot, text, label, onClick }: { dot: string; text: string; label: string; onClick?: () => void }) {
  const cls = "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full bg-surface px-3 text-xs font-semibold text-foreground ring-1 ring-inset ring-border";
  const body = (
    <>
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label} title={label} data-testid="stato-online" className={`${cls} min-h-11 hover:ring-accent`}>
      {body}
    </button>
  ) : (
    <span role="status" aria-label={label} title={label} data-testid="stato-online" className={cls}>
      {body}
    </span>
  );
}

// «Sei Marta · cambia» sul telefono enoteca (o «Chi sei?» se nessuno l'ha detto).
function WhoChip({ who, onClick }: { who: string | null; onClick: () => void }) {
  return who ? (
    <button
      type="button"
      onClick={onClick}
      data-testid="chi-sei"
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-surface py-1 pl-1.5 pr-3.5 text-sm text-foreground ring-1 ring-inset ring-border hover:ring-accent"
      aria-label={`Sei ${who}: tocca per cambiare`}
    >
      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
        {who.charAt(0)}
      </span>
      <span className="truncate">
        Sei <strong>{who}</strong>
      </span>
      <span className="shrink-0 text-xs font-semibold text-accent-ink md:max-xl:hidden">cambia</span>
    </button>
  ) : (
    <button type="button" onClick={onClick} data-testid="chi-sei" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold/15 px-4 text-sm font-semibold text-foreground ring-1 ring-inset ring-gold/45 hover:ring-gold">
      <span aria-hidden className="h-2 w-2 rounded-full bg-gold" />
      Chi sei?<span className="md:max-xl:hidden"> Scegli il tuo nome</span>
    </button>
  );
}

function BookIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M9 8h7M9 11.5h5" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 20V11M12 20V4M19 20v-6" />
    </svg>
  );
}
function SlidersIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Dopo «Segna in agenda»: niente schermata con «Fatto», il foglio si chiude e resta questo messaggio
// in basso per qualche secondo, con «Annulla» (toglie la prenotazione appena segnata) e, se si può,
// «Manda conferma» su WhatsApp.
function SavedBar({
  info,
  canWhatsapp,
  onUndo,
  onQueue,
  onOpen,
  onClose,
}: {
  info: SavedInfo;
  canWhatsapp: boolean;
  onUndo: () => void;
  onQueue: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (hover) return;
    const t = setTimeout(() => closeRef.current(), 12000);
    return () => clearTimeout(t);
  }, [hover]);
  const btn = "flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold";
  return (
    <div
      role="status"
      aria-live="polite"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg md:bottom-4 rounded-2xl border border-success/30 bg-surface p-3 shadow-2xl"
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="block text-[15px] font-semibold text-success">✓ Segnata: {info.summary}</span>
        {info.isTest && <span className="block text-xs text-foreground-muted">Di prova: l&apos;agenda è spenta.</span>}
        {!info.phone && <span className="block text-xs text-foreground-muted">Manca il numero: lo aggiungi dopo con «Modifica».</span>}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onUndo} className={`${btn} border border-border text-foreground hover:border-danger hover:text-danger`}>
          Annulla
        </button>
        {info.whatsappHref &&
          (canWhatsapp ? (
            <a
              href={info.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                // Stessa coda condivisa: si prende in mano (cronologia «in invio…») e si apre WhatsApp.
                e.preventDefault();
                const win = window.open("", "_blank");
                markWhatsapp(info.id, "opened", { device: deviceId() })
                  .then((r) => {
                    if (r.ok && r.data.ok) {
                      if (win) win.location.href = info.whatsappHref!;
                      else window.location.href = info.whatsappHref!;
                    } else win?.close();
                  })
                  .catch(() => win?.close());
                onClose();
              }}
              className={`${btn} gap-1.5 bg-[#137a43] text-white hover:bg-[#0f6837]`}
            >
              <WhatsappIcon className="h-4 w-4" /> Manda conferma
            </a>
          ) : (
            <button type="button" onClick={onQueue} className={`${btn} border border-[#137a43]/40 text-[#137a43] hover:bg-[#137a43]/10 dark:text-[#3fae74]`}>
              Falla mandare dal telefono enoteca
            </button>
          ))}
        <button type="button" onClick={onClose} aria-label="Chiudi il messaggio" className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-foreground-muted hover:text-foreground">
          ✕
        </button>
      </div>
    </div>
  );
}

// «Chi sei?» sul telefono enoteca: un tocco sul nome (prima chi è in turno oggi). Vale qualche ora.
function WhoPicker({ choices, current, onClose }: { choices: { id: string; name: string; onShift: string | null }[]; current: string | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function pick(id: string) {
    setBusy(true);
    try {
      const res = await chooseVenueWho(id);
      if (!res.ok) toast.showError(res.error);
      else {
        toast.showSuccess(`Ciao ${res.data.name}: quello che segni porta il tuo nome`);
        onClose();
      }
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }
  const onShift = choices.filter((c) => c.onShift);
  const others = choices.filter((c) => !c.onShift);
  const btn = (c: (typeof choices)[number]) => (
    <li key={c.id}>
      <button
        type="button"
        disabled={busy}
        onClick={() => pick(c.id)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left ring-1 ring-inset hover:ring-accent disabled:opacity-60 ${current === c.name ? "bg-accent/10 ring-accent/50" : "bg-surface ring-border"}`}
      >
        <span className="text-[15px] font-semibold text-foreground">{c.name}</span>
        {c.onShift && <span className="text-xs tabular-nums text-foreground-muted">{c.onShift}</span>}
      </button>
    </li>
  );
  return (
    <Sheet title="Chi sei?" onClose={onClose}>
      <div className="space-y-4" data-testid="chi-sei-scelta" data-unsaved-ignore>
        <p className="text-sm text-foreground-muted">Questo è il telefono enoteca: scegli il tuo nome. Quello che segni o mandi da qui porta il tuo nome, per qualche ora.</p>
        {onShift.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">In turno oggi</h3>
            <ul className="space-y-1.5">{onShift.map(btn)}</ul>
          </section>
        )}
        {others.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">{onShift.length ? "Gli altri" : "Tutti"}</h3>
            <ul className="space-y-1.5">{others.map(btn)}</ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}

// All'accensione dell'agenda o delle richieste online, se ci sono prenotazioni di prova.
export function TestsDialog({ tests, keepable, busy, onDelete, onKeep, onCancel }: { tests: number; keepable: number; busy: boolean; onDelete: () => void; onKeep: () => void; onCancel: () => void }) {
  const title = tests === 1 ? "C'è 1 prenotazione di prova: cancellarla?" : `Ci sono ${tests} prenotazioni di prova: cancellarle?`;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={() => !busy && onCancel()}>
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          role="alertdialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-left shadow-2xl sm:rounded-2xl sm:pb-5"
        >
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <div className="mt-2 space-y-2 text-sm text-foreground-muted">
            <p>Sono quelle segnate o chieste mentre provavi: non contano e non avvisano nessuno.</p>
            <p>
              {keepable > 0
                ? `«Tienile e rendile vere»: ${keepable === 1 ? "diventa vera quella segnata" : `diventano vere le ${keepable} segnate`} a mano per oggi o i prossimi giorni (non annullate); le altre prove si cancellano.`
                : "Nessuna è una prenotazione segnata a mano per oggi o i prossimi giorni: conviene cancellarle."}
            </p>
          </div>
          <div className="mt-5 grid gap-2">
            <button type="button" disabled={busy} onClick={onDelete} className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">
              {busy ? "Un attimo…" : "Cancella le prove"}
            </button>
            {keepable > 0 && (
              <button type="button" disabled={busy} onClick={onKeep} className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:border-accent disabled:opacity-50">
                Tienile e rendile vere
              </button>
            )}
            <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg px-4 text-sm font-medium text-foreground-muted hover:text-foreground disabled:opacity-50">
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
