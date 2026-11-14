-- «Telefono enoteca» e WhatsApp condiviso (solo aggiunte, si può rilanciare): il dipendente che è il
-- telefono della sala e il lucchetto della risposta «da mandare su WhatsApp» (chi e da quando).
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isVenueDevice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "waClaimBy" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "waClaimAt" TIMESTAMP(3);
