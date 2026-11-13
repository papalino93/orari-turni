"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { runWithToast, showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { addDays, agendaTotals, availability, dayLong, isIncomplete, missingText, pausedNow, peopleText, SOURCE_LABEL, switchesText, tableText, type BookingSettings } from "@/lib/booking/rules";
import { whatsappPending } from "@/lib/booking/whatsapp-queue";
import type { MessageKind } from "@/lib/booking/messages";
import type { Hours } from "@/lib/menu-venue";
import { chooseVenueWho, markWhatsapp, reopenOnline, setArrival, setBookingSwitch, setDayClosed, setPushLocalPhone, undoNewBooking } from "./actions";
import { WaContext, WhatsappButton, PERSONAL_WARNING, type WaInfo } from "./wa-send";
import { activeClaim, lastSent } from "@/lib/booking/whatsapp-queue";
import { ALLERGY_TEXT, BookingSheet, StatusChip, TestChip } from "./booking-sheet";
import { SettingsSheet } from "./settings-sheet";
import { arrivesText, BellIcon, PushBox, usePush, WhatsappIcon, WhatsappInfoBox } from "./device";
import { clock, dayLabel, duration, originShort, phoneDisplay, REPLY_SHORT, replyHref, sourceText, telLink, viewOf } from "./format";
import { BookingForm, type SavedInfo } from "./agenda";
import { AgendaCalendar } from "./calendar";
import { ImportSheet } from "./import-sheet";
import { centerInRow, edgeFade } from "@/lib/edge-fade";
import type { BookingItem, BookingStatsData } from "./types";

