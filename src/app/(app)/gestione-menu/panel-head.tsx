// Intestazione dei riquadri in cima alla gestione («Oggi fuori menù», «Informazioni
// del menù», «Il locale»): icona colorata, titolo e una riga di riepilogo, così si
// riconoscono a colpo d'occhio invece di essere tre scritte grigie uguali.

export type PanelTone = "gold" | "accent" | "success" | "muted";

const TONE: Record<PanelTone, string> = {
  gold: "bg-gold/15 text-gold",
  accent: "bg-accent/15 text-accent-hover",
  success: "bg-success/15 text-success",
  muted: "bg-surface-2 text-foreground-muted",
};

export function PanelHead({
  icon,
  tone,
  title,
  subtitle,
  badge,
  chevron,
}: {
  icon: React.ReactNode;
  tone: PanelTone;
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  /** Riquadro che si apre e chiude: freccia accanto al titolo. */
  chevron?: "open" | "closed";
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold text-foreground">{title}</span>
          {badge}
          {chevron && (
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-foreground-muted transition-transform ${chevron === "open" ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </span>
        {subtitle && <span className="mt-0.5 line-clamp-2 text-xs text-foreground-muted sm:line-clamp-1">{subtitle}</span>}
      </span>
    </span>
  );
}

const svg = (children: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

// Stella: il piatto o il vino del giorno.
export const IconToday = svg(
  <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
);
// «i» delle informazioni (coperto, cucina, avvisi).
export const IconInfo = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.2" />
  </>,
);
// Vetrina del locale: copertina, orari, contatti.
export const IconVenue = svg(
  <>
    <path d="M4 10v9h16v-9" />
    <path d="M3 10l2-5h14l2 5c0 1.4-1.2 2.4-2.6 2.4S16 11.4 16 10c0 1.4-1.4 2.4-2.8 2.4S10.4 11.4 10.4 10c0 1.4-1.4 2.4-2.8 2.4S5 11.4 5 10" />
    <path d="M10 19v-4.5h4V19" />
  </>,
);
