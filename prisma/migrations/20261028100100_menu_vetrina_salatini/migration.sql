-- Primo riquadro in vetrina (caviale e tartufo bianco, in cima al menù) e la
-- sezione «Salatini» tra Tartare e Bevande, con un gruppo vuoto da riempire dalla
-- gestione. Solo aggiunte: se esistono già non si tocca nulla.
-- Il riquadro nasce messo da parte (deletedAt): le anteprime applicano le migrazioni
-- al database di produzione prima del rilascio, e la versione ancora online non
-- conosce il tipo HIGHLIGHT. Lo accende la migrazione successiva, a rilascio fatto.
INSERT INTO "MenuBlock" ("id", "kind", "label", "title", "text", "placement", "sortOrder", "deletedAt", "updatedAt")
SELECT 'blk_vetrina_caviale', 'HIGHLIGHT', 'Su prenotazione', 'Caviale & Tartufo bianco',
       'Per prezzi e disponibilità chiedete al nostro personale.', 'TOP',
       COALESCE((SELECT MAX("sortOrder") + 1 FROM "MenuBlock" WHERE "placement" = 'TOP'), 0), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "MenuBlock" WHERE "id" = 'blk_vetrina_caviale');

DO $$
DECLARE dopo INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MenuSection" WHERE "slug" = 'salatini') THEN
    SELECT "sortOrder" INTO dopo FROM "MenuSection" WHERE "slug" = 'tartare';
    IF dopo IS NULL THEN
      SELECT COALESCE(MAX("sortOrder"), 0) INTO dopo FROM "MenuSection" WHERE "promoId" IS NULL AND NOT "dailyOnly";
    END IF;
    UPDATE "MenuSection" SET "sortOrder" = "sortOrder" + 1 WHERE "promoId" IS NULL AND NOT "dailyOnly" AND "sortOrder" > dopo;
    INSERT INTO "MenuSection" ("id", "slug", "label", "kicker", "title", "kind", "sortOrder")
    VALUES ('menu_sec_salatini', 'salatini', 'Salatini', 'Cucina', 'Salatini', 'FOOD', dopo + 1);
    INSERT INTO "MenuGroup" ("id", "sectionId", "title", "sortOrder")
    VALUES ('menu_grp_salatini', 'menu_sec_salatini', 'Salatini', 0);
  END IF;
END $$;
