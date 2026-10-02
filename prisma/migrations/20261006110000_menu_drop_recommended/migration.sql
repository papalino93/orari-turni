-- «Consigliato» sui vini non si usa più (si punta solo sull'abbinamento dal
-- piatto al vino): la colonna, mai usata in produzione, si toglie.
ALTER TABLE "MenuItem" DROP COLUMN IF EXISTS "recommended";
