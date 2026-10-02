-- L'avviso della cucina ("la cucina chiude circa 40–50 minuti prima…") vale per
-- tutta la parte di cucina, come il coperto: diventa un'impostazione unica
-- (MenuSetting "kitchenNote") mostrata accanto al coperto in ogni sezione di
-- cucina. Il testo oggi scritto sulla sezione "Taglieri & Pinse" viene copiato
-- nell'impostazione e tolto dalla sezione, per non mostrarlo due volte.

INSERT INTO "MenuSetting" ("id", "value")
SELECT 'kitchenNote', "note" FROM "MenuSection"
WHERE "slug" = 'taglieri' AND "note" IS NOT NULL AND "note" <> ''
ON CONFLICT ("id") DO NOTHING;

UPDATE "MenuSection" SET "note" = NULL
WHERE "slug" = 'taglieri' AND EXISTS (SELECT 1 FROM "MenuSetting" WHERE "id" = 'kitchenNote');
