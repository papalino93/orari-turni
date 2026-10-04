"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { updateSectionTexts } from "./actions";
import { Field, Sheet, inputClass } from "./sheet";
import type { EditorSection, HistoryEntry, RunFn } from "./menu-editor";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Aggiunto",
  UPDATE: "Modificato",
  DELETE: "Eliminato",
  RESTORE: "Ripristinato",
  SOLD_OUT: "Segnato esaurito",
  AVAILABLE: "Di nuovo disponibile",
  RESET_SOLD_OUT: "Riattivate le voci esaurite",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistorySheet({
  history,
  onUndo,
  onClose,
}: {
  history: HistoryEntry[];
  onUndo: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function undo(id: string) {
    setBusyId(id);
    await onUndo(id);
    setBusyId(null);
  }

  return (
    <Sheet title="Storico modifiche" onClose={onClose} dirty={false}>
      {history.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-muted">Nessuna modifica ancora.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-border">
          {history.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-1 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  <span className="text-foreground-muted">{ACTION_LABELS[h.action] ?? h.action}:</span> {h.label}
                </p>
                <p className="text-[11px] text-foreground-muted">
                  {h.actorName} · {formatWhen(h.at)}
                </p>
              </div>
              {h.undone && h.action === "RESTORE" ? null : h.undone ? (
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground-muted">
                  Annullata
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => undo(h.id)}
                  className="min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
                >
                  {busyId === h.id ? "…" : "Ripristina"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function SectionTextsSheet({
  section,
  run,
  onClose,
}: {
  section: EditorSection;
  run: RunFn;
  onClose: () => void;
}) {
  const [note, setNote] = useState(section.note ?? "");
  const [addonTitle, setAddonTitle] = useState(section.addonTitle ?? "");
  const [addon, setAddon] = useState(section.addon ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"note" | "addon" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await run(() => updateSectionTexts(section.id, { note, addonTitle, addon }), "Testi aggiornati");
    setBusy(false);
    if (result) onClose();
  }

  // «Elimina»: toglie subito la nota o l'avviso (e solo quello) dal menù; l'altro resta com'è.
  async function remove(what: "note" | "addon") {
    setBusy(true);
    const result = await run(
      () =>
        updateSectionTexts(
          section.id,
          what === "note" ? { note: "", addonTitle: section.addonTitle ?? "", addon: section.addon ?? "" } : { note: section.note ?? "", addonTitle: "", addon: "" },
        ),
      what === "note" ? "Nota eliminata" : "Avviso eliminato",
    );
    setBusy(false);
    if (result) onClose();
  }

  const deleteButton = (what: "note" | "addon", label: string, question: string) =>
    confirming === what ? (
      <div className="rounded-xl border border-danger/30 bg-danger-bg p-3">
        <p className="text-xs text-danger">{question}</p>
        <div className="mt-2.5 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirming(null)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground">
            No, tienila
          </button>
          <button type="button" disabled={busy} onClick={() => remove(what)} className="min-h-10 rounded-full bg-danger px-3.5 text-xs font-semibold text-white disabled:opacity-50">
            Sì, elimina
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(what)}
        className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger disabled:opacity-50"
      >
        {label}
      </button>
    );

  return (
    <Sheet title={`Testi · ${section.title}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Nota sotto il titolo" hint="es. orario di chiusura della cucina. Vuoto = nessuna nota.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} className={inputClass} />
        </Field>
        {section.note && deleteButton("note", "Elimina la nota", "Eliminare la nota sotto il titolo? Resta recuperabile dallo storico.")}
        <Field label="Titolo dell'avviso a fondo sezione">
          <input value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} maxLength={120} className={inputClass} />
        </Field>
        <Field label="Testo dell'avviso a fondo sezione">
          <textarea value={addon} onChange={(e) => setAddon(e.target.value)} maxLength={500} rows={4} className={inputClass} />
        </Field>
        {(section.addon || section.addonTitle) && deleteButton("addon", "Elimina l'avviso", "Eliminare l'avviso a fondo sezione? Resta recuperabile dallo storico.")}
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

// Anteprima del menù dei clienti nella cornice di un telefono, senza lasciare la gestione.
export function PreviewSheet({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState(0);
  return (
    <Sheet title="Anteprima del menù" onClose={onClose} dirty={false}>
      <div className="space-y-3">
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border-4 border-foreground/20 bg-white shadow-lg">
          <iframe
            key={version}
            src="/menu"
            title="Anteprima del menù dei clienti"
            className="block h-[min(68vh,720px)] w-full border-0"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[11px] text-foreground-muted">Come lo vedono i clienti. Dopo una modifica può servire qualche secondo.</p>
          <button
            type="button"
            onClick={() => setVersion((v) => v + 1)}
            className="min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground"
          >
            Aggiorna
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// Codice QR del menù, da stampare: stesso indirizzo di «Vedi menù». Non cambia il QR
// già stampato (quello punta a un link che si ripunta da QR Code Generator).
export function QrSheet({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [color, setColor] = useState<"#111111" | "#6B1020">("#111111");
  const [svg, setSvg] = useState("");

  useEffect(() => {
    // L'indirizzo è quello da cui si sta usando la gestione: sempre il dominio giusto.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window esiste solo nel browser
    setUrl(`${window.location.origin}/menu`);
  }, []);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: color, light: "#FFFFFF" } }).then((out) => {
      if (alive) setSvg(out);
    });
    return () => {
      alive = false;
    };
  }, [url, color]);

  function save(href: string, filename: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadSvg() {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    save(href, "menu-qr.svg");
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function downloadPng() {
    const dataUrl = await QRCode.toDataURL(url, { width: 1600, margin: 4, errorCorrectionLevel: "M", color: { dark: color, light: "#FFFFFF" } });
    save(dataUrl, "menu-qr.png");
  }

  return (
    <Sheet title="Codice QR del menù" onClose={onClose} dirty={false}>
      <div className="space-y-4">
        <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-border bg-white p-3" aria-label="Anteprima del codice QR">
          {svg ? <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-square" />}
        </div>
        <p className="break-all text-center text-xs text-foreground-muted">{url}</p>
        <div role="radiogroup" aria-label="Colore del codice" className="grid grid-cols-2 gap-2">
          {(
            [
              ["#111111", "Nero"],
              ["#6B1020", "Bordeaux"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={color === value}
              onClick={() => setColor(value)}
              className={`min-h-11 rounded-xl border px-2 text-xs font-semibold ${
                color === value ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground-muted hover:border-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!svg}
            onClick={downloadSvg}
            className="min-h-11 rounded-xl bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            Scarica SVG
          </button>
          <button
            type="button"
            disabled={!svg}
            onClick={downloadPng}
            className="min-h-11 rounded-xl border border-accent px-3 text-sm font-semibold text-foreground hover:bg-accent/10 disabled:opacity-50"
          >
            Scarica PNG
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-foreground-muted">
          L&apos;SVG è per la stampa (si ingrandisce senza sfocare), il PNG per documenti e social. Il QR già stampato in enoteca non cambia:
          punta a un link che si ripunta dal sito di QR Code Generator.
        </p>
      </div>
    </Sheet>
  );
}
