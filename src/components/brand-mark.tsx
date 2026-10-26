"use client";

// Logo dell'Angolo del Vino nella barra del gestionale e nell'accesso. Dal 29 ottobre 2026
// alle 16:30 al 29 ottobre 2027 (gli 8 anni, vedi lib/ricorrenze.ts) ha dietro l'«8 rigirato» (∞) in oro.
// Il logo è il PNG vinaccia reso bianco (fondo bordeaux), l'∞ è disegnato in SVG.
import { useSyncExternalStore } from "react";
import { festaForzata, marchioOtto } from "@/lib/ricorrenze";

const INFINITY = "M300 100 C 360 8, 528 8, 528 100 C 528 192, 360 192, 300 100 C 240 8, 72 8, 72 100 C 72 192, 240 192, 300 100 Z";
const noop = () => () => {};
const conOtto = () => festaForzata() ?? marchioOtto(Date.now());

// `plainClassName`: la misura di sempre, finché non c'è l'∞ (prima del 29 ottobre 2026 alle 16:30 tutto resta com'era).
export function BrandMark({ className = "h-11", plainClassName = "h-10", stroke = 1.6 }: { className?: string; plainClassName?: string; stroke?: number }) {
  const otto = useSyncExternalStore(noop, conOtto, () => marchioOtto(Date.now()));
  return (
    <span className="relative inline-flex shrink-0 items-center">
      {otto && (
        <svg
          aria-hidden
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="pointer-events-none absolute -left-[8%] top-[2%] h-[100%] w-[116%] overflow-visible"
        >
          <path d={INFINITY} fill="none" stroke="#C9A96E" strokeWidth={stroke} vectorEffect="non-scaling-stroke" opacity="0.8" />
        </svg>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- logo statico, non serve l'ottimizzazione di next/image */}
      <img src="/logo.png" alt="L'Angolo del Vino" className={`brand-logo-invert relative w-auto ${otto ? className : plainClassName}`} />
    </span>
  );
}
