"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Username o password non corretti.");
      return;
    }
    router.push("/orari");
    router.refresh();
  }

  return (
    // Stessi colori della striscia di navigazione (bordeaux fisso, non
    // legato al tema chiaro/scuro): la pagina di accesso è il primo
    // contatto con l'app, deve sembrare la stessa identità visiva, non un
    // tema scuro generico con un accento diverso.
    // overflow-hidden qui bloccherebbe anche lo scroll della pagina, non solo
    // il gradiente decorativo sotto: su schermi bassi con la tastiera aperta
    // il pulsante "Accedi" resterebbe irraggiungibile. Il gradiente è
    // `absolute inset-0`, quindi non esce comunque dai bordi del contenitore
    // anche senza overflow-hidden.
    <div className="relative flex min-h-screen items-center justify-center bg-[#0c0b0d] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--brand-band) 55%, transparent), transparent)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo statico, non serve l'ottimizzazione di next/image */}
          <img src="/logo.png" alt="L'Angolo del Vino" className="brand-logo-invert mx-auto mb-4 h-16 w-auto" />
          <p className="text-sm text-white/70">Accedi per gestire orari, copertura e ferie</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-brand-band-border bg-[#18161a] p-6 shadow-2xl shadow-black/40"
        >
          {/* Sotto: colori scuri fissi, non legati al tema chiaro/scuro —
              coerente con lo sfondo della pagina, che ora è sempre scuro
              (vedi sopra) per far risaltare il logo bianco. Riusare i token
              del tema qui dentro (pensati per adattarsi al tema chiaro)
              produrrebbe testo scuro su sfondo scuro se l'utente avesse il
              tema chiaro impostato. */}
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-[#a39d9a]">
              Username
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-[#2f2a2f] bg-[#221f24] px-3 py-2.5 text-[#f3efe9] outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#a39d9a]">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-[#2f2a2f] bg-[#221f24] px-3 py-2.5 text-[#f3efe9] outline-none transition-colors focus:border-accent"
            />
          </div>

          {error && <p className="rounded-lg bg-[#3a1c1a] px-3 py-2 text-sm text-[#e2574c]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-band px-3 py-2.5 font-medium text-brand-band-foreground transition-colors hover:bg-brand-band-solid-hover disabled:opacity-60"
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
      </div>
    </div>
  );
}
