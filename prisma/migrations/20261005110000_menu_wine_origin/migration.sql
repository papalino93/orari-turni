-- Regione e nazione di un vino (facoltative).
ALTER TABLE "MenuItem" ADD COLUMN "region" TEXT, ADD COLUMN "country" TEXT;

-- Vini rossi divisi in «Italia» ed «Estero» (come i bianchi). I due rossi
-- francesi passano nel nuovo gruppo «Estero». Solo se la sezione è ancora com'era.
INSERT INTO "MenuGroup" ("id", "sectionId", "title", "columns", "sortOrder")
SELECT 'menu_grp_3_2', 'menu_sec_rossi', 'Estero', true, 2
WHERE EXISTS (SELECT 1 FROM "MenuGroup" WHERE "id" = 'menu_grp_3_1' AND "title" = 'Rossi')
  AND NOT EXISTS (SELECT 1 FROM "MenuGroup" WHERE "id" = 'menu_grp_3_2');

UPDATE "MenuItem" SET "groupId" = 'menu_grp_3_2', "country" = 'Francia'
WHERE "groupId" = 'menu_grp_3_1' AND "name" IN ('Famille Lançon', 'M. Chapoutier')
  AND EXISTS (SELECT 1 FROM "MenuGroup" WHERE "id" = 'menu_grp_3_2');

UPDATE "MenuGroup" SET "title" = 'Italia' WHERE "id" = 'menu_grp_3_1' AND "title" = 'Rossi'
  AND EXISTS (SELECT 1 FROM "MenuGroup" WHERE "id" = 'menu_grp_3_2');
