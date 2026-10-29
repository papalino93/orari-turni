"use client";

// Pagina di benvenuto per gli 8 anni (29 ottobre 2018 → 2026): chi inquadra il QR dal
// 29 ottobre alle 16:30 al 2 novembre alle 10:00 (vedi lib/ricorrenze.ts) vede prima la lettera di
// Andrea e del team, poi con «Entra nel menù» il menù di sempre. Una volta chiusa non torna
// più finché resta aperta la stessa scheda. Anteprima: /menu?festa=1.
// Decide il browser (non il server): la pagina del menù è in cache e l'ora conta al minuto.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { festaForzata, festaInCorso } from "@/lib/ricorrenze";

const INFINITY = "M300 100 C 360 8, 528 8, 528 100 C 528 192, 360 192, 300 100 C 240 8, 72 8, 72 100 C 72 192, 240 192, 300 100 Z";
const KEY = "festa-8-anni-vista";
// Spazio che non va a capo: «29 Ottobre 2018» resta sempre su una riga.
const NB = "\u00a0";
const noop = () => () => {};
function daMostrare() {
  const forzata = festaForzata();
  if (forzata !== null) return forzata;
  try {
    if (sessionStorage.getItem(KEY) === "1") return false;
  } catch {}
  return festaInCorso(Date.now());
}

export function FestaBenvenuto() {
  const mostra = useSyncExternalStore(noop, daMostrare, () => false);
  const [chiusa, setChiusa] = useState(false);
  const aperta = mostra && !chiusa;
  const pulsante = useRef<HTMLButtonElement>(null);
  const otto = useRef<SVGSVGElement>(null);

  function chiudi() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    setChiusa(true);
    window.scrollTo(0, 0);
  }

  // Mentre è aperta: niente scorrimento del menù sotto, Esc la chiude, il fuoco va sul pulsante.
  useEffect(() => {
    if (!aperta) return;
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    pulsante.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudi();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prima;
      window.removeEventListener("keydown", onKey);
    };
  }, [aperta]);

  // L'8: nasce grande, spesso e in piedi al centro dello schermo, si disegna, poi si sdraia diventando ∞
  // e va al suo posto sotto il logo. Le durate corrispondono ai ritardi di .festa-8-dopo in menu.css.
  useLayoutEffect(() => {
    const svg = otto.current;
    const tratto = svg?.querySelector("path");
    if (!aperta || !svg || !tratto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = svg.getBoundingClientRect();
    const zoom = r.width / svg.clientWidth || 1; // il logo può essere rimpicciolito sui telefoni bassi
    const largo = (r.width * 456) / 600; // larghezza del solo ∞ dentro il disegno
    const alto = (r.height * 184) / 200;
    const s = Math.min((innerHeight * 0.62) / largo, (innerWidth * 0.78) / alto);
    const dx = (innerWidth / 2 - (r.left + r.width / 2)) / zoom;
    const dy = (innerHeight * 0.47 - (r.top + r.height / 2)) / zoom;
    const disegno = tratto.animate([{ strokeDashoffset: 1400 }, { strokeDashoffset: 0 }], { duration: 2000, delay: 300, easing: "ease-in-out", fill: "both" });
    const viaggio = svg.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(90deg)` }, { transform: "translate(0px, 0px) scale(1) rotate(0deg)" }],
      { duration: 1300, delay: 2500, easing: "cubic-bezier(.65,0,.35,1)", fill: "both" },
    );
    // Nasce con un tratto spesso e si assottiglia mentre si rimpicciolisce, fino al calibro di sempre.
    const calibro = tratto.animate([{ strokeWidth: 11 }, { strokeWidth: 4 }], { duration: 1300, delay: 2500, easing: "cubic-bezier(.65,0,.35,1)", fill: "both" });
    return () => {
      disegno.cancel();
      viaggio.cancel();
      calibro.cancel();
    };
  }, [aperta]);

  if (!aperta) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Otto anni insieme" className="festa-8 fixed inset-0 z-[100] overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[440px] flex-col px-7 pb-[calc(20px+env(safe-area-inset-bottom))] pt-[calc(34px+env(safe-area-inset-top))]">
        <div className="festa-8-logo relative mx-auto flex h-[92px] w-[250px] items-center justify-center">
          <svg ref={otto} aria-hidden viewBox="0 0 600 200" className="festa-8-otto absolute -left-2 -top-1 h-[88px] w-[266px] overflow-visible">
            <path className="festa-8-infinito" d={INFINITY} fill="none" stroke="#D8B97A" strokeWidth="4" strokeLinecap="round" />
          </svg>
          {/* eslint-disable-next-line @next/next/no-img-element -- logo statico con filtro CSS */}
          <img src="/logo.png" alt="L'Angolo del Vino" className="festa-8-dopo relative -mt-2.5 h-auto w-[232px] [filter:brightness(0)_invert(1)]" />
        </div>

        <div className="festa-8-testo festa-8-dopo mt-6 font-[family-name:var(--font-menu-serif)] text-[22px] italic leading-[1.42] text-[#F4EEE3]">
          <p className="m-0 text-[#D8B97A]">Cari amici,</p>
          <p className="mt-2.5">
            Otto anni fa, il 29{NB}Ottobre{NB}2018, abbiamo stappato la prima bottiglia senza sapere dove ci avrebbe portato. Ci ha portato da voi: alle
            vostre storie, ai vostri brindisi, alle serate che non volevano finire.
          </p>
          <p className="mt-2.5">Ci sono date che cambiano la vita. Il{NB}29{NB}Ottobre, per me, lo ha fatto due volte.</p>
          <p className="mt-2.5">Stasera alziamo il calice per voi, che da otto anni rendete questo posto così speciale!</p>
          <p className="mt-2.5 text-[#D8B97A]">Il meglio deve ancora venire.</p>
        </div>

        <p className="festa-8-dopo mb-7 mt-3 self-end text-right font-[family-name:var(--font-menu-serif)] leading-[1.05] text-[#D8B97A]">
          <span className="text-[30px] font-semibold not-italic">A</span>
          <span className="text-[30px] italic">ndrea</span>
          <br />
          <span className="text-[22px] italic">e il team dell&apos;</span>
          <span className="text-[24px] font-semibold not-italic">A</span>
          <span className="text-[22px] italic">ngolo del Vino</span>
        </p>

        <button
          ref={pulsante}
          type="button"
          onClick={chiudi}
          className="festa-8-dopo festa-8-pulsante menu-sans mt-auto flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#F4EEE3] pt-0 text-[16px] font-medium tracking-[0.05em] text-[#4A0C18] outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#D8B97A]"
        >
          Entra nel menù
        </button>
        <div className="festa-8-dopo menu-sans mt-3.5 flex flex-col items-center gap-1 text-[11px] uppercase tracking-[0.22em] text-[#D8B97A]">
          <span>L&apos;Angolo del Vino</span>
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="h-px w-[26px] bg-[#D8B97A]" />8 anni di noi
            <span aria-hidden className="h-px w-[26px] bg-[#D8B97A]" />
          </span>
        </div>
      </div>
    </div>
  );
}
