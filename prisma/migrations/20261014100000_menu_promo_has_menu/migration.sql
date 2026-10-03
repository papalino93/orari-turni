-- Evento con o senza menù dedicato (spunta nella creazione dell'evento).
ALTER TABLE "MenuPromo" ADD COLUMN "hasMenu" BOOLEAN NOT NULL DEFAULT true;

-- Gli eventi già creati senza voci, pagine o note nel menù speciale partono senza menù dedicato.
UPDATE "MenuPromo" p
SET "hasMenu" = false
WHERE p."kind" = 'EVENT'
  AND p."menuNote" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "MenuPromoPage" pg WHERE pg."promoId" = p."id")
  AND NOT EXISTS (
    SELECT 1 FROM "MenuItem" i
    JOIN "MenuGroup" g ON g."id" = i."groupId"
    JOIN "MenuSection" s ON s."id" = g."sectionId"
    WHERE s."promoId" = p."id" AND i."deletedAt" IS NULL AND g."deletedAt" IS NULL
  );
