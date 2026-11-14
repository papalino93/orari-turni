"use client";

// Feedback immediato e coerente per ogni azione ("Turno salvato", "Foto
// aggiornata", "Locale impostato come chiuso"...). Un unico posto da cui
// tutta l'app invoca conferme ed errori, invece di ogni componente che si
// inventa il proprio banner.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error";
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; kind: ToastKind; message: string; action?: ToastAction };

type ToastContextValue = {
  showSuccess: (message: string, action?: ToastAction) => void;
  showError: (message: string, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Al massimo due messaggi alla volta: con tre o quattro impilati coprivano mezza
// schermata (e il pulsante «Salva» delle schede). Il più vecchio lascia il posto.
const MAX_TOASTS = 2;

// Una scheda o finestra aperta sopra la pagina: le schede del menù hanno role="dialog",
// le altre finestre dell'app sono un velo fisso a tutto schermo («fixed inset-0»).
const OPEN_DIALOG = '[role="dialog"], [aria-modal="true"], dialog[open], .fixed.inset-0';

function dialogOpen(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(OPEN_DIALOG)).some((el) => el.getClientRects().length > 0);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Con una scheda aperta i messaggi vanno in alto: in basso coprivano «Salva».
  const [onTop, setOnTop] = useState(false);
  const nextId = useRef(0);

  const push = useCallback((kind: ToastKind, message: string, action?: ToastAction) => {
    const id = nextId.current++;
    setOnTop(dialogOpen());
    // Lo stesso messaggio due volte di fila (es. due tocchi su «Salva») non si ripete.
    setToasts((prev) => [...prev.filter((t) => !(t.kind === kind && t.message === message)), { id, kind, message, action }].slice(-MAX_TOASTS));
    // Un toast con un'azione (es. "Annulla") resta un po' di più: 3s bastano
    // per leggere una conferma, ma sono pochi per accorgersi del pulsante,
    // decidere di premerlo e farlo in tempo.
    const duration = action ? 8000 : kind === "error" ? 5000 : 3000;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  // Finché c'è un messaggio a schermo, si segue l'apertura e la chiusura delle schede.
  const visible = toasts.length > 0;
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let wasOpen = dialogOpen();
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const open = dialogOpen();
        // Si apre una scheda mentre c'è ancora il messaggio dell'azione di prima («Segnata esaurita»,
        // «Arrivati»): in alto coprirebbe il titolo e la ×. Riguardava la schermata di prima: si toglie
        // (gli errori restano).
        if (open && !wasOpen) setToasts((prev) => prev.filter((t) => t.kind === "error"));
        wasOpen = open;
        setOnTop(open);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // La scheda può essersi chiusa nello stesso momento in cui è comparso il messaggio (es. «Importa»):
    // l'osservatore non l'ha vista, quindi si ricontrolla subito dove metterlo.
    frame = requestAnimationFrame(() => setOnTop(dialogOpen()));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [visible]);

  const value: ToastContextValue = {
    showSuccess: (message, action) => push("success", message, action),
    showError: (message, action) => push("error", message, action),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 ${
          // Con una scheda aperta: in alto ma sotto la riga del titolo e della ×, che restano toccabili.
          // Senza: sopra la barra in basso (più lo spazio della barra Home dell'iPhone).
          onTop ? "top-[calc(env(safe-area-inset-top)+4.75rem)] sm:top-6" : "bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-6"
        }`}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-xl backdrop-blur ${
              t.kind === "success"
                ? "border-success/30 bg-success-bg text-success"
                : "border-danger/30 bg-danger-bg text-danger"
            }`}
          >
            <span aria-hidden>{t.kind === "success" ? "✓" : "⚠"}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
                className="-my-1 min-h-9 shrink-0 rounded-full px-2 font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// Helper per invocare un'azione tipizzata `{ok:true,data}|{ok:false,error}` e
// mostrare in automatico il toast giusto.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const OFFLINE_MESSAGE = "Connessione assente: controlla la rete e riprova.";
export const SITE_UPDATED_MESSAGE = "Il sito è stato aggiornato: ricarica la pagina.";
export const UNEXPECTED_MESSAGE = "Qualcosa non ha funzionato: riprova tra poco.";

// Che tipo di errore è arrivato chiamando il server, quando l'azione non ha nemmeno
// risposto: senza rete («Failed to fetch» su Chrome, «Load failed» su Safari,
// «NetworkError…» su Firefox), sito aggiornato mentre la pagina era aperta (l'azione
// di prima non esiste più sul server), oppure altro.
export function actionErrorKind(error: unknown): "offline" | "updated" | "other" {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (name === "UnrecognizedActionError" || /Server Action .* was not found|Failed to find Server Action/i.test(message)) return "updated";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (error instanceof TypeError && /fetch|network|load failed|connection|internet/i.test(message)) return "offline";
  return "other";
}

export function actionErrorMessage(error: unknown): string {
  const kind = actionErrorKind(error);
  return kind === "offline" ? OFFLINE_MESSAGE : kind === "updated" ? SITE_UPDATED_MESSAGE : UNEXPECTED_MESSAGE;
}

// Mostra il messaggio giusto per un errore lanciato da una chiamata al server (vedi
// sopra), con «Ricarica» quando il sito è stato aggiornato. Da usare nei componenti
// che chiamano un'azione senza runWithToast: `catch (e) { showActionError(toast, e) }`.
export function showActionError(toast: ToastContextValue, error: unknown) {
  const kind = actionErrorKind(error);
  if (kind === "other") console.error("[azione]", error);
  toast.showError(actionErrorMessage(error), kind === "updated" ? { label: "Ricarica", onClick: () => window.location.reload() } : undefined);
}

export async function runWithToast<T>(
  toast: ToastContextValue,
  action: () => Promise<ActionResult<T>>,
  successMessage?: string,
): Promise<T | null> {
  // Senza rete, o con il sito aggiornato nel frattempo, la chiamata non risponde
  // affatto e lancia un errore: prima finiva sulla schermata «Qualcosa è andato
  // storto» e si perdeva la pagina con quello che si era scritto.
  let res: ActionResult<T> | undefined;
  try {
    res = await action();
  } catch (error) {
    showActionError(toast, error);
    return null;
  }
  if (!res) return null;
  if (res.ok) {
    if (successMessage) toast.showSuccess(successMessage);
    return res.data;
  }
  toast.showError(res.error);
  return null;
}
