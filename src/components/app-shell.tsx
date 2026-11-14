"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { AccountMenu } from "@/components/account-menu";
import { InstallBanner, EmployeeInstallPrompt, InstalledMark } from "@/components/install-banner";
import { VERSION_LABEL } from "@/lib/version";
import { BrandMark } from "@/components/brand-mark";
import { forgetPushOnSignOut } from "@/app/(app)/prenotazioni/actions";

// Prima di uscire: gli avvisi delle prenotazioni smettono di arrivare su questo dispositivo
// (il telefono può passare a un'altra persona). Mai più di un attimo, e senza bloccare l'uscita.
async function forgetPushHere() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await Promise.race([forgetPushOnSignOut(sub.endpoint).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
    await sub.unsubscribe().catch(() => {});
  } catch {
    /* si esce comunque */
  }
}

const ADMIN_NAV_ITEMS = [
  { href: "/orari", label: "Orari", icon: CalendarIcon },
  // «Ferie» si accende da Impostazioni (non ancora in uso: spenta di partenza).
  { href: "/ferie", label: "Ferie", icon: SunIcon },
  { href: "/dipendenti", label: "Dipendenti", icon: PeopleIcon },
  { href: "/gestione-menu", label: "Menù", icon: MenuIcon },
  { href: "/mail", label: "Mail", icon: MailIcon },
];

// Un login da dipendente vede solo la propria area — niente Orari generale,
// Dipendenti o Ferie & Permessi del titolare (vedi anche il Proxy, che
// blocca quegli indirizzi anche digitati a mano: qui è solo la vetrina).
const EMPLOYEE_NAV_ITEMS = [{ href: "/mie-ore", label: "Le mie ore", icon: CalendarIcon }];

// Un dipendente vede "Menù" solo se il titolare gliel'ha concesso: è la
// vetrina, il controllo vero resta lato server (vedi getMenuEditor).
const EMPLOYEE_MENU_NAV_ITEM = { href: "/gestione-menu", label: "Menù", icon: MenuIcon };

// «Prenotazioni»: solo con l'agenda accesa e per chi può gestirle (vedi layout.tsx).
// Sul telefono, da sei voci in su, la parola intera non ci sta: «Tavoli».
const BOOKINGS_NAV_ITEM = { href: "/prenotazioni", label: "Prenotazioni", short: "Tavoli", icon: BookingIcon };

type NavItem = { href: string; label: string; short?: string; icon: (p: { active: boolean }) => React.ReactNode };

