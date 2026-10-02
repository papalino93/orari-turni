-- Vini della carta ordinati per regione, come deciso con il titolare: prima la
-- Toscana, poi le altre regioni italiane in ordine alfabetico (senza regione in
-- fondo), poi l'estero (per paese e regione); nella stessa regione per nome del
-- produttore. Una volta sola: da
-- qui in poi l'ordine scelto a mano resta, e i vini nuovi si mettono al posto
-- della loro regione (lib/wine-order.ts, stessa regola).
-- Solo i gruppi delle sezioni vini fisse (non eventi, non «Oggi fuori menù»).
WITH wines AS (
  SELECT
    i."id",
    i."groupId",
    CASE WHEN COALESCE(lower(trim(i."country")), '') IN ('', 'italia') THEN 0 ELSE 1 END AS foreign_wine,
    CASE
      WHEN lower(trim(i."region")) = 'toscana' THEN 0
      WHEN COALESCE(trim(i."region"), '') = '' THEN 2
      ELSE 1
    END AS region_pos,
    lower(trim(COALESCE(i."country", ''))) AS country_key,
    lower(trim(COALESCE(i."region", ''))) AS region_key,
    lower(i."name") AS name_key,
    i."sortOrder" AS old_order
  FROM "MenuItem" i
  JOIN "MenuGroup" g ON g."id" = i."groupId"
  JOIN "MenuSection" s ON s."id" = g."sectionId"
  WHERE s."kind" = 'WINE' AND s."promoId" IS NULL AND s."dailyOnly" = false AND i."deletedAt" IS NULL
),
ranked AS (
  SELECT "id",
    row_number() OVER (
      PARTITION BY "groupId"
      ORDER BY foreign_wine,
        CASE WHEN foreign_wine = 1 THEN 0 ELSE region_pos END,
        CASE WHEN foreign_wine = 1 THEN country_key ELSE '' END,
        region_key, name_key, old_order
    ) - 1 AS pos
  FROM wines
)
UPDATE "MenuItem" m SET "sortOrder" = r.pos FROM ranked r WHERE m."id" = r."id";
