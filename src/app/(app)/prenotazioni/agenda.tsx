"use client";

// Agenda delle prenotazioni: il «librone» digitale. Tutte le prenotazioni confermate di un giorno
// (online e segnate a mano), il foglio per segnarne una nuova o modificarla, e la stampa del giorno.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { showActionError, useToast } from "@/components/toast";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { addDays, agendaTotals, availability, dayLong, editVersion, MANUAL_SOURCES, peopleText, quickDayLabels, romeInstant, romeParts, SOURCE_LABEL, tableText, timeToDayMinutes, type BookingSettings, type ManualSource } from "@/lib/booking/rules";
import type { Hours } from "@/lib/menu-venue";
import { addManualBooking, editBooking, markWhatsapp, type AgendaFields, type AgendaOutcome } from "./actions";
import { TestChip, WhatsappButton } from "./booking-sheet";
import { clock, dayLabel, originShort, phoneDisplay } from "./format";
import type { BookingItem } from "./types";

const ALLERGY_SHORT = "⚠ Allergie";
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
  people: string;
  day: string;
  time: string;
  table: string;
  note: string;
  allergies: boolean;
};

const fieldLabel = "mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted";
const choice = (on: boolean) =>
  `min-h-11 rounded-lg border text-sm font-semibold tabular-nums ${on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-accent"}`;

