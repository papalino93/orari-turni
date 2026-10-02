-- Caratteristiche dei vini già in carta (biologico, biodinamico, vegano),
-- ricavate dalle informazioni pubbliche dei produttori (certificazioni e schede
-- tecniche). Solo i casi sicuri; quelli dubbi restano da confermare col titolare.
-- Si tocca una voce solo se non ha ancora caratteristiche: quelle messe a mano
-- dalla gestione restano com'erano.
UPDATE "MenuItem" SET "traits" = ARRAY['VEGAN']::TEXT[] WHERE "id" = 'menu_itm_001' AND "traits" = '{}'; -- Henriot
UPDATE "MenuItem" SET "traits" = ARRAY['VEGAN']::TEXT[] WHERE "id" = 'menu_itm_003' AND "traits" = '{}'; -- Pol Roger
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_005' AND "traits" = '{}'; -- Castello di Meleto
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_018' AND "traits" = '{}'; -- Aquila del Torre
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_021' AND "traits" = '{}'; -- Poggio Cagnano
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_022' AND "traits" = '{}'; -- La Distesa
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_023' AND "traits" = '{}'; -- ‘A Vita
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_025' AND "traits" = '{}'; -- Tenuta il Quinto
UPDATE "MenuItem" SET "traits" = ARRAY['BIO','BIODYNAMIC']::TEXT[] WHERE "id" = 'menu_itm_026' AND "traits" = '{}'; -- Terre di Giotto
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_027' AND "traits" = '{}'; -- Aquila del Torre
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_030' AND "traits" = '{}'; -- François Weck
UPDATE "MenuItem" SET "traits" = ARRAY['BIO','VEGAN']::TEXT[] WHERE "id" = 'menu_itm_031' AND "traits" = '{}'; -- Skyphos
UPDATE "MenuItem" SET "traits" = ARRAY['BIO','BIODYNAMIC','VEGAN']::TEXT[] WHERE "id" = 'menu_itm_034' AND "traits" = '{}'; -- Avignonesi
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_039' AND "traits" = '{}'; -- Aquila del Torre
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_040' AND "traits" = '{}'; -- Famille Lançon
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_043' AND "traits" = '{}'; -- Bulichella
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_048' AND "traits" = '{}'; -- ‘A Vita
UPDATE "MenuItem" SET "traits" = ARRAY['BIO']::TEXT[] WHERE "id" = 'menu_itm_049' AND "traits" = '{}'; -- Schloss Englar
