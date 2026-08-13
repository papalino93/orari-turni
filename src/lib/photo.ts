"use client";

// Ridimensiona l'immagine scelta dall'utente a un quadrato piccolo prima di
// caricarla: la foto profilo non deve mai pesare più di qualche decina di KB,
// né essere così grande da rallentare liste e griglie. Fatto lato client per
// non dover mai gestire sul server un file arbitrariamente pesante.

const TARGET_SIZE = 320; // px, lato del quadrato
const JPEG_QUALITY = 0.85;

export class PhotoError extends Error {}

export async function resizeToSquareJpeg(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new PhotoError("Il file scelto non è un'immagine.");
  }

  const bitmap = await loadBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Impossibile elaborare l'immagine su questo dispositivo.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new PhotoError("Impossibile generare l'immagine.");

  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // alcuni formati (es. HEIC su browser non compatibili) falliscono qui:
      // si tenta comunque il fallback sotto prima di arrendersi.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new PhotoError("Formato immagine non supportato."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
