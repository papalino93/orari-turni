import Link from "next/link";
import { formatPromoDates } from "@/lib/menu-format";

type Notice = { id: string; slug: string; title: string; label: string | null; body: string | null; startDate: string; endDate: string };

// Annunci («Lunedì 13 chiusi per ferie», una novità): una riga sobria subito sotto la
// copertina, prima degli eventi. Si tocca per leggere tutto nella sua pagina.
export function Annunci({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <section aria-label="Annunci" className="mx-auto flex max-w-[720px] flex-col gap-2 px-6 pt-6">
      {notices.map((n) => (
        <Link
          key={n.id}
          href={`/menu/p/${n.slug}`}
          className="flex min-h-12 items-center gap-3 rounded-[14px] border border-[#D9CEBC] bg-[#FBF7EF] px-4 py-2.5 no-underline"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9C7A45" strokeWidth="1.8" strokeLinecap="round" aria-hidden className="flex-none">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M12 11v5.5M12 7.6v.1" />
          </svg>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-pretty text-[16.5px] font-medium leading-snug text-[#1F2621]">{n.title}</span>
            <span className="menu-sans text-[11px] uppercase tracking-[0.14em] text-[#5B605A]">
              {n.label || "Avviso"} · {formatPromoDates(n.startDate, n.endDate)}
            </span>
          </span>
          {n.body && (
            <span className="menu-sans flex-none text-[11px] font-medium uppercase tracking-[0.16em] text-[#6B1020]" aria-hidden>
              Leggi ›
            </span>
          )}
        </Link>
      ))}
    </section>
  );
}
