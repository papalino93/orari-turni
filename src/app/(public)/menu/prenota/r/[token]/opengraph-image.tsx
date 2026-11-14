// Anteprima del link nel WhatsApp al cliente: la stessa immagine del menù (logo e bicchiere),
// con il titolo «La tua prenotazione» dato dai metadati della pagina.
import MenuImage from "../../../opengraph-image";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "La tua prenotazione — L'Angolo del Vino";

export default async function Image() {
  return MenuImage();
}
