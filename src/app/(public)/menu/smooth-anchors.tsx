"use client";

import { useEffect } from "react";

// I link che portano a un punto della stessa pagina (chip delle sezioni, «Vai al menù ↓»…) scorrono
// «morbidi» da JavaScript, un salto alla volta. Lo scorrimento morbido non è impostato nel CSS di tutta
// la pagina: su iPhone rovinava il tocco sulla barra di stato (torna in cima) e lo scorrimento di pagine
// lunghe come quella di un evento. Con «riduci animazioni» attivo il salto è immediato.
export function SmoothAnchors() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onClick(e: MouseEvent) {
      // Un altro gestore (es. gli abbinamenti) può averlo già preso in carico.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href^='#']");
      if (!(link instanceof HTMLAnchorElement)) return;
      let id = "";
      try {
        id = decodeURIComponent(link.getAttribute("href")!.slice(1));
      } catch {
        return;
      }
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
