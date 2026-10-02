import { WINE_TRAITS } from "@/lib/wine-traits";

// Disegnini a tratto sottile, nel bordeaux della carta (come calice e bottiglia).
function TraitIcon({ code, size }: { code: string; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#6B1020",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (code) {
    case "BIO": // germoglio
      return (
        <svg {...common}>
          <path d="M12 21v-9" />
          <path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z" />
          <path d="M12 15c0-3-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z" />
          <path d="M8 21h8" />
        </svg>
      );
    case "BIODYNAMIC": // luna e foglia
      return (
        <svg {...common}>
          <path d="M14.5 3.5a8.5 8.5 0 1 0 6 13.2A7 7 0 0 1 14.5 3.5z" />
          <path d="M9 15.5c0-2.6 2-4.6 4.6-4.6 0 2.6-2 4.6-4.6 4.6z" />
        </svg>
      );
    case "VEGAN": // foglia
      return (
        <svg {...common}>
          <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" />
          <path d="M5 19l7-7" />
        </svg>
      );
    case "NO_ADDED_SULFITES": // goccia barrata
      return (
        <svg {...common}>
          <path d="M12 3.5c3 3.6 5 6.4 5 9a5 5 0 0 1-10 0c0-2.6 2-5.4 5-9z" />
          <path d="M4.5 19.5l15-15" />
        </svg>
      );
    default:
      return null;
  }
}

// Riga «disegnino + parola» sotto l'uvaggio (e, più piccola, nel riquadro
// dell'abbinamento). Niente legenda da imparare: la parola dice cos'è.
export function WineTraits({ traits, small = false }: { traits: readonly string[]; small?: boolean }) {
  const list = WINE_TRAITS.filter((t) => traits.includes(t.code));
  if (list.length === 0) return null;
  return (
    <span
      className={`menu-sans flex flex-wrap items-center gap-x-3.5 gap-y-1 font-medium text-[#4A504B] ${
        small ? "mt-1 text-[11px]" : "mt-1 text-[12px] tracking-[0.02em]"
      }`}
    >
      {list.map((t) => (
        <span key={t.code} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <TraitIcon code={t.code} size={small ? 13 : 15} />
          {t.short}
        </span>
      ))}
    </span>
  );
}
