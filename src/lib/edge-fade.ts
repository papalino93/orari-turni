// Righe che scorrono di lato (schede, periodi, giorni): dice al CSS (scroll-fade-x in
// globals.css) da che parte c'è ancora altro da vedere, per sfumare solo quel bordo.
// Si usa come ref (React 19: la funzione restituita toglie gli ascoltatori quando la riga
// sparisce). Si aggiorna anche quando cambia il contenuto (giorni caricati, schede nuove).
export function edgeFade(el: HTMLElement | null) {
  if (!el) return;
  const update = () => {
    el.toggleAttribute("data-more-left", el.scrollLeft > 2);
    el.toggleAttribute("data-more-right", el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  update();
  el.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  resized?.observe(el);
  const changed = typeof MutationObserver === "undefined" ? null : new MutationObserver(update);
  changed?.observe(el, { childList: true });
  return () => {
    el.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    resized?.disconnect();
    changed?.disconnect();
  };
}

// Porta in vista, al centro della riga, l'elemento scelto (la scheda o il periodo attivo),
// solo se la riga scorre davvero. La riga deve essere il suo offsetParent (classe «relative»).
export function centerInRow(row: HTMLElement | null, item: HTMLElement | null, smooth = false) {
  if (!row || !item || row.scrollWidth <= row.clientWidth) return;
  const left = item.offsetLeft - (row.clientWidth - item.offsetWidth) / 2;
  if (smooth) row.scrollTo({ left, behavior: "smooth" });
  else row.scrollLeft = left;
}
