"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showActionError, useToast } from "@/components/toast";
import { isStandalone } from "@/components/install-banner";
import { removePushSubscription, savePushSubscription, sendTestPush } from "./actions";

// «Avvisi e WhatsApp su questo telefono»: avvisi (notifiche) e «telefono enoteca», da cui partono le risposte su WhatsApp.
// Tutto vale per il dispositivo: il permesso delle notifiche e la scelta salvata nel browser.


export type PushState = "checking" | "server-off" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// L'iscrizione è stata fatta con questa chiave pubblica? (Se le chiavi del sito cambiano, quella
// vecchia non riceve più niente: va tolta e rifatta.)
function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // il browser non lo dice: si tiene
  const a = new Uint8Array(k);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export type PushControl = {
  state: PushState;
  // L'iscrizione di questo dispositivo (per «telefono enoteca» e «Prova un avviso»).
  endpoint: string | null;
  busy: boolean;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
  test: () => Promise<void>;
};

export function usePush(publicKey: string | null, myEndpoints: string[]): PushControl {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<PushState>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = myEndpoints.join("\n");

  useEffect(() => {
    let alive = true;
    (async () => {
      let next: PushState;
      let ep: string | null = null;
      if (!publicKey) next = "server-off";
      else if (isIos() && !isStandalone()) next = "ios-install";
      else if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          let sub = (await reg?.pushManager.getSubscription()) ?? null;
          let renewed = false;
          // Iscrizione fatta con una chiave vecchia: non riceverebbe più niente. Si toglie e, se gli avvisi
          // erano attivi qui, si rifà da sola con la chiave di adesso.
          if (reg && sub && !sameKey(sub, publicKey)) {
            const wasOn = mine.split("\n").includes(sub.endpoint);
            await removePushSubscription(sub.endpoint).catch(() => {});
            await sub.unsubscribe().catch(() => {});
            sub = null;
            if (wasOn && Notification.permission === "granted") {
              sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
              const res = await savePushSubscription(sub.toJSON() as Parameters<typeof savePushSubscription>[0], navigator.userAgent);
              if (!res.ok) sub = null;
              else renewed = true;
            }
          }
          ep = sub?.endpoint ?? null;
          next = sub && Notification.permission === "granted" && (mine.split("\n").includes(sub.endpoint) || renewed) ? "on" : "off";
        } catch {
          next = "off";
        }
      }
      if (alive) {
        setState(next);
        setEndpoint(ep);
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicKey, mine]);

  const activate = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      // Il permesso si chiede solo adesso, dopo il tocco: così il telefono mostra la domanda.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        if (permission !== "denied") toast.showError("Per ricevere gli avvisi tocca «Consenti» quando il telefono lo chiede.");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) };
      // Con una chiave vecchia non riceverebbe niente: si toglie prima di rifarla.
      if (sub && !sameKey(sub, publicKey)) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
      try {
        sub ??= await reg.pushManager.subscribe(options);
      } catch {
        // Un'iscrizione vecchia con un'altra chiave: si toglie e si rifà.
        await sub?.unsubscribe().catch(() => {});
        sub = await reg.pushManager.subscribe(options);
      }
      const res = await savePushSubscription(sub.toJSON() as Parameters<typeof savePushSubscription>[0], navigator.userAgent);
      if (!res.ok) {
        toast.showError(res.error);
        return;
      }
      setEndpoint(sub.endpoint);
      setState("on");
      toast.showSuccess("Avvisi attivi su questo telefono");
      router.refresh();
    } catch (e) {
      if (e instanceof Error && /fetch|network|load failed|action/i.test(e.message)) showActionError(toast, e);
      else toast.showError("Non sono riuscito ad attivare gli avvisi su questo telefono: riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }, [publicKey, router, toast]);

  const deactivate = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const ep = sub?.endpoint ?? endpoint;
      if (ep) {
        const res = await removePushSubscription(ep);
        if (!res.ok) {
          toast.showError(res.error);
          return;
        }
      }
      await sub?.unsubscribe().catch(() => {});
      setState("off");
      setEndpoint(null);
      toast.showSuccess("Avvisi spenti su questo telefono");
      router.refresh();
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }, [endpoint, router, toast]);

  const test = useCallback(async () => {
    if (!endpoint) return;
    setBusy(true);
    try {
      const res = await sendTestPush(endpoint);
      if (res.ok) toast.showSuccess("Avviso di prova mandato: arriva tra pochi secondi");
      else toast.showError(res.error);
    } catch (e) {
      showActionError(toast, e);
    } finally {
      setBusy(false);
    }
  }, [endpoint, toast]);

  return { state, endpoint, busy, activate, deactivate, test };
}

const btn = "min-h-11 rounded-full px-4 text-sm font-semibold disabled:opacity-60";

