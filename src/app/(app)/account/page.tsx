import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PasswordForm } from "./password-form";
import { ThemeSetting } from "./theme-setting";
import { FeatureSetting } from "./feature-setting";
import { BookingSwitches } from "./booking-switches";
import { loadFeatures } from "@/lib/app-features";
import { loadBookingSettings, pendingCount } from "@/lib/booking/service";

export const metadata = { title: "Impostazioni" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mail?: string | string[] }> }) {
  // Arrivati da /mail con la sezione spenta: si dice perché e dove accenderla.
  const mailOff = (await searchParams).mail === "spenta";
  const session = await getServerSession(authOptions);
  const [users, features, bookings, bookingsPending, venueDevices, pushDevices] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    loadFeatures(),
    loadBookingSettings(),
    pendingCount(),
    prisma.employee.count({ where: { isVenueDevice: true } }),
    prisma.pushSubscription.count(),
  ]);
  const me = users.find((u) => u.username === session?.user?.username);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-display font-medium">Impostazioni</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        {users.length > 1
          ? "Prenotazioni, aspetto, app e widget sul telefono, password: la tua e quella degli altri accessi del titolare. Le password dei dipendenti si cambiano da Dipendenti."
          : "Prenotazioni, aspetto, app e widget sul telefono, password del tuo accesso. Le password dei dipendenti si cambiano da Dipendenti."}
      </p>

      {/* Gli interruttori delle prenotazioni in cima: è la cosa che si cerca qui (prima erano nascosti in Prenotazioni → ⋯). */}
      <BookingSwitches agendaEnabled={bookings.agendaEnabled} enabled={bookings.enabled} pending={bookingsPending} hasVenueDevice={venueDevices > 0} hasPush={pushDevices > 0} />

      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface">
        <ThemeSetting />
      </div>

      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">Sezioni da mostrare</h2>
      {mailOff && !features.mail && (
        <p role="status" className="mb-2 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground">
          La sezione Mail è spenta, quindi non si apre e non spedisce nulla. Per usarla accendi «Mail» qui sotto.
        </p>
      )}
      <div className="mb-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        <FeatureSetting feature="ferie" visible={features.ferie} title="«Ferie»" hint="Ferie e permessi dei dipendenti. Spenta, non compare tra le sezioni; quello che c'è dentro resta." />
        <FeatureSetting feature="mail" visible={features.mail} title="«Mail»" hint="Invii di email ai clienti. Spenta, non compare tra le sezioni." />
      </div>


      {me?.appInstalledAt ? (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">App installata sul telefono</p>
            <p className="mt-0.5 text-xs text-foreground-muted">Si apre dall&apos;icona sulla schermata Home.</p>
          </div>
          <span className="text-success">✓</span>
        </div>
      ) : (
        <Link
          href="/installa"
          className="mb-6 flex min-h-11 items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:border-accent"
        >
          <div>
            <p className="text-sm font-medium text-foreground">Installa l&apos;app sul telefono</p>
            <p className="mt-0.5 text-xs text-foreground-muted">Icona sulla schermata Home, come una vera app</p>
          </div>
          <span className="text-foreground-muted">›</span>
        </Link>
      )}

      <Link
        href="/widget"
        className="mb-6 flex min-h-11 items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:border-accent"
      >
        <div>
          <p className="text-sm font-medium text-foreground">Widget sul telefono</p>
          <p className="mt-0.5 text-xs text-foreground-muted">Riquadri sulla Home dell&apos;iPhone; scegli anche quali dare ai dipendenti</p>
        </div>
        <span className="text-foreground-muted">›</span>
      </Link>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {users.map((u) => (
          <div key={u.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {u.name}
                {u.username === session?.user?.username && (
                  <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent-ink">
                    Tu
                  </span>
                )}
              </p>
              <p className="text-xs text-foreground-muted">nome utente: {u.username}</p>
            </div>
            <PasswordForm userId={u.id} isSelf={u.username === session?.user?.username} />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-4">
        <p className="text-sm font-medium text-foreground">Se dimentichi la password</p>
        <p className="mt-1 text-sm text-foreground-muted">
          Nessun dato si perde: orari, ferie, dipendenti e menù restano al sicuro. Chiedi a chi ti segue il sito di
          reimpostarla: bastano pochi minuti.
        </p>
      </div>
    </div>
  );
}
