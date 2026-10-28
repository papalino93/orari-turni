import type { Metadata } from "next";
import "./menu.css";
import { body, sans, serif } from "./fonts";
import { MenuStats } from "./stats";
import { SmoothAnchors } from "./smooth-anchors";

export const metadata: Metadata = {
  title: "Menù — L'Angolo del Vino",
  description: "Carta dei vini e menù dell'Angolo del Vino",
  // Raggiungibile dal QR in enoteca, non dai motori di ricerca: una copia
  // vecchia nei risultati mostrerebbe prezzi e voci non più veri.
  robots: { index: false, follow: false },
  // Anteprima quando il link del menù viene condiviso (immagine: opengraph-image.tsx).
  openGraph: {
    title: "Carta dei vini e Menù — L'Angolo del Vino",
    description: "Vini al calice e in bottiglia, taglieri, eventi. Enoteca a Scandicci.",
    siteName: "L'Angolo del Vino",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Carta dei vini e Menù — L'Angolo del Vino",
    description: "Vini al calice e in bottiglia, taglieri, eventi. Enoteca a Scandicci.",
  },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${serif.variable} ${body.variable} ${sans.variable} menu-root min-h-screen`}>
      <MenuStats />
      {children}
      {/* Dopo i figli: i gestori di click dei figli (abbinamenti) hanno la precedenza. */}
      <SmoothAnchors />
    </div>
  );
}