export function AppShell({
  userName,
  role,
  canEditMenu,
  appInstalled,
  showMail,
  showFerie,
  bookings,
  venueDevice = false,
  children,
}: {
  userName: string;
  role: "ADMIN" | "EMPLOYEE";
  canEditMenu: boolean;
  // App già installata su un telefono di questa persona: niente inviti a installarla.
  appInstalled: boolean;
  // «Mail» si accende da Account (finché l'invio non è collegato resta nascosta).
  showMail: boolean;
  // «Ferie» si accende da Impostazioni, come «Mail».
  showFerie: boolean;
  // Voce «Prenotazioni» con le richieste da confermare e i messaggi da mandare su WhatsApp; null = non si mostra.
  bookings: { pending: number; whatsapp: number; incomplete?: number } | null;
  // «Telefono enoteca»: solo Prenotazioni (e Menù se il titolare l'ha permesso), niente «Le mie ore».
  venueDevice?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // «Statistiche» sta dentro «Menù»: su /statistiche la voce accesa è «Menù».
  const isActive = (href: string) => Boolean(pathname?.startsWith(href) || (href === "/gestione-menu" && pathname?.startsWith("/statistiche")));
  const isAdmin = role === "ADMIN";
  const baseItems: NavItem[] = isAdmin
    ? ADMIN_NAV_ITEMS.filter((item) => (showMail || item.href !== "/mail") && (showFerie || item.href !== "/ferie"))
    : canEditMenu
      ? [...EMPLOYEE_NAV_ITEMS, EMPLOYEE_MENU_NAV_ITEM]
      : EMPLOYEE_NAV_ITEMS;
  // Subito dopo «Orari» (o «Le mie ore»): è la cosa da guardare più spesso durante la serata.
  const navItems: NavItem[] = venueDevice
    ? [BOOKINGS_NAV_ITEM, ...(canEditMenu ? [EMPLOYEE_MENU_NAV_ITEM] : [])]
    : bookings
      ? [baseItems[0], BOOKINGS_NAV_ITEM, ...baseItems.slice(1)]
      : baseItems;
  // Il pallino conta le cose da fare: richieste da confermare + risposte da mandare su WhatsApp.
  // Richieste da confermare, messaggi da mandare e prenotazioni da completare: tre insiemi separati
  // (una prenotazione da completare è già confermata e non ha messaggi in coda), niente doppioni.
  const todo = bookings ? bookings.pending + bookings.whatsapp + (bookings.incomplete ?? 0) : 0;
  const todoText = bookings
    ? [
        bookings.pending ? `${bookings.pending} ${bookings.pending === 1 ? "richiesta" : "richieste"} da confermare` : "",
        bookings.whatsapp ? `${bookings.whatsapp} ${bookings.whatsapp === 1 ? "messaggio" : "messaggi"} da mandare su WhatsApp` : "",
        bookings.incomplete ? `${bookings.incomplete} ${bookings.incomplete === 1 ? "prenotazione" : "prenotazioni"} da completare` : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const navLabel = (item: NavItem) => (item.href === "/prenotazioni" && todo ? `${item.label}: ${todoText}` : item.label);
  const badge = (href: string) =>
    href === "/prenotazioni" && todo > 0 ? (
      <span
        aria-hidden
        className="absolute -right-1.5 -top-2 min-w-[1.125rem] rounded-full bg-brand-band-foreground px-1 text-center text-[10px] font-bold leading-[1.125rem] text-brand-band tabular-nums"
      >
        {todo > 99 ? "99+" : todo}
      </span>
    ) : null;
  // Il logo riporta alla prima sezione: per chi ha una sola sezione (dipendente senza il
  // menù) non c'è la barra di navigazione, e da /mie-ore/revisione, /installa o /widget
  // era l'unico modo di tornare indietro.
  const home = navItems[0] ?? EMPLOYEE_NAV_ITEMS[0];

  // Dopo «Esci», il tasto Indietro del browser può ripescare la pagina dalla memoria
  // (dalla cache, o intera com'era) senza chiedere niente al server, e mostrare ancora
  // i dati: se intanto l'accesso non c'è più, si va alla pagina di accesso. Con
  // l'accesso ancora valido non si ricarica niente, così una scheda lasciata a metà
  // resta com'era.
  useEffect(() => {
    const checkSession = () => {
      fetch("/api/auth/session", { cache: "no-store" })
        .then((r) => r.json())
        .then((s: { user?: unknown } | null) => {
          if (!s?.user) window.location.replace("/login");
        })
        .catch(() => {});
    };
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "back_forward") checkSession();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) checkSession();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <div className="app-backdrop flex min-h-screen flex-col">
      {/* La striscia di navigazione resta sempre bordeaux con logo/testo
          bianchi, indipendentemente dal tema chiaro/scuro scelto per il
          resto della pagina: è la fascia di marca fissa, non un elemento
          che segue il tema come tutto il resto. */}
      {/* pt-safe: su iOS, "black-translucent" (vedi layout.tsx) fa scorrere
          il contenuto web dietro la barra di stato invece che sotto —
          l'aspetto voluto di un'app vera, non di una scheda del browser.
          Ma "dietro" richiede che sia il contenuto a lasciare lo spazio
          giusto da solo, altrimenti logo/orologio/pulsante Esci finiscono
          letteralmente sotto l'orologio e la batteria del telefono. Lo
          sfondo bordeaux resta esteso fin sotto la barra di stato (l'effetto
          voluto); solo il contenuto vero scende sotto di essa. */}
      <header className="brand-band-bar brand-band-bar-top sticky top-0 z-30 bg-brand-band pt-[env(safe-area-inset-top)]">
        <div className="app-wide mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href={home.href}
            aria-label={`L'Angolo del Vino: torna a ${home.label}`}
            title={`Torna a ${home.label}`}
            className="-mx-1 flex shrink-0 items-center gap-2.5 rounded-lg px-1"
          >
            <BrandMark className="h-11" />
          </Link>

          <nav className={`hidden items-center gap-0.5 lg:gap-1 ${navItems.length > 1 ? "md:flex" : ""}`}>
            {navItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={navLabel(item)}
                  title={navLabel(item)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:gap-2 lg:px-3.5 ${
                    active
                      ? "nav-mark-bottom bg-brand-band-active text-brand-band-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                      : "text-brand-band-foreground-muted hover:bg-brand-band-hover/50 hover:text-brand-band-foreground"
                  }`}
                >
                  <span className="relative">
                    <Icon active={!!active} />
                    {badge(item.href)}
                  </span>
                  {/* Con 5 voci («Mail» o «Ferie» accese) sul tablet verticale le parole non starebbero, con 7
                      neanche sul computer piccolo: lì solo icone (il nome compare passandoci sopra). */}
                  <span className={navItems.length > 6 ? "md:max-xl:hidden" : navItems.length > 4 ? "md:max-lg:hidden" : ""}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Ovunque, anche sul telefono: un solo pulsante con le iniziali (Impostazioni, tema, vista larga, Esci). */}
          <div className="shrink-0">
            <AccountMenu
              userName={userName}
              isAdmin={isAdmin}
              settingsActive={Boolean(pathname?.startsWith("/account") || pathname?.startsWith("/widget") || pathname?.startsWith("/installa"))}
              onSignOut={async () => {
                await forgetPushHere();
                signOut({ callbackUrl: "/login" });
              }}
            />
          </div>
        </div>
      </header>

      <main className={`app-wide mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 md:pb-10 ${navItems.length > 1 ? "pb-28" : "pb-10"}`}>
        <Suspense fallback={null}>
          <BlockedNotice />
        </Suspense>
        <InstalledMark installed={appInstalled} />
        {appInstalled || venueDevice ? null : isAdmin ? <InstallBanner /> : <EmployeeInstallPrompt />}
        {children}
        {/* Colore pieno, non attenuato: «/70» scendeva a un contrasto di 3 su 1 nel tema chiaro. */}
        <p className="mt-10 text-center text-[11px] text-foreground-muted" aria-label="Versione dell'app">
          {VERSION_LABEL}
        </p>
      </main>

      {/* pb con env(safe-area-inset-bottom): a differenza dei modali a
          foglio dell'app (che lo fanno già tutti), questa è l'unica barra
          fissa a fondo schermo presente su ogni pagina mobile — senza,
          le etichette finiscono a ridosso dell'Home Indicator gestuale. */}
      {/* Con una voce sola (il dipendente senza il menù) la barra in basso non serve a niente. */}
      {navItems.length > 1 && (
        <nav className="brand-band-bar brand-band-bar-bottom fixed inset-x-0 bottom-0 z-30 flex bg-brand-band md:hidden">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={navLabel(item)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] text-[11px] font-medium transition-colors ${
                  active ? "nav-mark-top text-brand-band-foreground" : "text-brand-band-foreground-muted"
                }`}
              >
                <span className="relative">
                  <Icon active={!!active} />
                  {badge(item.href)}
                </span>
                {/* Da 6 voci «Prenotazioni» non ci sta: «Tavoli». Con 7 (Ferie e Mail accese) anche più piccole. */}
                <span className={`max-w-full truncate px-0.5 ${navItems.length > 6 ? "text-[10px] tracking-tight" : ""}`}>{item.short && navItems.length > 5 ? item.short : item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

// Un dipendente che apre a mano una pagina del titolare viene rimandato alla sua area
// con ?bloccato=1 (vedi proxy.ts): qui gli si dice perché, invece di cambiare pagina in
// silenzio. «Ho capito» toglie il segno dall'indirizzo, così non ricompare ricaricando.
function BlockedNotice() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const why = searchParams.get("bloccato");
  if (why !== "1" && why !== "menu") return null;

  function dismiss() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("bloccato");
    const rest = params.toString();
    window.history.replaceState(null, "", rest ? `${pathname}?${rest}` : pathname);
  }

  return (
    // Larga come la pagina «Le mie ore» (max-w-xl), dove compare.
    <div role="status" className="mx-auto mb-4 flex max-w-xl items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-foreground">
      <span aria-hidden className="text-base">🔒</span>
      <p className="flex-1">
        {why === "menu"
          ? "Il menù lo cambia solo chi ha il permesso: se ti serve, chiedilo al titolare. Ecco la tua area."
          : "Questa pagina è solo per il titolare: ecco la tua area."}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="-my-1 min-h-10 shrink-0 rounded-full border border-border px-3.5 text-xs font-medium text-foreground-muted hover:text-foreground"
      >
        Ho capito
      </button>
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

function SunIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MailIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function MenuIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.4 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3h10c0 6-2 9-5 9s-5-3-5-9z" />
      <path d="M12 12v8" />
      <path d="M8 21h8" />
    </svg>
  );
}

function BookingIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
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
