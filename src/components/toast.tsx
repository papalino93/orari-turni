"use client";

// Feedback immediato e coerente per ogni azione ("Turno salvato", "Foto
// aggiornata", "Locale impostato come chiuso"...). Un unico posto da cui
// tutta l'app invoca conferme ed errori, invece di ogni componente che si
// inventa il proprio banner.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error";
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; kind: ToastKind; message: string; action?: ToastAction };

type ToastContextValue = {
  showSuccess: (message: string, action?: ToastAction) => void;
  showError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((kind: ToastKind, message: string, action?: ToastAction) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message, action }]);
    // Un toast con un'azione (es. "Annulla") resta un po' di più: 3s bastano
    // per leggere una conferma, ma sono pochi per accorgersi del pulsante,
    // decidere di premerlo e farlo in tempo.
    const duration = action ? 8000 : kind === "error" ? 5000 : 3000;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const value: ToastContextValue = {
    showSuccess: (message, action) => push("success", message, action),
    showError: (message) => push("error", message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-xl backdrop-blur ${
              t.kind === "success"
                ? "border-success/30 bg-success-bg text-success"
                : "border-danger/30 bg-danger-bg text-danger"
            }`}
          >
            <span aria-hidden>{t.kind === "success" ? "✓" : "⚠"}</span>
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
                className="shrink-0 rounded-full px-2 py-0.5 font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid"
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

export async function runWithToast<T>(
  toast: ToastContextValue,
  action: () => Promise<ActionResult<T>>,
  successMessage?: string,
): Promise<T | null> {
  const res = await action();
  if (res.ok) {
    if (successMessage) toast.showSuccess(successMessage);
    return res.data;
  }
  toast.showError(res.error);
  return null;
}
