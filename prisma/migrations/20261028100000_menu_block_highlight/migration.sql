-- Riquadro in vetrina: nuovo tipo di blocco del menù con un titolo grande.
-- Categorie create ed eliminate dalla gestione: eliminazione morbida come gruppi e voci.
ALTER TYPE "MenuBlockKind" ADD VALUE IF NOT EXISTS 'HIGHLIGHT';
ALTER TABLE "MenuBlock" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "MenuSection" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
