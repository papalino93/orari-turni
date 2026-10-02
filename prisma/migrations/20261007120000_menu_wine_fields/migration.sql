-- Vini: azienda, nome del vino, denominazione e annata in campi separati
-- (prima tutto in un «sottotitolo» libero). Tre colonne nuove facoltative.
ALTER TABLE "MenuItem" ADD COLUMN "wineName" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "denomination" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "vintage" TEXT;

-- I vini della carta, divisi a mano dal vecchio sottotitolo (verificato con il
-- titolare). Si tocca una voce solo se il sottotitolo è ancora quello di
-- partenza: un testo cambiato dalla gestione resta com'è. Alcune aziende
-- vengono scritte meglio (es. «Champagne Henriot» → «Henriot», denominazione
-- «Champagne»; «Teatrico» è il vino di Castello di Meleto).
UPDATE "MenuItem" SET "name" = 'Henriot', "wineName" = 'Brut Souverain', "denomination" = 'Champagne', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_001' AND ("sub" = 'Brut Souverain');
UPDATE "MenuItem" SET "name" = 'De Villepin', "wineName" = 'Brut Vignoble Classique', "denomination" = 'Champagne', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_002' AND ("sub" = 'Brut Vignoble Classique');
UPDATE "MenuItem" SET "name" = 'Pol Roger', "wineName" = 'Brut Réserve', "denomination" = 'Champagne', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_003' AND ("sub" = 'Brut Réserve');
UPDATE "MenuItem" SET "name" = 'Castello di Meleto', "wineName" = 'Teatrico Rosé', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_005' AND ("sub" = 'Castello di Meleto Rosé, Toscana');
UPDATE "MenuItem" SET "wineName" = 'Deanna', "denomination" = 'Lambrusco Rosé', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_011' AND ("sub" = 'Deanna, Lambrusco Rosé');
UPDATE "MenuItem" SET "wineName" = 'Il Trentatré Dosaggio Zero', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_009' AND ("sub" = 'Il Trentatré, Dosaggio Zero');
UPDATE "MenuItem" SET "wineName" = 'Cépage Brut', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_008' AND ("sub" = 'Cépage Brut');
UPDATE "MenuItem" SET "wineName" = 'Costaripa Créant', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_012' AND ("sub" = 'Costaripa Créant');
UPDATE "MenuItem" SET "wineName" = 'Costaripa Brut', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_013' AND ("sub" = 'Costaripa Brut');
UPDATE "MenuItem" SET "wineName" = 'M’Arte', "denomination" = NULL, "vintage" = '2022', "sub" = NULL WHERE "id" = 'menu_itm_014' AND ("sub" = 'M’Arte 2022, Marche' OR "sub" = 'M''Arte 2022, Marche');
UPDATE "MenuItem" SET "wineName" = 'Brut Millesimato', "denomination" = 'Trentodoc', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_004' AND ("sub" = 'Trentodoc, Brut Millesimato');
UPDATE "MenuItem" SET "wineName" = 'Alperegis Brut Rosé', "denomination" = 'Trento Doc', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_007' AND ("sub" = 'Alperegis Brut Rosé, Trento Doc');
UPDATE "MenuItem" SET "wineName" = 'Brut', "denomination" = 'Crémant de Bourgogne', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_006' AND ("sub" = 'Crémant de Bourgogne, Brut');
UPDATE "MenuItem" SET "wineName" = 'Peerless Brut', "denomination" = NULL, "vintage" = '2016', "sub" = NULL WHERE "id" = 'menu_itm_010' AND ("sub" = 'Peerless Brut 2016, Portogallo');
UPDATE "MenuItem" SET "wineName" = 'Ancestrale Rosato', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_016' AND ("sub" = 'Ancestrale Rosato, Melfi');
UPDATE "MenuItem" SET "wineName" = 'Spoma', "denomination" = 'Lambrusco Rosato', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_015' AND ("sub" = 'Spoma?, Lambrusco Rosato' OR "sub" = 'Spoma, Lambrusco Rosato');
UPDATE "MenuItem" SET "wineName" = 'Trebbiano', "denomination" = 'Toscana Igt', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_028' AND ("sub" = 'Trebbiano, Toscana Igt');
UPDATE "MenuItem" SET "wineName" = 'Tacabanda', "denomination" = 'Toscana Igt', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_021' AND ("sub" = 'Tacabanda, Toscana Igt');
UPDATE "MenuItem" SET "wineName" = 'I Biondi', "denomination" = 'Maremma Toscana', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_025' AND ("sub" = 'I Biondi, Maremma Toscana');
UPDATE "MenuItem" SET "wineName" = 'Nostrale Bianco', "denomination" = 'Toscana Igt', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_026' AND ("sub" = 'Nostrale Bianco, Toscana Igt');
UPDATE "MenuItem" SET "wineName" = 'Leukò', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_023' AND ("sub" = 'Leukò, Calabria');
UPDATE "MenuItem" SET "wineName" = NULL, "denomination" = 'Greco di Tufo Docg', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_020' AND ("sub" = 'Greco di Tufo Docg');
UPDATE "MenuItem" SET "wineName" = 'Torre Bianco', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_018' AND ("sub" = 'Torre Bianco');
UPDATE "MenuItem" SET "wineName" = 'Friulano', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_027' AND ("sub" = 'Friulano');
UPDATE "MenuItem" SET "wineName" = 'Terre Silvate', "denomination" = 'Marche Igt', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_022' AND ("sub" = 'Terre Silvate, Marche Igt');
UPDATE "MenuItem" SET "wineName" = 'Kimere', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_024' AND ("sub" = 'Kimere, Puglia');
UPDATE "MenuItem" SET "wineName" = NULL, "denomination" = 'Terre Siciliane', "vintage" = '2022', "sub" = NULL WHERE "id" = 'menu_itm_017' AND ("sub" = 'Terre Siciliane 2022');
UPDATE "MenuItem" SET "wineName" = 'Selva del Vescovo', "denomination" = 'Lugana Doc', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_019' AND ("sub" = 'Selva del Vescovo, Lugana Doc');
UPDATE "MenuItem" SET "wineName" = 'Les Origines', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_030' AND ("sub" = 'Les Origines, Alsazia');
UPDATE "MenuItem" SET "name" = 'Thymiopoulos', "wineName" = 'Atma White', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_029' AND ("sub" = 'Grecia');
UPDATE "MenuItem" SET "name" = 'Artisans Vignerons de Naoussa', "wineName" = 'Skyphos Assyrtiko', "denomination" = 'Igp Macedonia', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_031' AND ("sub" = 'Assyrtiko, Macedonia');
UPDATE "MenuItem" SET "wineName" = 'Da-Di', "denomination" = 'Toscana Igt', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_034' AND ("sub" = 'Da-Di, Toscana Igt');
UPDATE "MenuItem" SET "wineName" = 'Le Anfore di Elena Casadei', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_037' AND ("sub" = 'Le Anfore di Elena Casadei');
UPDATE "MenuItem" SET "wineName" = NULL, "denomination" = 'Bolgheri Rosso Doc', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_042' AND ("sub" = 'Bolgheri Rosso Doc');
UPDATE "MenuItem" SET "wineName" = NULL, "denomination" = 'Rosso di Montalcino', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_033' AND ("sub" = 'Rosso di Montalcino');
UPDATE "MenuItem" SET "wineName" = 'Villa Donoratico', "denomination" = 'Bolgheri Doc', "vintage" = '2023', "sub" = NULL WHERE "id" = 'menu_itm_032' AND ("sub" = 'Villa Donoratico 2023, Bolgheri Doc');
UPDATE "MenuItem" SET "wineName" = 'Refosco dal Peduncolo Rosso', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_039' AND ("sub" = 'Refosco dal Peduncolo Rosso, Friuli');
UPDATE "MenuItem" SET "wineName" = 'Cabernet Sauvignon', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_038' AND ("sub" = 'Cabernet Sauvignon');
UPDATE "MenuItem" SET "wineName" = 'Baccanera', "denomination" = NULL, "vintage" = '2024', "sub" = NULL WHERE "id" = 'menu_itm_036' AND ("sub" = 'Baccanera 2024, Lazio');
UPDATE "MenuItem" SET "wineName" = 'Braghé', "denomination" = 'Colli Tortonesi', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_035' AND ("sub" = 'Braghé, Colli Tortonesi');
UPDATE "MenuItem" SET "wineName" = 'Rouge Clair', "denomination" = 'Vin de France', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_041' AND ("sub" = 'Rouge Clair, Francia');
UPDATE "MenuItem" SET "wineName" = 'La Solitude', "denomination" = 'Côtes du Rhône', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_040' AND ("sub" = 'Côtes du Rhône, La Solitude');
UPDATE "MenuItem" SET "wineName" = 'Sol Sera', "denomination" = 'Costa Toscana', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_043' AND ("sub" = 'Sol Sera, Costa Toscana');
UPDATE "MenuItem" SET "wineName" = 'N', "denomination" = 'Toscana Igt', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_044' AND ("sub" = 'N, Toscana Igt');
UPDATE "MenuItem" SET "wineName" = 'Droppello', "denomination" = 'Costa Toscana Igt', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_045' AND ("sub" = 'Droppello, Igt Costa Toscana');
UPDATE "MenuItem" SET "wineName" = 'Rosato', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_048' AND ("sub" = 'Rosato, Calabria');
UPDATE "MenuItem" SET "wineName" = 'Aimé', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_047' AND ("sub" = 'Aimé');
UPDATE "MenuItem" SET "wineName" = 'Tramonto d’Estate', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_046' AND ("sub" = 'Tramonto d’Estate' OR "sub" = 'Tramonto d''Estate');
UPDATE "MenuItem" SET "wineName" = NULL, "denomination" = 'Toscana Bianco', "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_050' AND ("sub" = 'Toscana Bianco, Montalcino');
UPDATE "MenuItem" SET "wineName" = 'Orange', "denomination" = NULL, "vintage" = NULL, "sub" = NULL WHERE "id" = 'menu_itm_049' AND ("sub" = 'Orange');
