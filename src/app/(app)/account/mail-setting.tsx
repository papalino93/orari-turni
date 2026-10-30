"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMailVisible } from "../app-actions";

// «Mail» nel menù in alto: spenta finché l'invio non è collegato, si riaccende da qui.
export function MailSetting({ visible }: { visible: boolean }) {
  const [on, setOn] = useState(visible);
  const [pending, start] = useTransition();
  const router = useRouter();
  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setMailVisible(next);
      if (!res.ok) setOn(!next);
      router.refresh();
    });
  }
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">«Mail» nel menù</p>
        <p className="text-xs text-foreground-muted">Invii di email ai clienti. Nascosta finché non serve.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Mostra «Mail» nel menù"
        disabled={pending}
        onClick={toggle}
        className="flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
      >
        <span aria-hidden className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
        </span>
      </button>
    </div>
  );
}
