-- Prenotazioni (solo aggiunte): il dispositivo è il «telefono del locale» (riceve gli avvisi «da mandare su WhatsApp»).
-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "localPhone" BOOLEAN NOT NULL DEFAULT false;
