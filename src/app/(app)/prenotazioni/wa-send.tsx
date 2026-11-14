"use client";

// Le risposte ai clienti su WhatsApp, una sola coda per tutti (vedi service.ts, claimWhatsapp).
// «Apri WhatsApp» prende in mano la risposta: per gli altri diventa «In invio da Marta (telefono
// enoteca)…»; «Mandato» la toglie per tutti; «Annulla» la libera. Se è già stata mandata si dice da
// chi e quando, e WhatsApp si apre solo con «Rimanda lo stesso». Da un telefono che non è quello
// dell'enoteca una riga avvisa sempre che il messaggio parte dal WhatsApp personale.

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { showActionError, useToast } from "@/components/toast";
import { markWhatsapp } from "./actions";
import { WhatsappIcon } from "./device";
import { clock } from "./format";

export type WaRole = "send" | "override" | "none";
export type WaInfo = {
  role: WaRole;
  mode: "venue" | "all";
  // Il nome con cui questo dispositivo firma («Marta (telefono enoteca)», «Andrea»); null = da scegliere.
  me: string | null;
  venueDevice: boolean;
  venueExists: boolean;
};
export const WaContext = createContext<WaInfo>({ role: "send", mode: "all", me: null, venueDevice: false, venueExists: false });
export const useWa = () => useContext(WaContext);

export const PERSONAL_WARNING = "Partirà dal tuo WhatsApp personale, non dal numero del locale: il cliente risponderà a te.";
const CLAIM_MS = 5 * 60000;

type Claim = { by: string | null; at: number | null; device?: string | null };

// Un numero a caso tenuto su questo apparecchio: il lucchetto riconosce l'apparecchio oltre al nome
// (lo stesso nome dal telefono e dal computer non prende due volte lo stesso messaggio).
const DEVICE_KEY = "prenotazioni-apparecchio";
let deviceCache: string | null = null;
export function deviceId(): string {
  if (deviceCache) return deviceCache;
  let id = "";
  try {
    id = localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    /* niente memoria: un numero solo per questa pagina */
  }
  if (!/^[a-z0-9]{16,40}$/.test(id)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 20);
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      /* resta per questa pagina */
    }
  }
  deviceCache = id;
  return id;
}

