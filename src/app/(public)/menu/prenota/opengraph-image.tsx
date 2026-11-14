// Anteprima di /menu/prenota (e dei link brevi /g, /ig, /fb che portano qui).
import { bookingImage } from "./og-booking";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Prenota un tavolo — L'Angolo del Vino";

export default async function Image() {
  return bookingImage("Prenota un tavolo", "Scegli giorno e ora: ti confermiamo noi");
}
