-- Menù speciale degli eventi: voce per voce (ITEMS) oppure pagine caricate (FILE:
-- un PDF trasformato in immagini, o foto); note in cima; avviso allergeni unico.
ALTER TABLE "MenuPromo" ADD COLUMN "menuMode" TEXT NOT NULL DEFAULT 'ITEMS';
ALTER TABLE "MenuPromo" ADD COLUMN "menuNote" TEXT;
ALTER TABLE "MenuPromo" ADD COLUMN "allergenNotice" TEXT;

CREATE TABLE "MenuPromoPage" (
    "id" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MenuPromoPage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MenuPromoPage_promoId_sortOrder_idx" ON "MenuPromoPage"("promoId", "sortOrder");
ALTER TABLE "MenuPromoPage" ADD CONSTRAINT "MenuPromoPage_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "MenuPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Righe di solo testo tra le voci di un gruppo (es. «Tutti i piatti con pane fatto in casa»).
ALTER TABLE "MenuItem" ADD COLUMN "textOnly" BOOLEAN NOT NULL DEFAULT false;
