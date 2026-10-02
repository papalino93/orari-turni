-- Blocchi informativi: coperto, chiusura cucina e qualsiasi altra informazione
-- (testo, voce con prezzo, avviso) che il titolare vuole piazzare nel menù: in
-- cima, in fondo o sotto il titolo di una o più sezioni, con date facoltative.
-- Coperto e chiusura cucina diventano i primi due blocchi, mostrati dove
-- comparivano prima (le sezioni con coverApplies), poi le vecchie impostazioni
-- e la colonna coverApplies spariscono.

CREATE TYPE "MenuBlockKind" AS ENUM ('TEXT', 'PRICE', 'NOTICE');
CREATE TYPE "MenuBlockPlacement" AS ENUM ('TOP', 'BOTTOM', 'SECTIONS');

CREATE TABLE "MenuBlock" (
    "id" TEXT NOT NULL,
    "kind" "MenuBlockKind" NOT NULL,
    "label" TEXT,
    "text" TEXT,
    "priceCents" INTEGER,
    "placement" "MenuBlockPlacement" NOT NULL,
    "sectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TEXT,
    "endDate" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MenuBlock_placement_sortOrder_idx" ON "MenuBlock"("placement", "sortOrder");

-- Chiusura cucina (testo semplice), mostrata per prima come prima.
INSERT INTO "MenuBlock" ("id", "kind", "label", "text", "placement", "sectionIds", "sortOrder", "updatedAt")
SELECT 'blk_kitchen_note', 'TEXT', NULL, btrim("value"), 'SECTIONS',
       COALESCE((SELECT array_agg("id" ORDER BY "sortOrder") FROM "MenuSection" WHERE "coverApplies"), ARRAY[]::TEXT[]),
       0, CURRENT_TIMESTAMP
FROM "MenuSetting" WHERE "id" = 'kitchenNote' AND btrim("value") <> '';

-- Coperto: «Coperto € 1,00» → voce con prezzo (etichetta «Coperto», 100 centesimi).
-- Se il testo non ha la forma «etichetta € importo» resta un testo semplice.
INSERT INTO "MenuBlock" ("id", "kind", "label", "text", "priceCents", "placement", "sectionIds", "sortOrder", "updatedAt")
SELECT 'blk_cover',
       CASE WHEN m.parts IS NULL THEN 'TEXT'::"MenuBlockKind" ELSE 'PRICE'::"MenuBlockKind" END,
       CASE WHEN m.parts IS NULL THEN NULL ELSE COALESCE(NULLIF(btrim(m.parts[1], E'  '), ''), 'Coperto') END,
       CASE WHEN m.parts IS NULL THEN btrim(s."value") ELSE NULL END,
       CASE WHEN m.parts IS NULL THEN NULL ELSE round(replace(m.parts[2], ',', '.')::numeric * 100)::int END,
       'SECTIONS',
       COALESCE((SELECT array_agg("id" ORDER BY "sortOrder") FROM "MenuSection" WHERE "coverApplies"), ARRAY[]::TEXT[]),
       1, CURRENT_TIMESTAMP
FROM "MenuSetting" s
CROSS JOIN LATERAL (
  SELECT regexp_match(s."value", E'^(.*?)[\\s ]*€[\\s ]*([0-9]+(?:[.,][0-9]{1,2})?)[\\s ]*$') AS parts
) m
WHERE s."id" = 'cover' AND btrim(s."value") <> '';

-- Le vecchie impostazioni e il loro storico non servono più.
DELETE FROM "MenuChange" WHERE "entity" = 'setting';
DELETE FROM "MenuSetting" WHERE "id" IN ('cover', 'kitchenNote');

ALTER TABLE "MenuSection" DROP COLUMN "coverApplies";
