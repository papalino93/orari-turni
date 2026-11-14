"use client";

import { useEffect } from "react";

// iPhone, sito aperto dall'icona sulla schermata Home: chiusa la tastiera (o tornati all'app),
// Safari a volte lascia la barra in basso «staccata» a metà schermo mentre si scorre. Un
// piccolo scorrimento di un pixel avanti e indietro lo costringe a rimetterla al suo posto.
export function IosViewportFix() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!ios) return;
    let timer = 0;
    const nudge = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const y = window.scrollY;
        window.scrollTo(window.scrollX, y + 1);
        requestAnimationFrame(() => window.scrollTo(window.scrollX, y));
      }, 120);
    };
    const onFocusOut = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) nudge();
    };
    let lastH = window.visualViewport?.height ?? window.innerHeight;
    const onResize = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      // Solo quando lo schermo torna più alto (tastiera chiusa): aperta, non si tocca niente.
      if (h > lastH + 40) nudge();
      lastH = h;
    };
    const onVisible = () => document.visibilityState === "visible" && nudge();
    document.addEventListener("focusout", onFocusOut);
    window.visualViewport?.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
