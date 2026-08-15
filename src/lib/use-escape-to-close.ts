import { useEffect } from "react";

// Nessun modal dell'app chiudeva con Esc — solo click sullo sfondo o un
// pulsante esplicito. Un solo hook condiviso invece di ripetere lo stesso
// listener in ogni modal (DayEditorModal, ClosureRangeModal, DayStatusModal,
// l'anteprima di esportazione, PdfExportModal, il conferma-svuota di
// ClearWeekButton, PhotoEditor).
export function useEscapeToClose(onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, onClose]);
}
