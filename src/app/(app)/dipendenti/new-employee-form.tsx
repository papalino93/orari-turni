"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast, runWithToast } from "@/components/toast";
import { createEmployee } from "./actions";

export function NewEmployeeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<"EMPLOYEE" | "OWNER">("EMPLOYEE");
  const router = useRouter();
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await runWithToast(toast, () => createEmployee(fd), "Dipendente aggiunto");
          if (result !== null) {
            formRef.current?.reset();
            setRole("EMPLOYEE");
            router.refresh();
          }
        })
      }
      className="mb-5 flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center"
    >
      <input
        name="name"
        placeholder="Nome e cognome"
        required
        className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
      />
      <input type="hidden" name="role" value={role} />
      <div className="flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-foreground-muted has-[:checked]:border-accent has-[:checked]:text-foreground sm:flex-none">
          <input type="radio" className="sr-only" checked={role === "EMPLOYEE"} onChange={() => setRole("EMPLOYEE")} />
          Dipendente
        </label>
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-foreground-muted has-[:checked]:border-gold has-[:checked]:text-gold sm:flex-none">
          <input type="radio" className="sr-only" checked={role === "OWNER"} onChange={() => setRole("OWNER")} />
          Titolare
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Aggiungo…" : "Aggiungi"}
      </button>
    </form>
  );
}
