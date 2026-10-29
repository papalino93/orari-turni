-- Allergeni dei salatini (pasta sfoglia, Pasticceria Perbellini): glutine e latte su
-- tutti, sesamo sulla variante al sesamo e sulle voci a gusti misti (senza un gusto
-- singolo nel nome). Tracce possibili (uova, frutta a guscio, arachidi, soia, senape):
-- una riga sotto il titolo della categoria, modificabile dalla gestione.
UPDATE "MenuItem" i
SET "allergens" = CASE
      WHEN i."name" ILIKE '%sesam%' OR (i."name" || ' ' || COALESCE(i."description", '')) !~* '(zucca|carciof|pomodor|wasabi)'
        THEN ARRAY['GLUTINE', 'LATTE', 'SESAMO']
      ELSE ARRAY['GLUTINE', 'LATTE']
    END,
    "allergensReviewed" = true,
    "updatedAt" = NOW()
FROM "MenuGroup" g, "MenuSection" s
WHERE i."groupId" = g."id" AND g."sectionId" = s."id" AND s."slug" = 'salatini'
  AND i."deletedAt" IS NULL AND NOT i."textOnly";

INSERT INTO "MenuBlock" ("id", "kind", "text", "placement", "sectionIds", "sortOrder", "updatedAt")
SELECT 'blk_salatini_tracce', 'TEXT', 'Possono contenere tracce di uova, frutta a guscio, arachidi, soia e senape.',
       'SECTIONS', ARRAY[s."id"], COALESCE((SELECT MAX("sortOrder") + 1 FROM "MenuBlock" WHERE "placement" = 'SECTIONS'), 0), NOW()
FROM "MenuSection" s
WHERE s."slug" = 'salatini'
  AND NOT EXISTS (SELECT 1 FROM "MenuBlock" WHERE "id" = 'blk_salatini_tracce');
