-- Tracce dei salatini su ogni voce (così il filtro «solo i piatti adatti» le considera):
-- uova, frutta a guscio, arachidi, soia, senape. La riga unica sotto il titolo non serve più.
UPDATE "MenuItem" i
SET "allergenTraces" = ARRAY['UOVA', 'ARACHIDI', 'SOIA', 'FRUTTA_A_GUSCIO', 'SENAPE'],
    "updatedAt" = NOW()
FROM "MenuGroup" g, "MenuSection" s
WHERE i."groupId" = g."id" AND g."sectionId" = s."id" AND s."slug" = 'salatini'
  AND i."deletedAt" IS NULL AND NOT i."textOnly";

UPDATE "MenuBlock" SET "deletedAt" = NOW(), "updatedAt" = NOW()
WHERE "id" = 'blk_salatini_tracce' AND "deletedAt" IS NULL;
