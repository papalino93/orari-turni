import Link from "next/link";

// «Gestione · Statistiche»: le due pagine del menù (le Statistiche stanno dentro «Menù», non più nella
// barra in alto). Stesso aspetto su /gestione-menu e /statistiche, anche sul telefono.
export function MenuTabs({ current }: { current: "gestione" | "statistiche" }) {
  const tabs = [
    { id: "gestione", label: "Gestione", href: "/gestione-menu" },
    { id: "statistiche", label: "Statistiche", href: "/statistiche" },
  ] as const;
  return (
    <nav aria-label="Menù: gestione e statistiche" className="mb-4 grid w-full grid-cols-2 rounded-full bg-surface-2/80 p-[3px] ring-1 ring-inset ring-border sm:inline-grid sm:w-auto" data-testid="schede-menu">
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors ${on ? "bg-accent text-accent-foreground shadow-sm" : "text-foreground-muted hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
