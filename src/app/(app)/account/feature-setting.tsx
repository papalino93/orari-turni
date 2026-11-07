"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runWithToast, useToast } from "@/components/toast";
import { setFeatureVisible } from "../app-actions";

// Le sezioni che si accendono e spengono nel menù in alto: «Mail» (finché l'invio non è collegato)
// e «Ferie» (non ancora in uso). Spente, le pagine restano dove sono: tornano con un tocco.
export function FeatureSetting({ feature, visible, title, hint }: { feature: "mail" | "ferie"; visible: boolean; title: string; hint: string }) {
  const [on, setOn] = useState(visible);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      // Se il salvataggio non riesce l'interruttore torna com'era e un messaggio dice perché.
      const res = await runWithToast(toast, async () => {
        try {
          const r = await setFeatureVisible(feature, next);
          return r.ok ? { ok: true as const, data: true } : r;
        } catch {
          return { ok: false as const, error: "Non sono riuscito a salvare: controlla la connessione e riprova." };
        }
      });
      if (res === null) setOn(!next);
      router.refresh();
    });
  }
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-foreground-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Mostra ${title}`}
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
