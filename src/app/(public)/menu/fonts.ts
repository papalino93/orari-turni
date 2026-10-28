import { Cormorant_Garamond, EB_Garamond, Jost } from "next/font/google";

// Caratteri del menù dei clienti. Anche la gestione li usa, per le anteprime
// (es. il riquadro in vetrina), così si vede com'è davvero.
export const serif = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-menu-serif",
  display: "swap",
});
export const body = EB_Garamond({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-menu-body",
  display: "swap",
});
export const sans = Jost({
  subsets: ["latin", "latin-ext"],
  variable: "--font-menu-sans",
  display: "swap",
});
