-- Ordine scelto a mano degli eventi e annunci («Riordina» → «Eventi e annunci»).
-- Vuoto = ordine automatico per data; chi ha un numero viene prima degli altri.
ALTER TABLE "MenuPromo" ADD COLUMN "sortOrder" INTEGER;

-- Richiesta del titolare: l'Oktoberfest per primo in «In evidenza».
UPDATE "MenuPromo" SET "sortOrder" = 0 WHERE "slug" LIKE 'oktoberfest%' AND "deletedAt" IS NULL;
