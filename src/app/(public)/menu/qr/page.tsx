import type { Metadata } from "next";
import QRCode from "qrcode";
import Link from "next/link";
import { MENU_QR_URL } from "@/lib/widgets";
import { Ornament } from "../ornament";

// Il QR del menù a tutto schermo, da far inquadrare a un cliente dal proprio telefono
// (ci porta il widget «QR» e il «Pannello»). È lo stesso codice stampato sui tavoli.
export const metadata: Metadata = { title: "QR del menù — L'Angolo del Vino" };

export default async function MenuQrPage() {
  const svg = await QRCode.toString(MENU_QR_URL, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2A0A12", light: "#FFFFFF" } });
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-[#F4EEE3] px-6 py-10 text-center">
      <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#9C7A45]">L&apos;Angolo del Vino</div>
      <h1 className="menu-serif m-0 text-[40px] font-medium leading-none text-[#6B1020]">Il nostro menù</h1>
      <Ornament color="#9C7A45" />
      <div
        role="img"
        aria-label="Codice QR del menù"
        className="w-full max-w-[340px] rounded-[28px] border border-[#D9CEBC] bg-white p-5 shadow-[0_12px_40px_rgba(42,10,18,0.12)] [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="m-0 max-w-[300px] text-[19px] italic leading-snug text-[#3F4540]">Inquadra il codice con la fotocamera del telefono.</p>
      <Link href="/menu" className="menu-sans flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] text-[#6B1020] underline underline-offset-4">
        Oppure sfoglialo qui
      </Link>
    </main>
  );
}
