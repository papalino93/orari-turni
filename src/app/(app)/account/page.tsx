import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PasswordForm } from "./password-form";
import { ThemeSetting } from "./theme-setting";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Account</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Entrambi gli accessi hanno gli stessi permessi: puoi cambiare qui sia la tua password che
        quella dell&apos;altro accesso, se serve resettarla.
      </p>

      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface">
        <ThemeSetting />
      </div>

      <Link
        href="/installa"
        className="mb-6 flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:border-accent"
      >
        <div>
          <p className="text-sm font-medium text-foreground">Installa l&apos;app sul telefono</p>
          <p className="mt-0.5 text-xs text-foreground-muted">Icona sulla schermata Home, come una vera app</p>
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
                  <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                    Tu
                  </span>
                )}
              </p>
              <p className="text-xs text-foreground-muted">username: {u.username}</p>
            </div>
            <PasswordForm userId={u.id} isSelf={u.username === session?.user?.username} />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-4">
        <p className="text-sm font-medium text-foreground">Se dimenticate entrambe le password</p>
        <p className="mt-1 text-sm text-foreground-muted">
          Nessun dato viene perso: orari, ferie e dipendenti restano nel database. Basta aprire una
          nuova sessione con me (Claude) e chiedermi di reimpostare una password: ho accesso diretto
          al database e posso farlo in un minuto.
        </p>
      </div>
    </div>
  );
}
