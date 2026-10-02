-- «Consigliato» sui vini e «Abbinalo con» sui piatti: solo colonne nuove,
-- facoltative, nessun dato esistente toccato.
ALTER TABLE "MenuItem" ADD COLUMN "recommended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN "pairWineId" TEXT;
