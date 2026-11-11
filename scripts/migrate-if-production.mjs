// Migrazioni del database solo nel rilascio vero (o in locale), mai nelle anteprime di Vercel.
//
// Le anteprime usano lo stesso database del sito: se una migrazione partisse da un ramo di prova,
// cambierebbe il database di produzione prima del rilascio. Su Vercel VERCEL_ENV vale «production»,
// «preview» o «development» (anche durante il build); in locale non c'è.
//
// Si salta SOLO quando VERCEL_ENV dice esplicitamente che non è produzione: se per qualche motivo
// mancasse, si migra (meglio una migrazione in più che un rilascio vero senza la sua).
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env && env !== "production") {
  console.log(`[migrazioni] VERCEL_ENV=${env}: anteprima, il database non si tocca (le migrazioni le fa solo il rilascio vero).`);
  process.exit(0);
}
console.log(`[migrazioni] ${env ? "rilascio vero (production)" : "in locale"}: prisma migrate deploy`);
execSync("prisma migrate deploy", { stdio: "inherit" });
