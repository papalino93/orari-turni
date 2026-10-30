import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PasswordForm } from "./password-form";
import { ThemeSetting } from "./theme-setting";
import { MailSetting } from "./mail-setting";
import { loadFeatures } from "@/lib/app-features";

export const metadata = { title: "Impostazioni" };

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const [users, features] = await Promise.all([prisma.user.findMany({ orderBy: { createdAt: "asc" } }), loadFeatures()]);
  const me = users.find((u) => u.username === session?.user?.username);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Impostazioni</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        {users.length > 1
          ? "Aspetto, app e widget sul telefono, password: la tua e quella degli altri accessi del titolare. Le password dei dipendenti si cambiano da Dipendenti."
          : "Aspetto, app e widget sul telefono, password del tuo accesso. Le password dei dipendenti si cambiano da Dipendenti."}
      </p>

      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface">
        <ThemeSetting />
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface">
        <MailSetting visible={features.mail} />
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
