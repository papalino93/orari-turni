import Link from "next/link";

// Pagina «non trovata» (link vecchio o sbagliato, es. un evento cancellato):
// in italiano e con i colori del menù, invece della pagina inglese predefinita.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-[#F4EEE3] px-6 text-center text-[#1F2621]">
      <p className="text-[11px] uppercase tracking-[0.34em] text-[#9C7A45]">L&apos;Angolo del Vino</p>
      <h1 className="mt-4 font-serif text-[38px] font-medium leading-tight text-[#6B1020]">Pagina non trovata</h1>
      <p className="mt-3 max-w-[340px] text-[16px] leading-normal text-[#3F4540]">
        Il link potrebbe essere vecchio, per esempio di un evento già concluso.
      </p>
      <Link
        href="/menu"
        className="mt-8 inline-flex min-h-12 items-center rounded-full bg-[#6B1020] px-7 text-[12px] font-medium uppercase tracking-[0.2em] text-[#F4EEE3] no-underline"
      >
        Vai al menù
      </Link>
    </main>
  );
}
