"use client";

import { IconVenue, PanelHead } from "./panel-head";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { ZoomableImage } from "@/components/zoomable-image";
import { resizeToJpeg } from "@/lib/image-resize";
import { formatPromoDates } from "@/lib/menu-format";
import {
  DAY_NAMES,
  openStatus,
  weeklyRows,
  type Contacts,
  type Hero,
  type Hours,
  type HoursException,
  type Range,
} from "@/lib/menu-venue";
import { createPromo } from "./promo-actions";
import { removeHeroImage, saveContacts, saveHero, saveHeroImage, saveHours } from "./venue-actions";
import { Field, Sheet, dateInputClass, inputClass } from "./sheet";
import type { RunFn } from "./menu-editor";

export type EditorVenue = { hero: Hero; heroImageVersion: number | null; hours: Hours; contacts: Contacts };

export type VenueSheetKind = "hero" | "hours" | "contacts";

// --- Riquadro «Il locale» ------------------------------------------------------

export function VenuePanel({ venue, onOpen, defaultOpen = false }: { venue: EditorVenue; onOpen: (kind: VenueSheetKind) => void; defaultOpen?: boolean }) {
  // Nella scheda «Orari e contatti» è già aperto: lì non c'è altro.
  const [open, setOpen] = useState(defaultOpen);
  // Aperto/chiuso sull'orologio del dispositivo, calcolato dopo il primo disegno
  // (come sul menù dei clienti): così server e browser non si contraddicono.
  const [status, setStatus] = useState<ReturnType<typeof openStatus>>(null);
  useEffect(() => {
    const update = () => setStatus(openStatus(venue.hours, new Date()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [venue.hours]);
  const upcoming = venue.hours.exceptions.length;
  const rows: { kind: VenueSheetKind; title: string; summary: string; label: string }[] = [
    {
      kind: "hero",
      title: "Testo e foto della copertina",
      summary: `Testo: «${venue.hero.title.replace(/\n/g, " ")}» · Foto: ${venue.heroImageVersion ? "personalizzata" : "predefinita"}`,
      label: "Modifica la copertina",
    },
    {
      kind: "hours",
      title: "Orari",
      summary: `${status ? status.label : "Indicazione «Aperto ora» spenta"}${upcoming ? ` · ${upcoming} eccezion${upcoming === 1 ? "e" : "i"}` : ""}`,
      label: "Modifica gli orari",
    },
    {
      kind: "contacts",
      title: "Contatti",
      summary: [venue.contacts.phone, venue.contacts.address].filter(Boolean).join(" · ") || "Nessun contatto",
      label: "Modifica i contatti",
    },
  ];
  return (
    <section aria-label="Il locale" className="mb-5 rounded-2xl border border-border bg-surface px-4 py-3.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 w-full items-center rounded-xl text-left"
      >
        <PanelHead
          icon={IconVenue}
          tone={status ? (status.open ? "success" : "muted") : "muted"}
          title="Il locale"
          chevron={open ? "open" : "closed"}
          badge={
            status ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  status.open ? "bg-success/15 text-success" : "bg-danger/10 text-danger"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${status.open ? "bg-success" : "bg-danger"}`} />
                {status.label}
              </span>
            ) : undefined
          }
          subtitle="Copertina, orari e contatti che vedono i clienti"
        />
      </button>
      <ul className={`mt-1 divide-y divide-border ${open ? "" : "hidden"}`}>
        {rows.map((row) => (
          <li key={row.kind}>
            <button
              type="button"
              onClick={() => onOpen(row.kind)}
              aria-label={row.label}
              className="flex min-h-12 w-full items-center gap-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{row.title}</span>
                <span className="line-clamp-2 break-words text-[11px] text-foreground-muted">{row.summary}</span>
              </span>
              <span aria-hidden="true" className="text-xs text-foreground-muted">
                Modifica
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Copertina -------------------------------------------------------------------

export function HeroSheet({ venue, run, onClose }: { venue: EditorVenue; run: RunFn; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(venue.hero.title);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = file ? URL.createObjectURL(file) : null;
  const currentUrl = venue.heroImageVersion && !removeImage ? `/menu/copertina?v=${venue.heroImageVersion}` : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => saveHero({ title }), "Copertina salvata");
    if (result === null) {
      setBusy(false);
      return;
    }
    try {
      if (file) {
        const resized = await resizeToJpeg(file, 1600, 1600);
        const formData = new FormData();
        formData.set("file", resized.blob, "copertina.jpg");
        const res = await saveHeroImage(formData);
        if (!res.ok) toast.showError(res.error);
      } else if (removeImage && venue.heroImageVersion) {
        await removeHeroImage();
      }
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Impossibile caricare la foto.");
    }
    router.refresh();
    setBusy(false);
    onClose();
  }

  return (
    <Sheet title="Copertina del menù" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Titolo" hint="Una riga per rigo, al massimo 3. «e Menù» mantiene la «e» in corsivo.">
          <textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={3} maxLength={130} className={inputClass} />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-foreground-muted">Foto di sfondo</p>
          <div className="flex items-center gap-3">
            {previewUrl || currentUrl ? (
              <ZoomableImage src={previewUrl ?? currentUrl ?? ""} className="h-[72px] w-[96px] rounded-lg border border-border object-cover" />
            ) : (
              <div className="flex h-[72px] w-[96px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border px-1 text-center text-[11px] text-foreground-muted">
                Foto predefinita
              </div>
            )}
            <div className="flex flex-col items-start gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setRemoveImage(false);
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
              >
                {previewUrl || currentUrl ? "Cambia foto" : "Scegli foto"}
              </button>
              {(previewUrl || currentUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setRemoveImage(true);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="min-h-9 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-danger"
                >
                  Torna alla foto predefinita
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-foreground-muted/80">Meglio orizzontale o quadrata, con la parte scura in basso. Si ridimensiona da sola.</p>
        </div>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : "Salva"}
        </button>
      </form>
    </Sheet>
  );
}

// --- Orari -----------------------------------------------------------------------

function RangesEditor({ ranges, onChange, label }: { ranges: Range[]; onChange: (next: Range[]) => void; label: string }) {
  return (
    <div className="space-y-2">
      {ranges.map((range, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
          <input
            type="time"
            value={range.open}
            aria-label={`${label}: apertura fascia ${i + 1}`}
            onChange={(e) => onChange(ranges.map((r, j) => (j === i ? { ...r, open: e.target.value } : r)))}
            className={dateInputClass}
          />
          <input
            type="time"
            value={range.close}
            aria-label={`${label}: chiusura fascia ${i + 1}`}
            onChange={(e) => onChange(ranges.map((r, j) => (j === i ? { ...r, close: e.target.value } : r)))}
            className={dateInputClass}
          />
          <button
            type="button"
            onClick={() => onChange(ranges.filter((_, j) => j !== i))}
            aria-label={`${label}: togli fascia ${i + 1}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-2 hover:text-danger"
          >
            ✕
          </button>
        </div>
      ))}
      {ranges.length < 4 && (
        <button
          type="button"
          onClick={() => onChange([...ranges, ranges.length ? { open: "16:30", close: "22:00" } : { open: "10:00", close: "13:00" }])}
          className="min-h-10 rounded-full border border-dashed border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
        >
          + Aggiungi fascia
        </button>
      )}
    </div>
  );
}

type DraftException = HoursException & { announce: boolean };

export function HoursSheet({ hours, today, run, onClose }: { hours: Hours; today: string; run: RunFn; onClose: () => void }) {
  const [showStatus, setShowStatus] = useState(hours.showStatus);
  const [weekly, setWeekly] = useState<Range[][]>(hours.weekly);
  // Le eccezioni già passate non servono più: non si mostrano e non si salvano.
  const [exceptions, setExceptions] = useState<DraftException[]>(
    hours.exceptions.filter((e) => e.endDate >= today).map((e) => ({ ...e, announce: false })),
  );
  const [busy, setBusy] = useState(false);

  const setDay = (i: number, ranges: Range[]) => setWeekly((w) => w.map((r, j) => (j === i ? ranges : r)));
  const setException = (id: string, patch: Partial<DraftException>) =>
    setExceptions((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload: Hours = {
      showStatus,
      weekly,
      exceptions: exceptions.map(({ announce: _announce, ...rest }) => {
        void _announce;
        return rest;
      }),
    };
    const result = await run(() => saveHours(payload), "Orari salvati");
    if (result === null) {
      setBusy(false);
      return;
    }
    // Chiusura o apertura straordinaria appena aggiunta: se richiesto, anche l'annuncio.
    for (const ex of exceptions.filter((x) => x.announce)) {
      const title = ex.note.trim() || (ex.closed ? "Chiusura straordinaria" : "Apertura straordinaria");
      const body = ex.closed ? "Il locale resterà chiuso." : `Orario: ${ex.ranges.map((r) => `${r.open}–${r.close}`).join(" · ")}.`;
      await run(
        () => createPromo({ kind: "NOTICE", title: title.slice(0, 80), label: "Orari", body, showFrom: today, startDate: ex.startDate, endDate: ex.endDate }),
        "Annuncio creato",
      );
    }
    setBusy(false);
    onClose();
  }

  const invalid = exceptions.some((x) => !x.startDate || !x.endDate || (!x.closed && x.ranges.length === 0));

  return (
    <Sheet title="Orari" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input type="checkbox" checked={showStatus} onChange={(e) => setShowStatus(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          <span>
            Mostra «Aperto ora / Chiuso» in copertina
            <span className="block text-[11px] text-foreground-muted">Si calcola da solo dagli orari qui sotto.</span>
          </span>
        </label>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-medium text-foreground-muted">Orari della settimana</legend>
          {DAY_NAMES.map((name, i) => (
            <div key={name} className="rounded-xl border border-border px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={weekly[i].length > 0}
                    aria-label={`${name}: aperto`}
                    onChange={(e) => setDay(i, e.target.checked ? [{ open: "17:00", close: "21:00" }] : [])}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                  {name}
                </label>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => setDay(i, weekly[i - 1].map((r) => ({ ...r })))}
                    className="min-h-9 text-[11px] font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Come {DAY_NAMES[i - 1].toLowerCase()}
                  </button>
                )}
              </div>
              {weekly[i].length > 0 ? (
                <div className="mt-2">
                  <RangesEditor ranges={weekly[i]} onChange={(next) => setDay(i, next)} label={name} />
                </div>
              ) : (
                <p className="text-[11px] text-foreground-muted">Chiuso</p>
              )}
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-medium text-foreground-muted">Chiusure e aperture straordinarie</legend>
          {exceptions.length === 0 && <p className="text-[11px] text-foreground-muted">Nessuna in programma. Valgono al posto degli orari della settimana, nei giorni indicati.</p>}
          {exceptions.map((ex, n) => (
            <div key={ex.id} className="space-y-3 rounded-xl border border-border px-3.5 py-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dal">
                  <input
                    type="date"
                    value={ex.startDate}
                    onChange={(e) => setException(ex.id, { startDate: e.target.value, endDate: ex.endDate < e.target.value ? e.target.value : ex.endDate })}
                    className={dateInputClass}
                    aria-label={`Eccezione ${n + 1}: dal`}
                  />
                </Field>
                <Field label="Al">
                  <input
                    type="date"
                    value={ex.endDate}
                    min={ex.startDate}
                    onChange={(e) => setException(ex.id, { endDate: e.target.value })}
                    className={dateInputClass}
                    aria-label={`Eccezione ${n + 1}: al`}
                  />
                </Field>
              </div>
              <div role="radiogroup" aria-label={`Eccezione ${n + 1}: tipo`} className="grid grid-cols-2 gap-2">
                {[
                  { closed: true, label: "Chiuso" },
                  { closed: false, label: "Aperto con orario" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={ex.closed === opt.closed}
                    onClick={() => setException(ex.id, { closed: opt.closed, ranges: opt.closed ? [] : ex.ranges.length ? ex.ranges : [{ open: "17:00", close: "21:00" }] })}
                    className={`min-h-11 rounded-xl border px-2 text-xs font-semibold ${
                      ex.closed === opt.closed ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground-muted hover:border-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {!ex.closed && <RangesEditor ranges={ex.ranges} onChange={(next) => setException(ex.id, { ranges: next })} label={`Eccezione ${n + 1}`} />}
              <Field label="Motivo (facoltativo)" hint="Compare accanto a «Chiuso oggi».">
                <input
                  value={ex.note}
                  onChange={(e) => setException(ex.id, { note: e.target.value })}
                  maxLength={120}
                  placeholder="es. Ferie, evento privato"
                  aria-label={`Eccezione ${n + 1}: motivo`}
                  className={inputClass}
                />
              </Field>
              {ex.id.startsWith("new-") && (
                <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                  <input type="checkbox" checked={ex.announce} onChange={(e) => setException(ex.id, { announce: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
                  Pubblica anche un annuncio sul menù
                </label>
              )}
              <button
                type="button"
                onClick={() => setExceptions((list) => list.filter((x) => x.id !== ex.id))}
                className="min-h-10 rounded-full border border-danger/40 px-3.5 text-xs font-medium text-danger hover:bg-danger/10"
              >
                Elimina eccezione
              </button>
              <p className="text-[11px] text-foreground-muted">{formatPromoDates(ex.startDate || today, ex.endDate || today)}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setExceptions((list) => [
                ...list,
                { id: `new-${Date.now().toString(36)}-${list.length}`, startDate: today, endDate: today, closed: true, ranges: [], note: "", announce: false },
              ])
            }
            className="min-h-11 w-full rounded-xl border border-dashed border-border px-4 text-sm font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            + Aggiungi chiusura o apertura straordinaria
          </button>
        </fieldset>

        <button
          type="submit"
          disabled={busy || invalid}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : "Salva"}
        </button>
        <p className="text-[11px] text-foreground-muted">
          Anteprima: {weeklyRows({ showStatus, weekly, exceptions: [] }).map((r) => `${r.days} ${r.text}`).join(" · ")}
        </p>
      </form>
    </Sheet>
  );
}

// --- Contatti --------------------------------------------------------------------

export function ContactsSheet({ contacts, run, onClose }: { contacts: Contacts; run: RunFn; onClose: () => void }) {
  const [phone, setPhone] = useState(contacts.phone);
  const [whatsappMessage, setWhatsappMessage] = useState(contacts.whatsappMessage);
  const [address, setAddress] = useState(contacts.address);
  const [instagram, setInstagram] = useState(contacts.instagram);
  const [review, setReview] = useState(contacts.review);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => saveContacts({ phone, whatsappMessage, address, instagram, review }), "Contatti salvati");
    setBusy(false);
    if (result) onClose();
  }

  return (
    <Sheet title="Contatti" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Telefono" hint="Serve per «Chiama» e «WhatsApp». Vuoto = i due pulsanti non compaiono.">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className={inputClass} placeholder="es. 338 327 7053" />
        </Field>
        <Field label="Messaggio WhatsApp" hint="Già scritto quando il cliente apre la chat.">
          <textarea value={whatsappMessage} onChange={(e) => setWhatsappMessage(e.target.value)} maxLength={300} rows={2} className={inputClass} />
        </Field>
        <Field label="Indirizzo" hint="Serve per «Come arrivare» (Google Maps). Vuoto = nessun pulsante.">
          <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={160} className={inputClass} />
        </Field>
        <Field label="Link Instagram" hint="Deve iniziare con https://">
          <input type="url" value={instagram} onChange={(e) => setInstagram(e.target.value)} maxLength={300} className={inputClass} placeholder="https://www.instagram.com/…" />
        </Field>
        <Field label="Link per la recensione su Google" hint="Dal tuo profilo Google, «Scrivi una recensione». Deve iniziare con https://">
          <input type="url" value={review} onChange={(e) => setReview(e.target.value)} maxLength={300} className={inputClass} placeholder="https://…" />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : "Salva"}
        </button>
      </form>
    </Sheet>
  );
}
