-- Skyphos (Artisans Vignerons de Naoussa, IGP Macedonia): Macedonia Centrale,
-- nel nord della Grecia (non la Macedonia del Nord). Solo se ancora vuoti.
UPDATE "MenuItem" SET "region" = 'Macedonia Centrale'
WHERE "name" = 'Skyphos' AND "region" IS NULL
  AND "groupId" IN (SELECT g."id" FROM "MenuGroup" g JOIN "MenuSection" s ON s."id" = g."sectionId" WHERE s."kind" = 'WINE');
UPDATE "MenuItem" SET "country" = 'Grecia'
WHERE "name" = 'Skyphos' AND "country" IS NULL
  AND "groupId" IN (SELECT g."id" FROM "MenuGroup" g JOIN "MenuSection" s ON s."id" = g."sectionId" WHERE s."kind" = 'WINE');
