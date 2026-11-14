"use client";

// Agenda delle prenotazioni: il foglio per segnare una prenotazione nuova o modificarla e la stampa
// del giorno. Il calendario (Giorno · Settimana · Mese) è in calendar.tsx.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { parseQuick, type QuickResult } from "@/lib/booking/quick";
import { periodTitle } from "@/lib/booking/agenda";
import {
  addDays,
  romeParts,
  withinOpening,
  aroundTime,
  availability,
  bookingsText,
  dayLong,
  dayShort,
  dayTimeShort,
  editVersion,
  MANUAL_SOURCES,
  peopleText,
  quickDayLabels,
  romeInstant,
  SOURCE_LABEL,
  tableText,
  timeToDayMinutes,
  type BookingSettings,
  type ManualSource,
} from "@/lib/booking/rules";
import type { Hours } from "@/lib/menu-venue";
import { addManualBooking, editBooking, markWhatsapp, type AgendaFields, type AgendaOutcome } from "./actions";
import { WhatsappButton } from "./booking-sheet";
import { originShort, phoneDisplay } from "./format";
import type { BookingItem } from "./types";

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Gli orari del giorno come pulsanti: tutta l'apertura (non solo dalla prima ora prenotabile online),
// con il passo delle impostazioni e senza anticipo: chi è al telefono può segnare anche un tavolo
// tra dieci minuti, o chi è appena entrato.
export function daySlots(day: string, hours: Hours, settings: BookingSettings): string[] {
  const a = availability(day, hours, { ...settings, firstTime: "00:00", leadMinutes: 0, daysAhead: 400, lastBeforeClose: Math.min(settings.lastBeforeClose, 60) }, null, romeInstant(day, 5 * 60));
  return a.slots.map((s) => s.time);
}

// ---------- Foglio «Nuova prenotazione» / «Modifica la prenotazione»

type FormState = {
  source: ManualSource;
  name: string;
  phone: string;
  // «?» = ancora da definire (scelto apposta, non un campo lasciato vuoto).
  people: string;
  day: string;
  time: string;
  table: string;
  note: string;
  allergies: boolean;
  menu: string;
};
const UNKNOWN = "?";

const fieldLabel = "mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted";
const choice = (on: boolean) =>
  `min-h-11 rounded-lg border text-sm font-semibold tabular-nums ${on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-accent"}`;

// Dopo «Segna in agenda» (nuova): il foglio si chiude e la pagina mostra «✓ Segnata: …» con «Annulla».
export type SavedInfo = { id: string; name: string; summary: string; phone: boolean; whatsappHref: string | null; isTest: boolean };

// «Oggi», «Domani», «Ven 14»: i pulsanti dei prossimi 7 giorni.
function nextDays(today: string, quick: { today: string; tomorrow: string }): { day: string; label: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i);
    return { day: d, label: i === 0 ? quick.today : i === 1 ? quick.tomorrow : dayShort(d).split(" ").slice(0, 2).join(" ") };
  });
}

