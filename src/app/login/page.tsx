"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { VERSION_LABEL } from "@/lib/version";
import { BrandMark } from "@/components/brand-mark";
import { LOGIN_BLOCKED_PREFIX } from "@/lib/login-limit";

// Dove andare dopo l'accesso: la pagina da cui si era partiti (il Proxy la passa come
// ?callbackUrl=/…), purché sia un indirizzo di questo sito. Mai «//altrosito» o «/\…»,
// che il browser leggerebbe come un altro sito. Altrimenti "/": il Proxy manda ognuno
// alla sua prima sezione (Orari per il titolare, Le mie ore per i dipendenti).
// Il controllo si fa sull'indirizzo come lo legge il browser, che toglie tabulazioni e
// a capo: «/%09/altrosito» diventerebbe «//altrosito», cioè un altro sito.
function nextPage(): string {
  const target = new URLSearchParams(window.location.search).get("callbackUrl") ?? "";
  if (!target.startsWith("/")) return "/";
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/login")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let res: Awaited<ReturnType<typeof signIn>>;
    try {
      res = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });
    } catch {
      setLoading(false);
      setError("Connessione assente: controlla la rete e riprova.");
      return;
    }

    if (!res?.ok || res.error) {
      setLoading(false);
      // Troppi tentativi sbagliati (vedi lib/login-limit.ts): il messaggio dice quanto aspettare.
      setError(res?.error?.startsWith(LOGIN_BLOCKED_PREFIX) ? res.error : "Nome utente o password non corretti.");
      return;
    }
    // Caricamento completo e non router.push: la pagina di accesso, con l'accesso ormai
    // fatto, rimanda a "/" (vedi layout.tsx) e non deve contendersi la destinazione.
    window.location.assign(nextPage());
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
    // [--border]: la regola globale «* { border-color: var(--border) }» batte i colori dei
    // bordi scritti qui sotto; la pagina è sempre scura, quindi bordo scuro anche nel tema
    // chiaro (prima i campi avevano un contorno quasi bianco).
    <div className="relative flex min-h-screen items-center justify-center bg-[#0e0b0d] px-4 [--border:#362c32]">
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
          <p className="text-sm text-white/70">Accedi per orari, turni e menù</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-brand-band-border bg-[#1a1619] p-6 [box-shadow:inset_0_1px_0_rgb(255_236_240/0.05),0_24px_60px_-20px_rgb(0_0_0/0.8)]"
        >
          {/* Sotto: colori scuri fissi, non legati al tema chiaro/scuro —
              coerente con lo sfondo della pagina, che ora è sempre scuro
              (vedi sopra) per far risaltare il logo bianco. Riusare i token
              del tema qui dentro (pensati per adattarsi al tema chiaro)
              produrrebbe testo scuro su sfondo scuro se l'utente avesse il
              tema chiaro impostato. */}
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-[#ada5a2]">
              Nome utente
            </label>
            <input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-[#362c32] bg-[#251f23] px-3 py-2.5 text-[#f5f0ea] outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#ada5a2]">
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
                className="w-full rounded-lg border border-[#362c32] bg-[#251f23] py-2.5 pl-3 pr-12 text-[#f5f0ea] outline-none transition-colors focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Nascondi la password" : "Mostra la password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#ada5a2] hover:text-[#f5f0ea]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="M4 4l16 16" />}
                </svg>
              </button>
            </div>
          </div>

          {/* #f27b70 su #3a1c1a: contrasto 5,8 (il rosso di prima, #e2574c, arrivava a 4,2). */}
          {error && (
            <p role="alert" className="rounded-lg bg-[#3a1c1a] px-3 py-2 text-sm text-[#f27b70]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full rounded-lg bg-accent px-3 py-2.5 font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
          <p className="text-center text-xs text-[#ada5a2]">Password dimenticata? Chiedi al titolare.</p>
        </form>
        <p className="mt-4 text-center text-[11px] text-brand-band-foreground-muted" aria-label="Versione dell'app">
          {VERSION_LABEL}
        </p>
      </div>
    </div>
  );
}