export function BookingForm({
  booking,
  initialDay,
  today,
  settings,
  hours,
  canWhatsapp,
  onClose,
  onShow,
}: {
  // null: nuova prenotazione; altrimenti si modifica questa.
  booking: BookingItem | null;
  initialDay: string;
  today: string;
  settings: BookingSettings;
  hours: Hours;
  canWhatsapp: boolean;
  onClose: () => void;
  // Dopo il salvataggio: apre la prenotazione.
  onShow: (id: string) => void;
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
      : { source: "telefono", name: "", phone: "", people: "", day: initialDay, time: "", table: "", note: "", allergies: false },
  );
  const [initial, setInitial] = useState(() => JSON.stringify(f));
  // I dati che chi modifica ha davanti (vedi editVersion): dopo un conflitto, quelli nuovi.
  const [version, setVersion] = useState(() => (booking ? editVersion(booking) : ""));
  const [conflict, setConflict] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ field: string | null; text: string } | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Extract<AgendaOutcome, { saved: true }> | null>(null);
  const [queued, setQueued] = useState(false);
  const [waOpened, setWaOpened] = useState(false);
  // Tra mezzanotte e le 5 «Oggi»/«Domani» confondono: si scrive la data («Sab 7 nov (stanotte)»).
  const [quick] = useState(() => quickDayLabels(today, new Date()));
  const conflictRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (conflict) conflictRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [conflict]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors?.field === k) setErrors(null);
  };

  const slots = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(f.day) ? daySlots(f.day, hours, settings) : []), [f.day, hours, settings]);
  // Chiudendo con dati scritti e non salvati, il foglio chiede conferma (come le altre finestre).
  const dirty = !saved && !gone && (editing ? JSON.stringify(f) !== initial : Boolean(f.name.trim() || f.phone.trim() || f.note.trim() || f.table.trim()));
  const peopleQuick = [1, 2, 3, 4, 5, 6, 7, 8];
  const dayText = (d: string) => (d === today ? quick.today : d === addDays(today, 1) ? quick.tomorrow : capital(dayLong(d)));

  // Nel frattempo un altro l'ha modificata: nel modulo i dati di adesso, da rifare e salvare.
  function reload(c: AgendaFields, text: string) {
    const next: FormState = { source: f.source, ...fieldsOf(c) };
    setF(next);
    setInitial(JSON.stringify(next));
    setVersion(c.version);
    setConflict(text);
  }

  async function save(force = false) {
    setBusy(true);
    setErrors(null);
    const input = { ...f, people: Number(f.people), force };
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
        setSaved(out);
        router.refresh();
      } else if (out.ask) {
        setAsk(out.ask);
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
          <p className="text-base font-semibold text-success">{saved.unchanged ? "Nessuna modifica" : editing ? "✓ Modifiche salvate" : "✓ Segnata in agenda"}</p>
          <p className="text-sm text-foreground">
            {dayText(f.day)} alle {f.time} · {peopleText(people)} · {f.name.trim()}
            {f.table.trim() ? ` · ${tableText(f.table).replace(/^Tavolo /, "tavolo ")}` : ""}
          </p>
          {saved.unchanged ? (
            <p className="text-xs text-foreground-muted">Non hai cambiato niente: la prenotazione resta com&apos;era.</p>
          ) : saved.hasPhone && saved.whatsappHref ? (
            canWhatsapp ? (
              <>
                <WhatsappButton
                  href={saved.whatsappHref}
                  bookingId={saved.id}
                  label={editing ? "Manda la conferma aggiornata su WhatsApp" : "Manda la conferma su WhatsApp"}
                  onOpened={() => setWaOpened(true)}
                />
                <p className="text-xs text-foreground-muted">
                  {waOpened ? "WhatsApp aperto: se non hai toccato Invia, tocca di nuovo il pulsante." : "Facoltativo. Si apre WhatsApp con il messaggio già scritto (con il link per annullare): controlla e tocca Invia."}
                </p>
              </>
            ) : queued ? (
              <p className="text-sm font-medium text-foreground">✓ La manda il telefono del locale: è nella lista «Da mandare su WhatsApp».</p>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={queue} className="flex min-h-12 w-full items-center justify-center rounded-xl border border-[#137a43]/40 px-4 text-[15px] font-semibold text-[#137a43] hover:bg-[#137a43]/10 disabled:opacity-60 dark:text-[#3fae74]">
                  Da mandare dal telefono del locale
                </button>
                <p className="text-xs text-foreground-muted">Facoltativo: se il cliente vuole la conferma su WhatsApp, la manda il telefono del locale.</p>
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
          save(false);
        }}
      >
        {conflict && (
          <p ref={conflictRef} role="alert" className="rounded-xl border border-gold/40 bg-gold/[0.08] px-3 py-2.5 text-sm font-medium text-foreground">
            {conflict}
          </p>
        )}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Nome</span>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} autoComplete="off" autoCapitalize="words" placeholder="es. Rossi" className={inputClass} aria-invalid={errors?.field === "name" || undefined} />
            {err("name")}
          </label>
          <label className="block">
            <span className={fieldLabel}>Telefono{f.source === "persona" || (booking && !booking.phone) ? " (facoltativo)" : ""}</span>
            <input value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} type="tel" inputMode="tel" autoComplete="off" placeholder="es. 333 123 4567" className={inputClass} aria-invalid={errors?.field === "phone" || undefined} />
            {err("phone") ?? (
              <span className="mt-1 block text-xs text-foreground-muted">
                {f.source === "persona" ? "Consigliato: serve per la conferma o per avvisare se cambia qualcosa." : "Serve per la conferma su WhatsApp e per avvisare se cambia qualcosa."}
              </span>
            )}
          </label>
        </div>

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
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-foreground-muted">
            Di più:
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={peopleQuick.includes(Number(f.people)) ? "" : f.people}
              onChange={(e) => set("people", e.target.value)}
              aria-label="Altro numero di persone"
              placeholder="es. 12"
              className={`${inputClass} w-24!`}
            />
          </label>
          {err("people")}
        </div>

        <div>
          <span className={fieldLabel}>Giorno</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {[today, addDays(today, 1)].map((d) => (
              <button key={d} type="button" aria-pressed={f.day === d} onClick={() => set("day", d)} className={`${choice(f.day === d)} px-4`}>
                {d === today ? quick.today : quick.tomorrow}
              </button>
            ))}
            <input
              type="date"
              value={f.day}
              min={booking && booking.day < today ? booking.day : today}
              max={addDays(today, 365)}
              onChange={(e) => e.target.value && set("day", e.target.value)}
              aria-label="Giorno"
              className={`${inputClass} w-auto! flex-1 sm:flex-none`}
            />
          </div>
          {/^\d{4}-\d{2}-\d{2}$/.test(f.day) && <p className="mt-1 text-sm font-medium text-foreground first-letter:uppercase">{dayLong(f.day)}</p>}
          {err("day")}
        </div>

        <div>
          <span id="nuova-ora" className={fieldLabel}>
            Ora
          </span>
          {slots.length > 0 ? (
            <div role="radiogroup" aria-labelledby="nuova-ora" className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {slots.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={f.time === t} onClick={() => set("time", t)} className={choice(f.time === t)}>
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">Quel giorno il locale risulta chiuso: scrivi l&apos;ora qui sotto.</p>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-foreground-muted">
            Un altro orario:
            <input type="time" value={slots.includes(f.time) ? "" : f.time} onChange={(e) => set("time", e.target.value)} aria-label="Un altro orario" className={`${inputClass} w-32!`} />
          </label>
          {err("time")}
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
      {ask && (
        <ConfirmSheet title={ask} confirmLabel="Segna lo stesso" busy={busy} onConfirm={() => save(true)} onCancel={() => setAsk(null)}>
          <p>{/già passate/.test(ask) ? "Controlla giorno e ora: forse volevi un altro giorno. Se sono giusti (per esempio la segni dopo), si segna lo stesso." : "Controlla giorno e ora. Se sono giusti (per esempio una serata privata), si segna lo stesso."}</p>
        </ConfirmSheet>
      )}
    </Sheet>
  );
}

// I campi del modulo da una prenotazione (o dai dati arrivati dopo un conflitto).
function fieldsOf(b: Pick<BookingItem, "name" | "phone" | "people" | "day" | "time" | "table" | "note" | "allergies"> | AgendaFields): Omit<FormState, "source"> {
  return {
    name: b.name,
    phone: b.phone ? phoneDisplay(b.phone) : "",
    people: String(b.people),
    day: b.day,
    time: b.time,
    table: b.table ?? "",
    note: b.note ?? "",
    allergies: b.allergies,
  };
}

// ---------- Scheda «Agenda»

export function Agenda({
  rows,
  cancelled,
  countTests,
  day,
  setDay,
  today,
  now,
  onOpen,
  onNew,
}: {
  // Le confermate di tutti i giorni caricati (dagli ultimi 30 giorni in poi).
  rows: BookingItem[];
  // Le annullate che erano in agenda: in fondo al giorno, barrate (come sul librone).
  cancelled: BookingItem[];
  // Con la funzione spenta tutto è di prova e si conta; accesa, le prove non contano nei totali.
  countTests: boolean;
  day: string;
  setDay: (d: string) => void;
  today: string;
  now: number;
  onOpen: (id: string) => void;
  onNew: (day: string) => void;
}) {
  const list = useMemo(() => rows.filter((b) => b.day === day).sort((a, b) => a.startsAt - b.startsAt || a.createdAt - b.createdAt), [rows, day]);
  const gone = useMemo(() => cancelled.filter((b) => b.day === day).sort((a, b) => a.startsAt - b.startsAt), [cancelled, day]);
  const counted = list.filter((b) => countTests || !b.isTest);
  const totals = agendaTotals(counted);
  const arrived = counted.filter((b) => b.arrivedAt).length;
  const min = addDays(today, -30);
  const max = addDays(today, 365);
  const label = dayLabel(day, today);
  // Tra mezzanotte e le 5 il giorno dopo è già cominciato: niente «Domani», solo la data.
  const night = romeParts(new Date(now)).dateKey !== today;
  const near = label === "Oggi" || label === "Ieri" || (label === "Domani" && !night) ? label : null;

  return (
    <section aria-label="Agenda" className="space-y-3">
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Giorno prima" title="Giorno prima" disabled={day <= min} onClick={() => setDay(addDays(day, -1))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl text-foreground hover:border-accent disabled:opacity-40">
          ‹
        </button>
        <label className="relative min-w-0 flex-1">
          {/* Due righe: «Domani» piccolo sopra, la data intera sotto (niente puntini su telefono). */}
          <span className="flex min-h-11 flex-col items-center justify-center rounded-full border border-border bg-surface px-4 py-1 text-center leading-tight">
            {near && <span className="text-xs font-medium text-foreground-muted">{near}</span>}
            <span className="text-sm font-semibold text-foreground first-letter:uppercase">{dayLong(day)}</span>
          </span>
          {/* Il campo data copre l'etichetta: un tocco apre il calendario del telefono. */}
          <input
            type="date"
            value={day}
            min={min}
            max={max}
            onChange={(e) => e.target.value && setDay(e.target.value < min ? min : e.target.value > max ? max : e.target.value)}
            aria-label="Scegli la data"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <button type="button" aria-label="Giorno dopo" title="Giorno dopo" disabled={day >= max} onClick={() => setDay(addDays(day, 1))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl text-foreground hover:border-accent disabled:opacity-40">
          ›
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{counted.length ? totals.text : "Nessuna prenotazione"}</span>
          {day === today && counted.length > 0 && <span className="text-foreground-muted"> · arrivati {arrived} su {counted.length}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {day !== today && (
            <button type="button" onClick={() => setDay(today)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground hover:border-accent">
              Oggi
            </button>
          )}
          <button type="button" onClick={() => window.print()} disabled={!list.length} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50">
            Stampa il giorno
          </button>
        </div>
      </div>

      {list.length === 0 && gone.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">Nessuna prenotazione {day === today ? "per oggi" : "per questo giorno"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">Qui c&apos;è tutto il giorno, come sul librone: le prenotazioni dal sito e quelle segnate a mano.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {list.map((b) => (
            <AgendaRow key={b.id} b={b} now={now} onOpen={onOpen} />
          ))}
          {gone.map((b) => (
            <AgendaRow key={b.id} b={b} now={now} onOpen={onOpen} cancelled />
          ))}
        </ul>
      )}

      {day >= today && (
        <button type="button" onClick={() => onNew(day)} className="min-h-11 w-full rounded-xl border border-dashed border-border text-sm font-semibold text-foreground-muted hover:border-accent hover:text-foreground">
          + Segna in questo giorno
        </button>
      )}

      <AgendaPrint day={day} list={list} totals={counted.length ? totals.text : "Nessuna prenotazione"} countTests={countTests} />
    </section>
  );
}

function AgendaRow({ b, now, onOpen, cancelled = false }: { b: BookingItem; now: number; onOpen: (id: string) => void; cancelled?: boolean }) {
  const late = !cancelled && !b.arrivedAt && !b.noShowAt && b.startsAt < now && b.startsAt > now - 3 * 3600000;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(b.id)}
        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-2/60 ${cancelled ? "opacity-55" : b.noShowAt ? "opacity-60" : ""}`}
      >
        <span className={`w-12 shrink-0 pt-0.5 text-base font-semibold tabular-nums text-foreground ${cancelled ? "line-through" : ""}`}>{b.time}</span>
        <span className={`w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-foreground ${cancelled ? "line-through" : ""}`}>
          {b.people} <span className="text-xs font-normal text-foreground-muted">pers.</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[15px] font-semibold text-foreground ${cancelled ? "line-through" : ""}`}>{b.name}</span>
          {b.note && !cancelled && <span className="mt-0.5 block text-sm text-foreground-muted [overflow-wrap:anywhere]">«{b.note}»</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {cancelled && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-foreground-muted ring-1 ring-inset ring-border">Annullata</span>}
            {b.table && !cancelled && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-semibold text-accent-ink">{tableText(b.table)}</span>}
            {b.allergies && !cancelled && <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">{ALLERGY_SHORT}</span>}
            {b.isTest && <TestChip />}
            {b.arrivedAt && !cancelled && <span className="font-semibold text-success">✓ Arrivati alle {clock(b.arrivedAt)}</span>}
            {b.noShowAt && !cancelled && <span className="font-semibold text-danger">Non venuti</span>}
            {late && <span className="font-medium text-gold">non ancora arrivati</span>}
            <span className="text-foreground-muted">{originShort(b)}</span>
          </span>
        </span>
        <span aria-hidden className="self-center text-foreground-muted">
          ›
        </span>
      </button>
    </li>
  );
}

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

function AgendaPrint({ day, list, totals, countTests }: { day: string; list: BookingItem[]; totals: string; countTests: boolean }) {
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
        }
      `}</style>
      <h1>{capital(dayLong(day))}</h1>
      <p className="tot">{totals}</p>
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
              <td className="num b">{printTime(b.time)}</td>
              <td className="num b">{b.people}</td>
              <td className="b nome">{b.name}</td>
              <td>{b.table ?? ""}</td>
              <td className="num">{b.phone ? phoneDisplay(b.phone) : ""}</td>
              <td className="nota">
                {b.allergies ? <strong>⚠ Allergie. </strong> : null}
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
