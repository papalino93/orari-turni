import type { Metadata } from "next";
import "../../menu/menu.css";
import { body, sans, serif } from "../../menu/fonts";

// Pagina pubblica per non ricevere più le email (link in fondo a ogni mail della lista):
// fuori dal login, con i colori e i caratteri del menù dei clienti.
export const metadata: Metadata = {
  title: "Email dell'Angolo del Vino",
  robots: { index: false, follow: false },
  // Il link contiene l'indirizzo di chi l'ha ricevuto: non lo si passa ad altri siti.
  referrer: "no-referrer",
};

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${serif.variable} ${body.variable} ${sans.variable} menu-root min-h-screen [color-scheme:light]`}>{children}</div>;
}
