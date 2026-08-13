// Su molti browser mobile (in particolare iOS Safari) un link <a download>
// con un blob non salva mai il file: l'unico modo affidabile di "mandarlo
// su WhatsApp" è passare dal pannello di condivisione nativo del sistema
// (Web Share API con file), che su un telefono vero include WhatsApp in
// automatico tra le app disponibili.
//
// Su desktop invece la Web Share API con file esiste ormai anche in Safari e
// Chrome, ma il pannello che apre è quello di sistema: elenca solo le app
// registrate come estensioni di condivisione macOS/Windows, e WhatsApp
// Desktop (versione scaricata dal sito, non dal Mac App Store) di norma non
// lo è. Il risultato è un pannello che si apre ma non contiene mai WhatsApp,
// più confuso di un semplice download — quindi su desktop non lo usiamo
// affatto. Non esiste un modo per allegare un file a un messaggio WhatsApp
// via link (l'API web di WhatsApp non lo consente): il file va scaricato e
// trascinato a mano. Per risparmiare almeno il passaggio di andare a
// cercare WhatsApp Web, dopo il download si apre comunque una scheda su
// web.whatsapp.com.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ dichiara uno user agent "Macintosh" identico a Safari desktop,
  // ma resta un touch device: lo distinguiamo dal numero di punti di tocco.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

// Cosa è successo, per permettere al chiamante di mostrare (o no) un
// messaggio di spiegazione:
// - "shared": pannello di condivisione nativo del telefono, con o senza
//   conferma dell'utente — in entrambi i casi non serve altro.
// - "downloaded-whatsapp-web": scaricato su desktop e aperta anche una
//   scheda di WhatsApp Web, così il chiamante può spiegare perché.
// - "downloaded": scaricato senza aprire nient'altro (es. share API non
//   disponibile su mobile).
export type ShareOutcome = "shared" | "downloaded-whatsapp-web" | "downloaded";

export async function shareOrDownloadFile(file: File): Promise<ShareOutcome> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  const mobile = isMobileDevice();

  if (mobile && nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared";
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

  if (!mobile) {
    // Non è possibile allegare il file in automatico a un messaggio: l'API
    // web di WhatsApp non lo consente, va trascinato a mano dopo averlo
    // scaricato. Aprire subito WhatsApp Web risparmia comunque il passaggio
    // di cercarlo — il chiamante mostra un messaggio che lo spiega.
    window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
    return "downloaded-whatsapp-web";
  }
  return "downloaded";
}
