import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Carta dei vini e Menù — L'Angolo del Vino";

// Anteprima del menù quando il link viene condiviso (WhatsApp, Instagram…):
// la foto della copertina velata di bordeaux e il logo chiaro, come la
// copertina del menù.
export default async function Image() {
  const [hero, logo, serif, sans] = await Promise.all([
    readFile(join(process.cwd(), "public/menu/hero.jpg")),
    readFile(join(process.cwd(), "public/menu/logo-light.png")),
    // Stessi caratteri della copertina del menù (Cormorant Garamond corsivo e Jost).
    readFile(join(process.cwd(), "public/menu/fonts/cormorant-italic-500.woff")),
    readFile(join(process.cwd(), "public/menu/fonts/jost-400.woff")),
  ]);
  const src = (b: Buffer, type: string) => `data:${type};base64,${b.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#3a0a12" }}>
        <img src={src(hero, "image/jpeg")} width={1200} height={1200} alt="" style={{ position: "absolute", top: -300, left: 0, objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", background: "linear-gradient(180deg, rgba(58,10,18,0.72) 0%, rgba(74,10,21,0.78) 55%, rgba(38,4,10,0.95) 100%)" }} />
        <div style={{ position: "absolute", top: 28, left: 28, width: 1144, height: 574, display: "flex", border: "2px solid rgba(201,169,110,0.55)", borderRadius: 18 }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
          <img src={src(logo, "image/png")} width={640} height={183} alt="" />
          <div style={{ width: 140, height: 2, background: "#C9A96E", margin: "30px 0 24px" }} />
          <div style={{ display: "flex", fontFamily: "Cormorant", fontStyle: "italic", fontSize: 54, color: "#F4EDE1", letterSpacing: 0.5 }}>Carta dei vini e Menù</div>
          <div style={{ display: "flex", fontFamily: "Jost", fontSize: 21, color: "#E3D4BC", letterSpacing: 7, marginTop: 14, textTransform: "uppercase" }}>
            Enoteca · Scandicci
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Cormorant", data: serif, style: "italic", weight: 500 },
        { name: "Jost", data: sans, style: "normal", weight: 400 },
      ],
    },
  );
}