// Il riquadro «Avvisi su questo telefono». arrives: che cosa arriva qui, detto chiaro.
export function PushBox({ push, arrives }: { push: PushControl; arrives: string }) {
  const { state, busy } = push;
  return (
    <section aria-labelledby="avvisi-titolo" className="rounded-2xl border border-border bg-surface p-4">
      <h3 id="avvisi-titolo" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BellIcon /> Avvisi su questo telefono
      </h3>
      {state === "checking" && <p className="mt-1 text-sm text-foreground-muted">Controllo…</p>}
      {state === "server-off" && <p className="mt-1 text-sm text-foreground-muted">Gli avvisi non sono ancora collegati: chiedi a chi ha preparato il sito.</p>}
      {state === "unsupported" && (
        <p className="mt-1 text-sm text-foreground-muted">Questo browser non riceve avvisi. Sul telefono apri il sito con Chrome (Android) o installa l&apos;app (iPhone).</p>
      )}
      {state === "ios-install" && (
        <div className="mt-1 text-sm text-foreground-muted">
          <p>Su iPhone gli avvisi arrivano solo con l&apos;app sulla schermata Home.</p>
          <Link href="/installa" className={`${btn} mt-3 inline-flex items-center bg-accent text-accent-foreground hover:bg-accent-hover`}>
            Installa l&apos;app
          </Link>
        </div>
      )}
      {state === "denied" && (
        <p className="mt-1 text-sm text-foreground-muted">
          Gli avvisi per questo sito sono bloccati. Riattivali dalle impostazioni del telefono (Notifiche) o del browser, poi torna qui.
        </p>
      )}
      {state === "off" && (
        <>
          <p className="mt-1 text-sm text-foreground-muted" data-testid="avvisi-cosa">{arrives}</p>
          <button type="button" disabled={busy} onClick={push.activate} className={`${btn} mt-3 bg-accent text-accent-foreground hover:bg-accent-hover`}>
            {busy ? "Un attimo…" : "Attiva gli avvisi"}
          </button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="mt-1 text-sm font-medium text-success">✓ Avvisi attivi su questo telefono.</p>
          <p className="mt-0.5 text-sm text-foreground-muted" data-testid="avvisi-cosa">{arrives}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={push.test} className={`${btn} border border-border text-foreground hover:border-accent`}>
              Prova un avviso
            </button>
            <button type="button" disabled={busy} onClick={push.deactivate} className={`${btn} border border-border font-medium text-foreground-muted hover:border-danger hover:text-danger`}>
              Disattiva
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function Switch({ on, label, onToggle, disabled }: { on: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
    >
      <span aria-hidden className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

// Che cosa arriva su questo telefono, detto chiaro (niente interruttori: lo decide l'accesso).
export function arrivesText(wa: { venueDevice: boolean; role: "send" | "override" | "none" }): string {
  if (wa.venueDevice) return "Qui arrivano: le nuove richieste di tavolo e i messaggi da mandare su WhatsApp ai clienti (partono dal numero del locale).";
  if (wa.role === "send") return "Qui arrivano: le nuove richieste di tavolo e i messaggi da mandare su WhatsApp ai clienti (partono dal tuo WhatsApp).";
  if (wa.role === "override") return "Qui arrivano: le nuove richieste di tavolo. I messaggi su WhatsApp ai clienti li manda il telefono enoteca: qui non suonano.";
  return "Qui arrivano: le nuove richieste di tavolo.";
}

// Le risposte su WhatsApp: chi le manda (al posto del vecchio interruttore «telefono enoteca»).
export function WhatsappInfoBox({ wa }: { wa: { venueDevice: boolean; role: "send" | "override" | "none"; venueExists: boolean } }) {
  const text = wa.venueDevice
    ? "Questo è il telefono enoteca: da qui partono le risposte ai clienti, dal numero del locale."
    : wa.role === "send"
      ? wa.venueExists
        ? "Puoi mandarle anche tu, dal tuo WhatsApp: il primo che tocca «Apri WhatsApp» la prende e gli altri non la mandano due volte."
        : "Le mandi tu dal tuo WhatsApp (non c'è ancora un telefono enoteca collegato: si aggiunge da Dipendenti)."
      : wa.role === "override"
        ? "Le manda il telefono enoteca. Qui le vedi e, se serve, puoi mandarle tu con «Mandalo io dal mio WhatsApp»."
        : "Le manda il telefono enoteca: da qui le vedi soltanto.";
  return (
    <section className="rounded-2xl border border-border bg-surface p-4" data-testid="whatsapp-chi">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <WhatsappIcon /> Risposte su WhatsApp
      </h3>
      <p className="mt-1 text-sm text-foreground-muted">{text}</p>
    </section>
  );
}

export function BellIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}

export function WhatsappIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}
