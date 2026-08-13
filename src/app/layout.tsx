import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers";
import "./globals.css";

const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme', t==='light'?'light':'dark');}catch(e){}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// VERCEL_PROJECT_PRODUCTION_URL è iniettata da Vercel ad ogni build con il
// dominio di produzione reale (che sia quello *.vercel.app o uno
// personalizzato) — evita di doverlo scrivere qui a mano, e resta corretto
// da solo se in futuro cambia. Serve perché le anteprime social (WhatsApp,
// ecc.) e le icone del manifest richiedono URL assoluti, non relativi.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "L'Angolo del Vino — Orari",
  description: "Gestione orari, copertura e ferie del personale",
  // Fa aprire l'app installata (vedi /installa) a schermo intero, senza la
  // barra degli indirizzi di Safari — l'aspetto di un'app vera, non di una
  // scheda del browser.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Orari",
  },
  openGraph: {
    title: "L'Angolo del Vino — Orari",
    description: "Gestione orari, copertura e ferie del personale",
    siteName: "L'Angolo del Vino",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "L'Angolo del Vino — Orari",
    description: "Gestione orari, copertura e ferie del personale",
  },
};

export const viewport: Viewport = {
  themeColor: "#560101",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
