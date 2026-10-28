-- Voci a tempo: periodo facoltativo in cui una voce del menù fisso si vede.
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "availableFrom" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "availableTo" TEXT;
