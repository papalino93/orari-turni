"use client";

import { useState, useTransition } from "react";
import { setPassword } from "./actions";

export function PasswordForm({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSuccess(false);
    if (value !== confirm) {
      setError("Le due password non coincidono.");
      return;
    }
    startTransition(async () => {
      const res = await setPassword(userId, value);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setValue("");
        setConfirm("");
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-accent hover:text-accent-hover"
        >
          {isSelf ? "Cambia la tua password" : "Imposta nuova password"}
        </button>
        {success && <span className="text-xs text-success">Aggiornata ✓</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
      <input
        type="password"
        placeholder="Nuova password (min 6 caratteri)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent"
      />
      <input
        type="password"
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
          Salva
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
