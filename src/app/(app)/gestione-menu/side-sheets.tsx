"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { updateSectionTexts } from "./actions";
import { Field, Sheet, inputClass } from "./sheet";
import type { EditorSection, HistoryEntry, RunFn } from "./menu-editor";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Filtri dello Storico, con i nomi delle schede della gestione.
const HISTORY_FILTERS: { id: "tutto" | HistoryEntry["group"]; label: string }[] = [
  { id: "tutto", label: "Tutto" },
  { id: "voci", label: "Voci" },
  { id: "esauriti", label: "Esauriti" },
  { id: "eventi", label: "Eventi e annunci" },
  { id: "locale", label: "Orari e contatti" },
];

export function HistorySheet({
  history,
  onUndo,
  onClose,
}: {
  history: HistoryEntry[];
  onUndo: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  // Riga di cui si sta chiedendo conferma («Annulla aggiunta», «Rimetti nel menù»…).
  const [askId, setAskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof HISTORY_FILTERS)[number]["id"]>("tutto");
  const filters = HISTORY_FILTERS.filter((f) => f.id === "tutto" || history.some((h) => h.group === f.id));
  const shown = filter === "tutto" ? history : history.filter((h) => h.group === filter);

  async function undo(id: string) {
    setBusyId(id);
    const done = await onUndo(id);
    setBusyId(null);
    if (done) setAskId(null);
  }

  return (
    <Sheet title="Storico modifiche" onClose={onClose} dirty={false}>
      {history.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-muted">Nessuna modifica ancora.</p>
      ) : (
        <>
          <p className="-mt-2 mb-3 text-xs text-foreground-muted">Le ultime {history.length} modifiche, dalla più recente. Da qui puoi tornare indietro.</p>
          {filters.length > 2 && (
            <div role="radiogroup" aria-label="Mostra" className="mb-2 flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`min-h-9 rounded-full px-3 text-xs font-medium ${
                    filter === f.id ? "bg-accent text-accent-foreground" : "border border-border text-foreground-muted hover:border-accent hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <ul className="-mx-1 divide-y divide-border">
            {shown.map((h) => (
              <li key={h.id} className="px-1 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm text-foreground">
                      <span className="text-foreground-muted">{h.title}:</span> <span className="break-words">{h.label}</span>
                    </p>
                    {h.detail && <p className="mt-0.5 break-words text-xs text-foreground">{h.detail}</p>}
                    <p className="text-[11px] text-foreground-muted">
                      {h.actorName} · {formatWhen(h.at)}
                    </p>
                  </div>
                  {h.undone ? (
                    <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground-muted">Annullata</span>
                  ) : h.blocked ? (
                    <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground-muted">{h.blocked}</span>
                  ) : h.undo && askId !== h.id ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => setAskId(h.id)}
                      className="ml-auto min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:border-accent hover:text-foreground disabled:opacity-50"
                    >
                      {h.undo.label}
                    </button>
                  ) : null}
                </div>
                {h.undo && askId === h.id && (
                  <div role="alertdialog" aria-label={h.undo.label} className="mt-2 rounded-xl border border-gold/40 bg-gold/10 p-3">
                    <p className="text-sm text-foreground">{h.undo.question}</p>
                    <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAskId(null)}
                        className="min-h-10 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground"
                      >
                        Lascia com&apos;è
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => undo(h.id)}
                        className="min-h-10 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                      >
                        {busyId === h.id ? "…" : h.undo.label}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
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
        <Field label="Titolo dell'avviso in fondo alla categoria">
          <input value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} maxLength={120} className={inputClass} />
        </Field>
        <Field label="Testo dell'avviso in fondo alla categoria">
          <textarea value={addon} onChange={(e) => setAddon(e.target.value)} maxLength={500} rows={4} className={inputClass} />
        </Field>
        {(section.addon || section.addonTitle) && deleteButton("addon", "Elimina l'avviso", "Eliminare l'avviso in fondo alla categoria? Resta recuperabile dallo storico.")}
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
// `section`: aperta da «Vedi nel menù», scorre fino a quella sezione (se vuota, lo dice).
// ?festa=0: nell'anteprima niente pagina di benvenuto delle ricorrenze.
export function PreviewSheet({ onClose, section }: { onClose: () => void; section?: { slug: string; title: string; empty: boolean } }) {
  const [version, setVersion] = useState(0);
  const target = section && !section.empty ? `#${section.slug}` : "";
  return (
    <Sheet title={section ? `«${section.title}» nel menù` : "Anteprima del menù"} onClose={onClose} dirty={false}>
      <div className="space-y-3">
        {section?.empty && (
          <p className="rounded-xl border border-gold/30 bg-gold/[0.06] px-3 py-2.5 text-sm text-foreground">
            «{section.title}» è vuota: i clienti non la vedono finché non aggiungi almeno una voce.
          </p>
        )}
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border-4 border-foreground/20 bg-white shadow-lg">
          <iframe
            key={version}
            src={`/menu?festa=0${target}`}
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
              // Scelta segnata da un bordo e un pallino del colore: piena di colore sembrerebbe il pulsante «Scarica SVG».
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold ${
                color === value ? "border-accent bg-accent/10 text-foreground ring-1 ring-accent" : "border-border text-foreground-muted hover:border-accent"
              }`}
            >
              <span aria-hidden className="h-3.5 w-3.5 rounded-full" style={{ background: value }} />
              {label}
              {color === value && <span aria-hidden>✓</span>}
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
          porta sempre al menù, anche quando cambi prezzi e voci.
        </p>
      </div>
    </Sheet>
  );
}