export function BookingForm({
  booking,
  initialDay,
  today,
  settings,
  hours,
  canWhatsapp,
  confirmed,
  countTests,
  menus = [],
  onClose,
  onShow,
  onSaved,
}: {
  // null: nuova prenotazione; altrimenti si modifica questa.
  booking: BookingItem | null;
  initialDay: string;
  today: string;
  settings: BookingSettings;
  hours: Hours;
  canWhatsapp: boolean;
  // Le confermate (per «Alle 20:30 (±1 ora): …» prima di salvare).
  confirmed: BookingItem[];
  countTests: boolean;
  // Menù già usati (suggerimenti con un tocco).
  menus?: string[];
  onClose: () => void;
  // Dopo il salvataggio di una modifica: apre la prenotazione.
  onShow: (id: string) => void;
  // Dopo il salvataggio di una nuova: il foglio si chiude e la pagina mostra il messaggio.
  onSaved: (info: SavedInfo) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = booking !== null;
  const [f, setF] = useState<FormState>(() =>
    booking
      ? {
          source: (MANUAL_SOURCES as readonly string[]).includes(booking.source ?? "") ? (booking.source as ManualSource) : "telefono",
          ...fieldsOf(booking),
        }
      : { source: "telefono", name: "", phone: "", people: "", day: nightDefault(initialDay, today), time: "", table: "", note: "", allergies: false, menu: "" },
  );
  const [initial, setInitial] = useState(() => JSON.stringify(f));
  // I dati che chi modifica ha davanti (vedi editVersion): dopo un conflitto, quelli nuovi.
  const [version, setVersion] = useState(() => (booking ? editVersion(booking) : ""));
  const [conflict, setConflict] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ field: string | null; text: string } | null>(null);
  // Domanda prima di salvare: giorno chiuso / fuori orario (force) oppure «c'è già…» (dup).
  const [ask, setAsk] = useState<{ text: string; dup: boolean } | null>(null);
  // Già risposto «Segna lo stesso» alla prima domanda: vale anche dopo quella sui doppioni.
  const [forced, setForced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Extract<AgendaOutcome, { saved: true }> | null>(null);
  const [queued, setQueued] = useState(false);
  const [waOpened, setWaOpened] = useState(false);
  // Tra mezzanotte e le 5 «Oggi»/«Domani» confondono: si scrive la data («Sab 7 nov (stanotte)»).
  const [quick] = useState(() => quickDayLabels(today, new Date()));
  const week = useMemo(() => nextDays(today, quick), [today, quick]);
  // «Altro giorno»: il calendario, se il giorno non è tra i prossimi 7.
  const [otherDay, setOtherDay] = useState(() => !nextDays(today, quick).some((d) => d.day === f.day));
  const conflictRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (conflict) conflictRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [conflict]);
  // «Scrivi o detta»: il testo e quello che ne ha capito il sito. I campi toccati a mano non li
  // sovrascrive più; quelli riempiti dal testo si aggiornano (o si svuotano) mentre si scrive.
  const [quickText, setQuickText] = useState("");
  const [heard, setHeard] = useState<QuickResult | null>(null);
  const manual = useRef<Set<keyof FormState>>(new Set());
  const fromQuick = useRef<Set<keyof FormState>>(new Set());
  function applyQuick(text: string) {
    setQuickText(text);
    const r = text.trim()
      ? parseQuick(text, { today: romeParts(new Date()).dateKey, isOpen: (day, time) => withinOpening(day, time, hours) === "ok" })
      : null;
    setHeard(r);
    const next: Partial<FormState> = {};
    const filled = new Set<keyof FormState>();
    const put = <K extends keyof FormState>(k: K, v: FormState[K] | null | undefined, empty: FormState[K]) => {
      if (manual.current.has(k)) return;
      if (v !== null && v !== undefined) {
        next[k] = v;
        filled.add(k);
      } else if (fromQuick.current.has(k)) next[k] = empty;
    };
    put("name", r?.name, "");
    put("phone", r?.phone, "");
    put("table", r?.table, "");
    put("menu", r?.menu, "");
    put("note", r?.note, "");
    if (r?.allergies) put("allergies", true, false);
    else put("allergies", null, false);
    if (r?.day) put("day", r.day, initialDay);
    else put("day", null, initialDay);
    // Ora o persone che mancano (o sono un dubbio): «Ancora da definire», così si può segnare lo
    // stesso «da completare». Solo quando c'è già un nome: mentre si comincia a scrivere non si sceglie niente.
    const hasName = Boolean(r?.name || (manual.current.has("name") && f.name.trim()));
    put("people", r?.people != null ? String(r.people) : r && hasName ? UNKNOWN : null, "");
    put("time", r?.time ?? (r && hasName ? UNKNOWN : null), "");
    fromQuick.current = filled;
    if (Object.keys(next).length) {
      setF((x) => ({ ...x, ...next }));
      if (next.day && !nextDays(today, quick).some((d) => d.day === next.day)) setOtherDay(true);
      else if (next.day) setOtherDay(false);
    }
    if (errors) setErrors(null);
  }
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    manual.current.add(k);
    setF((x) => ({ ...x, [k]: v }));
    if (errors?.field === k) setErrors(null);
  };

  const slots = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(f.day) ? daySlots(f.day, hours, settings) : []), [f.day, hours, settings]);
  // Chiudendo con dati scritti e non salvati, il foglio chiede conferma (come le altre finestre).
  const dirty = !saved && !gone && (editing ? JSON.stringify(f) !== initial : Boolean(f.name.trim() || f.phone.trim() || f.note.trim() || f.table.trim() || f.menu.trim()));
  const timeUnknown = f.time === UNKNOWN;
  const peopleUnknown = f.people === UNKNOWN;
  const peopleQuick = [1, 2, 3, 4, 5, 6, 7, 8];
  const dayText = (d: string) => (d === today ? quick.today : d === addDays(today, 1) ? quick.tomorrow : capital(dayLong(d)));

  // Quanta gente c'è già intorno a quell'ora e in tutta la giornata (senza le prove, con l'agenda accesa).
  const context = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.day) || !/^\d{2}:\d{2}$/.test(f.time)) return null;
    // (con l'ora da definire niente «±1 ora»: si vede solo la giornata, sotto)
    const at = romeInstant(f.day, timeToDayMinutes(f.time)).getTime();
    return aroundTime(
      confirmed.filter((b) => countTests || !b.isTest),
      f.day,
      at,
      booking?.id,
    );
  }, [f.day, f.time, confirmed, countTests, booking?.id]);

  // Nel frattempo un altro l'ha modificata: nel modulo i dati di adesso, da rifare e salvare.
  function reload(c: AgendaFields, text: string) {
    const next: FormState = { source: f.source, ...fieldsOf(c) };
    setF(next);
    setInitial(JSON.stringify(next));
    setVersion(c.version);
    setConflict(text);
  }

  async function save(force = forced, dupOk = false) {
    setBusy(true);
    setErrors(null);
    const input = {
      ...f,
      time: timeUnknown ? "" : f.time,
      people: peopleUnknown ? 0 : Number(f.people),
      timeUnknown,
      peopleUnknown,
      force,
      dupOk,
    };
    try {
      const res = booking ? await editBooking(booking.id, input, version) : await addManualBooking(input);
      if (!res.ok) {
        toast.showError(res.error);
        return;
      }
      const out = res.data;
      if (out.saved) {
        setAsk(null);
        setConflict(null);
        router.refresh();
        if (!booking) {
          const people = Number(f.people);
          onSaved({
            id: out.id,
            name: f.name.trim(),
            summary: `${f.name.trim()}, ${timeUnknown ? `${f.day === today ? "oggi" : dayShort(f.day)}, ora da definire` : f.day === today ? `oggi ${f.time}` : dayTimeShort(f.day, f.time)}, ${peopleUnknown ? "persone da definire" : peopleText(people)}`,
            phone: out.hasPhone,
            whatsappHref: out.whatsappHref,
            isTest: out.isTest,
          });
          return;
        }
        setSaved(out);
      } else if (out.ask) {
        setAsk({ text: out.ask, dup: out.dup });
      } else if ("error" in out) {
        setAsk(null);
        if (out.gone) {
          // Annullata (o sparita) nel frattempo: niente più modulo, un solo messaggio.
          setGone(out.error);
        } else if (out.conflict) {
          reload(out.conflict, out.error);
        } else {
          setErrors({ field: out.field ?? null, text: out.error });
          if (!out.field) toast.showError(out.error);
        }
        router.refresh();
      }
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  async function queue() {
    if (!saved) return;
    setBusy(true);
    try {
      const res = await markWhatsapp(saved.id, "queue");
      if (res.ok) setQueued(true);
      else toast.showError(res.error);
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }

  const err = (field: string) =>
    errors?.field === field ? (
      <p role="alert" className="mt-1 text-sm font-medium text-danger">
        {errors.text}
      </p>
    ) : null;

  const title = editing ? "Modifica la prenotazione" : "Nuova prenotazione";

  if (gone) {
    return (
      <Sheet title={title} onClose={onClose}>
        <div role="alert" className="space-y-3 rounded-xl border border-danger/30 bg-danger-bg p-4">
          <p className="text-base font-semibold text-danger">{gone}</p>
          <button type="button" onClick={onClose} className="min-h-11 w-full rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:border-accent">
            Chiudi
          </button>
        </div>
      </Sheet>
    );
  }

  if (saved) {
    const people = Number(f.people);
    return (
      <Sheet title={title} onClose={onClose}>
        <div className="space-y-3 rounded-xl border border-success/30 bg-success-bg/60 p-4">
          <p className="text-base font-semibold text-success">{saved.unchanged ? "Nessuna modifica" : "✓ Modifiche salvate"}</p>
          <p className="text-sm text-foreground">
            {dayText(f.day)} {timeUnknown ? "· ora da definire" : `alle ${f.time}`} · {peopleUnknown ? "persone da definire" : peopleText(people)} · {f.name.trim()}
            {f.table.trim() ? ` · ${tableText(f.table).replace(/^Tavolo /, "tavolo ")}` : ""}
          </p>
          {saved.unchanged ? (
            <p className="text-xs text-foreground-muted">Non hai cambiato niente: la prenotazione resta com&apos;era.</p>
          ) : (timeUnknown || peopleUnknown) && saved.hasPhone ? (
            <p className="text-xs text-foreground-muted">La conferma al cliente si manda quando ora e persone sono decise.</p>
          ) : saved.hasPhone && saved.whatsappHref ? (
            canWhatsapp ? (
              <>
                <WhatsappButton href={saved.whatsappHref} bookingId={saved.id} label="Manda la conferma aggiornata su WhatsApp" onOpened={() => setWaOpened(true)} />
                <p className="text-xs text-foreground-muted">
                  {waOpened ? "WhatsApp aperto: se non hai toccato Invia, tocca di nuovo il pulsante." : "Facoltativo. Si apre WhatsApp con il messaggio già scritto (con il link per annullare): controlla e tocca Invia."}
                </p>
              </>
            ) : queued ? (
              <p className="text-sm font-medium text-foreground">✓ La manda il telefono enoteca: è nella lista «Da mandare su WhatsApp».</p>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={queue} className="flex min-h-12 w-full items-center justify-center rounded-xl border border-[#137a43]/40 px-4 text-[15px] font-semibold text-[#137a43] hover:bg-[#137a43]/10 disabled:opacity-60 dark:text-[#3fae74]">
                  Da mandare dal telefono enoteca
                </button>
                <p className="text-xs text-foreground-muted">Facoltativo: se il cliente vuole la conferma su WhatsApp, la manda il telefono enoteca.</p>
              </>
            )
          ) : (
            saved.hasPhone && <p className="text-xs text-foreground-muted">È un numero fisso: niente conferma su WhatsApp. Se serve, chiama il cliente.</p>
          )}
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
              Fatto
            </button>
            <button type="button" onClick={() => onShow(saved.id)} className="min-h-11 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:border-accent">
              Apri la prenotazione
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={title} onClose={onClose} dirty={dirty}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {conflict && (
          <p ref={conflictRef} role="alert" className="rounded-xl border border-gold/40 bg-gold/[0.08] px-3 py-2.5 text-sm font-medium text-foreground">
            {conflict}
          </p>
        )}

        {/* «Scrivi o detta»: tutta la prenotazione in una frase, anche col microfono della tastiera.
            Sotto, i campi si riempiono da soli: si controlla e si segna come sempre. */}
        {!editing && (
          <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-3.5" data-testid="scrivi-o-detta">
            <label htmlFor="scrivi-o-detta" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MicIcon /> Scrivi o detta
            </label>
            <p className="mt-0.5 text-xs text-foreground-muted">Nome, persone, giorno e ora, in qualsiasi ordine. Per dettare, tocca il microfono della tastiera.</p>
            <textarea
              id="scrivi-o-detta"
              rows={2}
              value={quickText}
              onChange={(e) => applyQuick(e.target.value)}
              placeholder="Es. Angelo, 10 persone, sabato alle 20:30"
              autoCapitalize="sentences"
              autoComplete="off"
              enterKeyHint="done"
              className={`${inputClass} mt-2 min-h-[4.5rem] resize-none`}
            />
            {heard && <Heard r={heard} day={f.day} />}
          </div>
        )}

        {/* Modalità rapida (al telefono, mentre il cliente parla): Persone → Ora → Giorno → Nome, il resto sotto. */}
        <div>
          <span id="nuova-persone" className={fieldLabel}>
            Persone
          </span>
          <div role="radiogroup" aria-labelledby="nuova-persone" className="grid grid-cols-8 gap-1.5">
            {peopleQuick.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={f.people === String(n)} onClick={() => set("people", String(n))} className={choice(f.people === String(n))}>
                {n}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={peopleUnknown} onClick={() => set("people", UNKNOWN)} className={`${unknownChoice(peopleUnknown)} col-span-8`}>
              Ancora da definire
            </button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-foreground-muted">
            Di più:
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={peopleQuick.includes(Number(f.people)) || peopleUnknown ? "" : f.people}
              onChange={(e) => set("people", e.target.value)}
              aria-label="Altro numero di persone"
              placeholder="es. 12"
              className={`${inputClass} w-24!`}
            />
          </label>
          {err("people")}
        </div>

        <div>
          <span id="nuova-ora" className={fieldLabel}>
            Ora
          </span>
          <div role="radiogroup" aria-labelledby="nuova-ora" className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {slots.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={f.time === t} onClick={() => set("time", t)} className={choice(f.time === t)}>
                {t}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={timeUnknown} onClick={() => set("time", UNKNOWN)} className={`${unknownChoice(timeUnknown)} col-span-4 sm:col-span-6`}>
              Ancora da definire
            </button>
          </div>
          {slots.length === 0 && <p className="mt-1.5 text-sm text-foreground-muted">Quel giorno il locale risulta chiuso: scrivi l&apos;ora qui sotto.</p>}
          <label className="mt-2 flex items-center gap-2 text-sm text-foreground-muted">
            Un altro orario:
            <input type="time" value={slots.includes(f.time) || timeUnknown ? "" : f.time} onChange={(e) => set("time", e.target.value)} aria-label="Un altro orario" className={`${inputClass} w-32!`} />
          </label>
          {(timeUnknown || peopleUnknown) && (
            <p className="mt-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-foreground" data-testid="avviso-da-definire">
              <span className="font-semibold">Si segna lo stesso, «da completare».</span> Resta segnalata in giallo finché non scrivi {timeUnknown && peopleUnknown ? "ora e persone" : timeUnknown ? "l'ora" : "le persone"}; la conferma al cliente si manda dopo.
            </p>
          )}
          {err("time")}
        </div>

        <div>
          <span className={fieldLabel}>
            Giorno
          </span>
          <div role="radiogroup" aria-label="Scegli il giorno" className="grid grid-cols-4 gap-1.5">
            {week.map((d) => (
              <button
                key={d.day}
                type="button"
                role="radio"
                aria-checked={!otherDay && f.day === d.day}
                onClick={() => {
                  setOtherDay(false);
                  set("day", d.day);
                }}
                className={`${choice(!otherDay && f.day === d.day)} px-1 text-[13px] leading-tight`}
              >
                {d.label}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={otherDay} onClick={() => setOtherDay(true)} className={`${choice(otherDay)} px-1 text-[13px] leading-tight`}>
              Altro giorno
            </button>
          </div>
          {otherDay && (
            <input
              type="date"
              value={f.day}
              min={booking && booking.day < today ? booking.day : today}
              max={addDays(today, 365)}
              onChange={(e) => e.target.value && set("day", e.target.value)}
              aria-label="Giorno"
              className={`${inputClass} mt-2 w-auto!`}
            />
          )}
          {/^\d{4}-\d{2}-\d{2}$/.test(f.day) && <p className="mt-1 text-sm font-medium text-foreground">{periodTitle("day", f.day, today)}</p>}
          {err("day")}
        </div>

        {/* Prima di segnare: quanta gente c'è già intorno a quell'ora. */}
        {context && (
          <p data-testid="contesto" className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground">
            <span className="font-semibold">
              Alle {f.time} (±1 ora): {context.near && context.near.count ? `${peopleText(context.near.people)} · ${bookingsText(context.near.count)}` : "nessuna prenotazione"}
            </span>
            <span className="block text-xs text-foreground-muted">
              In tutta la giornata: {context.day.count ? `${peopleText(context.day.people)} · ${bookingsText(context.day.count)}` : "nessuna prenotazione"}
              {settings.capacityHint > 0 && ` · di solito pieni oltre ${peopleText(settings.capacityHint)}`}
            </span>
          </p>
        )}

        <label className="block">
          <span className={fieldLabel}>Nome</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} autoComplete="off" autoCapitalize="words" enterKeyHint="done" placeholder="es. Rossi" className={inputClass} aria-invalid={errors?.field === "name" || undefined} />
          {err("name")}
        </label>

        <label className="block">
          <span className={fieldLabel}>Telefono{booking && booking.phone ? "" : " (facoltativo)"}</span>
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} type="tel" inputMode="tel" autoComplete="off" placeholder="es. 333 123 4567" className={inputClass} aria-invalid={errors?.field === "phone" || undefined} />
          {err("phone") ?? <span className="mt-1 block text-xs text-foreground-muted">Con il numero puoi mandare la conferma su WhatsApp e avvisare se cambia qualcosa. Si può aggiungere dopo.</span>}
        </label>

        <div>
          <label className="block">
            <span className={fieldLabel}>Menù (facoltativo)</span>
            <input value={f.menu} onChange={(e) => set("menu", e.target.value)} maxLength={60} autoComplete="off" list="menu-usati" placeholder="es. Menù da 25 €" aria-label="Menù" className={inputClass} />
          </label>
          <datalist id="menu-usati">
            {menus.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {menus.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Menù già usati">
              {menus.slice(0, 4).map((m) => (
                <button key={m} type="button" onClick={() => set("menu", f.menu === m ? "" : m)} aria-pressed={f.menu === m} className={`min-h-9 rounded-full border px-3 text-xs font-medium ${f.menu === m ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground-muted hover:border-accent hover:text-foreground"}`}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <label className="block">
            <span className={fieldLabel}>Tavolo</span>
            <input value={f.table} onChange={(e) => set("table", e.target.value)} maxLength={20} autoComplete="off" placeholder="es. 5, dehors" aria-label="Tavolo" className={inputClass} />
          </label>
          <label className="block">
            <span className={fieldLabel}>Nota</span>
            <textarea value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={300} rows={2} placeholder="es. compleanno, seggiolone, vicino alla finestra" className={`${inputClass} resize-y`} />
          </label>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2">
          <input type="checkbox" checked={f.allergies} onChange={(e) => set("allergies", e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
          <span className="text-sm text-foreground">
            Qualcuno ha allergie o intolleranze
            <span className="block text-xs text-foreground-muted">Solo sì/no: i dettagli si chiedono al tavolo.</span>
          </span>
        </label>

        {!editing && (
          <div>
            <span id="nuova-da-dove" className={fieldLabel}>
              Da dove arriva
            </span>
            <div role="radiogroup" aria-labelledby="nuova-da-dove" className="grid grid-cols-3 gap-1.5">
              {MANUAL_SOURCES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={f.source === s} onClick={() => set("source", s)} className={choice(f.source === s)}>
                  {SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {errors && !["name", "phone", "people", "day", "time"].includes(errors.field ?? "") && (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors.text}
          </p>
        )}

        {/* Su telefono il pulsante per salvare resta sempre in vista, in una barra in fondo al foglio. */}
        <div className="sticky bottom-0 z-10 -mx-5 flex gap-2 border-t border-border bg-surface px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
          <button type="button" onClick={onClose} className="min-h-12 shrink-0 rounded-full border border-border px-5 text-sm font-medium text-foreground-muted hover:text-foreground sm:min-h-11">
            Annulla
          </button>
          <button type="submit" disabled={busy} className="min-h-12 flex-1 rounded-full bg-accent px-6 text-[15px] font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60 sm:flex-none">
            {busy ? "Un attimo…" : editing ? "Salva le modifiche" : "Segna in agenda"}
          </button>
        </div>
      </form>
      {ask &&
        (ask.dup ? (
          <ConfirmSheet title={ask.text} confirmLabel="È un'altra, segna lo stesso" busy={busy} onConfirm={() => save(forced, true)} onCancel={() => setAsk(null)}>
            <p>Controlla nell&apos;agenda: se è la stessa persona, tocca Annulla e non la segni due volte.</p>
          </ConfirmSheet>
        ) : (
          <ConfirmSheet
            title={ask.text}
            confirmLabel="Segna lo stesso"
            busy={busy}
            onConfirm={() => {
              setForced(true);
              save(true);
            }}
            onCancel={() => setAsk(null)}
          >
            <p>{/già passate/.test(ask.text) ? "Controlla giorno e ora: forse volevi un altro giorno. Se sono giusti (per esempio la segni dopo), si segna lo stesso." : "Controlla giorno e ora. Se sono giusti (per esempio una serata privata), si segna lo stesso."}</p>
          </ConfirmSheet>
        ))}
    </Sheet>
  );
}

// I campi del modulo da una prenotazione (o dai dati arrivati dopo un conflitto).
function fieldsOf(b: Pick<BookingItem, "name" | "phone" | "people" | "day" | "time" | "table" | "note" | "allergies" | "timeUnknown" | "peopleUnknown" | "menu"> | AgendaFields): Omit<FormState, "source"> {
  return {
    name: b.name,
    phone: b.phone ? phoneDisplay(b.phone) : "",
    people: b.peopleUnknown ? UNKNOWN : String(b.people),
    day: b.day,
    time: b.timeUnknown ? UNKNOWN : b.time,
    table: b.table ?? "",
    note: b.note ?? "",
    allergies: b.allergies,
    menu: b.menu ?? "",
  };
}

const unknownChoice = (on: boolean) =>
  `min-h-11 rounded-lg border text-sm font-semibold ${on ? "border-gold bg-gold/20 text-foreground" : "border-dashed border-border bg-surface text-foreground-muted hover:border-gold hover:text-foreground"}`;

// ---------- Stampa del giorno: un foglio A4 pulito, bianco e nero, come una pagina del librone.

const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

// «00:30 (notte)»: sul foglio stampato un orario dopo mezzanotte non si confonde con il pranzo.
const printTime = (t: string) => (timeToDayMinutes(t) >= 1440 ? `${t} (notte)` : t);

type PrintRow = Pick<BookingItem, "id" | "time" | "people" | "name" | "table" | "phone" | "allergies" | "note" | "manual" | "source" | "createdBy" | "isTest" | "timeUnknown" | "peopleUnknown" | "menu">;

export function AgendaPrint({ day, list, totals, countTests, notes = [], events = [] }: { day: string; list: PrintRow[]; totals: string; countTests: boolean; notes?: string[]; events?: string[] }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <div id="agenda-stampa" aria-hidden>
      <style>{`
        #agenda-stampa { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          /* Anche con il tema scuro: foglio bianco e testo nero. */
          :root { color-scheme: light !important; }
          html, body { background: #fff !important; color: #000 !important; }
          body > *:not(#agenda-stampa) { display: none !important; }
          #agenda-stampa { display: block; background: #fff; font: 11pt/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #000; }
          #agenda-stampa * { background: transparent !important; color: #000 !important; }
          #agenda-stampa h1 { font-size: 16pt; margin: 0 0 1mm; }
          #agenda-stampa .tot { margin: 0 0 4mm; font-size: 10pt; }
          #agenda-stampa table { width: 100%; border-collapse: collapse; table-layout: auto; }
          #agenda-stampa th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1.5pt solid #000; padding: 1.5mm 1.5mm; white-space: nowrap; }
          #agenda-stampa td { border-bottom: .5pt solid #999; padding: 1.8mm 1.5mm; vertical-align: top; }
          #agenda-stampa tr { break-inside: avoid; }
          #agenda-stampa .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
          #agenda-stampa .nome { white-space: nowrap; }
          #agenda-stampa .nota { width: 40%; min-width: 55mm; overflow-wrap: break-word; }
          #agenda-stampa .presa { font-size: 9pt; min-width: 22mm; }
          #agenda-stampa .b { font-weight: 700; }
          #agenda-stampa .foot { margin-top: 3mm; font-size: 8pt; color: #444 !important; }
          #agenda-stampa .giorno { margin: 0 0 3mm; font-size: 10.5pt; font-weight: 700; }
        }
      `}</style>
      <h1>{capital(dayLong(day))}</h1>
      <p className="tot">{totals}</p>
      {events.map((e) => (
        <p key={e} className="giorno">
          Evento: {e}
        </p>
      ))}
      {notes.map((n, i) => (
        <p key={i} className="giorno">
          ✎ {n}
        </p>
      ))}
      <table>
        <thead>
          <tr>
            <th>Ora</th>
            <th>Pers.</th>
            <th>Nome</th>
            <th>Tavolo</th>
            <th>Telefono</th>
            <th>Nota</th>
            <th>Presa da</th>
          </tr>
        </thead>
        <tbody>
          {list.map((b) => (
            <tr key={b.id}>
              <td className="num b">{b.timeUnknown ? "da definire" : printTime(b.time)}</td>
              <td className="num b">{b.peopleUnknown ? "?" : b.people}</td>
              <td className="b nome">{b.name}</td>
              <td>{b.table ?? ""}</td>
              <td className="num">{b.phone ? phoneDisplay(b.phone) : ""}</td>
              <td className="nota">
                {b.allergies ? <strong>⚠ Allergie. </strong> : null}
                {b.menu ? <strong>{b.menu}. </strong> : null}
                {b.note ?? ""}
              </td>
              <td className="presa">
                {originShort(b)}
                {b.isTest && !countTests ? " · di prova" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="foot">L&apos;Angolo del Vino · agenda delle prenotazioni</p>
    </div>,
    document.body,
  );
}

// Tra mezzanotte e le 5 la serata in agenda è quella appena finita: una prenotazione presa ora è per
// un'altra sera, quindi il giorno proposto è quello di calendario («Sab 14 nov»), non «stanotte».
function nightDefault(day: string, today: string): string {
  return day === today && romeParts(new Date()).dateKey !== today ? addDays(today, 1) : day;
}

// «Ho capito: Angelo · 10 persone · Sab 21 nov · 20:30»: quello che il sito ha letto nella frase,
// con quello che manca (si segna lo stesso, «da completare») e i dubbi da controllare.
function Heard({ r, day }: { r: QuickResult; day: string }) {
  const chip = "inline-flex min-h-7 items-center rounded-full bg-surface px-2.5 text-[13px] font-semibold text-foreground ring-1 ring-inset ring-border";
  const missing = "inline-flex min-h-7 items-center rounded-full bg-gold/15 px-2.5 text-[13px] font-semibold text-gold ring-1 ring-inset ring-gold/35";
  const parts: { text: string; miss?: boolean }[] = [
    r.name ? { text: r.name } : { text: "Manca il nome", miss: true },
    r.people !== null ? { text: peopleText(r.people) } : { text: "Persone da definire", miss: true },
    { text: r.day ? capital(dayShort(r.day)) : `${capital(dayShort(day))} (scelto qui sotto)` },
    r.time ? { text: `alle ${r.time}` } : { text: "Ora da definire", miss: true },
    ...(r.phone ? [{ text: r.phone }] : []),
    ...(r.table ? [{ text: tableText(r.table) }] : []),
    ...(r.menu ? [{ text: r.menu }] : []),
    ...(r.allergies ? [{ text: "⚠ Allergie" }] : []),
    ...(r.note ? [{ text: `Nota: ${r.note}` }] : []),
  ];
  return (
    <div className="mt-2.5" aria-live="polite" data-testid="ho-capito">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Ho capito</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {parts.map((p) => (
          <span key={p.text} className={`${p.miss ? missing : chip} max-w-full [overflow-wrap:anywhere]`}>
            {p.text}
          </span>
        ))}
      </div>
      {r.doubts.map((d) => (
        <p key={d} className="mt-1.5 text-xs font-medium text-gold">
          {d}
        </p>
      ))}
      <p className="mt-1.5 text-xs text-foreground-muted">
        {r.name ? "Controlla qui sotto e tocca «Segna in agenda». Quello che manca resta «da completare»." : "Scrivi anche il nome: senza, non si sa di chi è."}
      </p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-ink">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </svg>
  );
}
