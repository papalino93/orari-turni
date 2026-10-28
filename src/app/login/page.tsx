"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { VERSION_LABEL } from "@/lib/version";
import { BrandMark } from "@/components/brand-mark";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      setError("Nome utente o password non corretti.");
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
          <div className="mb-4 flex justify-center">
            <BrandMark className="h-20" plainClassName="h-16" stroke={2.2} />
          </div>
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
              Nome utente
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[#2f2a2f] bg-[#221f24] py-2.5 pl-3 pr-12 text-[#f3efe9] outline-none transition-colors focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Nascondi la password" : "Mostra la password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#a39d9a] hover:text-[#f3efe9]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="M4 4l16 16" />}
                </svg>
              </button>
            </div>
          </div>

          {error && <p className="rounded-lg bg-[#3a1c1a] px-3 py-2 text-sm text-[#e2574c]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full rounded-lg bg-accent px-3 py-2.5 font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
          <p className="text-center text-xs text-[#a39d9a]">Password dimenticata? Chiedi al titolare.</p>
        </form>
        <p className="mt-4 text-center text-[11px] text-brand-band-foreground-muted" aria-label="Versione dell'app">
          {VERSION_LABEL}
        </p>
      </div>
    </div>
  );
}
