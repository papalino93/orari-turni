import Link from "next/link";
import { formatPromoDates, promoStatus } from "@/lib/menu-format";

export type StripPromo = {
  id: string;
  slug: string;
  kind: "NOTICE" | "EVENT";
  title: string;
  label: string | null;
  showFrom: string;
  startDate: string;
  endDate: string;
  imageUpdatedAt: Date | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

function Poster({ promo, className }: { promo: StripPromo; className: string }) {
  return promo.imageUpdatedAt ? (
    // eslint-disable-next-line @next/next/no-img-element -- locandina servita dalla nostra rotta con cache lunga
    <img
      src={`/menu/p/${promo.slug}/immagine?v=${promo.imageUpdatedAt.getTime()}`}
      alt=""
      width={promo.imageWidth ?? 99}
      height={promo.imageHeight ?? 124}
      className={`${className} flex-none rounded-[10px] object-cover`}
    />
  ) : (
    <div className={`menu-serif ${className} flex flex-none items-center justify-center rounded-[10px] bg-[#6B1020] text-4xl italic text-[#E3D4BC]`}>
      {promo.title.slice(0, 1).toUpperCase()}
    </div>
  );
}

// Scheda grande: locandina a sinistra, tipo, date e titolo a destra, «Scopri» in fondo.
function Card({ promo, dayKey, big }: { promo: StripPromo; dayKey: string; big: boolean }) {
  const status = promoStatus(promo, dayKey);
  const name = promo.label || (promo.kind === "EVENT" ? "Evento" : "Annuncio");
  return (
    <Link href={`/menu/p/${promo.slug}`} className="flex w-full items-start gap-4 rounded-[18px] border border-[#D9CEBC] bg-[#FBF7EF] p-3.5 no-underline">
      <Poster promo={promo} className={big ? "h-[140px] w-[112px] sm:h-[170px] sm:w-[136px]" : "h-[140px] w-[112px]"} />
      {/* Tutto allineato in alto e «Scopri» sempre in fondo: due schede affiancate
          restano in riga anche con titoli di lunghezza diversa. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-stretch py-0.5">
        <div className="menu-sans truncate text-[12px] font-medium uppercase leading-snug tracking-[0.18em] text-[#9C7A45]">
          {status === "live" ? `${name} · in corso` : name}
        </div>
        <div className="menu-sans -mt-1 truncate text-[15px] text-[#4A504B]">{formatPromoDates(promo.startDate, promo.endDate)}</div>
        <div className={`menu-serif mt-0.5 line-clamp-3 text-balance font-medium leading-[1.05] text-[#6B1020] ${big ? "text-[29px] sm:text-[35px]" : "text-[27px]"}`}>
          {promo.title}
        </div>
        <div className="menu-sans mt-auto pt-1 text-[13px] font-medium uppercase tracking-[0.18em] text-[#6B1020]">Scopri →</div>
      </div>
    </Link>
  );
}

// Locandina piccola con data e titolo sotto: dal secondo evento in poi quando sono tre o più.
function Mini({ promo }: { promo: StripPromo }) {
  return (
    <Link href={`/menu/p/${promo.slug}`} className="flex min-w-0 flex-col gap-1.5 no-underline">
      <Poster promo={promo} className="aspect-[4/5] h-auto w-full border border-[#D9CEBC]" />
      <span className="menu-sans text-[12px] leading-tight text-[#4A504B]">{formatPromoDates(promo.startDate, promo.endDate)}</span>
      <span className="menu-serif line-clamp-2 text-[18px] font-medium leading-[1.05] text-[#6B1020]">{promo.title}</span>
    </Link>
  );
}

// «In evidenza» sotto la copertina, tutti gli eventi visibili senza scorrere di lato:
// uno → scheda grande; due → una sotto l'altra (affiancate da tablet in su); tre o più →
// il primo (quello messo in cima in «Riordina») grande e gli altri in una fila di locandine.
export function InEvidenza({ promos, dayKey }: { promos: StripPromo[]; dayKey: string }) {
  if (promos.length === 0) return null;
  const [first, ...rest] = promos;
  const cols = rest.length <= 4 ? rest.length : 3;
  const phoneCols = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"][cols] ?? "grid-cols-3";

  return (
    <section aria-label="In evidenza" className="mx-auto max-w-[720px] px-6 pt-8">
      <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#5B605A]">In evidenza</div>
      {promos.length <= 2 ? (
        <div className="mt-3 flex flex-col gap-3 sm:grid sm:grid-cols-2 [&:has(>:only-child)]:sm:grid-cols-1">
          {promos.map((promo) => (
            <Card key={promo.id} promo={promo} dayKey={dayKey} big={promos.length === 1} />
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          <Card promo={first} dayKey={dayKey} big />
          <div className={`grid gap-3 ${phoneCols} sm:grid-cols-[repeat(auto-fill,150px)]`}>
            {rest.map((promo) => (
              <Mini key={promo.id} promo={promo} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
