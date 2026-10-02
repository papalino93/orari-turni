-- «Oggi fuori menù»: piatti e vini che valgono solo per un giorno commerciale.
-- Sono voci normali (stessi campi, stesso editor) in due sezioni speciali che non
-- compaiono tra le sezioni fisse: onlyDay dice per quale giorno valgono.
ALTER TABLE "MenuSection" ADD COLUMN "dailyOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN "onlyDay" TEXT;

INSERT INTO "MenuSection" ("id", "slug", "label", "kicker", "title", "kind", "sortOrder", "dailyOnly") VALUES
  ('menu_sec_oggi_piatti', 'oggi-piatti', 'Oggi', 'Solo oggi', 'Oggi fuori menù', 'FOOD', -2, true),
  ('menu_sec_oggi_vini', 'oggi-vini', 'Oggi', 'Solo oggi', 'Oggi fuori menù', 'WINE', -1, true);

INSERT INTO "MenuGroup" ("id", "sectionId", "title", "columns", "sortOrder") VALUES
  ('menu_grp_oggi_piatti', 'menu_sec_oggi_piatti', 'Piatti', false, 0),
  ('menu_grp_oggi_vini', 'menu_sec_oggi_vini', 'Vini', true, 0);

CREATE INDEX "MenuItem_onlyDay_idx" ON "MenuItem"("onlyDay");
