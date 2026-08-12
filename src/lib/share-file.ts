// Su molti browser mobile (in particolare iOS Safari) un link <a download>
// con un blob non salva mai il file: l'unico modo affidabile di "mandarlo
// su WhatsApp" è passare dal pannello di condivisione nativo del sistema
// (Web Share API con file). Sul desktop, dove la condivisione nativa non è
// disponibile, si scarica normalmente.
export async function shareOrDownloadFile(file: File) {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
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
