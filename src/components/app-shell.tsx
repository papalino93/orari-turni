"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallBanner, EmployeeInstallPrompt } from "@/components/install-banner";

const ADMIN_NAV_ITEMS = [
  { href: "/orari", label: "Orari", icon: CalendarIcon },
  // Ferie & Permessi nascosta temporaneamente su richiesta: la sezione non è
  // ancora in uso e genera confusione. La pagina resta funzionante, va solo
  // riaggiunta qui (con la sua PalmIcon, rimossa sotto) quando la riattiviamo.
  // { href: "/ferie", label: "Ferie & Permessi", icon: PalmIcon },
  { href: "/dipendenti", label: "Dipendenti", icon: PeopleIcon },
];

// Un login da dipendente vede solo la propria area — niente Orari generale,
// Dipendenti o Ferie & Permessi del titolare (vedi anche il Proxy, che
// blocca quegli indirizzi anche digitati a mano: qui è solo la vetrina).
const EMPLOYEE_NAV_ITEMS = [{ href: "/mie-ore", label: "Le mie ore", icon: CalendarIcon }];

export function AppShell({
  userName,
  role,
  children,
}: {
  userName: string;
  role: "ADMIN" | "EMPLOYEE";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = role === "ADMIN";
  const navItems = isAdmin ? ADMIN_NAV_ITEMS : EMPLOYEE_NAV_ITEMS;

  return (
    <div className="flex min-h-screen flex-col">
      {/* La striscia di navigazione resta sempre bordeaux con logo/testo
          bianchi, indipendentemente dal tema chiaro/scuro scelto per il
          resto della pagina: è la fascia di marca fissa, non un elemento
          che segue il tema come tutto il resto. */}
      <header className="sticky top-0 z-30 bg-brand-band shadow-[0_1px_0_rgba(0,0,0,0.18)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo statico, non serve l'ottimizzazione di next/image */}
            <img src="/logo.png" alt="L'Angolo del Vino" className="brand-logo-invert h-10 w-auto" />
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-band-active text-brand-band-foreground"
                      : "text-brand-band-foreground-muted hover:text-brand-band-foreground"
                  }`}
                >
                  <Icon active={!!active} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                href="/account"
                aria-label="Account"
                title="Account"
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-brand-band-border transition-colors hover:text-brand-band-foreground ${
                  pathname?.startsWith("/account") ? "text-brand-band-foreground" : "text-brand-band-foreground-muted"
                }`}
              >
                <GearIcon />
              </Link>
            )}
            <ThemeToggle />
            <span className="hidden text-sm text-brand-band-foreground-muted sm:block">{userName}</span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-full border border-brand-band-border px-3 py-1.5 text-xs font-medium text-brand-band-foreground-muted transition-colors hover:text-brand-band-foreground"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
        {isAdmin ? <InstallBanner /> : <EmployeeInstallPrompt />}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex bg-brand-band shadow-[0_-1px_0_rgba(0,0,0,0.18)] backdrop-blur md:hidden">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-brand-band-foreground" : "text-brand-band-foreground-muted"
              }`}
            >
              <Icon active={!!active} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.96z" />
    </svg>
  );
}

function PeopleIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      <circle cx="18" cy="9" r="2.3" />
      <path d="M16.5 14c2.7.3 4.5 2.3 4.5 5.5" />
    </svg>
  );
}
