-- Agenda a calendario (solo aggiunte, si può rilanciare): dati «da definire» (ora, persone), menù
-- scelto e note del giorno. Il database è condiviso con le anteprime: niente si toglie o rinomina.
-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "timeUnknown" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "peopleUnknown" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "menu" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BookingDayNote" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingDayNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BookingDayNote_day_idx" ON "BookingDayNote"("day");
