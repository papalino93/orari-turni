-- Agenda delle prenotazioni (solo aggiunte): tavolo, chi l'ha segnata, prenotazione segnata a mano.
-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "tableLabel" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "manual" BOOLEAN NOT NULL DEFAULT false;