export function WhatsappButton({
  href,
  bookingId,
  label = "Manda la risposta su WhatsApp",
  onOpened,
  compact = false,
  icon = false,
  name,
  claim = { by: null, at: null },
}: {
  href: string;
  bookingId: string;
  label?: string;
  // WhatsApp aperto da qui (per i messaggi «se non hai toccato Invia…»).
  onOpened?: () => void;
  compact?: boolean;
  // Nell'elenco «Da mandare su WhatsApp»: solo il tondo verde (l'avviso è sopra l'elenco).
  icon?: boolean;
  name?: string;
  claim?: Claim;
}) {
  const router = useRouter();
  const toast = useToast();
  const wa = useWa();
  const [state, setState] = useState<"idle" | "busy" | "open">(() => (claim.by && wa.me && claim.by === wa.me && claim.at && Date.now() - claim.at < CLAIM_MS ? "open" : "idle"));
  const [problem, setProblem] = useState<{ text: string; sent: boolean } | null>(null);
  const [askOverride, setAskOverride] = useState(false);
  // L'ora di quando il pulsante è comparso (la pagina si aggiorna da sola ogni pochi secondi).
  const [shownAt] = useState(() => Date.now());
  // Questo apparecchio (si legge dopo il primo disegno: sul server non c'è).
  const [here, setHere] = useState<string | null>(null);
  useEffect(() => {
    const id = deviceId();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'apparecchio si conosce solo nel browser
    setHere(id);
    // Preso con il mio nome ma da un altro apparecchio: qui non è «in invio».
    if (claim.device && claim.device !== id) setState((s) => (s === "open" ? "idle" : s));
  }, [claim.device]);
  const sameName = claim.by !== null && claim.by === wa.me;
  const otherDevice = Boolean(claim.device && here && claim.device !== here);
  const other = claim.by && claim.at && shownAt - claim.at < CLAIM_MS && (!sameName || otherDevice) ? { ...claim, by: otherDevice && sameName ? `${claim.by} su un altro apparecchio` : claim.by } : null;

  // «Apri WhatsApp»: la finestra si apre subito (dentro il tocco, sennò il telefono la blocca) e
  // riceve l'indirizzo solo se la risposta è nostra.
  async function open(force = false) {
    if (state === "busy") return;
    const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setState("busy");
    setProblem(null);
    try {
      const res = await markWhatsapp(bookingId, "opened", { force, device: deviceId() });
      if (!res.ok) {
        win?.close();
        toast.showError(res.error);
        setState("idle");
        return;
      }
      if (!res.data.ok) {
        win?.close();
        setProblem({ text: res.data.text, sent: Boolean(res.data.sentBy) });
        setState("idle");
        router.refresh();
        return;
      }
      if (win) win.location.href = href;
      else window.location.href = href;
      onOpened?.();
      setState("open");
      router.refresh();
    } catch (e) {
      win?.close();
      setState("idle");
      showActionError(toast, e);
    }
  }

  async function finish(how: "sent" | "release") {
    setState("busy");
    try {
      const res = await markWhatsapp(bookingId, how, { device: deviceId() });
      if (!res.ok) toast.showError(res.error);
      else toast.showSuccess(how === "sent" ? `Segnato come mandato alle ${clock(Date.now())}` : "Ancora da mandare: lo può mandare anche un altro");
      setState("idle");
      router.refresh();
    } catch (e) {
      setState("open");
      showActionError(toast, e);
    }
  }

  if (wa.role === "none") return <p className="text-sm text-foreground-muted">La risposta su WhatsApp la manda il telefono della sala.</p>;

  const big = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60";
  const green = compact
    ? "flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#137a43] px-4 text-sm font-semibold text-white hover:bg-[#0f6837]"
    : `${big} bg-[#137a43] text-white hover:bg-[#0f6837]`;
  const override = wa.role === "override";

  if (icon) {
    if (state === "open")
      return (
        <span className="flex shrink-0 items-center gap-1.5" data-testid="wa-in-invio">
          {/* Dopo aver aperto WhatsApp: si dice se è partito. Non verde pieno né con la spunta, che
              sembravano «già fatto»; «Non ancora» al posto di «Annulla», che sembrava annullare la prenotazione. */}
          <a href={href} target="_blank" rel="noopener noreferrer" className="min-h-10 px-1 py-2.5 text-xs font-medium text-[#137a43] underline decoration-dotted underline-offset-2 dark:text-[#3fae74]">
            Riapri
          </a>
          <button type="button" onClick={() => finish("sent")} aria-label="L'ho mandato" className="min-h-10 rounded-full px-3 text-xs font-semibold text-[#137a43] ring-1 ring-inset ring-[#137a43]/50 hover:bg-[#137a43]/10 dark:text-[#3fae74]">
            L&apos;ho mandato
          </button>
          <button type="button" onClick={() => finish("release")} aria-label="Non ancora" className="min-h-10 rounded-full px-2.5 text-xs font-medium text-foreground-muted ring-1 ring-inset ring-border">
            Non ancora
          </button>
        </span>
      );
    if (other) return <span className="min-h-8 shrink-0 py-1 text-right text-xs font-medium text-gold" data-testid="wa-occupato">In invio da {other.by}…</span>;
    return (
      <span className="flex shrink-0 flex-col items-end gap-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={override ? `Mandalo io dal mio WhatsApp: ${name ?? ""}` : `Manda su WhatsApp a ${name ?? ""}`}
          title={override ? "Mandalo io dal mio WhatsApp" : "Manda su WhatsApp"}
          onClick={(e) => {
            e.preventDefault();
            if (override) setAskOverride(true);
            else open();
          }}
          className={override ? "flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#137a43] ring-1 ring-inset ring-[#137a43]/40 dark:text-[#3fae74]" : "flex h-11 w-11 items-center justify-center rounded-full bg-[#137a43] text-white hover:bg-[#0f6837]"}
        >
          <WhatsappIcon className={override ? "h-4 w-4" : ""} />
          {override && "Mandalo io"}
        </a>
        {problem && (
          <span className="max-w-[12rem] text-right text-xs font-semibold text-gold" role="alert" data-testid="wa-problema">
            {problem.text}
            {problem.sent && (
              <button type="button" onClick={() => open(true)} className="ml-1 font-semibold text-[#137a43] underline dark:text-[#3fae74]">
                Rimanda lo stesso
              </button>
            )}
          </span>
        )}
        {askOverride && (
          <ConfirmSheet title="Mandarlo tu dal tuo WhatsApp?" confirmLabel="Apri il mio WhatsApp" onConfirm={() => { setAskOverride(false); open(); }} onCancel={() => setAskOverride(false)}>
            <p>{PERSONAL_WARNING}</p>
            <p>Di solito le risposte le manda il telefono enoteca.</p>
          </ConfirmSheet>
        )}
      </span>
    );
  }

  if (state === "open") {
    return (
      <div className="space-y-2 rounded-xl bg-[#137a43]/[0.06] p-3 ring-1 ring-inset ring-[#137a43]/30" data-testid="wa-in-invio">
        <p className="text-sm font-medium text-foreground">Hai toccato Invia su WhatsApp?</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => finish("sent")} aria-label="L'ho mandato" className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[#137a43] ring-1 ring-inset ring-[#137a43]/50 hover:bg-[#137a43]/10 dark:text-[#3fae74]">
            Sì, l&apos;ho mandato
          </button>
          <button type="button" onClick={() => finish("release")} aria-label="Non ancora" className="min-h-11 rounded-xl px-3 text-sm font-medium text-foreground-muted ring-1 ring-inset ring-border hover:text-foreground">
            Non ancora
          </button>
        </div>
        <a href={href} target="_blank" rel="noopener noreferrer" className="block text-center text-xs font-medium text-[#137a43] underline decoration-dotted underline-offset-2 dark:text-[#3fae74]">
          Riapri WhatsApp
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {other && (
        <p className="rounded-lg bg-gold/10 px-3 py-2 text-sm font-medium text-foreground" data-testid="wa-occupato">
          In invio da {other.by} dalle {clock(other.at!)}…
        </p>
      )}
      {problem && (
        <div className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-foreground" role="alert" data-testid="wa-problema">
          <p className="font-semibold">{problem.text}</p>
          {problem.sent && (
            <button type="button" onClick={() => open(true)} className="mt-1 min-h-10 text-sm font-semibold text-[#137a43] underline decoration-dotted underline-offset-2 dark:text-[#3fae74]">
              Rimanda lo stesso
            </button>
          )}
        </div>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={Boolean(other) || state === "busy" || undefined}
        onClick={(e) => {
          e.preventDefault();
          if (other) return;
          if (override) setAskOverride(true);
          else open();
        }}
        className={`${green} ${other ? "pointer-events-none opacity-50" : ""}`}
      >
        <WhatsappIcon /> {state === "busy" ? "Un attimo…" : override ? "Mandalo io dal mio WhatsApp" : label}
      </a>
      {!wa.venueDevice && <p className="text-xs text-foreground-muted" data-testid="wa-avviso-personale">{PERSONAL_WARNING}</p>}
      {askOverride && (
        <ConfirmSheet
          title="Mandarlo tu dal tuo WhatsApp?"
          confirmLabel="Apri il mio WhatsApp"
          onConfirm={() => {
            setAskOverride(false);
            open();
          }}
          onCancel={() => setAskOverride(false)}
        >
          <p>{PERSONAL_WARNING}</p>
          <p>Di solito le risposte le manda il telefono enoteca.</p>
        </ConfirmSheet>
      )}
    </div>
  );
}
