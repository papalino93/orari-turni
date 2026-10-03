"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { ZoomableImage } from "@/components/zoomable-image";
import { blockSummary, formatPromoDates, promoStatus, type MenuBlockView, type PromoStatus } from "@/lib/menu-format";
import { resizeToJpeg } from "@/lib/image-resize";
import { pdfFirstPage } from "@/lib/pdf-pages";
import { createPromo, deletePromo, duplicatePromo, removePromoImage, savePromoImage, setPromoHidden, updatePromo } from "./promo-actions";
import { Field, Sheet, dateInputClass, inputClass } from "./sheet";
import type { EditorPromo, RunFn } from "./menu-editor";

export const STATUS_LABEL: Record<PromoStatus | "hidden", string> = {
  scheduled: "In programma",
  announced: "Annunciato",
  live: "In corso",
  past: "Concluso",
  hidden: "Nascosto",
};

export function effectiveStatus(promo: EditorPromo, today: string): PromoStatus | "hidden" {
  return promo.hidden ? "hidden" : promoStatus(promo, today);
}

export function StatusChip({ status }: { status: PromoStatus | "hidden" }) {
  const tone =
    status === "live"
      ? "bg-success-bg text-success"
      : status === "announced" || status === "scheduled"
        ? "bg-gold/15 text-gold"
        : "bg-surface-2 text-foreground-muted";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

// Scheda della pagina selezionata: stato, date, azioni rapide.
export function PromoCard({
  promo,
  today,
  run,
  onEdit,
  onDuplicate,
}: {
  promo: EditorPromo;
  today: string;
  run: RunFn;
  onEdit: () => void;
  onDuplicate: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = effectiveStatus(promo, today);

  async function toggleHidden() {
    setBusy(true);
    await run(() => setPromoHidden(promo.id, !promo.hidden), promo.hidden ? "Pagina di nuovo visibile" : "Pagina nascosta");
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const result = await run(() => deletePromo(promo.id), `«${promo.title}» eliminata`);
    setBusy(false);
    if (result) setConfirmingDelete(false);
  }

  const btn =
    "min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50";

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex gap-3.5">
        {promo.imageVersion ? (
          <ZoomableImage
            src={`/menu/p/${promo.slug}/immagine?v=${promo.imageVersion}`}
            label="Ingrandisci la locandina"
            className="h-[100px] w-[80px] rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="flex h-[100px] w-[80px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border px-2 text-center text-[11px] text-foreground-muted">
            Nessuna foto
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={status} />
            <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
              {promo.label || (promo.kind === "EVENT" ? (promo.hasMenu ? "Evento con menù speciale" : "Evento") : "Annuncio")}
            </span>
          </div>
          <h2 className="mt-1 break-words text-base font-semibold text-foreground">{promo.title}</h2>
          <p className="text-sm text-foreground-muted">{formatPromoDates(promo.startDate, promo.endDate)}</p>
          <p className="mt-1 text-[11px] text-foreground-muted">
            {promo.kind === "EVENT"
              ? promo.hasMenu
                ? "Locandina in «In evidenza» dal giorno scelto; il menù speciale solo durante l'evento."
                : "Locandina in «In evidenza» dal giorno scelto; nei giorni dell'evento si apre dopo la copertina."
              : "Compare in «In evidenza» dal giorno di inizio fino alla fine."}{" "}
            Dopo la fine sparisce da sola.
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={btn}>
          Modifica
        </button>
        <button type="button" onClick={onDuplicate} className={btn}>
          Duplica
        </button>
        <button type="button" disabled={busy} onClick={toggleHidden} className={btn}>
          {promo.hidden ? "Mostra" : "Nascondi"}
        </button>
        <a href={`/menu/p/${promo.slug}`} target="_blank" rel="noopener noreferrer" className={`${btn} flex items-center`}>
          Apri la pagina ↗
        </a>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger"
        >
          Elimina
        </button>
      </div>

      {confirmingDelete && (
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger-bg p-3">
          <p className="text-xs text-danger">Eliminare «{promo.title}»? Sparisce dal menù e resta recuperabile dallo storico.</p>
          <div className="mt-2.5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted">
              Annulla
            </button>
            <button type="button" disabled={busy} onClick={remove} className="min-h-10 rounded-full bg-danger px-3.5 text-xs font-semibold text-white disabled:opacity-60">
              Sì, elimina
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Creazione e modifica di un annuncio o di un evento.
export function PromoSheet({
  promo,
  today,
  blocks,
  fixedFoodSectionIds,
  run,
  onSaved,
  onClose,
}: {
  promo: EditorPromo | null;
  today: string;
  // Informazioni del menù: si sceglie quali mostrare anche nel menù speciale dell'evento.
  blocks: MenuBlockView[];
  fixedFoodSectionIds: string[];
  run: RunFn;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"NOTICE" | "EVENT">(promo?.kind ?? "EVENT");
  // Non tutti gli eventi hanno un menù loro (es. una degustazione fuori sede).
  const [hasMenu, setHasMenu] = useState(promo?.hasMenu ?? true);
  const [title, setTitle] = useState(promo?.title ?? "");
  const [label, setLabel] = useState(promo?.label ?? "");
  const [body, setBody] = useState(promo?.body ?? "");
  // Nuovo evento: di solito tra una settimana; la locandina compare da 7 giorni prima.
  const defaultStart = addDaysKey(today, 7);
  const [showFrom, setShowFrom] = useState(promo?.showFrom ?? today);
  const [startDate, setStartDate] = useState(promo?.startDate ?? defaultStart);
  const [endDate, setEndDate] = useState(promo?.endDate ?? defaultStart);
  const [showFromTouched, setShowFromTouched] = useState(promo !== null);
  // Un nuovo evento parte con le stesse informazioni della cucina (coperto, chiusura…).
  const sectionBlocks = blocks.filter((b) => b.placement === "SECTIONS");
  const [blockIds, setBlockIds] = useState<string[]>(
    sectionBlocks
      .filter((b) => (promo?.section ? b.sectionIds.includes(promo.section.id) : b.sectionIds.some((id) => fixedFoodSectionIds.includes(id))))
      .map((b) => b.id),
  );
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  // Locandina in PDF: si trasforma subito in immagine (prima pagina), così si vede l'anteprima.
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  async function pick(chosen: File | null) {
    setRemoveImage(false);
    setPdfNote(null);
    if (!chosen || !(chosen.type === "application/pdf" || /\.pdf$/i.test(chosen.name))) {
      setFile(chosen);
      return;
    }
    setConverting(true);
    try {
      const page = await pdfFirstPage(chosen);
      setFile(new File([page.blob], "locandina.jpg", { type: "image/jpeg" }));
      setPdfNote(page.pages > 1 ? `Dal PDF ho preso la prima pagina (su ${page.pages}).` : "Locandina presa dal PDF.");
    } catch {
      toast.showError("Non riesco a leggere questo PDF. Prova con un'immagine (JPG o PNG).");
      if (fileInput.current) fileInput.current.value = "";
    } finally {
      setConverting(false);
    }
  }

  const isEvent = kind === "EVENT";
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const currentUrl = promo?.imageVersion && !removeImage ? `/menu/p/${promo.slug}/immagine?v=${promo.imageVersion}` : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const input = {
      kind,
      title,
      label,
      body,
      showFrom: isEvent ? showFrom : startDate,
      startDate,
      endDate,
      blockIds: isEvent ? blockIds : undefined,
      hasMenu: isEvent ? hasMenu : true,
    };
    const result = promo
      ? await run(() => updatePromo(promo.id, input), "Pagina aggiornata")
      : await run(() => createPromo(input), isEvent ? "Evento creato" : "Annuncio creato");
    if (result === null) {
      setBusy(false);
      return;
    }
    const id = promo?.id ?? (result as unknown as { id: string }).id;

    try {
      if (file) {
        const resized = await resizeToJpeg(file);
        const formData = new FormData();
        formData.set("promoId", id);
        formData.set("file", resized.blob, "locandina.jpg");
        formData.set("width", String(resized.width));
        formData.set("height", String(resized.height));
        const res = await savePromoImage(formData);
        if (!res.ok) toast.showError(res.error);
      } else if (removeImage && promo?.imageVersion) {
        await removePromoImage(promo.id);
      }
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Impossibile caricare la foto.");
    }
    router.refresh();
    setBusy(false);
    onSaved(id);
    onClose();
  }

  return (
    <Sheet title={promo ? "Modifica pagina" : "Nuovo evento o annuncio"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        {!promo && (
          <div role="radiogroup" aria-label="Che cosa vuoi creare" className="grid grid-cols-2 gap-2">
            {(
              [
                ["EVENT", "Evento"],
                ["NOTICE", "Annuncio"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={`min-h-12 rounded-xl border px-2 text-xs font-medium leading-tight transition-colors ${
                  kind === value
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border text-foreground-muted hover:border-accent hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <Field label="Titolo">
          <input
            autoFocus={!promo}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
            className={inputClass}
            placeholder={isEvent ? "es. Oktoberfest" : "es. Chiusi il 25 dicembre"}
          />
        </Field>

        <Field label="Tipo" hint="Facoltativo: compare sopra al titolo. Scegli un suggerimento o scrivi il tuo.">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={30}
            list="promo-labels"
            className={inputClass}
            placeholder={isEvent ? "es. Degustazione" : "es. Avviso"}
          />
          <datalist id="promo-labels">
            {["Degustazione", "Cena a tema", "Serata a tema", "Musica dal vivo", "Festa", "Apertura straordinaria", "Chiusura", "Novità"].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>

        <Field label="Testo" hint="Facoltativo: due righe che spiegano di cosa si tratta.">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} rows={3} className={inputClass} />
        </Field>

        <div>
          <p className="mb-1 text-xs font-medium text-foreground-muted">Foto o locandina (immagine o PDF)</p>
          <div className="flex items-center gap-3">
            {previewUrl || currentUrl ? (
              <ZoomableImage src={previewUrl ?? currentUrl ?? ""} label="Ingrandisci la locandina" className="h-[88px] w-[70px] rounded-lg border border-border object-cover" />
            ) : (
              <div className="flex h-[88px] w-[70px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-foreground-muted">
                Nessuna
              </div>
            )}
            <div className="flex flex-col items-start gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*,application/pdf"
                aria-label="Scegli la foto o la locandina"
                className="sr-only"
                onChange={(e) => void pick(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={converting}
                onClick={() => fileInput.current?.click()}
                className="min-h-11 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                {converting ? "Preparo la locandina…" : previewUrl || currentUrl ? "Cambia foto o PDF" : "Scegli foto o PDF"}
              </button>
              {(previewUrl || currentUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPdfNote(null);
                    setRemoveImage(true);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="min-h-9 text-xs font-medium text-foreground-muted underline decoration-dotted underline-offset-2 hover:text-danger"
                >
                  Rimuovi foto
                </button>
              )}
            </div>
          </div>
          {pdfNote && <p className="mt-1 text-[11px] text-foreground">{pdfNote}</p>}
          <p className="mt-1 text-[11px] text-foreground-muted/80">Meglio verticale (4:5). Va bene anche un PDF: si usa la prima pagina. Si ridimensiona da sola.</p>
        </div>

        <div className="space-y-3">
          {isEvent && (
            <Field label="Mostra la locandina dal" hint="Per annunciarlo in anticipo.">
              <input
                type="date"
                value={showFrom}
                onChange={(e) => {
                  setShowFrom(e.target.value);
                  setShowFromTouched(true);
                }}
                required
                className={dateInputClass}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={isEvent ? "Inizio evento" : "Dal"}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setStartDate(value);
                  if (endDate < value) setEndDate(value);
                  // Finché non si sceglie a mano, la locandina compare 7 giorni prima.
                  if (!showFromTouched && value) setShowFrom(addDaysKey(value, -7));
                }}
                required
                className={dateInputClass}
              />
            </Field>
            <Field label={isEvent ? "Fine evento" : "Al"}>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required className={dateInputClass} />
            </Field>
          </div>
        </div>

        {isEvent && (
          <p className="-mt-1 text-[11px] text-foreground-muted">
            Da «Mostra la locandina dal» compare nella striscia «In evidenza»; nei giorni dell&apos;evento si apre a pagina piena subito dopo la copertina.
          </p>
        )}

        {isEvent && (
          <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5">
            <input type="checkbox" checked={hasMenu} onChange={(e) => setHasMenu(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-medium text-foreground">Ha un menù dedicato</span>
              <span className="block text-[11px] text-foreground-muted">
                Cibo e bevande della serata, voce per voce o in PDF. Senza spunta la pagina mostra solo locandina, testo e date.
              </span>
            </span>
          </label>
        )}

        {isEvent && hasMenu && (promo === null || promo.section !== null) && sectionBlocks.length > 0 && (
          <fieldset className="rounded-xl border border-border px-3 py-1.5">
            <legend className="px-1 text-[11px] text-foreground-muted">Nel menù speciale mostra anche</legend>
            {sectionBlocks.map((b) => (
              <label key={b.id} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={blockIds.includes(b.id)}
                  onChange={() => setBlockIds((prev) => (prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id]))}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate">{blockSummary(b)}</span>
              </label>
            ))}
          </fieldset>
        )}

        {isEvent && hasMenu && !promo && (
          <p className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3 text-xs leading-relaxed text-foreground">
            <span className="font-semibold">E il menù speciale?</span> Si compone subito dopo: tocca «Crea evento e componi il menù», si apre la
            pagina dell&apos;evento e lì aggiungi i gruppi (es. Da bere, Da mangiare) con le voci e i prezzi.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || converting || !title.trim()}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Salvo…" : promo ? "Salva" : isEvent ? (hasMenu ? "Crea evento e componi il menù" : "Crea evento") : "Crea annuncio"}
        </button>
      </form>
    </Sheet>
  );
}

// Duplica una pagina (e il suo menù speciale) per una nuova edizione.
export function DuplicatePromoSheet({
  promo,
  today,
  run,
  onSaved,
  onClose,
}: {
  promo: EditorPromo;
  today: string;
  run: RunFn;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const length = Math.max(0, diffDays(promo.startDate, promo.endDate));
  const [title, setTitle] = useState(promo.title);
  const nextStart = addDaysKey(today, 7);
  // Evento: locandina da subito; annuncio: compare dal giorno di inizio.
  const [showFrom, setShowFrom] = useState(promo.kind === "EVENT" ? today : nextStart);
  const [startDate, setStartDate] = useState(nextStart);
  const [endDate, setEndDate] = useState(addDaysKey(nextStart, length));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => duplicatePromo(promo.id, { title, showFrom, startDate, endDate }), "Pagina duplicata");
    setBusy(false);
    if (result) {
      onSaved(result.id);
      onClose();
    }
  }

  return (
    <Sheet title="Duplica per una nuova edizione" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <p className="text-sm text-foreground-muted">
          Copia testo, foto{promo.kind === "EVENT" ? ", gruppi, voci, formati e allergeni" : ""}. Scegli titolo e date: i prezzi li ritocchi dopo.
        </p>
        <Field label="Titolo">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required className={inputClass} />
        </Field>
        <div className="space-y-3">
          {promo.kind === "EVENT" && (
            <Field label="Mostra la locandina dal">
              <input type="date" value={showFrom} onChange={(e) => setShowFrom(e.target.value)} required className={dateInputClass} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={promo.kind === "EVENT" ? "Inizio evento" : "Dal"}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  // La fine si sposta con l'inizio, mantenendo la durata dell'edizione precedente.
                  if (e.target.value) setEndDate(addDaysKey(e.target.value, length));
                  if (promo.kind !== "EVENT") setShowFrom(e.target.value);
                }}
                required
                className={dateInputClass}
              />
            </Field>
            <Field label={promo.kind === "EVENT" ? "Fine evento" : "Al"}>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required className={dateInputClass} />
            </Field>
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Duplico…" : "Duplica"}
        </button>
      </form>
    </Sheet>
  );
}
