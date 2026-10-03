-- «Lascia una recensione»: link diretto alla finestra di recensione Google
-- (confermato dal titolare). Solo se c'è ancora il link di partenza.
UPDATE "MenuSetting"
SET "value" = replace("value", 'https://share.google/ads9ad7vXNVdN2B4t', 'https://g.page/r/CQtef5OLe4RQEBM/review')
WHERE "id" = 'contacts' AND "value" LIKE '%https://share.google/ads9ad7vXNVdN2B4t%';