type Tab = "todo" | "tonight" | "agenda" | "next" | "archive" | "numbers";
const PUSH_LATER_KEY = "prenotazioni-avvisi-non-ora";
const IOS_LATER_KEY = "prenotazioni-iphone-non-ora";

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
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(serverNow);
  // Dalla notifica: /prenotazioni?r=<id> apre subito il foglio di quella richiesta.
  const [openId, setOpenId] = useState<string | null>(openRequest);
  const [sheetKey, setSheetKey] = useState(0);
  const [askedFor, setAskedFor] = useState(openRequest);
  if (openRequest !== askedFor) {
    setAskedFor(openRequest);
    if (openRequest) {
      setOpenId(openRequest);
      setSheetKey((k) => k + 1);
    }
  }
  // Poi l'indirizzo torna pulito, così ricaricando la pagina il foglio non si riapre.
  useEffect(() => {
    if (!openRequest) return;
    try {
      window.history.replaceState(window.history.state, "", "/prenotazioni");
    } catch {
      /* resta l'indirizzo con ?r= */
    }
  }, [openRequest]);
  const [showSettings, setShowSettings] = useState(false);
  // Agenda: il giorno mostrato e il foglio «Nuova prenotazione» / «Modifica» (booking null = nuova).
  const [agendaDay, setAgendaDay] = useState(today);
  const [form, setForm] = useState<{ booking: BookingItem | null; day: string; key: number } | null>(null);
  const [showDevice, setShowDevice] = useState(false);
  // «Importa dal librone»: tante prenotazioni insieme da una lista incollata.
  const [showImport, setShowImport] = useState(false);
  // Un interruttore toccato (da confermare) e, dopo, la domanda sulle prenotazioni di prova.
  const [askSwitch, setAskSwitch] = useState<{ which: "agenda" | "online"; on: boolean } | null>(null);
  const [askTests, setAskTests] = useState<{ which: "agenda" | "online"; on: boolean; tests: number; keepable: number } | null>(null);
  // Appena segnata dal foglio «Nuova prenotazione»: «✓ Segnata: Rossi, sab 20:30, 4 persone» con «Annulla».
  const [justSaved, setJustSaved] = useState<SavedInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [askClose, setAskClose] = useState<{ day: string; pending: number } | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const push = usePush(pushConfig.publicKey, pushConfig.myEndpoints);
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
  const [pushLater, setPushLater] = useState(true);
  const [iosLater, setIosLater] = useState(true);
  // Il pulsante verde c'è per chi manda e, con «Mandalo io dal mio WhatsApp», per titolare e consulente.
  const canWhatsapp = wa.role !== "none";
  // Risposte aperte in WhatsApp da questa pagina: restano nella lista con «Aperto alle…» finché la pagina resta aperta.
  const [waOpened, setWaOpened] = useState<Record<string, { at: number; kind: MessageKind }>>({});
  const noteWaOpened = useCallback((id: string, kind: MessageKind) => setWaOpened((m) => ({ ...m, [id]: { at: Date.now(), kind } })), []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage non c'è al primo disegno sul server
      setPushLater(localStorage.getItem(PUSH_LATER_KEY) === "1");
      setIosLater(localStorage.getItem(IOS_LATER_KEY) === "1");
    } catch {
      setPushLater(false);
      setIosLater(false);
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
      .map((b) => ({ b, kind: whatsappPending(b, now), openedAt: null as number | null }))
      .filter((x): x is { b: BookingItem; kind: MessageKind; openedAt: number | null } => x.kind !== null)
      .sort((a, b) => a.b.startsAt - b.b.startsAt);
    // Quelle appena aperte in WhatsApp da qui: restano visibili, con «Aperto alle…» e «Riapri».
    const waIds = new Set(wa.map((x) => x.b.id));
    // Mandate da poco (da chiunque): restano in fondo, chiare, con «Mandato da … alle …».
    const waDone = rows
      .filter((b) => !waIds.has(b.id))
      .map((b) => ({ b, sent: lastSent(b) }))
      .filter((x): x is { b: BookingItem; sent: { by: string; at: number } } => x.sent !== null && now - x.sent.at < 30 * 60000 && x.sent.at <= now + 60000)
      .map((x) => ({ b: x.b, kind: (waOpened[x.b.id]?.kind ?? "confirmed") as MessageKind, openedAt: x.sent.at, by: x.sent.by }))
      .sort((a, b) => b.openedAt - a.openedAt);
    const tonight = live.filter((x) => x.v === "CONFIRMED" && x.b.day === today).map((x) => x.b);
    const tonightPending = live.filter((x) => x.v === "PENDING" && x.b.day === today).map((x) => x.b);
    const confirmed = live.filter((x) => x.v === "CONFIRMED").map((x) => x.b);
    // Annullate che erano in agenda (segnate a mano o confermate): restano barrate in fondo al giorno.
    const cancelled = rows.filter((b) => b.status === "CANCELLED" && (b.manual || b.log.some((l) => l.kind === "CONFIRMED" || l.kind === "ACCEPTED")));
    const upcoming = live.filter((x) => x.v === "CONFIRMED" && x.b.day > today).map((x) => x.b);
    // Prenotazioni vere con ora o persone ancora da definire, da oggi in poi (le prove no, con l'agenda accesa).
    const incomplete = live
      .filter((x) => x.v === "CONFIRMED" && x.b.day >= today && isIncomplete(x.b) && (!settings.agendaEnabled || !x.b.isTest))
      .map((x) => x.b)
      .sort((a, b) => a.startsAt - b.startsAt);
    const archive = live
      .filter((x) => x.v === "DECLINED" || x.v === "CANCELLED" || x.v === "EXPIRED" || (x.v === "CONFIRMED" && x.b.day < today))
      .map((x) => x.b)
      .sort((a, b) => b.startsAt - a.startsAt);
    return { pending, proposed, wa, waDone, tonight, tonightPending, confirmed, cancelled, upcoming, archive, incomplete };
  }, [rows, now, today, waOpened, settings.agendaEnabled]);

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

  // Si apre sull'agenda (è il «librone»); solo se c'è un messaggio WhatsApp da mandare si parte da «Da gestire».
  // Le richieste da confermare restano in vista con la fascia sopra l'agenda.
  const [tab, setTab] = useState<Tab>(() => (lists.wa.length ? "todo" : "agenda"));
  // Sul telefono la riga delle schede scorre di lato: bordi sfumati da dove c'è altro
  // e la scheda scelta sempre in vista (niente «enda» o pallino tagliati a metà).
  const tabRow = useRef<HTMLDivElement | null>(null);
  const tabRowRef = useCallback((el: HTMLDivElement | null) => {
    tabRow.current = el;
    const stop = edgeFade(el);
    return () => {
      stop?.();
      tabRow.current = null;
    };
  }, []);
  useEffect(() => {
    const row = tabRow.current;
    centerInRow(row, row?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null, true);
  }, [tab, searching]);

  // Una prenotazione aperta dall'agenda ma fuori da quelle caricate dalla pagina (più vecchia di 30
  // giorni): si legge intera, con la cronologia.
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
  const opened = openId ? (rows.find((r) => r.id === openId) ?? (fetched?.id === openId ? fetched.booking : null)) : null;
  const loadingOpened = Boolean(openId && !opened && fetched?.id === openId && fetched.booking === null && !rows.some((r) => r.id === openId));
  const next = lists.pending.find((b) => b.id !== openId) ?? null;

  const todayClosed = fullDays.includes(today);
  // La fascia di stasera solo finché oggi si può ancora chiedere un tavolo online: dopo, non serve più.
  const todayOpen = availability(today, hours, settings, null, new Date(now)).state === "open";

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

  const q = query.trim().toLowerCase();
  const results = q
    ? rows
        .filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.code.toLowerCase().includes(q) ||
            (b.menu ?? "").toLowerCase().includes(q) ||
            (q.replace(/\D/g, "").length >= 3 && b.phone.includes(q.replace(/\D/g, ""))),
        )
        .sort((a, b) => b.startsAt - a.startsAt)
    : [];

  // Come il pallino del menù in alto e Impostazioni: solo le richieste da confermare.
  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "agenda", label: "Agenda" },
    { id: "todo", label: "Da gestire", count: lists.pending.length + lists.incomplete.length },
    { id: "tonight", label: "Stasera", count: lists.tonight.length },
    { id: "next", label: "Prossimi giorni" },
    { id: "archive", label: "Archivio" },
    { id: "numbers", label: "Numeri" },
  ];

  return (
    <WaContext.Provider value={wa}>
    <div className="app-wide mx-auto max-w-6xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Prenotazioni</h1>
          <p className="mt-1 text-sm text-foreground-muted">Le richieste dal sito e l&apos;agenda di tutte le prenotazioni, anche quelle al telefono.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton label="Cerca" active={searching} onClick={() => (searching ? (setSearching(false), setQuery("")) : setSearching(true))}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </IconButton>
          <IconButton label="Avvisi e WhatsApp su questo telefono" onClick={() => setShowDevice(true)} dot={push.state === "on"}>
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

      {venueDevice && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="chi-sei">
          {venueDevice.who ? (
            <button
              type="button"
              onClick={() => setAskWho(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface px-3.5 text-sm text-foreground ring-1 ring-inset ring-border hover:ring-accent"
              aria-label={`Sei ${venueDevice.who}: tocca per cambiare`}
            >
              <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                {venueDevice.who.charAt(0)}
              </span>
              Sei <strong>{venueDevice.who}</strong> · <span className="text-accent-ink underline decoration-dotted underline-offset-2">cambia</span>
            </button>
          ) : (
            <button type="button" onClick={() => setAskWho(true)} className="min-h-11 rounded-full bg-gold/15 px-4 text-sm font-semibold text-foreground ring-1 ring-inset ring-gold/40">
              Chi sei? Tocca qui e scegli il tuo nome
            </button>
          )}
          <span className="text-xs text-foreground-muted">Telefono enoteca: quello che segni porta il tuo nome.</span>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => newBooking(tab === "agenda" && agendaDay >= today ? agendaDay : today)}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-foreground shadow-sm hover:bg-accent-hover sm:w-auto"
        >
          + Nuova prenotazione
        </button>
        <button
          type="button"
          onClick={() => {
            setJustSaved(null);
            setShowImport(true);
          }}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground hover:border-accent sm:min-h-12 sm:w-auto"
        >
          Importa dal librone
        </button>
      </div>

      {preview && (
        <p role="status" className="mb-4 rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-foreground">
          <span className="font-semibold text-danger">Anteprima di prova del sito.</span> Le prenotazioni vere si guardano ma si cambiano solo dal sito vero.
        </p>
      )}

      {/* I due interruttori in una riga: chi guarda sa subito se l'agenda conta e se i clienti possono chiedere. */}
      {(!settings.agendaEnabled || !settings.enabled || isOwner) && (
        <div
          role="status"
          className={`mb-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center ${settings.agendaEnabled ? "border-border bg-surface" : "border-gold/40 bg-gold/10"}`}
        >
          <p className="flex-1 text-sm text-foreground">
            <span className="font-semibold">{switchesText(settings)}</span>
            <span className="block text-foreground-muted">
              {!settings.agendaEnabled
                ? isOwner
                  ? "Solo tu vedi le prenotazioni: quello che segni e le richieste che provi sono di prova e non avvisano nessuno."
                  : "Quello che segni è di prova."
                : !settings.enabled
                  ? "Le prenotazioni segnate qui sono vere. I clienti non possono chiedere un tavolo dal sito."
                  : "Le prenotazioni segnate qui sono vere e i clienti possono chiedere un tavolo dal sito."}
            </span>
          </p>
          {isOwner && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {!settings.enabled && (
                <a
                  href="/menu/prenota"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground hover:border-accent"
                >
                  Prova la pagina ↗
                </a>
              )}
              {!settings.agendaEnabled ? (
                <button type="button" disabled={busy} onClick={() => askToggle("agenda")} className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
                  Accendi l&apos;agenda
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => setShowSettings(true)} className="min-h-11 rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground hover:border-accent">
                  Interruttori
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {settings.enabled && paused && (
        <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-foreground">
            <span className="font-semibold">Richieste online in pausa automatica fino alle {clock(paused.getTime())}.</span>{" "}
            <span className="text-foreground-muted">Sono arrivate troppe richieste in pochi minuti: i clienti vedono «chiamaci».</span>
          </p>
          {isOwner && (
            <button type="button" disabled={busy} onClick={reopen} className="min-h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
              Riapri ora
            </button>
          )}
        </div>
      )}

      {push.state === "ios-install" && !iosLater && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2 text-sm text-foreground">
            <BellIcon className="mt-0.5 shrink-0 text-gold" /> Su iPhone gli avvisi arrivano solo con l&apos;app sulla schermata Home.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setIosLater(true);
                remember(IOS_LATER_KEY);
              }}
              className="min-h-11 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Non ora
            </button>
            <Link href="/installa" className="flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
              Come si fa
            </Link>
          </div>
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
                remember(PUSH_LATER_KEY);
              }}
              className="min-h-11 rounded-full border border-border px-4 text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Non ora
            </button>
            <button type="button" disabled={push.busy} onClick={push.activate} className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
              {push.busy ? "Un attimo…" : "Attiva gli avvisi"}
            </button>
          </div>
        </div>
      )}

      {/* Stasera: chiudere le richieste con un tocco quando il locale è pieno. */}
      {todayOpen && settings.enabled && !paused && (
        <div
          className={`mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border px-4 py-2.5 ${todayClosed ? "border-danger/30 bg-danger-bg" : "border-border bg-surface"}`}
        >
          <p className="min-w-0 text-sm text-foreground">
            {todayClosed ? (
              <span className="font-semibold text-danger">Stasera al completo: niente più richieste online.</span>
            ) : (
              <>
                <span className="font-semibold">Stasera</span>{" "}
                <span className="text-foreground-muted">
                  · {lists.tonight.length ? agendaTotals(lists.tonight.filter((b) => !settings.agendaEnabled || !b.isTest)).text : "nessuna prenotazione"} · si accettano richieste online
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
            {todayClosed ? "Riapri le richieste" : "Stasera siamo al completo"}
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
          <div ref={tabRowRef} role="tablist" aria-label="Prenotazioni" className="relative -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] max-sm:scroll-fade-x sm:mx-0 sm:px-0">
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
                {(lists.wa.length > 0 || lists.waDone.length > 0) && (
                  <section aria-labelledby="wa-titolo" className="rounded-2xl border border-[#137a43]/30 bg-[#137a43]/[0.06] p-4">
                    <h2 id="wa-titolo" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <WhatsappIcon className="text-[#137a43] dark:text-[#3fae74]" /> Da mandare su WhatsApp ({lists.wa.length})
                    </h2>
                    {canWhatsapp ? (
                      <>
                        <p className="mt-0.5 text-xs text-foreground-muted">
                          {wa.role === "override"
                            ? "Le manda il telefono enoteca. Se serve, puoi mandarne una tu con «Mandalo io»."
                            : "Il pulsante verde apre WhatsApp con il messaggio già scritto: tocca Invia, poi «Mandato». Chi la prende la vede solo lui: gli altri leggono «In invio da…»."}
                        </p>
                        {!wa.venueDevice && <p className="mt-1 text-xs font-medium text-foreground" data-testid="wa-avviso-personale">{PERSONAL_WARNING}</p>}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-foreground-muted">Le manda il telefono enoteca: qui le vedi soltanto.</p>
                    )}
                    {(lists.wa.length > 0 || lists.waDone.length > 0) && (
                      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface" data-testid="coda-whatsapp">
                        {lists.wa.map(({ b, kind }) => (
                          <WaRow key={b.id} b={b} kind={kind} today={today} now={now} canSend={canWhatsapp} onOpen={open} />
                        ))}
                        {lists.waDone.map(({ b, openedAt, by }) => (
                          <li key={b.id} className="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm text-foreground-muted" data-testid="wa-mandato">
                            <button type="button" onClick={() => open(b.id)} className="min-w-0 flex-1 truncate text-left">
                              <span className="font-semibold text-foreground">{b.name}</span> · Mandato da {by} alle {clock(openedAt)}
                            </button>
                            <span aria-hidden className="text-success">✓</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                <section aria-labelledby="da-confermare-titolo">
                  <h2 id="da-confermare-titolo" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                    Da confermare ({lists.pending.length})
                  </h2>
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

                {lists.incomplete.length > 0 && (
                  <section aria-labelledby="da-completare-titolo" data-testid="da-completare">
                    <h2 id="da-completare-titolo" className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-gold">
                      Da completare ({lists.incomplete.length})
                    </h2>
                    <p className="mb-2 px-1 text-xs text-foreground-muted">Prenotazioni vere con ora o persone ancora da definire: chiedile al cliente e completale.</p>
                    <CardList>
                      {lists.incomplete.map((b) => (
                        <RequestCard key={b.id} b={b} now={now} today={today} onOpen={open} />
                      ))}
                    </CardList>
                  </section>
                )}

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

            {tab === "tonight" && <Tonight rows={lists.tonight} pending={lists.tonightPending} countTests={!settings.agendaEnabled} now={now} today={today} onOpen={open} />}

            {tab === "agenda" && (lists.pending.length > 0 || lists.wa.length > 0 || lists.incomplete.length > 0) && (
              <button
                type="button"
                onClick={() => setTab("todo")}
                className="mb-4 flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-left text-sm font-medium text-foreground hover:border-gold"
              >
                <span>
                  {[
                    lists.pending.length ? `${lists.pending.length} ${lists.pending.length === 1 ? "richiesta online da confermare" : "richieste online da confermare"}` : "",
                    lists.wa.length ? `${lists.wa.length} ${lists.wa.length === 1 ? "messaggio da mandare su WhatsApp" : "messaggi da mandare su WhatsApp"}` : "",
                    lists.incomplete.length ? `${lists.incomplete.length} ${lists.incomplete.length === 1 ? "prenotazione da completare" : "prenotazioni da completare"}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="shrink-0 text-accent">Apri ›</span>
              </button>
            )}
            {tab === "agenda" && (
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
                onCloseRequests={requestClose}
                onReopenRequests={(d) => closeDay(d, false)}
                onDayChange={setAgendaDay}
              />
            )}

            {tab === "next" && (
              <Upcoming rows={lists.upcoming} pending={lists.pending} fullDays={fullDays} today={today} settings={settings} now={now} busy={busy} onOpen={open} onClose={requestClose} onReopen={(d) => closeDay(d, false)} />
            )}

            {tab === "archive" &&
              (lists.archive.length ? (
                <>
                  <p className="mb-2 px-1 text-xs text-foreground-muted">Al completo, annullate, scadute e passate degli ultimi 30 giorni.</p>
                  <CardList>
                    {lists.archive.map((b) => (
                      <RequestCard key={b.id} b={b} now={now} today={today} onOpen={open} showStatus />
                    ))}
                  </CardList>
                </>
              ) : (
                <Empty title="L'archivio è vuoto" text="Qui finiscono le richieste al completo, annullate, scadute e passate degli ultimi 30 giorni." />
              ))}

            {tab === "numbers" && <Numbers stats={stats} />}
          </div>
        </>
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

      {showSettings && isOwner && (
        <SettingsSheet venueExists={wa.venueExists} settings={settings} mailReady={mailReady} googleLink={googleLink} busy={busy} onToggle={askToggle} onReopen={reopen} onClose={() => setShowSettings(false)} />
      )}

      {showDevice && (
        <Sheet title="Avvisi e WhatsApp su questo telefono" onClose={() => setShowDevice(false)}>
          <div className="space-y-3" data-unsaved-ignore>
            <PushBox push={push} arrives={arrivesText(wa)} />
            <WhatsappInfoBox wa={wa} />
          </div>
        </Sheet>
      )}

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
              <p>I clienti potranno chiedere un tavolo dal menù, dagli eventi e dal link per Google. Le richieste arrivano qui e vanno confermate una per una.</p>
              {!settings.agendaEnabled && <p>Si accende anche l&apos;agenda per i dipendenti con il permesso.</p>}
              {push.state !== "on" && <p>Consiglio: attiva anche gli avvisi sul telefono (campanella in alto).</p>}
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

function CardList({ children, single = false }: { children: React.ReactNode; single?: boolean }) {
  return <ul className={`grid grid-cols-[minmax(0,1fr)] gap-2 ${single ? "" : "lg:grid-cols-[repeat(2,minmax(0,1fr))]"}`}>{children}</ul>;
}

// Numero di persone accanto al nome: sul telefono compatto («4» con l'omino), così il nome
// ha spazio; da tablet in su per esteso («4 persone»).
function People({ n, unknown = false }: { n: number; unknown?: boolean }) {
  if (unknown) return <span className="shrink-0 text-sm font-semibold text-gold">persone ?</span>;
  return (
    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
      <span className="inline-flex items-center gap-1 sm:hidden" aria-hidden>
        {n}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </span>
      <span className="max-sm:sr-only">{peopleText(n)}</span>
    </span>
  );
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
        <span className={`flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl px-1 py-2 sm:w-24 ${day === "Oggi" ? "bg-accent/15" : "bg-surface-2"}`}>
          <span className={`text-center text-[11px] font-semibold uppercase leading-tight tracking-wide ${day === "Oggi" ? "text-accent-ink" : "text-foreground-muted"}`}>{day}</span>
          {b.timeUnknown ? (
            <span className="text-center text-[12px] font-semibold leading-tight text-gold">ora da definire</span>
          ) : (
            <span className="text-lg font-semibold tabular-nums leading-tight text-foreground">{v === "PROPOSED" && b.proposedTime ? b.proposedTime : b.time}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:truncate">{b.name}</span>
            <People n={b.people} unknown={b.peopleUnknown} />
          </span>
          {b.note && <span className="mt-0.5 block truncate text-sm text-foreground-muted">«{b.note}»</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {(showStatus || v === "PROPOSED") && <StatusChip b={b} now={now} />}
            {missingText(b) && b.status === "CONFIRMED" && <MissingChip b={b} />}
            {b.menu && <span className="rounded-md bg-gold/10 px-1.5 py-0.5 font-semibold text-gold ring-1 ring-inset ring-gold/25">{b.menu}</span>}
            {b.isTest && <TestChip />}
            {b.allergies && <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">{ALLERGY_TEXT}</span>}
            {v === "PENDING" &&
              (waiting >= 30 ? (
                <span className="font-semibold text-danger">in attesa da {duration(waiting)}</span>
              ) : (
                <span className="text-foreground-muted">arrivata {duration(waiting)} fa</span>
              ))}
            {v === "PROPOSED" && <span className="text-foreground-muted">aveva chiesto le {b.time}</span>}
            {b.table && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-semibold text-accent-ink">{tableText(b.table)}</span>}
            {b.manual ? (
              <span className="text-foreground-muted">{originShort(b)}</span>
            ) : (
              b.source && b.source !== "altro" && <span className="text-foreground-muted">{sourceText(b.source, b.promoTitle)}</span>
            )}
          </span>
        </span>
        <span aria-hidden className="self-center text-foreground-muted">
          ›
        </span>
      </button>
    </li>
  );
}

// Una riga della lista «Da mandare su WhatsApp»: nome · tipo di risposta · giorno e ora, lo stato
// («In invio da Marta…») e il pulsante verde con il lucchetto condiviso.
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
      {href && canSend && <WhatsappButton key={`${b.id}-${b.waClaimAt ?? 0}`} href={href} bookingId={b.id} icon name={b.name} claim={{ by: b.waClaimBy, at: b.waClaimAt }} />}
    </li>
  );
}

function Tonight({
  rows,
  pending,
  countTests,
  now,
  today,
  onOpen,
}: {
  rows: BookingItem[];
  // Richieste di stasera ancora da confermare: in cima, in giallo, per chi guarda solo «Stasera».
  pending: BookingItem[];
  countTests: boolean;
  now: number;
  today: string;
  onOpen: (id: string) => void;
}) {
  const waiting =
    pending.length > 0 ? (
      <section aria-labelledby="stasera-da-confermare" className="mb-4 rounded-2xl border border-gold/40 bg-gold/10 p-3">
        <h2 id="stasera-da-confermare" className="mb-2 px-1 text-sm font-semibold text-foreground">
          Da confermare per stasera ({pending.length})
        </h2>
        <CardList>
          {pending.map((b) => (
            <RequestCard key={b.id} b={b} now={now} today={today} onOpen={onOpen} />
          ))}
        </CardList>
      </section>
    ) : null;
  if (!rows.length)
    return (
      <>
        {waiting}
        <Empty title="Nessuna prenotazione per stasera" text="Le prenotazioni confermate per oggi compaiono qui, in ordine di orario." />
      </>
    );
  // Con l'agenda accesa le prenotazioni di prova restano visibili («Di prova») ma non contano.
  const counted = rows.filter((b) => countTests || !b.isTest);
  const arrived = counted.filter((b) => b.arrivedAt).length;
  return (
    <section aria-label="Stasera">
      {waiting}
      <p className="mb-3 px-1 text-sm text-foreground">
        <span className="font-semibold">Stasera · {agendaTotals(counted).text}</span>
        <span className="text-foreground-muted"> · arrivati {arrived} su {counted.length}</span>
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
  const late = !b.timeUnknown && !b.arrivedAt && !b.noShowAt && b.startsAt < now;
  return (
    <li className={`rounded-2xl border bg-surface p-3 shadow-sm ${b.arrivedAt ? "border-success/30 opacity-80" : b.noShowAt ? "border-border opacity-60" : "border-border"}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => onOpen(b.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className={`w-14 shrink-0 font-semibold tabular-nums ${b.timeUnknown ? "text-sm leading-tight text-gold" : "text-xl text-foreground"}`}>{b.timeUnknown ? "ora ?" : b.time}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:truncate">{b.name}</span>
              <People n={b.people} unknown={b.peopleUnknown} />
            </span>
            {b.note && <span className="mt-0.5 block text-sm text-foreground-muted">«{b.note}»</span>}
            <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {missingText(b) && <MissingChip b={b} />}
              {b.menu && <span className="rounded-md bg-gold/10 px-1.5 py-0.5 font-semibold text-gold ring-1 ring-inset ring-gold/25">{b.menu}</span>}
              {b.table && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-semibold text-accent-ink">{tableText(b.table)}</span>}
              {b.isTest && <TestChip />}
              {b.allergies && <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">{ALLERGY_TEXT}</span>}
              {b.arrivedAt && <span className="font-semibold text-success">✓ Arrivati alle {clock(b.arrivedAt)}</span>}
              {b.noShowAt && <span className="font-semibold text-danger">Non venuti</span>}
              {late && <span className="font-medium text-gold">in ritardo di {duration((now - b.startsAt) / 60000)}</span>}
            </span>
          </span>
        </button>
        {b.phone && (
          <a
            href={telLink(b.phone)}
            aria-label={`Chiama ${b.name}: ${phoneDisplay(b.phone)}`}
            title={`Chiama ${phoneDisplay(b.phone)}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:border-accent"
          >
            <PhoneIcon />
          </a>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {b.arrivedAt || b.noShowAt ? (
          <button type="button" disabled={busy} onClick={() => mark(null)} className="col-span-2 min-h-11 rounded-xl text-sm font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-60">
            Togli il segno
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => mark(true)}
              className={`min-h-11 rounded-xl border border-success/40 text-sm font-semibold text-success hover:bg-success-bg disabled:opacity-60 ${b.startsAt <= now && !b.timeUnknown ? "" : "col-span-2"}`}
            >
              ✓ Arrivati
            </button>
            {b.startsAt <= now && !b.timeUnknown && (
              <button type="button" disabled={busy} onClick={() => mark(false)} className="min-h-11 rounded-xl border border-border text-sm font-medium text-foreground-muted hover:border-danger hover:text-danger disabled:opacity-60">
                Non venuti
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

// «Mancano: ora, persone» in giallo: prenotazione vera da completare.
export function MissingChip({ b }: { b: Pick<BookingItem, "timeUnknown" | "peopleUnknown"> }) {
  return <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold ring-1 ring-inset ring-gold/40">{missingText(b)}</span>;
}

function PhoneIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
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
  const last = addDays(today, settings.daysAhead);
  // Il campo parte dal primo giorno ancora aperto da domani in poi (non «gg/mm/2026» a metà).
  function firstOpen() {
    for (let d = addDays(today, 1); d <= last; d = addDays(d, 1)) if (!fullDays.includes(d)) return d;
    return addDays(today, 1);
  }
  const [picked, setPick] = useState<string | null>(null);
  const pick = picked ?? firstOpen();
  const days = [...new Set([...rows.map((b) => b.day), ...fullDays.filter((d) => d > today)])].sort();
  return (
    // Una sola colonna, larga quanto le schede: il «Chiudi le richieste» di ogni giorno resta
    // vicino al suo giorno e il riquadro sotto non è più largo dell'elenco.
    <div className="max-w-3xl space-y-5">
      {days.length === 0 && <Empty title="Nessuna prenotazione nei prossimi giorni" text="Le prenotazioni confermate da domani in poi compaiono qui, giorno per giorno." />}
      {days.map((day) => {
        const all = rows.filter((b) => b.day === day);
        // Con l'agenda accesa le prenotazioni di prova non contano nei totali.
        const list = settings.agendaEnabled ? all.filter((b) => !b.isTest) : all;
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
                  {list.length ? agendaTotals(list).text : "Nessuna prenotazione confermata"}
                  {settings.capacityHint > 0 && <span className={overHint ? "font-semibold text-danger" : ""}> · di solito pieni oltre {peopleText(settings.capacityHint)}</span>}
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
            {all.length > 0 && (
              <CardList single>
                {all.map((b) => (
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
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground-muted">Giorno da chiudere</span>
            <input type="date" value={pick} min={addDays(today, 1)} max={last} onChange={(e) => setPick(e.target.value)} className={`${inputClass} w-auto`} />
          </label>
          <button
            type="button"
            disabled={busy || !pick || pick <= today || fullDays.includes(pick)}
            onClick={() => {
              onClose(pick);
              setPick(null);
            }}
            className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:bg-surface-2 disabled:text-foreground-muted disabled:ring-1 disabled:ring-border"
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
  if (!stats.total && !stats.manual.total) {
    return <Empty title="Ancora nessun numero" text="Qui vedrai quante richieste arrivano dal sito, quante prenotazioni segnate a mano e da dove arrivano (ultimi 90 giorni, senza le prove)." />;
  }
  const pct = (n: number) => (stats.total ? `${Math.round((n / stats.total) * 100)}%` : "—");
  // Le note si spezzano solo ai «·»: niente «di persona · 0» con «persone» a capo da solo.
  const tiles: { label: string; value: string; note: string[] }[] = [
    { label: "Richieste online", value: String(stats.total), note: ["dal sito", "ultimi 90 giorni"] },
    { label: "Confermate online", value: String(stats.confirmed), note: [pct(stats.confirmed), peopleText(stats.people)] },
    { label: "Al completo", value: String(stats.declined), note: [pct(stats.declined)] },
    { label: "Segnate a mano", value: String(stats.manual.total), note: [peopleText(stats.manual.people), "non dal sito"] },
    { label: "Annullate", value: String(stats.cancelled + stats.manual.cancelled), note: stats.manual.cancelled ? [`${stats.cancelled} online`, `${stats.manual.cancelled} a mano`] : [pct(stats.cancelled)] },
    { label: "Non venuti", value: String(stats.noShow), note: ["prenotati, mai arrivati"] },
    { label: "Risposta tipica", value: stats.medianResponseMinutes === null ? "—" : duration(stats.medianResponseMinutes), note: ["alle richieste dal sito"] },
  ];
  const max = Math.max(...stats.bySource.map(([, n]) => n), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{t.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{t.value}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {t.note.map((part, i) => (
                <span key={i}>
                  <span className="whitespace-nowrap">
                    {part}
                    {i < t.note.length - 1 && " ·"}
                  </span>{" "}
                </span>
              ))}
            </p>
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
                markWhatsapp(info.id, "opened")
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
              Conferma dal telefono enoteca
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
function TestsDialog({ tests, keepable, busy, onDelete, onKeep, onCancel }: { tests: number; keepable: number; busy: boolean; onDelete: () => void; onKeep: () => void; onCancel: () => void }) {
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
