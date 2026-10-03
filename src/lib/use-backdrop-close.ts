"use client";

import { useRef } from "react";

// Chiusura di un modale toccando lo sfondo scuro, ma solo se il tocco (o il clic)
// è cominciato e finito nello stesso punto. Selezionando un testo con il mouse e
// rilasciando fuori dal riquadro, il browser manda un «clic» allo sfondo: senza
// questo controllo il modale si chiudeva da solo, perdendo quello che si scriveva.
export function useBackdropClose(onClose: () => void) {
  const down = useRef<EventTarget | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      down.current = e.target;
    },
    onClick: (e: React.MouseEvent) => {
      if (down.current === e.target) onClose();
      down.current = null;
    },
  };
}
