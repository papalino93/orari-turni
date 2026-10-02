import { Cormorant_Garamond, Jost } from "next/font/google";
import "./print.css";

// Pagine da stampare (fuori dalla cornice dell'app: niente barra in alto né menù in basso).
const serif = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-print-serif",
  display: "swap",
});
const sans = Jost({ subsets: ["latin", "latin-ext"], variable: "--font-print-sans", display: "swap" });

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className={`print-root ${serif.variable} ${sans.variable}`}>{children}</div>;
}
