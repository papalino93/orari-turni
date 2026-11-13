// Aiuto per le prove E2E delle prenotazioni: stampa in JSON i prossimi giorni prenotabili, calcolati
// dal servizio vero (stessi orari, chiusure e impostazioni del sito) sul database di prova.
// Uso: npx tsx scripts/menu-e2e/prenota-giorni.mjs   (lo chiama prenota-lib.mjs → bookableDays())
import { loadEnvLocal } from "./prenota-lib.mjs";

loadEnvLocal();
if (!new RegExp(`/${process.env.E2E_DB || "orari_test"}(\\?|$)`).test(process.env.DATABASE_URL || "")) {
  console.error("DATABASE_URL non è il database di prova orari_test.");
  process.exit(2);
}
const S = await import("@/lib/booking/service");
const { prisma } = await import("@/lib/prisma");
const settings = await S.loadBookingSettings();
// Con la funzione spenta i giorni si calcolano lo stesso (il titolare la prova in anteprima).
const days = await S.bookingDays(settings);
console.log(
  JSON.stringify({
    settings,
    days: days.map((d) => ({ day: d.day, label: d.label, state: d.availability.state, reason: d.availability.reason ?? null, slots: d.availability.slots.map((s) => s.time), events: d.events })),
  }),
);
await prisma.$disconnect();
