// Anteprima del link nel WhatsApp al cliente («La tua prenotazione»).
import { bookingImage } from "../../og-booking";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "La tua prenotazione — L'Angolo del Vino";

export default async function Image() {
  return bookingImage("La tua prenotazione", "Qui vedi a che punto è, e puoi annullare");
}
