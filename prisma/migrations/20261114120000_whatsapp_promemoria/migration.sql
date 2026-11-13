-- WhatsApp ai clienti (solo aggiunte, si può rilanciare): il lucchetto riconosce anche l'apparecchio
-- (due apparecchi con lo stesso nome non prendono lo stesso messaggio) e il promemoria al titolare
-- «Da 15 minuti c'è un messaggio WhatsApp da mandare…» parte una volta sola.
-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "waClaimDevice" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "waRemindedAt" TIMESTAMP(3);
