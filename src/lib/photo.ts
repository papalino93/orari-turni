"use client";

// Caricamento e ritaglio dell'immagine scelta dall'utente. Il ritaglio finale
// è sempre un quadrato piccolo (la foto profilo non deve mai pesare più di
// qualche decina di KB), ma la posizione e lo zoom dentro quel quadrato sono
// scelti dall'utente in PhotoCropper — non più un centro automatico che può
// tagliare male un volto non centrato nella foto originale.

export const TARGET_SIZE = 320; // px, lato del quadrato esportato
export const JPEG_QUALITY = 0.85;

export class PhotoError extends Error {}

// Carica il file in un vero <img> (non un ImageBitmap): serve come elemento
// del DOM per l'anteprima trascinabile del ritaglio, ed è comunque una
// sorgente valida per drawImage in fase di esportazione finale.
export async function loadImageElement(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith("image/")) {
    throw new PhotoError("Il file scelto non è un'immagine.");
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
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

// Ritaglia la regione [sx,sy,sSize×sSize] (in pixel dell'immagine originale)
// e la esporta come JPEG quadrato TARGET_SIZE×TARGET_SIZE.
export async function cropToSquareJpeg(
  img: HTMLImageElement,
  crop: { sx: number; sy: number; sSize: number },
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Impossibile elaborare l'immagine su questo dispositivo.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.sx, crop.sy, crop.sSize, crop.sSize, 0, 0, TARGET_SIZE, TARGET_SIZE);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new PhotoError("Impossibile generare l'immagine.");

  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
