-- Accende il riquadro in vetrina di caviale e tartufo bianco, creato messo da parte
-- dalla migrazione precedente: ora la versione online conosce il tipo HIGHLIGHT.
UPDATE "MenuBlock" SET "deletedAt" = NULL, "updatedAt" = NOW()
WHERE "id" = 'blk_vetrina_caviale' AND "deletedAt" IS NOT NULL;
