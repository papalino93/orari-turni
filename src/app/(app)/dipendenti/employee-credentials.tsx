"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast, runWithToast } from "@/components/toast";
import { regenerateEmployeePassword, setEmployeePassword, updateEmployeeUsername } from "./actions";

// La password resta leggibile (non un hash) apposta: il titolare deve
// poterla rileggere per comunicarla a voce, non solo resettarla alla cieca
// — vedi il piano di progetto "Area Dipendenti" per il perché.
export function EmployeeCredentials({
  employeeId,
  username,
  password,
}: {
  employeeId: string;
  username: string | null;
  password: string | null;
}) {
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState(username ?? "");
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState(password ?? "");
  const [reveal, setReveal] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function saveUsername() {
    setEditingUsername(false);
    const trimmed = usernameValue.trim().toLowerCase();
    if (trimmed && trimmed !== username) {
      startTransition(async () => {
        const result = await runWithToast(toast, () => updateEmployeeUsername(employeeId, trimmed), "Username aggiornato");
        if (result !== null) router.refresh();
        else setUsernameValue(username ?? "");
      });
    } else {
      setUsernameValue(username ?? "");
    }
  }

  function savePassword() {
    setEditingPassword(false);
    const trimmed = passwordValue.trim();
    if (trimmed && trimmed !== password) {
      startTransition(async () => {
        const result = await runWithToast(toast, () => setEmployeePassword(employeeId, trimmed), "Password aggiornata");
        if (result !== null) {
          setReveal(true);
          router.refresh();
        } else {
          setPasswordValue(password ?? "");
        }
      });
    } else {
      setPasswordValue(password ?? "");
    }
  }

  function regenerate() {
    startTransition(async () => {
      const result = await runWithToast(toast, () => regenerateEmployeePassword(employeeId), "Nuova password generata");
      if (result) {
        setPasswordValue(result.password);
        setReveal(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="border-t border-border bg-surface-2/40 px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-muted/70">
        <LockIcon /> Accesso Area Dipendenti
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground-muted">Username</span>
          {editingUsername ? (
            <input
              autoFocus
              value={usernameValue}
              onChange={(e) => setUsernameValue(e.target.value)}
              onBlur={saveUsername}
              onKeyDown={(e) => e.key === "Enter" && saveUsername()}
              className="w-32 rounded border border-accent bg-surface px-1.5 py-0.5 font-mono text-xs outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingUsername(true)}
              className="font-mono text-foreground hover:underline"
              title="Modifica username"
            >
              {username ?? "—"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-foreground-muted">Password</span>
          {editingPassword ? (
            <input
              autoFocus
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              onBlur={savePassword}
              onKeyDown={(e) => e.key === "Enter" && savePassword()}
              className="w-32 rounded border border-accent bg-surface px-1.5 py-0.5 font-mono text-xs outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingPassword(true)}
              className="font-mono text-foreground hover:underline"
              title="Modifica password"
            >
              {password ? (reveal ? password : "••••••••") : "—"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Nascondi password" : "Mostra password"}
            title={reveal ? "Nascondi password" : "Mostra password"}
            className="text-foreground-muted hover:text-foreground"
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={regenerate}
            className="text-foreground-muted underline decoration-dotted hover:text-foreground disabled:opacity-50"
          >
            Rigenera
          </button>
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.5 17.5 0 0 1-3.2 4.2M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
