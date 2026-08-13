import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "L'Angolo del Vino — Orari";

// Anteprima quando il link dell'app viene condiviso su WhatsApp e simili:
// prima non c'era nessuna immagine, il messaggio arrivava come un link nudo.
// Riusa il logo esistente (il nome del locale, in bordeaux) su un biglietto
// chiaro sopra il gradiente bordeaux della barra di navigazione — stessa
// identità visiva del resto dell'app, non un'immagine generica a parte.
export default async function Image() {
  const logoData = await readFile(join(process.cwd(), "public/logo.png"));
  const logoSrc = Uint8Array.from(logoData).buffer;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #2e0101 0%, #560101 55%, #7a2138 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#fdf7f2",
            borderRadius: 32,
            padding: "68px 96px",
            boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          }}
        >
          <img src={logoSrc as unknown as string} width={560} height={160} alt="" />
          <div style={{ width: 120, height: 3, background: "#8a2740", opacity: 0.4, margin: "30px 0 26px", borderRadius: 2 }} />
          <div style={{ display: "flex", fontSize: 30, color: "#5a5254", letterSpacing: 0.2 }}>
            Gestione orari, copertura e ferie del personale
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
