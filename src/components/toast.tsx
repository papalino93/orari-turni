"use client";

// Feedback immediato e coerente per ogni azione ("Turno salvato", "Foto
// aggiornata", "Locale impostato come chiuso"...). Un unico posto da cui
// tutta l'app invoca conferme ed errori, invece di ogni componente che si
// inventa il proprio banner.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), kind === "error" ? 5000 : 3000);
  }, []);

  const value: ToastContextValue = {
    showSuccess: (message) => push("success", message),
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
            {t.message}
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
