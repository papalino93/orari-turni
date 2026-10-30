"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Platform = "ios" | "android" | "other";

export default function InstallaPage() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [standalone, setStandalone] = useState(false);
  // Dal computer: un QR per aprire questa stessa pagina sul telefono.
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    // L'iPad si presenta come un Mac: lo si riconosce dallo schermo touch.
    const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dipende da navigator/matchMedia, non disponibili al primo render lato server
    if (/iPhone|iPad|iPod/.test(ua) || ipad) setPlatform("ios");
    else if (/Android/.test(ua)) setPlatform("android");
    else
      QRCode.toDataURL(`${location.origin}/installa`, { margin: 1, width: 360, color: { dark: "#1a1a1a", light: "#ffffff" } })
        .then(setQr)
        .catch(() => {});

    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  }, []);

  const guides = platform === "android" ? [ANDROID, IOS] : [IOS, ANDROID];

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Installa l&apos;app sul telefono</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Un&apos;icona sulla schermata Home, come una vera app: si apre a schermo intero, senza la
        barra degli indirizzi del browser. Funziona sia su iPhone che su Android.
      </p>

      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- icona statica, non serve l'ottimizzazione di next/image */}
        <img src="/icons/icon-192.png" alt="" width={56} height={56} className="rounded-xl" />
        <div>
          <p className="text-sm font-medium text-foreground">Orari</p>
          <p className="text-xs text-foreground-muted">Così apparirà l&apos;icona sulla tua schermata Home</p>
        </div>
      </div>

      {qr && !standalone && (
        <div className="mb-6 flex items-center gap-5 rounded-2xl border border-accent/40 bg-surface px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- immagine generata qui, niente da ottimizzare */}
          <img src={qr} alt="Codice QR per aprire questa pagina sul telefono" width={120} height={120} className="shrink-0 rounded-lg bg-white p-1" />
          <div>
            <p className="text-sm font-semibold text-foreground">Sei al computer?</p>
            <p className="mt-1 text-sm text-foreground-muted">
              Inquadra il codice con la fotocamera del telefono: si apre questa pagina, e da lì segui i passi qui sotto.
            </p>
          </div>
        </div>
      )}

      {standalone && (
        <div className="mb-6 rounded-2xl border border-success/30 bg-success-bg px-5 py-4 text-sm text-success">
          ✓ Stai già usando l&apos;app installata — non serve rifare nulla.
        </div>
      )}

      <div className="space-y-4">
        {guides.map((g) => (
          <GuideCard key={g.id} guide={g} highlighted={g.id === platform} />
        ))}
      </div>
    </div>
  );
}

type Guide = {
  id: Platform;
  label: string;
  icon: React.ReactNode;
  note?: string;
  steps: string[];
};

const IOS: Guide = {
  id: "ios",
  label: "iPhone / iPad (Safari)",
  icon: <ShareIcon />,
  note: "Funziona aprendo il sito con Safari: se l'hai aperto da WhatsApp o da un'altra app, tocca prima «Apri in Safari». Se «Aggiungi alla schermata Home» non c'è, scorri fino in fondo all'elenco e tocca «Modifica azioni» per aggiungerlo.",
  steps: [
    "Apri questo sito con Safari.",
    "Tocca l'icona Condividi (il quadrato con la freccia verso l'alto): sull'iPhone è nella barra in basso, sull'iPad in alto a destra.",
    "Scorri l'elenco e tocca “Aggiungi alla schermata Home”.",
    "Lascia attivo “Apri come app web”, se compare, e tocca “Aggiungi” in alto a destra.",
  ],
};

const ANDROID: Guide = {
  id: "android",
  label: "Android (Chrome)",
  icon: <DotsIcon />,
  note: "A volte Chrome lo propone da solo con un banner in basso: in quel caso basta toccare “Installa”.",
  steps: [
    "Apri questo sito con Chrome.",
    "Tocca i tre puntini in alto a destra.",
    "Tocca “Installa app” (oppure “Aggiungi a schermata Home”).",
    "Conferma.",
  ],
};

function GuideCard({ guide, highlighted }: { guide: Guide; highlighted: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-surface ${
        highlighted ? "border-accent/50" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground-muted">
          {guide.icon}
        </span>
        <p className="text-sm font-semibold text-foreground">{guide.label}</p>
        {highlighted && (
          <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent-ink">
            Il tuo telefono
          </span>
        )}
      </div>
      <ol className="space-y-2.5 px-5 py-4">
        {guide.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-foreground">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-foreground-muted">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {guide.note && (
        <p className="border-t border-border px-5 py-3 text-xs text-foreground-muted">{guide.note}</p>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}
