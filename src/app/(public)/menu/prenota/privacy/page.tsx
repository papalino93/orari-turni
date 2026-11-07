import type { Metadata } from "next";
import Link from "next/link";
import { loadVenue } from "@/lib/menu";
import { MenuFooter } from "../../venue-footer";
import { Ornament } from "../../ornament";
import { PrenotaHeader } from "../ui";
import { PrivacyText } from "../privacy-text";

// Informativa: sempre raggiungibile (anche a funzione spenta: chi ha già una richiesta deve poterla leggere).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Privacy delle prenotazioni — L'Angolo del Vino",
  description: "Come usiamo i dati di chi chiede un tavolo",
  robots: { index: false, follow: false },
};

export default async function PrivacyPage() {
  const venue = await loadVenue();
  return (
    <>
      <PrenotaHeader />
      <main className="mx-auto max-w-[620px] px-6 pb-[72px] pt-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">Prenotazioni</div>
          <h1 className="menu-serif m-0 mb-2 text-balance text-[40px] font-medium leading-[1.05] text-[#6B1020]">I tuoi dati</h1>
          <Ornament color="#9C7A45" />
        </div>
        <div className="mt-8">
          <PrivacyText address={venue.contacts.address} phone={venue.contacts.phone} />
        </div>
        <div className="mt-12 flex flex-col items-center gap-3.5 text-center">
          <Ornament color="#9C7A45" />
          <Link href="/menu/prenota" className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] underline underline-offset-4">
            Torna alla prenotazione
          </Link>
        </div>
      </main>
      <MenuFooter hours={venue.hours} contacts={venue.contacts} hideBooking />
    </>
  );
}
