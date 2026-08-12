"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/orari", label: "Orari", icon: CalendarIcon },
  { href: "/ferie", label: "Ferie & Permessi", icon: PalmIcon },
  { href: "/dipendenti", label: "Dipendenti", icon: PeopleIcon },
];

export function AppShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base">
              🍷
            </span>
            <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:block">
              Orari & Turni
            </span>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-surface-2 text-foreground"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden text-sm text-foreground-muted sm:block">{userName}</span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-foreground-muted"
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

function PalmIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2}>
      <path d="M12 21V10M12 10c0-4-3-7-7-7 0 4 3 6 7 6M12 10c0-4 3-7 7-7 0 4-3 6-7 6M12 12c0-3-2.5-5-6-5 0 3 2 5 6 5M12 12c0-3 2.5-5 6-5 0 3-2 5-6 5" />
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
