import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Niente pulsantino «N» di sviluppo: copre le foto della guida e del giro.
  devIndicators: false,
  // Numero di versione mostrato sul sito (vedi src/lib/version.ts): quello di
  // package.json, da aumentare a ogni rilascio, più il commit di Vercel.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
  // La guida (PDF e video) viene letta dal disco dalle route /gestione-menu/guida e /gestione-menu/guida/video.
  outputFileTracingIncludes: {
    "/gestione-menu/guida": ["./docs/guida/Guida-gestione-menu.pdf"],
    "/gestione-menu/guida/video": ["./docs/guida/Guida-gestione-menu.mp4"],
  },
  async headers() {
    // Pagine dell'area riservata: mai conservate dal browser, così dopo «Esci» il tasto
    // Indietro non rimostra orari, ore o dati dei dipendenti. Non il menù pubblico, i
    // file dei widget (/widget/angolo.js…), la guida PDF/video e le immagini, che hanno
    // le loro regole (o nessuna: si possono tenere in memoria).
    const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }];
    // Contro chi mostra il sito dentro una sua pagina per far toccare i pulsanti a
    // sorpresa: solo il sito stesso può incorniciarlo (l'Anteprima del menù nella gestione).
    const noFraming = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ];
    return [
      {
        source: "/:path*",
        headers: [
          // Agli altri siti (link aperti dal menù, Instagram, recensioni…) arriva solo il
          // nome del sito, non l'indirizzo completo della pagina.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // Tutto tranne il menù pubblico, che qualcuno potrebbe voler mostrare nel proprio sito.
      { source: "/((?!menu(?:/|$)).*)", headers: noFraming },
      { source: "/", headers: noStore },
      { source: "/:area(orari|dipendenti|statistiche|account|ferie|mail|mie-ore|installa)", headers: noStore },
      { source: "/:area(orari|dipendenti|statistiche|account|ferie|mail|mie-ore|installa)/:rest*", headers: noStore },
      { source: "/widget", headers: noStore },
      { source: "/gestione-menu", headers: noStore },
      { source: "/gestione-menu/stampa", headers: noStore },
      { source: "/login", headers: noStore },
    ];
  },
};

export default nextConfig;
