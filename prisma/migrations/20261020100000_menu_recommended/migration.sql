-- «Consigliato dalla casa» e «Sta bene con…» (vini): solo colonne nuove, con un valore di
-- partenza, nessun dato esistente toccato. IF NOT EXISTS perché «recommended» esisteva in
-- una versione precedente e poi tolta (migrazione 20261006110000).
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "recommended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "pairDishIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "pairHideIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
