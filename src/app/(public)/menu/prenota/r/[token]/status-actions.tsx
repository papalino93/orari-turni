"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pillFilled, pillOutline } from "../../ui";

// Finché la richiesta è in attesa la pagina si aggiorna da sola (ogni 30 secondi con la scheda
// in vista, e subito quando si torna sulla pagina), senza ricaricarsi né saltare.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [active, router]);
  return null;
}

type Action = "cancel" | "accept" | "refuse";

function useCustomerAction(token: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(action: Action): Promise<boolean> {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/menu/prenota/r/${token}/azione`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error || "Qualcosa non ha funzionato: riprova tra poco.");
        setBusy(null);
        router.refresh();
        return false;
      }
      router.refresh();
      // Il nuovo stato si legge in cima alla pagina.
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      // busy resta acceso finché la pagina aggiornata non sostituisce questi pulsanti.
      return true;
    } catch {
      setError("Non riesco a inviare: controlla la connessione e riprova.");
      setBusy(null);
      return false;
    }
  }
  return { busy, error, run };
}

function ErrorText({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="menu-sans m-0 mt-3 text-center text-[14px] font-medium text-[#A11B1B]">
      {text}
    </p>
  );
}

// «Sì, va bene» / «No, grazie» per l'orario proposto dal locale.
export function ProposalButtons({ token, proposedTime }: { token: string; proposedTime: string }) {
  const { busy, error, run } = useCustomerAction(token);
  return (
    <div className="mt-6">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
        <button type="button" disabled={busy !== null} onClick={() => run("accept")} className={`${pillFilled} min-h-14 sm:min-w-[220px]`}>
          {busy === "accept" ? "Un attimo…" : `Sì, va bene alle ${proposedTime}`}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => run("refuse")} className={`${pillOutline} min-h-14 sm:min-w-[180px]`}>
          {busy === "refuse" ? "Un attimo…" : "No, grazie"}
        </button>
      </div>
      <ErrorText text={error} />
    </div>
  );
}

// «Annulla»: discreto (grigio, piccolo, staccato dal resto), e prima chiede conferma lì sul posto
// (niente finestre del browser). Nella domanda il pulsante in evidenza è «No, tienila».
export function CancelButton({ token, label, question }: { token: string; label: string; question: string }) {
  const { busy, error, run } = useCustomerAction(token);
  const [asking, setAsking] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) keep.current?.focus();
  }, [asking]);

  return (
    <div className="mt-2">
      {!asking ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="menu-sans flex min-h-11 items-center px-2 text-[13px] text-[#6E736C] underline decoration-[#B9B2A5] underline-offset-4"
          >
            {label}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border bg-[#FBF7EF] px-5 py-5 text-center" role="group" aria-label={question}>
          <p className="menu-serif m-0 text-[23px] font-medium leading-tight text-[#1F2621]">{question}</p>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row-reverse sm:justify-center">
            <button ref={keep} type="button" disabled={busy !== null} onClick={() => setAsking(false)} className={`${pillFilled} sm:min-w-[180px]`}>
              No, tienila
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run("cancel")} className={`${pillOutline} sm:min-w-[180px]`}>
              {busy ? "Un attimo…" : "Sì, annulla"}
            </button>
          </div>
          <ErrorText text={error} />
        </div>
      )}
    </div>
  );
}

// Salva o manda il link di questa pagina, per ritrovarla: con il menù «Condividi» del telefono
// quando c'è (Note, WhatsApp a sé stessi, Promemoria…), altrimenti lo copia.
export function SaveLink() {
  const [done, setDone] = useState(false);
  async function save() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "La mia richiesta all'Angolo del Vino", url });
        return;
      } catch (e) {
        // Chiuso senza scegliere: va bene così. Altri errori: si prova a copiare.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch {
      window.prompt("Copia il link di questa pagina:", url);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={save}
        className="menu-sans mt-2 inline-flex min-h-11 items-center px-2 text-[12px] font-medium uppercase tracking-[0.18em] text-[#6B1020] underline underline-offset-4"
      >
        Salva o manda il link
      </button>
      <span aria-live="polite" className="menu-sans block min-h-4 text-[12.5px] text-[#5B605A]">
        {done ? "Link copiato: salvalo dove vuoi." : ""}
      </span>
    </>
  );
}
