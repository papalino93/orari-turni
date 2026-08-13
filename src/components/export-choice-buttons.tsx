"use client";

// Le due opzioni di export (immagine per WhatsApp, PDF A4) condivise tra
// l'export della settimana (/orari) e l'export del singolo dipendente
// (/dipendenti): icona + titolo + sottotitolo invece di un pulsante di solo
// testo con un'emoji davanti — più chiaro a colpo d'occhio, e le emoji
// rendono in modo incoerente tra sistemi operativi diversi.

export function ExportChoiceButtons({
  downloading,
  disabled,
  onImage,
  onPdf,
}: {
  downloading: "image" | "pdf" | null;
  disabled?: boolean;
  onImage: () => void;
  onPdf: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={onImage}
        disabled={downloading !== null || disabled}
        className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-border px-4 py-4 text-center transition-colors hover:border-accent disabled:opacity-60"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-foreground">
          <ImageIcon />
        </span>
        <span className="text-sm font-semibold text-foreground">{downloading === "image" ? "Preparazione…" : "Immagine"}</span>
        <span className="text-xs text-foreground-muted">Condividi su WhatsApp</span>
      </button>
      <button
        type="button"
        onClick={onPdf}
        disabled={downloading !== null || disabled}
        className="flex flex-1 flex-col items-center gap-2 rounded-xl bg-accent px-4 py-4 text-center text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
          <DocumentIcon />
        </span>
        <span className="text-sm font-semibold">{downloading === "pdf" ? "Preparazione…" : "PDF"}</span>
        <span className="text-xs opacity-80">Formato A4</span>
      </button>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5-4 4-3-3-6 6" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
