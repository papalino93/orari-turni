-- Orario facoltativo dell'evento («Dalle 19:00», «Dalle 19:00 alle 23:00»), in formato HH:MM.
ALTER TABLE "MenuPromo" ADD COLUMN "startTime" TEXT;
ALTER TABLE "MenuPromo" ADD COLUMN "endTime" TEXT;
