"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { ZoomableImage } from "@/components/zoomable-image";
import { resizeToJpeg } from "@/lib/image-resize";
import { pdfToJpegs, type PageImage } from "@/lib/pdf-pages";
import { addPromoPage, clearPromoPages, movePromoPage, removePromoPage, setPromoMenu } from "./promo-actions";
import { inputClass } from "./sheet";
import type { EditorPromo, RunFn } from "./menu-editor";

const MAX_PAGES = 6;
const DEFAULT_NOTICE = "Allergeni: chiedi al personale.";

// Impostazioni del menù speciale di un evento: voce per voce o PDF/foto, note in
// cima, avviso allergeni unico; con «PDF o foto» anche le pagine caricate.
export function EventMenuPanel({ promo, run }: { promo: EditorPromo; run: RunFn }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"ITEMS" | "FILE">(promo.menuMode);
  const [note, setNote] = useState(promo.menuNote ?? "");
  const [notice, setNotice] = useState(promo.allergenNotice !== null);
  const [noticeText, setNoticeText] = useState(promo.allergenNotice ?? DEFAULT_NOTICE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef(false);

  const changed =
    mode !== promo.menuMode ||
    note.trim() !== (promo.menuNote ?? "") ||
    (mode === "FILE" || notice) !== (promo.allergenNotice !== null) ||
    ((mode === "FILE" || notice) && noticeText.trim() !== (promo.allergenNotice ?? DEFAULT_NOTICE));

  async function save(nextMode = mode) {
    setBusy(true);
    await run(() => setPromoMenu(promo.id, { mode: nextMode, note, allergenNotice: nextMode === "FILE" || notice, allergenText: noticeText }), "Menù speciale salvato");
    setBusy(false);
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = [...files];
    setBusy(true);
    try {
      let images: PageImage[] = [];
      const pdf = list.find((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      const room = MAX_PAGES - (replaceRef.current ? 0 : promo.pages.length);
      if (pdf) {
        if (list.length > 1) throw new Error("Scegli un solo PDF, oppure solo foto.");
        images = await pdfToJpegs(pdf, room, (n, total) => setProgress(`Preparo la pagina ${n} di ${total}…`));
      } else {
        if (list.length > room) throw new Error(`Al massimo ${MAX_PAGES} pagine in tutto.`);
        for (const [i, f] of list.entries()) {
          setProgress(`Preparo la foto ${i + 1} di ${list.length}…`);
          images.push(await resizeToJpeg(f, 1400, 2400));
        }
      }
      if (replaceRef.current) await clearPromoPages(promo.id);
      for (const [i, img] of images.entries()) {
        setProgress(`Carico la pagina ${i + 1} di ${images.length}…`);
        const fd = new FormData();
        fd.set("promoId", promo.id);
        fd.set("file", img.blob, `pagina-${i + 1}.jpg`);
        fd.set("width", String(img.width));
        fd.set("height", String(img.height));
        const res = await addPromoPage(fd);
        if (!res.ok) throw new Error(res.error);
      }
      // Caricare un menù vuol dire usarlo: si passa a «PDF o foto» se non lo era già.
      if (promo.menuMode !== "FILE") await setPromoMenu(promo.id, { mode: "FILE", note, allergenNotice: true, allergenText: noticeText });
      toast.showSuccess(images.length === 1 ? "Pagina caricata" : `${images.length} pagine caricate`);
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Impossibile caricare il file.");
    }
    replaceRef.current = false;
    setProgress(null);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function pageAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    if (!res.ok) toast.showError(res.error ?? "Errore.");
    setBusy(false);
    router.refresh();
  }

  const pill = "min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-40";

  return (
    <section aria-label="Impostazioni del menù speciale" className="space-y-4 rounded-2xl border border-border bg-surface px-4 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Come preparare il menù speciale</p>
        <div role="radiogroup" aria-label="Tipo di menù speciale" className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["ITEMS", "Voce per voce", "Gruppi, voci e prezzi"],
              ["FILE", "PDF o foto", "Carichi il menù già pronto"],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-14 rounded-xl border px-3 py-2 text-left transition-colors ${
                mode === value ? "border-accent bg-accent/10" : "border-border hover:border-accent"
              }`}
            >
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="block text-[11px] text-foreground-muted">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground-muted">Note del menù (facoltative, in cima)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} rows={2} className={inputClass} placeholder="es. Menù degustazione per tutto il tavolo, su prenotazione" />
      </label>

      <div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={mode === "FILE" || notice}
            disabled={mode === "FILE"}
            onChange={(e) => setNotice(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          Avviso allergeni unico in fondo al menù
        </label>
        {(mode === "FILE" || notice) && (
          <input value={noticeText} onChange={(e) => setNoticeText(e.target.value)} maxLength={200} aria-label="Testo dell'avviso allergeni" className={inputClass} />
        )}
        <p className="mt-1 text-[11px] text-foreground-muted">
          {mode === "FILE"
            ? "Con il PDF o le foto è sempre acceso: il sito non conosce gli allergeni del file."
            : "Se acceso, i piatti di questo evento non chiedono gli allergeni uno per uno."}
        </p>
      </div>

      {changed && (
        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={() => save()} className="min-h-10 rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">
            Salva
          </button>
        </div>
      )}

      {mode === "FILE" && (
        <div className="border-t border-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Pagine del menù</p>
          <p className="mt-0.5 text-[11px] text-foreground-muted">
            Un PDF fino a {MAX_PAGES} pagine, oppure da 1 a {MAX_PAGES} foto. Il PDF diventa immagini: i clienti lo leggono dentro il menù.
          </p>
          {promo.pages.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {promo.pages.map((p, i) => (
                <li key={p.id} className="flex flex-col items-center gap-1.5">
                  <ZoomableImage src={`/menu/p/${promo.slug}/pagina/${p.id}`} label={`Ingrandisci la pagina ${i + 1}`} className="h-28 w-20 rounded-lg border border-border bg-white object-contain" />
                  <span className="text-[11px] text-foreground-muted">Pagina {i + 1}</span>
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Sposta su la pagina ${i + 1}`} disabled={busy || i === 0} onClick={() => pageAction(() => movePromoPage(p.id, "up"))} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" aria-label={`Sposta giù la pagina ${i + 1}`} disabled={busy || i === promo.pages.length - 1} onClick={() => pageAction(() => movePromoPage(p.id, "down"))} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted disabled:opacity-30">
                      ↓
                    </button>
                    <button type="button" aria-label={`Togli la pagina ${i + 1}`} disabled={busy} onClick={() => pageAction(() => removePromoPage(p.id))} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground-muted hover:border-danger hover:text-danger disabled:opacity-30">
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Scegli PDF o foto del menù" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {promo.pages.length < MAX_PAGES && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  replaceRef.current = false;
                  fileRef.current?.click();
                }}
                className="min-h-11 rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                {promo.pages.length ? "+ Aggiungi pagine" : "Carica PDF o foto"}
              </button>
            )}
            {promo.pages.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  replaceRef.current = true;
                  fileRef.current?.click();
                }}
                className={pill}
              >
                Sostituisci tutto
              </button>
            )}
            {progress && <span className="text-xs text-foreground-muted">{progress}</span>}
          </div>
          {promo.pages.length === 0 && !progress && (
            <p className="mt-2 text-[11px] text-gold">Nessuna pagina: finché non carichi il menù, i clienti vedono solo locandina e testo.</p>
          )}
        </div>
      )}
    </section>
  );
}
