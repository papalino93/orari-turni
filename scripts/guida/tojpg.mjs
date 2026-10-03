import sharp from "sharp"; import { readdirSync } from "node:fs";
for (const f of readdirSync("img").filter((f) => f.endsWith(".png") && f !== "qr-prod.png")) {
  const d = /^(pubd|gesd|mac)-/.test(f);
  await sharp("img/" + f).resize({ width: d ? 1900 : f.startsWith("mac-") ? 2000 : 780 }).jpeg({ quality: d ? 84 : 90 }).toFile("jpg/" + f.replace(".png", ".jpg"));
}
