-- Allergeni iniziali dei piatti e delle bevande del menù. Primo elenco compilato
-- dal titolare a partire dalle descrizioni, con la regola "nel dubbio, in più":
-- dove un ingrediente poteva contenere un allergene (salumi, impasto della pinsa,
-- pomodori e fichi secchi, grana, pane) l'allergene è stato incluso.
-- I due kombucha restano "da compilare" finché non si controlla l'etichetta.
-- Riguarda solo le voci non ancora compilate: non sovrascrive modifiche fatte
-- dall'editor.

-- Taglieri
UPDATE "MenuItem" SET "allergens" = ARRAY['LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_051' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['SOIA','LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_052' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','PESCE','LATTE']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_053' AND "allergensReviewed" = false;

-- Pinse
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','SOIA','LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_054' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','SOIA','LATTE','FRUTTA_A_GUSCIO','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_055' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','SOIA','LATTE']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_056' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','UOVA','SOIA','LATTE']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_057' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','SOIA','LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_058' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','SOIA','LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_059' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','SOIA','LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_060' AND "allergensReviewed" = false;

-- Tartare
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_061' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_062' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','LATTE','SOLFITI']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_063' AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE','LATTE']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_064' AND "allergensReviewed" = false;

-- Bevande: nessun allergene (acqua, succo, caffè); orzo = glutine.
-- Kombucha (menu_itm_066, menu_itm_067): lasciati "da compilare".
UPDATE "MenuItem" SET "allergens" = ARRAY[]::TEXT[], "allergensReviewed" = true WHERE "id" IN ('menu_itm_065','menu_itm_068','menu_itm_069','menu_itm_070') AND "allergensReviewed" = false;
UPDATE "MenuItem" SET "allergens" = ARRAY['GLUTINE']::TEXT[], "allergensReviewed" = true WHERE "id" = 'menu_itm_071' AND "allergensReviewed" = false;
