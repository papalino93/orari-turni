-- Menù pubblico via QR: tabelle (sezioni, gruppi, voci, storico delle modifiche)
-- e permesso per dipendente di modificarlo (Employee.canEditMenu).

-- CreateEnum
CREATE TYPE "MenuSectionKind" AS ENUM ('WINE', 'FOOD');

-- CreateEnum
CREATE TYPE "MenuChangeAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'SOLD_OUT', 'AVAILABLE', 'RESET_SOLD_OUT');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "canEditMenu" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MenuSection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kicker" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "MenuSectionKind" NOT NULL,
    "note" TEXT,
    "cover" TEXT,
    "addonTitle" TEXT,
    "addon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "translations" JSONB,

    CONSTRAINT "MenuSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuGroup" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "columns" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "translations" JSONB,

    CONSTRAINT "MenuGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sub" TEXT,
    "grapes" TEXT,
    "description" TEXT,
    "priceGlassCents" INTEGER,
    "priceBottleCents" INTEGER,
    "priceCents" INTEGER,
    "enomatic" BOOLEAN NOT NULL DEFAULT false,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergensReviewed" BOOLEAN NOT NULL DEFAULT false,
    "soldOutDay" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "translations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuChange" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorName" TEXT NOT NULL,
    "action" "MenuChangeAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "undoneById" TEXT,

    CONSTRAINT "MenuChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuSection_slug_key" ON "MenuSection"("slug");

-- CreateIndex
CREATE INDEX "MenuGroup_sectionId_sortOrder_idx" ON "MenuGroup"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_groupId_sortOrder_idx" ON "MenuItem"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuChange_at_idx" ON "MenuChange"("at");

