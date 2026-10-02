-- Il coperto vale per tutta la parte di cucina, non per una sola sezione: diventa
-- un'impostazione unica del menù (MenuSetting "cover") e ogni sezione dice solo
-- se mostrarlo (coverApplies). Il valore già presente su "Taglieri & Pinse" viene
-- copiato nell'impostazione prima di eliminare la colonna.

CREATE TABLE "MenuSetting" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "MenuSetting_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MenuSection" ADD COLUMN "coverApplies" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "MenuSetting" ("id", "value")
SELECT 'cover', "cover" FROM "MenuSection"
WHERE "cover" IS NOT NULL AND "cover" <> ''
ORDER BY "sortOrder"
LIMIT 1;

UPDATE "MenuSection" SET "coverApplies" = true WHERE "slug" IN ('taglieri', 'tartare');

ALTER TABLE "MenuSection" DROP COLUMN "cover";
