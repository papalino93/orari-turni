// Su molti browser mobile (in particolare iOS Safari) un link <a download>
// con un blob non salva mai il file: l'unico modo affidabile di "mandarlo
// su WhatsApp" è passare dal pannello di condivisione nativo del sistema
// (Web Share API con file).
//
// Su desktop invece la Web Share API con file esiste ormai anche in Safari e
// Chrome, ma il pannello che apre è quello di sistema: elenca solo le app
// registrate come estensioni di condivisione macOS/Windows, e WhatsApp
// Desktop (versione scaricata dal sito, non dal Mac App Store) di norma non
// lo è. Il risultato è un pannello che si apre ma non contiene mai WhatsApp,
// più confuso di un semplice download. Su desktop l'utente sa comunque
// trascinare un file scaricato dentro WhatsApp Web/Desktop, quindi lì si
// scarica sempre direttamente, senza passare dal pannello di sistema.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ dichiara uno user agent "Macintosh" identico a Safari desktop,
  // ma resta un touch device: lo distinguiamo dal numero di punti di tocco.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export async function shareOrDownloadFile(file: File) {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (isMobileDevice() && nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // se la condivisione fallisce per un altro motivo, prova comunque il download
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