-- AddForeignKey
ALTER TABLE "MenuGroup" ADD CONSTRAINT "MenuGroup_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MenuSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MenuGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Caricamento iniziale: le 7 sezioni e le voci del menù così come sono nel
-- nuovo design (copia fedele, senza correzioni). Gli allergeni partono tutti
-- "da compilare" (allergensReviewed = false).
INSERT INTO "MenuSection" ("id","slug","label","kicker","title","kind","note","cover","addonTitle","addon","sortOrder") VALUES ('menu_sec_bollicine','bollicine','Bollicine','Vini','Bollicine','WINE',NULL,NULL,NULL,NULL,0);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_1_1','menu_sec_bollicine','Champagne',true,0);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_001','menu_grp_1_1','Champagne Henriot','Brut Souverain','45% Pinot Noir, 15% Pinot Meunier, 40% Chardonnay',1200,6000,false,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_002','menu_grp_1_1','Champagne de Villepin','Brut Vignoble Classique','10% Pinot Noir, 45% Pinot Meunier, 45% Chardonnay',1000,5000,false,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_003','menu_grp_1_1','Champagne Pol Roger','Brut Réserve','Pinot Noir 33%, Pinot Meunier 33%, Chardonnay 33%',NULL,7500,false,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_1_2','menu_sec_bollicine','Metodi classici',true,1);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_004','menu_grp_1_2','Revì','Trentodoc, Brut Millesimato','80% Chardonnay, 20% Pinot Nero',700,3500,false,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_005','menu_grp_1_2','Teatrico','Castello di Meleto Rosé, Toscana','100% Sangiovese',700,3500,false,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_006','menu_grp_1_2','Levert Frères','Crémant de Bourgogne, Brut','100% Chardonnay',700,3500,false,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_007','menu_grp_1_2','Rotari','Alperegis Brut Rosé, Trento Doc','Chardonnay, Pinot Nero',700,3500,false,3,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_008','menu_grp_1_2','Conte Vistarino','Cépage Brut','85% Pinot Nero, 15% Chardonnay',700,3500,false,4,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_009','menu_grp_1_2','Colletto','Il Trentatré, Dosaggio Zero','100% Chardonnay',800,4000,false,5,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_010','menu_grp_1_2','Caves Raposeira','Peerless Brut 2016, Portogallo','Pinot Blanc, Viosinho',700,3500,false,6,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_011','menu_grp_1_2','Melegari','Deanna, Lambrusco Rosé','100% Lambrusco Marani',600,3000,false,7,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_012','menu_grp_1_2','Mattia Vezzola','Costaripa Créant','100% Chardonnay',700,3500,false,8,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_013','menu_grp_1_2','Mattia Vezzola','Costaripa Brut','100% Chardonnay',700,3500,false,9,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_014','menu_grp_1_2','Collina delle Fate','M’Arte 2022, Marche','80% Chardonnay, 20% Pinot Nero',700,3500,false,10,CURRENT_TIMESTAMP);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_1_3','menu_sec_bollicine','Rifermentato in bottiglia',true,2);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_015','menu_grp_1_3','Angol d’Amig','Spoma?, Lambrusco Rosato','100% Lambrusco di Sorbara',500,2500,false,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_016','menu_grp_1_3','Arteteke','Ancestrale Rosato, Melfi','100% Aglianico',600,3000,false,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuSection" ("id","slug","label","kicker","title","kind","note","cover","addonTitle","addon","sortOrder") VALUES ('menu_sec_bianchi','bianchi','Bianchi','Vini','Bianchi','WINE',NULL,NULL,NULL,NULL,1);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_2_1','menu_sec_bianchi','Italia',true,0);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_017','menu_grp_2_1','Alberelli di Giodo','Terre Siciliane 2022','100% Carricante',1000,5000,true,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_018','menu_grp_2_1','Aquila del Torre','Torre Bianco','Sauvignon Blanc, Friulano',600,3000,false,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_019','menu_grp_2_1','Villa della Torre','Selva del Vescovo, Lugana Doc','100% Turbiana',500,2500,false,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_020','menu_grp_2_1','Bellaria','Greco di Tufo Docg','100% Greco',600,3000,false,3,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_021','menu_grp_2_1','Poggio Cagnano','Tacabanda, Toscana Igt','100% Ansonica',600,3000,false,4,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_022','menu_grp_2_1','La Distesa','Terre Silvate, Marche Igt','95% Verdicchio, 5% Trebbiano',500,2500,false,5,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_023','menu_grp_2_1','‘A Vita','Leukò, Calabria','70% Greco Bianco, 30% Gaglioppo',600,3000,false,6,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_024','menu_grp_2_1','Domus Hortae','Kimere, Puglia','100% Bombino Bianco',500,2500,false,7,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_025','menu_grp_2_1','Tenuta il Quinto','I Biondi, Maremma Toscana','100% Vermentino',500,2500,false,8,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_026','menu_grp_2_1','Terre di Giotto','Nostrale Bianco, Toscana Igt','Trebbiano, Malvasia di Candia',600,3000,false,9,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_027','menu_grp_2_1','Aquila del Torre','Friulano','100% Friulano',600,3000,false,10,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_028','menu_grp_2_1','Mastrojanni','Trebbiano, Toscana Igt','100% Trebbiano',600,3000,false,11,CURRENT_TIMESTAMP);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_2_2','menu_sec_bianchi','… dal mondo',true,1);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_029','menu_grp_2_2','Atma White','Grecia','Malagouzia, Xinomavro',600,3000,false,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_030','menu_grp_2_2','François Weck','Les Origines, Alsazia','100% Riesling',600,3000,false,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_031','menu_grp_2_2','Skyphos','Assyrtiko, Macedonia','100% Assyrtiko',700,3500,false,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuSection" ("id","slug","label","kicker","title","kind","note","cover","addonTitle","addon","sortOrder") VALUES ('menu_sec_rossi','rossi','Rossi','Vini','Rossi','WINE',NULL,NULL,NULL,NULL,2);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_3_1','menu_sec_rossi','Rossi',true,0);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_032','menu_grp_3_1','Tenuta Argentiera','Villa Donoratico 2023, Bolgheri Doc','45% Cabernet Sauvignon, 30% Merlot, 15% Cabernet Franc, 10% Petit Verdot',1000,5000,true,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_033','menu_grp_3_1','Mastrojanni','Rosso di Montalcino','100% Sangiovese',800,4000,true,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_034','menu_grp_3_1','Avignonesi','Da-Di, Toscana Igt','37,8% Sangiovese, 20,65% Alicante, 18,5% Canaiolo, 17,8% Mammolo, 5,25% Ciliegiolo',500,2500,false,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_035','menu_grp_3_1','Claudio Mariotto','Braghé, Colli Tortonesi','100% Freisa',600,3000,false,3,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_036','menu_grp_3_1','Medevì','Baccanera 2024, Lazio','100% Cesanese',500,2500,false,4,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_037','menu_grp_3_1','Castello del Trebbio','Le Anfore di Elena Casadei','100% Sangiovese',700,3500,false,5,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_038','menu_grp_3_1','Borgo Canedo','Cabernet Sauvignon','100% Cabernet Sauvignon',500,2500,false,6,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_039','menu_grp_3_1','Aquila del Torre','Refosco dal Peduncolo Rosso, Friuli','100% Refosco dal Peduncolo Rosso',600,3000,false,7,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_040','menu_grp_3_1','Famille Lançon','Côtes du Rhône, La Solitude','50% Grenache Noir, 40% Syrah, 10% Mourvèdre',600,3000,false,8,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_041','menu_grp_3_1','M. Chapoutier','Rouge Clair, Francia','80% Cantonaux, 20% Syrah',600,NULL,false,9,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_042','menu_grp_3_1','Le Macchiole','Bolgheri Rosso Doc','Merlot, Cabernet Franc, Cabernet Sauvignon, Syrah',700,3500,false,10,CURRENT_TIMESTAMP);
INSERT INTO "MenuSection" ("id","slug","label","kicker","title","kind","note","cover","addonTitle","addon","sortOrder") VALUES ('menu_sec_rose','rose','Rosé & Orange','Vini','Rosé & Orange','WINE',NULL,NULL,NULL,NULL,3);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_4_1','menu_sec_rose','Rosé',true,0);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_043','menu_grp_4_1','Bulichella','Sol Sera, Costa Toscana','100% Syrah',600,3000,false,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_044','menu_grp_4_1','One Belvedere','N, Toscana Igt','100% Sangiovese',500,2500,false,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_045','menu_grp_4_1','Tenuta Fertuna','Droppello, Igt Costa Toscana','100% Sangiovese',600,3000,false,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_046','menu_grp_4_1','Decugnano dei Barbi','Tramonto d’Estate','100% Grenache',500,2500,false,3,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_047','menu_grp_4_1','Bellaria','Aimé','100% Aglianico',600,3000,false,4,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_048','menu_grp_4_1','‘A Vita','Rosato, Calabria','100% Gaglioppo',500,2500,false,5,CURRENT_TIMESTAMP);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_4_2','menu_sec_rose','Orange',true,1);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_049','menu_grp_4_2','Schloss Englar','Orange','100% Gewürztraminer',700,3500,false,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","sub","grapes","priceGlassCents","priceBottleCents","enomatic","sortOrder","updatedAt") VALUES ('menu_itm_050','menu_grp_4_2','Les Oiseaux d’Oulan Bator','Toscana Bianco, Montalcino','70% Procanico, 30% Ansonica',1200,6000,true,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuSection" ("id","slug","label","kicker","title","kind","note","cover","addonTitle","addon","sortOrder") VALUES ('menu_sec_taglieri','taglieri','Taglieri & Pinse','Cucina','Taglieri & Pinse','FOOD','Si informa la gentile clientela che la cucina chiude circa 40–50 minuti prima della chiusura del negozio.','Coperto € 1,00',NULL,NULL,4);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_5_1','menu_sec_taglieri','Taglieri',false,0);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_051','menu_grp_5_1','Tagliere Classico','Prosciutto crudo Perugino, Salame Toscano, Sbriciolona, Pecorino agli Agrumi, Pecorino fresco.',1300,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_052','menu_grp_5_1','Tagliere Premium','Prosciutto crudo Perugino, Salame Toscano, Sbriciolona, Mortadella al tartufo, Salsiccia di cinghiale, Pecorino agli Agrumi, Pecorino fresco, blue cheese in coni al carbone.',1600,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_053','menu_grp_5_1','Burro & Acciughe','4 pezzi',1000,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_5_2','menu_sec_taglieri','Pinse',false,1);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_054','menu_grp_5_2','Crudo & Rucola','Mozzarella, Burrata, Crudo & Rucola',1300,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_055','menu_grp_5_2','Mortadella & Pistacchi','Mozzarella, Burrata, Mortadella & Granella di Pistacchi',1400,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_056','menu_grp_5_2','Tartare & Tartufo','Mozzarella, Tartare, Crema di Pecorino & Tartufo',1800,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_057','menu_grp_5_2','Pomodorini & Grana','Mozzarella, Pomodorini, Rucola & Grana',1200,3,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_058','menu_grp_5_2','Crudo & Brie','Mozzarella, Crudo, Brie & Pomodori Secchi',1400,4,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_059','menu_grp_5_2','’Nduja & Salame','Mozzarella, Burrata, ’Nduja & Salame',1400,5,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_060','menu_grp_5_2','Fichi & Salame','Mozzarella, Burrata, Fichi & Salame',1400,6,CURRENT_TIMESTAMP);
INSERT INTO "MenuSection" ("id","slug","label","kicker","title","kind","note","cover","addonTitle","addon","sortOrder") VALUES ('menu_sec_tartare','tartare','Tartare','Cucina','Tartare','FOOD',NULL,NULL,'Novità · Oli aromatizzati · + € 1,50','Potrai personalizzare la tua tartare con diversi tipi di oli aromatizzati (arancia, basilico o peperoncino), così da esaltare il sapore della carne e creare ogni volta un’esperienza diversa.',5);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_6_1','menu_sec_tartare','Tartare di manzo',false,0);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_061','menu_grp_6_1','Classica · 160 g','Condita con olio, sale e pepe.',1300,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_062','menu_grp_6_1','Di’Tico · 160 g','Condita con olio, sale e pepe, guarnita con stracciatella e pomodorini secchi.',1500,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_063','menu_grp_6_1','Bis di tartare · 80 g cad.','Tartare Classica da 80 g e Tartare Di’Tico da 80 g.',1400,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_064','menu_grp_6_1','Con Tartufo · 160 g','Condita con olio, sale e pepe, guarnita con crema di formaggio e tartufo grattugiato.',1800,3,CURRENT_TIMESTAMP);
INSERT INTO "MenuSection" ("id","slug","label","kicker","title","kind","note","cover","addonTitle","addon","sortOrder") VALUES ('menu_sec_bevande','bevande','Bevande','Analcolici & caffetteria','Bevande','FOOD',NULL,NULL,NULL,NULL,6);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_7_1','menu_sec_bevande','Analcoliche',false,0);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_065','menu_grp_7_1','Acqua',NULL,300,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_066','menu_grp_7_1','Kombucha BAF Zenzero',NULL,500,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_067','menu_grp_7_1','Kombucha BAF Bergamotto',NULL,500,2,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_068','menu_grp_7_1','Succo all’Ace',NULL,300,3,CURRENT_TIMESTAMP);
INSERT INTO "MenuGroup" ("id","sectionId","title","columns","sortOrder") VALUES ('menu_grp_7_2','menu_sec_bevande','Caffetteria',false,1);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_069','menu_grp_7_2','Caffè espresso',NULL,130,0,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_070','menu_grp_7_2','Caffè decaffeinato',NULL,140,1,CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id","groupId","name","description","priceCents","sortOrder","updatedAt") VALUES ('menu_itm_071','menu_grp_7_2','Orzo',NULL,150,2,CURRENT_TIMESTAMP);
