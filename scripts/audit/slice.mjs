// Taglia una schermata lunga in pezzi alti come un telefono, per guardarla bene.
import sharp from "sharp";
const [file, outPrefix, h = "900", max = "3"] = process.argv.slice(2);
const meta = await sharp(file).metadata();
const H = Number(h);
for (let i = 0; i < Math.min(Number(max), Math.ceil(meta.height / H)); i++) {
  const top = i * H;
  await sharp(file).extract({ left: 0, top, width: meta.width, height: Math.min(H, meta.height - top) }).toFile(`${outPrefix}-${i + 1}.png`);
}
console.log(meta.width, meta.height);
