import type { Metadata } from "next";
import { Cormorant_Garamond, EB_Garamond, Jost } from "next/font/google";
import "./menu.css";

const serif = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-menu-serif",
  display: "swap",
});
const body = EB_Garamond({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-menu-body",
  display: "swap",
});
const sans = Jost({
  subsets: ["latin", "latin-ext"],
  variable: "--font-menu-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Menù — L'Angolo del Vino",
  description: "Carta dei vini e menù dell'Angolo del Vino",
  // Raggiungibile dal QR in enoteca, non dai motori di ricerca: una copia
  // vecchia nei risultati mostrerebbe prezzi e voci non più veri.
  robots: { index: false, follow: false },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${serif.variable} ${body.variable} ${sans.variable} menu-root min-h-screen`}>{children}</div>;
}
