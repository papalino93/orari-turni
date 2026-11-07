// Pezzi comuni delle pagine di prenotazione del cliente (modulo, stato, informativa).
// Senza hook: si usano sia nelle pagine del server sia nei componenti client.

import { BackToMenu } from "../back-to-menu";

// Pulsanti a pillola, come quelli degli eventi. Nel menù i colori dei bordi e dei link vanno
// forzati (vedi menu.css: una regola globale batte le utility).
export const pillFilled =
  "menu-sans inline-flex min-h-12 items-center justify-center gap-2 rounded-full border !border-[#6B1020] bg-[#6B1020] px-6 text-[12px] font-medium uppercase tracking-[0.18em] !text-[#F4EEE3] no-underline disabled:opacity-60";
export const pillOutline =
  "menu-sans inline-flex min-h-12 items-center justify-center gap-2 rounded-full border !border-[#6B1020] bg-transparent px-6 text-[12px] font-medium uppercase tracking-[0.18em] !text-[#6B1020] no-underline disabled:opacity-60";

export function PrenotaHeader() {
  return (
    <header className="flex flex-col items-center gap-3 bg-[#5A0E18] px-6 pb-5 pt-[max(20px,env(safe-area-inset-top))] text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtri CSS */}
      <img src="/menu/logo.png" alt="L’Angolo del Vino" className="h-auto w-[150px] [filter:invert(1)_sepia(0.25)_brightness(0.97)]" />
      <BackToMenu className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] !text-[#E3D4BC] no-underline">
        ← Torna al menù
      </BackToMenu>
    </header>
  );
}

// Fascia del titolare quando la funzione è spenta.
export function PreviewBand({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="menu-sans bg-[#F3E3B5] px-5 py-3 text-center text-[13.5px] leading-snug text-[#4A3A12]">
      {children}
    </div>
  );
}

// «Chiama» e «WhatsApp» del locale: ognuno solo se il link c'è.
export function ContactButtons({ tel, wa, className = "" }: { tel: string | null; wa: string | null; className?: string }) {
  if (!tel && !wa) return null;
  return (
    <div className={`flex flex-wrap justify-center gap-2.5 ${className}`}>
      {tel && (
        <a href={tel} className={`${pillFilled} min-w-[132px] !px-4`}>
          <PhoneIcon /> Chiama
        </a>
      )}
      {wa && (
        <a href={wa} className={`${pillOutline} min-w-[132px] !px-4`}>
          <ChatIcon /> WhatsApp
        </a>
      )}
    </div>
  );
}

// Numero del cliente da mostrare: «333 123 4567» per i numeri italiani, altrimenti «+44 …».
export function phoneDisplay(international: string): string {
  if (international.startsWith("39") && international.length >= 11) {
    const n = international.slice(2);
    return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
  }
  return `+${international}`;
}

// Lo stesso numero con le cifre di mezzo nascoste (la pagina si può inoltrare): «333 1•• ••67».
export function phoneMasked(international: string): string {
  const shown = phoneDisplay(international);
  const digits = [...shown].filter((c) => /\d/.test(c)).length;
  let seen = 0;
  return [...shown]
    .map((c) => {
      if (!/\d/.test(c)) return c;
      seen++;
      return seen <= 4 || seen > digits - 2 ? c : "•";
    })
    .join("");
}

export function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />
    </svg>
  );
}
