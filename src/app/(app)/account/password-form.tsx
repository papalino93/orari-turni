"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { setPassword } from "./actions";

export function PasswordForm({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function save() {
    setError(null);
    if (value !== confirm) {
      setError("Le due password non coincidono.");
      return;
    }
    startTransition(async () => {
      const res = await setPassword(userId, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.showSuccess("Password aggiornata");
      setValue("");
      setConfirm("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:text-accent-hover">
        {isSelf ? "Cambia la tua password" : "Imposta nuova password"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
      <label className="sr-only" htmlFor={`new-password-${userId}`}>
        Nuova password
      </label>
      <input
        id={`new-password-${userId}`}
        type="password"
        autoComplete="new-password"
        placeholder="Nuova password (min 8 caratteri)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent"
      />
      <label className="sr-only" htmlFor={`confirm-password-${userId}`}>
        Ripeti la nuova password
      </label>
      <input
        id={`confirm-password-${userId}`}
        type="password"
        autoComplete="new-password"
        placeholder="Ripeti la password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !value}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Salvo…" : "Salva"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setValue("");
            setConfirm("");
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}
