import type { MetadataRoute } from "next";

// Abilita "Aggiungi a Home" su Android con icona e nome propri (non la
// scheda del browser). Su iPhone Safari legge le icone da qui insieme ad
// apple-icon.png — vedi la guida in /installa per i passaggi lato utente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "L'Angolo del Vino — Orari",
    short_name: "Orari",
    description: "Gestione orari, copertura e ferie del personale",
    start_url: "/orari",
    display: "standalone",
    background_color: "#0c0b0d",
    theme_color: "#560101",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
