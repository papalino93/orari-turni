// Ridimensiona una foto scelta dal telefono prima del caricamento: i clienti
// scaricano la locandina da una connessione mobile, quindi deve essere leggera.
// Solo browser (usa canvas).

export type ResizedImage = { blob: Blob; width: number; height: number };

const MAX_BYTES = 800 * 1024;

export async function resizeToJpeg(file: File, maxWidth = 1200, maxHeight = 1600): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossibile elaborare l'immagine.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Qualità decrescente finché sta sotto il limite.
  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return { blob, width, height };
  }
  throw new Error("La foto è troppo pesante anche dopo il ridimensionamento. Scegline una più piccola.");
}
