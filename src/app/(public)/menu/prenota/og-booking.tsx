import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

// Anteprima dei link delle prenotazioni (WhatsApp, Instagram, Facebook, Google): a sinistra la foto
// del locale, a destra su carta chiara il logo e la scritta grande («Prenota un tavolo», «La tua
// prenotazione»). Prima usciva quella del menù, «Carta dei vini e Menù»: non c'entrava.
export async function bookingImage(title: string, line: string) {
  const [hero, logo, serif, sans] = await Promise.all([
    readFile(join(process.cwd(), "public/menu/hero.jpg")),
    readFile(join(process.cwd(), "public/menu/logo.png")),
    readFile(join(process.cwd(), "public/menu/fonts/cormorant-italic-500.woff")),
    readFile(join(process.cwd(), "public/menu/fonts/jost-400.woff")),
  ]);
  const src = (b: Buffer, type: string) => `data:${type};base64,${b.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F6F1E8" }}>
        <div style={{ width: 470, height: 630, display: "flex", position: "relative", overflow: "hidden" }}>
          <img src={src(hero, "image/jpeg")} width={1000} height={1000} alt="" style={{ position: "absolute", top: -190, left: -300, objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: 470, height: 630, display: "flex", background: "linear-gradient(90deg, rgba(58,10,18,0.15) 0%, rgba(58,10,18,0.35) 100%)" }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 56px", position: "relative" }}>
          <div style={{ position: "absolute", top: 26, left: 26, right: 26, bottom: 26, display: "flex", border: "2px solid rgba(156,122,69,0.45)", borderRadius: 16 }} />
          <img src={src(logo, "image/png")} width={460} height={132} alt="" />
          <div style={{ width: 120, height: 2, background: "#C9A96E", margin: "26px 0 22px" }} />
          <div style={{ display: "flex", fontFamily: "Cormorant", fontStyle: "italic", fontSize: 76, color: "#6B1020", lineHeight: 1 }}>{title}</div>
          <div style={{ display: "flex", fontFamily: "Jost", fontSize: 26, color: "#3F4540", marginTop: 22, textAlign: "center" }}>{line}</div>
          <div style={{ display: "flex", fontFamily: "Jost", fontSize: 18, color: "#9C7A45", letterSpacing: 6, marginTop: 26, textTransform: "uppercase" }}>
            Enoteca · Scandicci
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Cormorant", data: serif, style: "italic", weight: 500 },
        { name: "Jost", data: sans, style: "normal", weight: 400 },
      ],
    },
  );
}
